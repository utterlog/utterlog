'use client';

import LazyImage from './LazyImage';

interface ImageGridProps {
  images: { src: string; alt: string }[];
  cols?: number;
  exifMap?: Record<string, Record<string, string>>;
}

function getGridClass(count: number, cols?: number): string {
  if (cols) return `image-grid image-grid-cols-${cols}`;
  if (count >= 1 && count <= 10) return `image-grid image-grid-${count}`;
  return 'image-grid image-grid-overflow';
}

export default function ImageGrid({ images, cols, exifMap }: ImageGridProps) {
  const gridStyle: React.CSSProperties = cols ? {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
  } : {};

  return (
    <div className={getGridClass(images.length, cols)} style={gridStyle}>
      {images.map((img, i) => (
        <LazyImage
          key={i}
          src={img.src}
          alt={img.alt}
          exifData={exifMap?.[img.src]}
        />
      ))}
    </div>
  );
}
