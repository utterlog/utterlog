import Link from 'next/link';
import PostLink from '@/components/blog/PostLink';
import PageTitle from '@/components/blog/PageTitle';
import { datePartsInTimeZone, formatMonthDayInTimeZone, isValidTimeZone } from '@/lib/timezone';
import { postDateInput } from '@/lib/post-date';

function timeAgo(ts: number | string): string {
  const now = Date.now();
  const t = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : new Date(ts).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} 个月前`;
  return `${Math.floor(diff / 31536000)} 年前`;
}

function getCatIcon(_name: string, icon?: string) {
  if (icon && (icon.startsWith('fa-') || icon.startsWith('fa '))) return icon;
  return 'fa-sharp fa-light fa-folder';
}

function renderCatIcon(icon: string | undefined, size = 18) {
  const cls = getCatIcon('', icon);
  if (icon && icon.startsWith('<svg')) {
    return (
      <span
        style={{ width: size, height: size, display: 'inline-flex' }}
        dangerouslySetInnerHTML={{
          __html: icon.replace(/<svg/, `<svg width="${size}" height="${size}"`),
        }}
      />
    );
  }
  if (icon && (icon.startsWith('http') || icon.startsWith('/'))) {
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  }
  return <i className={cls} style={{ fontSize: size }} />;
}

function getLatestPostPerCategory(posts: any[], categories: any[]): Record<number, any> {
  const result: Record<number, any> = {};
  for (const cat of categories) {
    const post = posts.find((p: any) => p.categories?.some((c: any) => c.id === cat.id));
    if (post) result[cat.id] = post;
  }
  return result;
}

interface YearGroup {
  year: number;
  months: { month: number; label: string; posts: any[] }[];
}

function groupByYearMonth(posts: any[], timeZone: string): YearGroup[] {
  const yearMap = new Map<number, Map<number, any[]>>();
  for (const post of posts) {
    const { year, month } = datePartsInTimeZone(postDateInput(post), timeZone);
    const monthIndex = month - 1;
    if (!yearMap.has(year)) yearMap.set(year, new Map());
    const monthMap = yearMap.get(year)!;
    if (!monthMap.has(monthIndex)) monthMap.set(monthIndex, []);
    monthMap.get(monthIndex)!.push(post);
  }
  return Array.from(yearMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, monthMap]) => ({
      year,
      months: Array.from(monthMap.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, posts]) => ({ month, label: `${month + 1}月`, posts })),
    }));
}

function formatDate(ts: string | number, timeZone: string) {
  return formatMonthDayInTimeZone(ts, timeZone);
}

// ──────────────────────────────────────────────────────────────
// Nebula 风热力图：绿色活跃色 + 暗底（替代默认 #ebedf0 浅灰底）
// ──────────────────────────────────────────────────────────────
function NebulaHeatmap({ data, timeZone }: { data: { date: string; count: number }[]; timeZone: string }) {
  // 日期一律按 site_timezone 切日，跟后端 heatmap 分桶口径一致；
  // 之前用浏览器本地 setDate 在跨时区或夏令时边界会让最右一格漂移。
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const ymd = (d: Date) => {
    const t = datePartsInTimeZone(d, tz);
    return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  };
  const todayYmd = ymd(new Date());
  const today = new Date(`${todayYmd}T00:00:00Z`);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 364);
  startDate.setUTCDate(startDate.getUTCDate() - startDate.getUTCDay());

  const countMap = new Map<string, number>();
  for (const d of data) countMap.set(d.date, d.count);

  const weeks: { date: Date; count: number; dateStr: string }[][] = [];
  const current = new Date(startDate);
  while (current <= today || weeks.length < 53) {
    const week: { date: Date; count: number; dateStr: string }[] = [];
    for (let d = 0; d < 7; d++) {
      // 用 UTC YMD 作 key —— current 始终是 UTC midnight，跟 ymd() 在 UTC tz
      // 下结果一致；这套 grid 只是日历，跟 site_tz 的具体小时无关。
      const t = datePartsInTimeZone(current, 'UTC');
      const dateStr = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
      week.push({ date: new Date(current), count: countMap.get(dateStr) || 0, dateStr });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    weeks.push(week);
    if (current > today && weeks.length >= 53) break;
  }

  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, i) => {
    const month = week[0].date.getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ label: `${month + 1}月`, col: i });
      lastMonth = month;
    }
  });

  // 绿色活跃色（GitHub 风），空格用 Nebula 深底
  const getColor = (count: number) => {
    if (count === 0) return '#1a1a1a';
    if (count === 1) return '#0e4429';
    if (count === 2) return '#006d32';
    if (count <= 4) return '#26a641';
    return '#39d353';
  };

  return (
    <div className="nebula-heatmap">
      <div className="nebula-heatmap-months">
        {weeks.map((_, i) => {
          const label = monthLabels.find(m => m.col === i);
          return <div key={i}>{label ? label.label : ''}</div>;
        })}
      </div>
      <div className="nebula-heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="nebula-heatmap-week">
            {week.map((day, di) => {
              const isFuture = day.date > today;
              return (
                <div
                  key={di}
                  title={isFuture ? '' : `${day.dateStr}: ${day.count} 篇`}
                  style={{ background: isFuture ? 'transparent' : getColor(day.count) }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="nebula-heatmap-legend">
        <span>少</span>
        {['#1a1a1a', '#0e4429', '#006d32', '#26a641', '#39d353'].map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

interface ArchivePageProps {
  posts: any[];
  categories: any[];
  tags: any[];
  stats: any;
  timeZone?: string;
}

export default function NebulaArchivePage({ posts, categories, tags, stats, timeZone = 'UTC' }: ArchivePageProps) {
  const sortedTags = [...tags].sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
  const archives = groupByYearMonth(posts, timeZone);
  const latestPosts = getLatestPostPerCategory(posts, categories);
  const heatmapData = stats?.heatmap || [];

  return (
    <div className="nebula-archive">
      <PageTitle
        title="归档"
        icon="fa-sharp fa-light fa-books"
        meta={
          <>
            {[
              { value: stats.post_count || posts.length, label: '篇文章' },
              { value: stats.days || 0, label: '天' },
              { value: stats.word_count || 0, label: '字' },
              { value: stats.comment_count || 0, label: '条评论' },
            ].map(s => (
              <span key={s.label} className="blog-page-title-stat">
                <strong>{s.value.toLocaleString()}</strong> {s.label}
              </span>
            ))}
          </>
        }
      />

      <section className="nebula-archive-section">
        <header className="nebula-archive-section-head">
          <h2>近一年更新</h2>
          <span className="nebula-archive-section-tip">颜色越深表示当天发文越多</span>
        </header>
        <div className="nebula-archive-card">
          <NebulaHeatmap data={heatmapData} timeZone={timeZone} />
        </div>
      </section>

      <section className="nebula-archive-section">
        <header className="nebula-archive-section-head">
          <h2><i className="fa-solid fa-folder-tree" /> 分类</h2>
          <span className="nebula-archive-section-tip">{categories.length} 个</span>
        </header>
        <div className="nebula-archive-cat-grid">
          {categories.map((cat: any) => {
            const keywords = cat.seo_keywords ? cat.seo_keywords.split(',').map((k: string) => k.trim()).filter(Boolean) : [];
            const latest = latestPosts[cat.id];
            return (
              <div key={cat.id} className="nebula-archive-cat-card">
                <i className={`${getCatIcon(cat.name, cat.icon)} nebula-archive-cat-watermark`} />
                <header className="nebula-archive-cat-head">
                  <Link href={`/categories/${cat.slug}`} prefetch={false} className="nebula-archive-cat-name">
                    {renderCatIcon(cat.icon, 18)}
                    <span>{cat.name}</span>
                  </Link>
                  <span className="nebula-archive-cat-count">{cat.count || 0} 篇</span>
                </header>
                {keywords.length > 0 && (
                  <div className="nebula-archive-cat-tags">
                    {keywords.map((kw: string, i: number) => (
                      <span key={i} className="nebula-archive-cat-tag">{kw}</span>
                    ))}
                  </div>
                )}
                {cat.description && <p className="nebula-archive-cat-desc">{cat.description}</p>}
                {latest && (
                  <PostLink post={latest} className="nebula-archive-cat-latest">
                    <i className="fa-sharp fa-light fa-pen-line" />
                    <span>{latest.title}</span>
                    <em>{timeAgo(postDateInput(latest))}</em>
                  </PostLink>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="nebula-archive-section">
        <header className="nebula-archive-section-head">
          <h2><i className="fa-solid fa-tags" /> 标签</h2>
          <span className="nebula-archive-section-tip">{sortedTags.length} 个</span>
        </header>
        <div className="nebula-archive-tag-cloud">
          {sortedTags.map((tag: any) => (
            <Link key={tag.id} href={`/tags/${tag.slug}`} prefetch={false} className="nebula-archive-tag">
              {tag.name}
              <em>{tag.count || 0}</em>
            </Link>
          ))}
        </div>
      </section>

      <section className="nebula-archive-section">
        <header className="nebula-archive-section-head">
          <h2><i className="fa-sharp fa-light fa-calendar-days" /> 时间线</h2>
        </header>
        <div className="nebula-archive-timeline">
          {archives.map((group) => (
            <div key={group.year} className="nebula-archive-year">
              <header className="nebula-archive-year-head">
                <Link href={`/date/${group.year}`} prefetch={false}>{group.year}</Link>
                <span>{group.months.reduce((s, m) => s + m.posts.length, 0)} 篇</span>
              </header>
              {group.months.map((monthGroup) => (
                <div key={monthGroup.month} className="nebula-archive-month">
                  <Link
                    href={`/date/${group.year}/${String(monthGroup.month + 1).padStart(2, '0')}`}
                    prefetch={false}
                    className="nebula-archive-month-head"
                  >
                    <span>{monthGroup.label}</span>
                    <em>{monthGroup.posts.length} 篇</em>
                  </Link>
                  {monthGroup.posts.map((post: any) => (
                    <PostLink key={post.id} post={post} className="nebula-archive-post">
                      <span className="nebula-archive-post-date">{formatDate(postDateInput(post), timeZone)}</span>
                      <i className={`${getCatIcon(post.categories?.[0]?.name, post.categories?.[0]?.icon)} nebula-archive-post-icon`} />
                      <span className="nebula-archive-post-title">{post.title}</span>
                      <span className="nebula-archive-post-meta">
                        <em><i className="fa-regular fa-comment" /> {post.comment_count || 0}</em>
                        <em><i className="fa-regular fa-eye" /> {post.view_count || 0}</em>
                      </span>
                    </PostLink>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
