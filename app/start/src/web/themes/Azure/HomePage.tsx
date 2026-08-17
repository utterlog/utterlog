'use client';

import PostCard from './PostCard';
import Sidebar from './Sidebar';
import VisitorWeather from './VisitorWeather';
import Pagination from './Pagination';
import FadeCover from '@/components/blog/FadeCover';
import MosaicReveal from '@/components/blog/MosaicReveal';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { useThemeContext } from '@/lib/theme-context';
import { randomCoverUrl } from '@/lib/blog-image';
import PostLink from '@/components/blog/PostLink';
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
  // React 不重渲、heroSrc === displaySrc、换图 effect 直接 return —— 挂载时那
  // 一次多余的请求和换图全省掉。
  //
  // 但这只解决了「挂载那一下」。5 秒后轮到「热评」、10 秒后「随机」，照样会
  // 换图 —— 当时把那个归成「设计内的轮播，不是要修的东西」，判断错了：换图
  // 本身没问题，问题是换图时盖的那层模糊 + spinner 让它看起来像页面在重载。
  // 蒙层已在下面的换图 effect 里删掉。
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

  // ── Hero 换图：静默预载，载好再换 ──
  //
  // **这里原来会盖一层模糊 + spinner，至少 hold 500ms。删掉了。**
  //
  // 那层蒙层是给「用户点分类 tab 主动切换」设计的：主动操作需要即时反馈，
  // 否则点了没动静。但那排 tab 早就删了（见上面轮播那段注释），现在 hero
  // 的每一次换图都是**自动**的 —— 读者没做任何操作，却看到首屏最大的一块
  // 盖上模糊 + 转圈 + 至少半秒，然后图片重新揭示一遍。每 5 秒来一次。
  //
  // 实测这就是「首页打开后又刷新两次」的真身：网络日志里文档只请求了一次
  // （不是真刷新），但同一次加载里多出 order_by=comment_count 与
  // order_by=random 两个请求 —— 轮播跑了两轮，对应看到的「两次」。
  //
  // 自动切换的正确做法是不打扰：后台把新图下完，切上去，让图片自己的淡入 /
  // 马赛克揭示演一遍就够了。没有主动操作，就不需要加载反馈。
  //
  // 顺带修掉一个真 bug：原来清除蒙层的 setHeroLoading(false) 套在两层
  // requestAnimationFrame 里，而 **rAF 在隐藏标签页里不触发** —— 后台打开
  // 首页（cmd+点击、「在新标签页打开」）时 hero 会一直卡在模糊 + spinner 下，
  // 直到用户切过去才恢复。现在没有蒙层，这条路径不存在了。
  //
  // 后台「图片显示效果」选马赛克时，hero 换图走逐块揭示；时长由 CSS 的
  // animation-delay 波次决定，不吃 image_display_duration —— 那个值是给正文
  // 小图淡入定的，跟这里的逐块节奏不是一回事。
  const mosaic = options?.image_display_effect === 'mosaic';

  const [displaySrc, setDisplaySrc] = useState(heroSrc);
  // 首图之后就不再演马赛克了 —— 见下面渲染处的注释。SSR 与客户端首帧都是
  // false，不会引起 hydration 失配。
  const [heroSwapped, setHeroSwapped] = useState(false);
  useEffect(() => {
    if (!heroSrc || heroSrc === displaySrc) return;
    const img = new window.Image();
    let cancelled = false;
    // 载完（或失败）才换。失败也换：让 <img> 自己去显示它的 alt / 破图，
    // 总好过永远停在旧图上、下一轮又被新的 heroSrc 顶掉。
    const finish = () => { if (!cancelled) { setDisplaySrc(heroSrc); setHeroSwapped(true); } };
    img.onload = finish;
    img.onerror = finish;
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
                  {/* **马赛克只演首图。**
                      MosaicReveal 会铺 30×6 = 180 个格子做逐块揭示。放在
                      key={displaySrc} 上意味着每次换图都重挂、整套 180 格重播
                      —— 而 hero 是 5 秒一轮的自动轮播，于是首屏最大的一块每
                      5 秒抖一次。这正是「首页强制刷新后还是多次闪烁」的来源：
                      加载时揭示一遍、5 秒一遍、10 秒一遍。

                      首次出现时演一遍是有价值的（那是这个主题的入场效果，
                      而且此刻读者刚落地、本来就在等内容）；之后的自动切换
                      读者没做任何操作，用 FadeCover 的淡入就够，不该再抖。 */}
                  {mosaic && !heroSwapped ? (
                    <MosaicReveal
                      key={displaySrc}
                      src={displaySrc}
                      alt={heroPost.title}
                      className="azure-hero-cover"
                    />
                  ) : (
                    <FadeCover key={displaySrc} src={displaySrc} alt={heroPost.title} className="azure-hero-cover" />
                  )}
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
