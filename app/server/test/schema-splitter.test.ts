import { expect, test } from 'bun:test';
import { splitSqlStatements } from '../src/db/client';

test('schema splitter ignores semicolons inside comments and strings', () => {
  const sql = `
-- disabled statement with a semicolon: select 1;
create table "semi;table" (
  id integer,
  note text default 'a; b; c'
);
/* another ; comment */
insert into "semi;table" (id, note) values (1, 'done; ok');
`;

  expect(splitSqlStatements(sql)).toEqual([
    `-- disabled statement with a semicolon: select 1;
create table "semi;table" (
  id integer,
  note text default 'a; b; c'
)`,
    `/* another ; comment */
insert into "semi;table" (id, note) values (1, 'done; ok')`,
  ]);
});

test('schema splitter keeps dollar quoted bodies intact', () => {
  const sql = `
create function test_fn() returns void as $$
begin
  perform 1;
  perform 2;
end;
$$ language plpgsql;
create table after_fn (id integer);
`;

  expect(splitSqlStatements(sql)).toEqual([
    `create function test_fn() returns void as $$
begin
  perform 1;
  perform 2;
end;
$$ language plpgsql`,
    'create table after_fn (id integer)',
  ]);
});
