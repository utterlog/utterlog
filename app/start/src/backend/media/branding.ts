import sharp from 'sharp';

export const BRANDING_MAX_SIZE = 512;
export const BRANDING_WEBP_QUALITY = 82;

export async function optimizeBrandingLogo(input: Buffer, sourceExt: string) {
  const isSvg = sourceExt.toLowerCase() === 'svg';
  const output = await sharp(input, {
    animated: false,
    failOn: 'error',
    limitInputPixels: 40_000_000,
    ...(isSvg ? { density: 256 } : {}),
  })
    .rotate()
    .resize({
      width: BRANDING_MAX_SIZE,
      height: BRANDING_MAX_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: BRANDING_WEBP_QUALITY, alphaQuality: 90, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: output.data,
    ext: 'webp' as const,
    mimeType: 'image/webp' as const,
    width: output.info.width,
    height: output.info.height,
  };
}
