import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileResponse } from '../src/backend/static/response';

let directory = '';

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('static response compression negotiation', () => {
  test('varies identity responses by Accept-Encoding', async () => {
    directory = await mkdtemp(join(tmpdir(), 'utterlog-static-'));
    const path = join(directory, 'app.js');
    await Bun.write(path, 'console.log("identity")');

    const response = await fileResponse(path, 'identity');
    expect(response?.headers.get('vary')).toBe('Accept-Encoding');
    expect(response?.headers.get('content-encoding')).toBeNull();
  });

  test('serves a compressed sidecar with the same cache variant header', async () => {
    directory = await mkdtemp(join(tmpdir(), 'utterlog-static-'));
    const path = join(directory, 'app.js');
    await Bun.write(path, 'console.log("identity")');
    await Bun.write(`${path}.br`, 'compressed');

    const response = await fileResponse(path, 'br, gzip');
    expect(response?.headers.get('vary')).toBe('Accept-Encoding');
    expect(response?.headers.get('content-encoding')).toBe('br');
  });
});
