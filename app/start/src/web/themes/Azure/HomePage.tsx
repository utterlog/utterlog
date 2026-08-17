'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import VisitorWeather from './VisitorWeather';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import MosaicReveal from '@/components/blog/MosaicReveal';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Link from '@/components/AppLink';
import { useThemeContext } from '@/lib/theme-context';
import { randomCoverUrl } from '@/lib/blog-image';
import PostLink from '@/components/blog/PostLink';
import LoadingBars from '@/components/blog/LoadingBars';
import { getCategoryIcon } from './constants';
import { useScrollReveal } from '@/lib/use-scroll-reveal';
import { useLazyVisible } from '@/lib/use-lazy-visible';

const API = '/api/v1';

// hero 轮播的口味。**不含「最新文章」** —— 下面的文章列表本身就是按时间
// 倒序排的，第一条永远是最新那篇；hero 再放一次等于同一篇文章占了首屏两个
// 位置。这里只留「最新之外」的几种视角。
const MODES = [
  { key: 'hot', label: '热门文章', color: '#e53935', param: '&order_by=view_count&order=desc' },
  { key: 'comments', label: '热评文章', color: '#f57c00', param: '&order_by=comment_count&order=desc' },
  { key: 'random', label: '随机文章', color: '#43a047', param: '&order_by=random' },
] as const;

let latestMomentCache: any | null = null;

export default function HomePage({ posts, page, totalPages, categories: serverCategories = [], archiveStats: serverStats = {}, latestMoment: serverLatestMoment = null, latestComments: serverLatestComments = [], perPage = 8 }: { posts: any[]; page: number; totalPages: number; categories?: any[]; archiveStats?: any; latestMoment?: any; latestComments?: any[]; perPage?: number }) {
  // Admin-configured sidebar menu items. When non-empty, each row
  // becomes a static navigation link in the hero sidebar instead of
  // the auto-generated category filter tabs. Empty ⇒ fall back to
  // the category auto-list behavior.
  const { options } = useThemeContext();
  const [modeIdx, setModeIdx] = useState(0);
  // 首屏还没有热门数据（那是挂载后才 fetch 的），先从服务端给的这批文章里
  // 挑浏览量最高的顶上。直接用 posts[0] 的话首屏就是最新那篇 —— 正是要避开的。
  // 纯计算、无随机，SSR 与客户端结果一致，不会引起 hydration 失配。
  const [heroPost, setHeroPost] = useState<any>(
    () => [...posts].sort((a, b) => (Number(b?.view_count) || 0) - (Number(a?.view_count) || 0))[0] || null,
  );
  const [latestMoment, setLatestMoment] = useState<any>(latestMomentCache || serverLatestMoment);
  const momentLazy = useLazyVisible<HTMLDivElement>();
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // 分页数据直接用 props —— 由路由 loader 给，翻页即换路由（见下面的注释）。
  // 这里不留副本 state：page/2 → page/3 是同一条路由，组件不重挂，
  // 用 useState 存副本的话 props 变了它不跟着变，第二次翻页就换不动内容。
  // Preloaded cache: heroCache[modeKey] = post
  //
  // **用 SSR 已经挑好的那篇预置 'hot' 这一格。** 不预置的话，挂载后那个
  // effect 必然发一次 `?order_by=view_count` 请求，而它返回的是**全站**最热，
  // 跟 SSR 从「当前这页文章」里挑出来的通常不是同一篇 → heroSrc 变 →
  // 整块 hero 盖上模糊 + spinner，至少 hold 500ms → displaySrc 变 →
  // key={displaySrc} 让 MosaicReveal 重挂、揭示动画重播。
  //
  // 效果就是：**每次打开首页，最大的那块视觉元素都会在一秒内重来一次**，
  // 这正是「显示出来又加载一次」的观感，而且对匿名读者也一样发生。
  //
  // 预置之后走 cached 分支，setHeroPost 传的是同一个对象引用，Object.is 相等，
  // React 不重渲、heroSrc === displaySrc、换图 effect 直接 return —— 一次请求、
  // 一次 loading、一次动画重播全省掉。5 秒后正常轮到「热评」再换，那是设计
  // 内的轮播，不是这里要修的东西。
  //
  // （更正的做法是让首页 loader 直接下发全站最热那篇，SSR 与客户端选出同一篇；
  //   那要动 server 端的首页数据源，改动面大得多，先不做。）
  const heroCacheRef = useRef<Record<string, any>>(
    heroPost ? { [MODES[0].key]: heroPost } : {},
  );

  useEffect(() => {
    if (!momentLazy.visible || latestMoment) return;
    fetch(`${API}/moments?per_page=1`).then(r => r.json()).then(r => {
      const items = r.data?.moments || r.data || [];
      if (items.length > 0) {
        latestMomentCache = items[0];
        setLatestMoment(items[0]);
      }
    }).catch(() => {});
  }, [latestMoment, momentLazy.visible]);


  // Lazy: fetch hero only when the active (category, mode) combo changes.
  // First visit fetches once; revisiting a combo hits the in-memory cache
  // and is instant. Auto-rotate every 5s amortizes to ~one fetch per
  // combo until all are seen, then stays cached for the rest of the
  // session — vs the old preload that fired (N+1)×4 fetches up-front.
  useEffect(() => {
    const cached = heroCacheRef.current[MODES[modeIdx].key];
    if (cached) {
      setHeroPost(cached);
      return;
    }
    let url = `${API}/posts?per_page=1&status=publish${MODES[modeIdx].param}`;
    fetch(url).then(r => r.json()).then(r => {
      const items = r.data?.posts || r.data || [];
      if (items.length > 0) {
        heroCacheRef.current[MODES[modeIdx].key] = items[0];
        setHeroPost(items[0]);
      }
    }).catch(() => {});
  }, [modeIdx]);

  // 自动轮播：只在 MODES（热门 / 热评 / 随机）之间切。
  // 原来还会同时推进分类维度，但 hero 下方那排分类 tabs 已经删掉了 ——
  // 没有 UI 能表达「现在看的是哪个分类」，图却在自己换，读者只会觉得乱。
  // 鼠标 hover 在 hero 上时暂停。
  const advance = useCallback(() => {
    setModeIdx(prev => (prev + 1) % MODES.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(advance, 5000);
    return () => clearInterval(timerRef.current);
  }, [paused, advance, page, modeIdx]);

  // 原本这里有播放控制按钮（goFirst/goPrev/goNext/goLast 切换 hero 分类轮播），
  // 但用户反馈这一行没人用，已改为渲染博主社交链接图标。
  // 自动轮播的开关仍然由 hero 区块本身的 hover 控制（onMouseEnter/Leave 改 paused 即可）。

  // 分页交给路由，这里不再自己 fetch。
  //
  // 原来这儿有一整套手写 PJAX：fetch 新一页 → setState → pushState 换 URL，
  // 意图是「原地换内容、不动滚动位置」。实测证明这个前提是错的：
  //
  //   页面上给 .blog-main 打记号 → 点第 2 页 → 记号没了、旧元素
  //   document.contains() === false
  //
  // 也就是说 pushState 到 /page/2 之后，TanStack Router 监听到 URL 变化、
  // 匹配到另一条路由，照样走了完整的路由切换，整个布局重新挂载。
  // 手写的那份数据白取一遍（等于每次翻页发两份请求），而滚动位置是随
  // 旧滚动容器一起没的 —— 不是谁把 scrollTop 设成了 0，是那个元素已经
  // 不在文档里了。所以之前围着 scrollTop 打的补丁（继承 history key、
  // 双 rAF、轮询、scroll 事件纠正）全都够不着病根。
  //
  // 现在页码改走 search 参数（`/?page=2`，见 routes/index.tsx），每一跳都
  // 在同一条路由内：loader 重跑、这个组件收到新的 posts 就地更新右侧列表，
  // hero、侧栏、滚动位置都不动 —— 真正的局部替换，而且只发一份请求。

  // 文章列表始终显示全部（分类标签只影响 hero 轮播）

  const heroSrc = heroPost?.cover_url || (heroPost ? randomCoverUrl(heroPost.id, options) : '');

  // ── Hero 切换过渡 ──
  // 之前点分类 tab → heroSrc 直接换 → <img src> 立刻替换，浏览器加载完
  // 才显示新图，看起来像「啪一下硬切」。
  // 现在加一层「先预加载新图 + 显示 loading 蒙层 + 至少展示 700ms」的
  // 过场，新图加载完成且最短时间到了再切 displaySrc，配合 key 触发
  // 现有的 [data-blog-image][data-loaded] 淡入动画。
  // 后台「图片显示效果」选了马赛克时，hero 换图走逐块揭示。
  // 时长由 CSS 的 animation-delay 波次决定，不吃 image_display_duration ——
  // 那个值是给正文小图淡入定的，跟这里的逐块节奏不是一回事。
  const mosaic = options?.image_display_effect === 'mosaic';

  const [displaySrc, setDisplaySrc] = useState(heroSrc);
  const [heroLoading, setHeroLoading] = useState(false);
  useEffect(() => {
    if (!heroSrc || heroSrc === displaySrc) return;
    setHeroLoading(true);
    const start = Date.now();
    const img = new window.Image();
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      const elapsed = Date.now() - start;
      const minHold = 500; // 至少展示 500ms 的 loading 圆圈
      setTimeout(() => {
        if (cancelled) return;
        setDisplaySrc(heroSrc);
        // 给浏览器一帧切 src + key，再淡出 spinner，否则 spinner 消失
        // 时新 img 还没贴上 dom 会闪一下旧图
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setHeroLoading(false));
        });
      }, Math.max(0, minHold - elapsed));
    };
    img.onload = finish;
    img.onerror = finish; // 加载失败也退出 loading 态，避免卡死
    img.src = heroSrc;
    return () => { cancelled = true; };
  }, [heroSrc, displaySrc]);

  // 高度交给 CSS 的 aspect-ratio 算（16:9 + max-height 限高），这里不再写死。
  // 早先是 max(280, 分类数 × 56) —— 因为要跟左侧 tabs 那列对齐，分类增减
  // 会让 banner 忽高忽低；tabs 删掉后那个约束就没了。
  const heroTitleH = 56;
  // 文章卡片滚动显现，同批错开 60ms。只对首屏那批生效 —— 翻页后的文章
  // 不带 data-reveal，直接可见（翻页时读者视线就在列表上，再让内容
  // 从透明淡进来只会看着像没加载出来）。
  const listRevealRef = useScrollReveal<HTMLElement>('.azure-post-list-item', 60);

  const heroVars = {
    '--azure-hero-title-height': `${heroTitleH}px`,
  } as CSSProperties;
  const heroModeStyle = {
    '--azure-hero-mode-color': MODES[modeIdx].color,
  } as CSSProperties;
  return (
    <div className="azure-home">
      {/* ===== Hero area: tabs + image — single unit, scrolls together ===== */}
      {(
        <div className="azure-grid azure-hero-grid" style={heroVars}>
          {/* Right: Hero image — overlaps border line */}
          <section className="azure-hero-panel">
            {heroPost && (
              <div className="azure-hero"
                onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                {/* Hero deliberately drops .cover-zoom — the giant
                    banner doesn't need the scale(1.04) hover; loading
                    placeholder + admin's image_display_effect (fade /
                    scale / pixel / none) already drive the visual
                    feedback through globals.css.

                    key={displaySrc} 强制 FadeCover 重新挂载 ——
                    [data-blog-image] 元素重新进入 data-loaded="0" → "1"
                    的状态机，触发现有的淡入动画。配合上面的 displaySrc
                    延迟切换，得到「loading 圈展示一会儿 → 新图淡入」效果。 */}
                <PostLink post={heroPost} className="azure-hero-link">
                  {/* 后台把「图片显示效果」设成 pixel 时，hero 换图走马赛克消散；
                      其余效果仍走 FadeCover 那套淡入。像素化只给 hero 用 ——
                      正文里几十张图各跑一条 rAF 不划算，而 hero 一次只有一张。 */}
                  {mosaic ? (
                    <MosaicReveal
                      key={displaySrc}
                      src={displaySrc}
                      alt={heroPost.title}
                      className="azure-hero-cover"
                    />
                  ) : (
                    <FadeCover key={displaySrc} src={displaySrc} alt={heroPost.title} className="azure-hero-cover" />
                  )}
                  {/* Loading overlay —— 切分类时盖在旧图上，模糊 + 半透黑底
                      + 中央旋转环 spinner。淡出由 transition 0.4s 控制，跟新图
                      淡入并行，整体过渡总长 ≈ 500ms（最短展示）+ 0.4s（淡出）。 */}
                  <div
                    aria-hidden={!heroLoading}
                    className={`azure-hero-loading${heroLoading ? ' active' : ''}`}
                  >
                    {/* banner 是块状区域，用三条竖条比圆环压得住；小尺寸的
                        行内位置仍用 LoadingSpinner。动画同样是 CSS 而非 SMIL ——
                        SMIL 在 hydration 边界会被冻住，这里原本就是为此换过一次。 */}
                    <LoadingBars size={34} color="#fff" />
                  </div>
                  {/* Title strip: same height as one left-sidebar tab
                      so the baseline lines up with the last tab. No
                      background overlay — readability comes entirely
                      from text-shadow, two layers stacked so white
                      text stays legible over both dark and bright
                      covers without dimming the image itself. */}
                  <div className="azure-hero-titlebar">
                    {/* 分类图标 —— heroPost.categories[0] 带 icon 字段，
                        没配图标的分类由 getCategoryIcon 按名字给兜底 */}
                    {heroPost.categories?.[0] && (
                      <i
                        className={`${getCategoryIcon(heroPost.categories[0])} azure-hero-title-icon`}
                        aria-hidden="true"
                      />
                    )}
                    <h2 className="azure-hero-title">{heroPost.title}</h2>
                  </div>
                </PostLink>
                <div className="azure-hero-mode" style={heroModeStyle}>
                  {MODES[modeIdx].label}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== Moment row =====
          Left side shows visitor weather; right side keeps the moment
          ticker aligned with the main content grid. */}
      {(
        <div ref={momentLazy.ref} className="azure-grid azure-strip">
          <aside className="azure-social-cell">
            <VisitorWeather />
          </aside>
          {/* Right: Moment ticker */}
          <section className="azure-moment-cell">
            {latestMoment && (
              <div className="azure-moment-ticker">
                <i className="fa-brands fa-twitter" aria-hidden="true" />
                <a href="/moments" className="azure-moment-text">{latestMoment.content}</a>
                <span className="azure-moment-time">
                  {(() => { const diff = (Date.now() - (typeof latestMoment.created_at === 'number' ? latestMoment.created_at * 1000 : new Date(latestMoment.created_at).getTime())) / 1000; if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前'; if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前'; return Math.floor(diff / 86400) + ' 天前'; })()}
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== Content area: sidebar sticky + posts list ===== */}
      <div className="azure-grid azure-content-grid">
        <aside className="azure-sidebar-cell">
          <div className="azure-sidebar-sticky">
            <Sidebar initialComments={serverLatestComments.slice(0, 5)} />
          </div>
        </aside>
        {/* Right: Post list */}
        <section className="azure-post-list" ref={listRevealRef}>
          {posts.length > 0 ? (
            <div className="azure-page-swap">
              {posts.map((post, idx) => (
                // 滚动显现只在第一页做。第 2 页往后是读者主动翻过来的，
                // 落地就该看见内容，再让它逐条淡入等于凭空多等一拍。
                <div key={post.id} className="azure-post-list-item" {...(page > 1 ? {} : { 'data-reveal': '' })}>
                  <PostCard post={post} isNewest={page === 1 && idx === 0} priority={page === 1 && idx === 0} />
                </div>
              ))}
            </div>
          ) : (
            <div className="azure-empty">暂无文章</div>
          )}
          <div className="azure-pagination-wrap">
            {/* 不传 onPageChange —— 让它渲染成真链接，由路由接管（见上面的注释）。
                顺带白拿两样：中键 / 右键能开新标签页，爬虫也跟得下去。 */}
            <Pagination currentPage={page} totalPages={totalPages} />
          </div>
        </section>
      </div>
    </div>
  );
}
