import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';
import { optimizeBrandingLogo } from '../media/branding';
import { buildFaviconIco, clearBrandingFaviconFiles } from '../media/favicon';
import { brandingExts, mediaExt } from '../media/storage';

type BrandingPurpose = 'logo' | 'dark-logo' | 'favicon';

export class BrandingUploadError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function brandingPurpose(value: unknown): BrandingPurpose {
  const purpose = String(value || 'logo').replace(/[^a-zA-Z0-9_-]/g, '');
  if (purpose === 'logo' || purpose === 'dark-logo' || purpose === 'favicon') return purpose;
  throw new BrandingUploadError('purpose 必须为 logo、dark-logo 或 favicon');
}

export async function storeBrandingUpload(file: File, purposeValue: unknown) {
  const purpose = brandingPurpose(purposeValue);
  const ext = mediaExt(file.name, 'png');
  if (!brandingExts.has(ext)) throw new BrandingUploadError('不支持的图片格式，请使用 PNG/JPG/GIF/WebP/AVIF/ICO/SVG');
  if (file.size > 5 * 1024 * 1024) throw new BrandingUploadError('文件大小不能超过 5MB');

  const dir = join(config.uploadDir, 'branding');
  mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());

  if (purpose === 'favicon') {
    try {
      const ico = await buildFaviconIco(bytes, ext);
      clearBrandingFaviconFiles(dir, rmSync);
      await Bun.write(join(dir, 'favicon.ico'), ico);
      return { url: '/favicon.ico', filename: 'favicon.ico', purpose };
    } catch (err) {
      throw new BrandingUploadError(err instanceof Error ? err.message : 'Favicon 转换失败');
    }
  }

  try {
    const optimized = await optimizeBrandingLogo(bytes, ext);
    const filename = `${purpose}.${optimized.ext}`;
    await Bun.write(join(dir, filename), optimized.bytes);
    for (const oldExt of brandingExts) {
      if (oldExt === optimized.ext) continue;
      rmSync(join(dir, `${purpose}.${oldExt}`), { force: true });
    }
    return {
      url: `/${filename}?v=${Date.now()}`,
      filename,
      purpose,
      format: optimized.ext,
      width: optimized.width,
      height: optimized.height,
      size: optimized.bytes.length,
      original_size: bytes.length,
    };
  } catch (err) {
    if (err instanceof BrandingUploadError) throw err;
    throw new BrandingUploadError(err instanceof Error ? `Logo 转换失败：${err.message}` : 'Logo 转换失败');
  }
}
