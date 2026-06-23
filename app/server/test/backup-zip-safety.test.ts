import { expect, test } from 'bun:test';
import { validateBackupZipEntries } from '../src/backup/zip-safety';

function makeStoredZip(entries: { name: string; data?: string }[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data || '');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

test('backup zip validation accepts expected backup layout', () => {
  const zip = makeStoredZip([
    { name: 'database.sql', data: 'select 1;' },
    { name: 'uploads/2026/image.png', data: 'png' },
    { name: 'content/themes/.gitkeep', data: '' },
  ]);
  expect(validateBackupZipEntries(zip)).toEqual(['database.sql', 'uploads/2026/image.png', 'content/themes/.gitkeep']);
});

test('backup zip validation rejects path traversal entries', () => {
  expect(() => validateBackupZipEntries(makeStoredZip([{ name: '../evil.sql' }]))).toThrow();
  expect(() => validateBackupZipEntries(makeStoredZip([{ name: 'uploads/../../evil.txt' }]))).toThrow();
  expect(() => validateBackupZipEntries(makeStoredZip([{ name: '/tmp/evil.txt' }]))).toThrow();
  expect(() => validateBackupZipEntries(makeStoredZip([{ name: 'uploads\\evil.txt' }]))).toThrow();
});

test('backup zip validation rejects unexpected top-level entries', () => {
  expect(() => validateBackupZipEntries(makeStoredZip([{ name: 'wp-config.php' }]))).toThrow();
});
