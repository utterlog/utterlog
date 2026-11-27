import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { TransactionSql } from 'postgres';
import { config, table } from '../config';

const identifier = '(?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"]|"")+")';
const copyHeader = new RegExp(`^COPY public\\.(${identifier}) \\((.+)\\) FROM stdin;$`);
const sequenceValue = new RegExp(`^SELECT pg_catalog\\.setval\\('public\\.(${identifier})', (-?\\d+), (true|false)\\);$`);
const columnList = new RegExp(`^${identifier}(, ${identifier})*$`);
const columnNames = new RegExp(identifier, 'g');

function unquote(name: string) {
  return name.startsWith('"') ? name.slice(1, -1).replaceAll('""', '"') : name;
}

// Old backups contain a full plain pg_dump. Use its COPY data and sequence
// positions only. The destination schema and executable SQL come from the app.
function readDump(dump: string) {
  const tables = new Map<string, { columns: string[]; start: number; end: number }>();
  const sequences = new Map<string, { value: bigint; called: boolean }>();
  const lines = dump.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const copy = copyHeader.exec(line);
    if (!copy) {
      const sequence = sequenceValue.exec(line);
      if (sequence) sequences.set(unquote(sequence[1]), { value: BigInt(sequence[2]), called: sequence[3] === 'true' });
      continue;
    }
    const name = unquote(copy[1]);
    if (!columnList.test(copy[2]) || tables.has(name)) throw new Error(`备份表定义无效：${name}`);
    const columns = [...copy[2].matchAll(columnNames)].map(([column]) => unquote(column));
    const end = lines.indexOf('\\.', i + 1);
    if (end === -1) throw new Error(`备份表数据不完整：${name}`);
    tables.set(name, { columns, start: i + 1, end });
    i = end;
  }
  let footer = lines.length - 1;
  while (footer >= 0 && !lines[footer].trim()) footer--;
  if (!lines.slice(Math.max(0, footer - 4), footer + 1).includes('-- PostgreSQL database dump complete') ||
      !['users', 'posts', 'options'].every((name) => tables.has(table(name)))) {
    throw new Error('备份缺少完整的数据库导出，或表前缀与当前站点不同');
  }
  function* rows(start: number, end: number) {
    for (let i = start; i < end; i++) yield `${lines[i]}\n`;
  }
  return { tables, sequences, rows };
}

function insertionOrder(names: string[], foreignKeys: { child: string; parent: string }[]) {
  const pending = new Set(names);
  const ordered: string[] = [];
  while (pending.size) {
    const before = pending.size;
    for (const name of pending) {
      if (foreignKeys.some(({ child, parent }) => child === name && parent !== name && pending.has(parent))) continue;
      ordered.push(name);
      pending.delete(name);
    }
    if (pending.size === before) throw new Error('当前数据库包含循环外键，无法恢复备份');
  }
  return ordered;
}

export async function restoreDatabase(tx: TransactionSql, dump: string) {
  const backup = readDump(dump);
  const tables = await tx<{ name: string }[]>`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and starts_with(c.relname, ${config.dbPrefix})
    order by c.relname`;
  const names = tables.map(({ name }) => name);
  if (!['users', 'posts', 'options'].every((name) => names.includes(table(name)))) {
    throw new Error('当前站点的数据库尚未初始化');
  }

  const destinations = tx.unsafe(names.map((name) => `public."${name.replaceAll('"', '""')}"`).join(', '));
  // Block writers while taking copies of tables absent from older backups.
  await tx`lock table ${destinations} in share row exclusive mode`;
  const foreignKeys = await tx<{ child: string; parent: string }[]>`
    select child.relname as child, parent.relname as parent
    from pg_constraint fk
    join pg_class child on child.oid = fk.conrelid
    join pg_class parent on parent.oid = fk.confrelid
    where fk.contype = 'f' and child.relnamespace = 'public'::regnamespace
      and parent.relnamespace = child.relnamespace`;
  const sequences = await tx<{ table: string; column: string; name: string; increment: string }[]>`
    select t.relname as "table", a.attname as "column", s.relname as name, seq.seqincrement::text as increment
    from pg_depend d
    join pg_class t on t.oid = d.refobjid
    join pg_class s on s.oid = d.objid
    join pg_sequence seq on seq.seqrelid = s.oid
    join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where d.classid = 'pg_class'::regclass and d.refclassid = 'pg_class'::regclass
      and d.deptype in ('a', 'i') and t.relnamespace = 'public'::regnamespace
      and s.relnamespace = t.relnamespace and t.relname = any(${names})`;

  const staged = new Map<string, { name: string; columns?: string[] }>();
  for (const [index, name] of names.entries()) {
    const fromBackup = backup.tables.get(name);
    const stage = `utterlog_restore_${index}`;
    const source = tx(`public.${name}`);
    if (fromBackup) {
      if (sequences.some((sequence) => sequence.table === name && !fromBackup.columns.includes(sequence.column))) {
        throw new Error(`备份缺少序列对应的列：${name}`);
      }
      const columns = tx(fromBackup.columns);
      await tx`create temp table ${tx(stage)} on commit drop as select ${columns} from ${source} with no data`;
      const copy = await tx`copy ${tx(`pg_temp.${stage}`)} (${columns}) from stdin`.writable();
      await pipeline(Readable.from(backup.rows(fromBackup.start, fromBackup.end)), copy);
    } else {
      await tx`create temp table ${tx(stage)} on commit drop as table ${source}`;
    }
    staged.set(name, { name: stage, columns: fromBackup?.columns });
  }

  // RESTRICT is the default. Foreign keys from outside the site must never be cascaded.
  await tx`truncate table ${destinations}`;
  for (const name of insertionOrder(names, foreignKeys)) {
    const stage = staged.get(name)!;
    const target = tx(`public.${name}`);
    const source = tx(`pg_temp.${stage.name}`);
    if (stage.columns) {
      const columns = tx(stage.columns);
      await tx`insert into ${target} (${columns}) overriding system value select ${columns} from ${source}`;
    } else {
      await tx`insert into ${target} overriding system value select * from ${source}`;
    }
  }

  for (const sequence of sequences) {
    if (!backup.tables.has(sequence.table)) continue;
    const name = tx(`public.${sequence.name}`);
    const column = tx(sequence.column);
    const saved = backup.sequences.get(sequence.name);
    const increment = BigInt(sequence.increment);
    const [current] = await tx<{ value: string; called: boolean }[]>`select last_value::text as value, is_called as called from ${name}`;
    const [row] = await tx<{ value: string | null }[]>`
      select ${increment > 0 ? tx`max(${column})` : tx`min(${column})`}::text as value from ${tx(`public.${sequence.table}`)}`;
    const position = saved ?? { value: BigInt(current.value), called: current.called };
    let next = position.value + (position.called ? increment : 0n);
    if (row.value !== null && (increment > 0 ? next <= BigInt(row.value) : next >= BigInt(row.value))) {
      next = BigInt(row.value) + increment;
    }
    // ALTER SEQUENCE RESTART is transactional. setval() would survive rollback.
    await tx`alter sequence ${name} restart with ${tx.unsafe(next.toString())}`;
  }
}
