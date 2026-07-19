import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';
import { brandingExts } from './storage';

const FAVICON_SIZES = [16, 32, 48] as const;

async function loadSharp() {
  const sharpModule = await (new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>)('sharp').catch(() => null);
  const sharp = (sharpModule as { default?: unknown })?.default || sharpModule;
  if (!sharp || typeof sharp !== 'function') {
    throw new Error('图片处理模块不可用');
  }
  return sharp as (input: Buffer, options?: { density?: number }) => {
    resize: (w: number, h: number, opts?: Record<string, unknown>) => {
      png: () => { toBuffer: () => Promise<Buffer> };
    };
  };
}

function encodePngIco(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries: Buffer[] = [];
  const data: Buffer[] = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    data.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...data]);
}

export async function buildFaviconIco(input: Buffer, ext: string): Promise<Buffer> {
  if (ext === 'ico') return input;

  const sharp = await loadSharp();
  const isSvg = ext === 'svg';
  const pngs = await Promise.all(FAVICON_SIZES.map(async (size) => {
    const png = await sharp(input, isSvg ? { density: 256 } : undefined)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    return { size, png };
  }));

  return encodePngIco(pngs);
}

export function clearBrandingFaviconFiles(dir: string, rmSync: (path: string, opts?: { force?: boolean }) => void) {
  for (const oldExt of brandingExts) {
    rmSync(join(dir, `favicon.${oldExt}`), { force: true });
  }
}

export function brandingFaviconIcoPath() {
  return join(config.uploadDir, 'branding', 'favicon.ico');
}

/** Map legacy /favicon.png|svg paths to /favicon.ico when the converted file exists. */
export function resolveFaviconUrl(stored: string): string {
  const value = (stored || '').trim();
  if (!value) return '';
  if (!/^\/favicon(?:\.[a-z0-9]+)?$/i.test(value)) return value;
  if (existsSync(brandingFaviconIcoPath())) return '/favicon.ico';
  return value;
}
