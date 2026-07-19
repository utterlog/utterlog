function entryName(raw: Buffer) {
  const name = raw.toString('utf8').trim();
  if (!name) throw new Error('ZIP 包含空文件名');
  if (name.includes('\\')) throw new Error('ZIP 文件名不能包含反斜杠');
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw new Error('ZIP 文件名不能使用绝对路径');
  const parts = name.split('/');
  if (parts.some((part) => part === '..' || part === '')) throw new Error('ZIP 文件名包含不安全路径');
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

export function validateBackupZipEntries(bytes: Uint8Array) {
  const names = readZipEntryNames(bytes);
  for (const name of names) {
    if (name === 'database.sql') continue;
    if (name.startsWith('uploads/')) continue;
    if (name.startsWith('content/')) continue;
    throw new Error(`备份文件包含不允许的路径：${name}`);
  }
  return names;
}

export function validateExtensionZipEntries(bytes: Uint8Array) {
  return readZipEntryNames(bytes);
}
