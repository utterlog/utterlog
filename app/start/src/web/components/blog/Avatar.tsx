/**
 * 头像。
 *
 * 建这个组件是因为同一段 <img> 在四份 CommentList 副本里各抄了三遍，
 * 十二处逐字符相同，**唯一的真实差异是圆角**（Azure/Flux 直角、
 * Utterlog 4px、默认主题正圆）。之前把 Gravatar 尺寸从 64 改到 256，
 * 同一个改动要在十二个地方各做一次，还漏了几处只能靠线上接口才发现。
 *
 * 两件事收在这里，以后只改一处：
 *   - 头像取不到时的兜底图（src 为空、或图片加载失败）
 *   - 尺寸参数（?s=256）
 *
 * 样式仍然开放：size / radius 覆盖常见差异，style 兜住剩下的。
 * 不把主题差异写死在组件里 —— 那样每加一个主题就要回来改这个文件。
 */

/** 头像取不到时的兜底。d=mp 是 Gravatar 的默认人形图，不会是破图。 */
const FALLBACK_AVATAR = 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=256';

type AvatarProps = {
  src?: string | null;
  /** 显示边长（px）。取 256 的图再缩到这个尺寸，高分屏才不糊。 */
  size: number;
  /** 圆角。0=直角，'50%'=正圆。主题之间就差这个。 */
  radius?: number | string;
  /** 悬停时轻微放大。传了才有，父级自己维护 hover 状态。 */
  hovered?: boolean;
  style?: React.CSSProperties;
  className?: string;
  alt?: string;
  /** 默认懒加载。首屏一定看得见的位置（比如文章作者）可以传 'eager'。 */
  loading?: 'lazy' | 'eager';
};

export default function Avatar({
  src,
  size,
  radius = 0,
  hovered,
  style,
  className,
  alt = '',
  loading = 'lazy',
}: AvatarProps) {
  return (
    <img
      src={src || FALLBACK_AVATAR}
      alt={alt}
      className={className}
      // 默认 lazy：评论头像动辄几十个，绝大多数在视口外。
      // 更要紧的是 React 19 会把 eager 图片提升成 head 里的 preload，
      // 一页几十条 preload 会跟正文图片抢带宽。
      loading={loading}
      decoding="async"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'cover',
        // 底色垫着，图没加载出来时不是一个白洞
        background: '#f0f0f0',
        borderRadius: radius,
        ...(hovered === undefined ? null : {
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: hovered ? 'scale(1.15)' : 'scale(1)',
        }),
        ...style,
      }}
      // 头像域名挂了 / 对方删了图，回落到兜底图而不是留个破图图标。
      // 兜底图本身也失败的话不再重试，否则 onError 会自己触发自己。
      onError={(e) => {
        const img = e.target as HTMLImageElement;
        if (img.src !== FALLBACK_AVATAR) img.src = FALLBACK_AVATAR;
      }}
    />
  );
}
