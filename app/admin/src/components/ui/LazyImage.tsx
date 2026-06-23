
import { useState, useRef, useEffect } from 'react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt?: string;
  spinnerSize?: number;
}

/**
 * 通用懒加载图片组件
 * - IntersectionObserver 检测是否进入视口（提前 300px 预加载）
 * - 未加载时显示条形旋转 spinner（主题色）
 * - 加载完成后淡入显示
 */
export default function LazyImage({ src, alt, spinnerSize = 28, style, className, ...props }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--color-bg-soft, #f0f0f0)',
        ...style,
      }}
    >
      {/* Bar spinner */}
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1,
        }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: spinnerSize, color: 'var(--color-primary, #999)' }} aria-hidden="true" />
        </div>
      )}

      {/* Image */}
      {inView && (
        <img
          src={src}
          alt={alt || ''}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          {...props}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            opacity: loaded ? 1 : 0,
            filter: loaded ? 'blur(0)' : 'blur(20px)',
            transition: 'opacity 0.5s ease-in-out, filter 0.5s linear',
          }}
        />
      )}
    </div>
  );
}
