import { describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { optimizeBrandingLogo } from '../src/backend/media/branding';
import { BrandingUploadError, storeBrandingUpload } from '../src/backend/services/branding';

describe('branding logo optimization', () => {
  test('converts and proportionally constrains wide images to 512px', async () => {
    const input = await sharp({
      create: { width: 1024, height: 256, channels: 4, background: '#336699' },
    }).png().toBuffer();

    const result = await optimizeBrandingLogo(input, 'png');
    const metadata = await sharp(result.bytes).metadata();

    expect(result.ext).toBe('webp');
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(128);
    expect(result.bytes.length).toBeLessThan(input.length);
  });

  test('does not enlarge an already small logo', async () => {
    const input = await sharp({
      create: { width: 128, height: 64, channels: 4, background: '#ffffff00' },
    }).png().toBuffer();

    const result = await optimizeBrandingLogo(input, 'png');
    expect(result.width).toBe(128);
    expect(result.height).toBe(64);
  });

  test('rejects files that are not valid images', async () => {
    await expect(optimizeBrandingLogo(Buffer.from('not-an-image'), 'png')).rejects.toThrow();
  });
});

describe('branding upload validation', () => {
  test('rejects unsupported purposes before writing a file', async () => {
    const file = new File([Buffer.from('image')], 'logo.png', { type: 'image/png' });
    await expect(storeBrandingUpload(file, 'other')).rejects.toBeInstanceOf(BrandingUploadError);
  });

  test('rejects files larger than 5MB', async () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' });
    await expect(storeBrandingUpload(file, 'logo')).rejects.toThrow('文件大小不能超过 5MB');
  });

  test('rejects unsupported file extensions', async () => {
    const file = new File([Buffer.from('image')], 'logo.txt', { type: 'text/plain' });
    await expect(storeBrandingUpload(file, 'logo')).rejects.toThrow('不支持的图片格式');
  });
});
