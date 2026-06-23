import type { Metadata } from 'next';
import Link from 'next/link';
import { getPosts } from '@/lib/blog-api';
import PageTitle from '@/components/blog/PageTitle';

export const metadata: Metadata = { title: '影视' };

interface PageProps {
  searchParams: Promise<{ video_type?: string; year?: string; region?: string; page?: string }>;
}

// 前台 /films 影视列表 —— v2.4.2
//
// 数据来自 /posts?type=video&...，与 /movies（观影日记，ul_movies 表）刻意不同：
// /movies 是「看过的影评」短卡片；/films 是「可在站内播放」的多集影视文章
// （每个 item 点进去是带播放器 + 选集网格的详情页）。
//
// 4 个 querystring 过滤：video_type（剧集/电影/综艺/动漫/纪录片）、year、region、page。
// 服务端拼成 SearchParams 传给后端 /posts?type=video&...，分页同 /posts 列表。

const TYPE_TABS = [
  { key: '', label: '全部', icon: 'fa-clapperboard-play' },
  { key: 'tv', label: '剧集', icon: 'fa-tv' },
  { key: 'movie', label: '电影', icon: 'fa-film' },
  { key: 'show', label: '综艺', icon: 'fa-microphone-stand' },
  { key: 'anime', label: '动漫', icon: 'fa-cat' },
  { key: 'doc', label: '纪录片', icon: 'fa-book-open' },
];

function buildHref(current: { video_type?: string; year?: string; region?: string; page?: string }, patch: Partial<{ video_type: string; year: string; region: string; page: string }>) {
  const merged: Record<string, string> = { ...current as any, ...patch as any };
  Object.keys(merged).forEach((k) => { if (!merged[k]) delete merged[k]; });
  // 切换筛选时主动复位 page —— 否则筛过后停在已不存在的尾页很糟糕
  if (patch.video_type !== undefined || patch.year !== undefined || patch.region !== undefined) {
    delete merged.page;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/films?${qs}` : '/films';
}

export default async function FilmsListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const videoType = sp.video_type || '';
  const year = sp.year || '';
  const region = sp.region || '';
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const perPage = 24;

  let items: any[] = [];
  let total = 0;
  try {
    const r: any = await getPosts({
      type: 'video', page, per_page: perPage,
      video_type: videoType || undefined,
      year: year || undefined,
      region: region || undefined,
    });
    items = r.data || [];
    total = r.pagination?.total ?? r.total ?? items.length;
  } catch {}

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle
        title="影视"
        icon="fa-sharp fa-light fa-clapperboard-play"
        subtitle="在线播放"
        meta={<><strong>{total}</strong> 部影视</>}
      />

      <div style={{ padding: '24px 32px 32px' }}>
        {/* 类型 tab —— 横向滚动避免移动端换行 */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {TYPE_TABS.map(tab => (
            <Link
              key={tab.key || 'all'}
              prefetch={false}
              href={buildHref(sp, { video_type: tab.key })}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 999,
                textDecoration: 'none',
                background: videoType === tab.key ? 'var(--color-primary)' : 'var(--color-bg-soft)',
                color: videoType === tab.key ? '#fff' : 'var(--color-text-main)',
                border: '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <i className={`fa-regular ${tab.icon}`} aria-hidden="true" />
              {tab.label}
            </Link>
          ))}
        </div>

        {(year || region) && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--color-text-sub)' }}>
            <span>已筛选：</span>
            {year && (
              <Link prefetch={false} href={buildHref(sp, { year: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--color-bg-soft)', borderRadius: 4, textDecoration: 'none', color: 'var(--color-text-main)' }}>
                {year} 年 <i className="fa-regular fa-xmark" style={{ fontSize: 10 }} />
              </Link>
            )}
            {region && (
              <Link prefetch={false} href={buildHref(sp, { region: '' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'var(--color-bg-soft)', borderRadius: 4, textDecoration: 'none', color: 'var(--color-text-main)' }}>
                {region} <i className="fa-regular fa-xmark" style={{ fontSize: 10 }} />
              </Link>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-dim" style={{ textAlign: 'center', padding: '80px 0' }}>
            {videoType || year || region ? '该筛选下暂无影视' : '暂无影视，可在后台「娱乐 → 影视」新建'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
            {items.map((item: any) => {
              const m = item.meta || {};
              const epCount = m.total_episodes;
              const rating = m.douban_rating;
              return (
                <Link
                  key={item.id}
                  prefetch={false}
                  href={`/films/${encodeURIComponent(item.slug || item.display_id || item.id)}`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden', position: 'relative', transition: 'border-color 0.15s, transform 0.15s' }} className="film-card">
                    {/* 海报 */}
                    {item.cover_url ? (
                      <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--color-bg-soft)', overflow: 'hidden', position: 'relative' }}>
                        <img src={item.cover_url} alt={item.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        {epCount ? (
                          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, fontWeight: 500, padding: '2px 6px', background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 3 }}>
                            {epCount} 集
                          </span>
                        ) : null}
                        {m.video_type === 'movie' ? (
                          <span style={{ position: 'absolute', top: 8, right: 8, fontSize: 11, fontWeight: 500, padding: '2px 6px', background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 3 }}>
                            电影
                          </span>
                        ) : null}
                        {rating ? (
                          <span style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 11, fontWeight: 600, padding: '2px 6px', background: 'rgba(245,158,11,0.92)', color: '#000', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <i className="fa-solid fa-star" /> {rating}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '2/3', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-sharp fa-light fa-clapperboard-play" style={{ fontSize: 36, color: 'var(--color-text-dim)' }} />
                      </div>
                    )}
                    <div style={{ padding: 10 }}>
                      <h3 className="text-main" style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.title}
                      </h3>
                      <p className="text-sub" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[m.year, m.region].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* 分页 —— 极简前 / 后翻 */}
        {totalPages > 1 && (
          <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 6, fontSize: 13 }}>
            {page > 1 && (
              <Link prefetch={false} href={buildHref(sp, { page: String(page - 1) })} style={{ padding: '6px 14px', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text-main)', borderRadius: 4 }}>
                ← 上一页
              </Link>
            )}
            <span style={{ padding: '6px 14px', color: 'var(--color-text-sub)' }}>
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages && (
              <Link prefetch={false} href={buildHref(sp, { page: String(page + 1) })} style={{ padding: '6px 14px', border: '1px solid var(--color-border)', textDecoration: 'none', color: 'var(--color-text-main)', borderRadius: 4 }}>
                下一页 →
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
