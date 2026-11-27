import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function updateCrc(crc: number, bytes: Uint8Array) {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc;
}

export function crc32(data: Uint8Array) {
  return (updateCrc(0xffffffff, data) ^ 0xffffffff) >>> 0;
}

function entryName(raw: Buffer) {
  const name = raw.toString('utf8');
  if (!name.trim() || name.includes('\0')) throw new Error('ZIP 包含无效文件名');
  if (name.includes('\\')) throw new Error('ZIP 文件名不能包含反斜杠');
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw new Error('ZIP 文件名不能使用绝对路径');
  const parts = name.split('/');
  if (parts.some((part) => part === '.' || part === '..' || part === '')) throw new Error('ZIP 文件名包含不安全路径');
  return name;
}

function readZipEntryNames(bytes: Uint8Array) {
  const data = Buffer.from(bytes);
  const names: string[] = [];
  let offset = 0;
  while (offset + 46 <= data.length) {
    const sig = data.readUInt32LE(offset);
    if (sig !== 0x02014b50) {
      offset++;
      continue;
    }
    const nameLen = data.readUInt16LE(offset + 28);
    const extraLen = data.readUInt16LE(offset + 30);
    const commentLen = data.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > data.length) throw new Error('ZIP 中心目录损坏');
    names.push(entryName(data.subarray(nameStart, nameEnd)));
    offset = nameEnd + extraLen + commentLen;
    if (names.length > 20_000) throw new Error('ZIP 文件条目过多');
  }
  if (names.length === 0) throw new Error('ZIP 文件缺少中心目录');
  return names;
}

type BackupZipEntry = { name: string; data: Buffer; method: number; size: number; crc: number };

export function readBackupZipEntries(bytes: Uint8Array) {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = data.length - 22;
  const earliestEnd = Math.max(0, end - 65_535);
  while (end >= earliestEnd && (data.readUInt32LE(end) !== 0x06054b50 ||
    end + 22 + data.readUInt16LE(end + 20) !== data.length)) end--;
  if (end < earliestEnd || data.readUInt32LE(end + 4) !== 0) throw new Error('ZIP 缺少有效的中心目录');

  const count = data.readUInt16LE(end + 10);
  const centralStart = data.readUInt32LE(end + 16);
  let offset = centralStart;
  if (!count || count > 20_000 || count !== data.readUInt16LE(end + 8) ||
    offset + data.readUInt32LE(end + 12) !== end) throw new Error('ZIP 中心目录无效');

  const names = new Set<string>();
  const entries: BackupZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50) throw new Error('ZIP 中心目录损坏');
    const nameStart = offset + 46;
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const next = nameStart + nameLength + extraLength + data.readUInt16LE(offset + 32);
    if (next > end) throw new Error('ZIP 中心目录损坏');

    const mode = data.readUInt32LE(offset + 38) >>> 28;
    if (mode !== 0 && mode !== 8) throw new Error('备份只能包含普通文件');
    const flags = data.readUInt16LE(offset + 8);
    const method = data.readUInt16LE(offset + 10);
    if ((flags & 1) || (method !== 0 && method !== 8)) throw new Error('备份必须使用未加密的 ZIP 存储或 Deflate 压缩');
    const rawName = data.subarray(nameStart, nameStart + nameLength);
    const local = data.readUInt32LE(offset + 42);
    if (local + 30 + nameLength > centralStart || data.readUInt32LE(local) !== 0x04034b50 ||
      data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method ||
      data.readUInt16LE(local + 26) !== nameLength || !rawName.equals(data.subarray(local + 30, local + 30 + nameLength))) {
      throw new Error('ZIP 文件头与中心目录不一致');
    }
    const dataStart = local + 30 + nameLength + data.readUInt16LE(local + 28);
    const dataEnd = dataStart + data.readUInt32LE(offset + 20);
    if (dataEnd > centralStart) throw new Error('ZIP 文件数据不完整');
    const name = entryName(rawName);
    if (!Buffer.from(name).equals(rawName)) throw new Error('备份文件名必须是 UTF-8');
    if (name !== 'database.sql' && !name.startsWith('uploads/') && !name.startsWith('content/')) {
      throw new Error(`备份文件包含不允许的路径：${name}`);
    }
    if (names.has(name)) throw new Error(`备份文件包含重复路径：${name}`);
    names.add(name);
    entries.push({ name, data: data.subarray(dataStart, dataEnd), method, size: data.readUInt32LE(offset + 24), crc: data.readUInt32LE(offset + 16) });
    offset = next;
  }
  if (offset !== end) throw new Error('ZIP 中心目录长度无效');
  return entries;
}

export async function extractBackupZip(entries: BackupZipEntry[], directory: string) {
  for (const entry of entries) {
    const target = join(directory, entry.name);
    const invalid = () => new Error(`ZIP 文件数据损坏：${entry.name}`);
    await mkdir(dirname(target), { recursive: true });
    if (entry.method === 0) {
      if (entry.data.length !== entry.size || crc32(entry.data) !== entry.crc) throw invalid();
      await writeFile(target, entry.data, { flag: 'wx' });
      continue;
    }
    let size = 0;
    let crc = 0xffffffff;
    const verify = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > entry.size) return callback(invalid());
        crc = updateCrc(crc, chunk);
        callback(null, chunk);
      },
      flush(callback) {
        callback(size === entry.size && ((crc ^ 0xffffffff) >>> 0) === entry.crc ? undefined : invalid());
      },
    });
    await pipeline(Readable.from([entry.data]), createInflateRaw(), verify, createWriteStream(target, { flags: 'wx' }));
  }
}

export function validateExtensionZipEntries(bytes: Uint8Array) {
  return readZipEntryNames(bytes);
}
