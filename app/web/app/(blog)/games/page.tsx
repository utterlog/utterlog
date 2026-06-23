import type { Metadata } from 'next';
import { getGames } from '@/lib/blog-api';
import PageTitle from '@/components/blog/PageTitle';

export const metadata: Metadata = { title: '游戏' };

const statusLabel: Record<string, string> = { want: '想玩', playing: '在玩', finished: '通关', abandoned: '弃坑' };

export default async function GamesPage() {
  let items: any[] = [];
  try { const r = await getGames({ per_page: 60 }); items = r.data || []; } catch {}

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle
        title="游戏"
        icon="fa-sharp fa-light fa-gamepad"
        subtitle="我玩过的"
        meta={<><strong>{items.length}</strong> 款游戏</>}
      />

      <div style={{ padding: '32px' }}>
        {items.length === 0 ? (
          <p className="text-dim" style={{ textAlign: 'center', padding: '80px 0' }}>暂无内容</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {items.map((item: any) => (
              <div key={item.id} style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden', position: 'relative' }}>
                {item.status && statusLabel[item.status] && (
                  <span style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '11px', fontWeight: 500, padding: '2px 6px', background: 'var(--color-bg-soft)', color: 'var(--color-primary)', zIndex: 1 }}>
                    {statusLabel[item.status]}
                  </span>
                )}
                {item.cover_url ? (
                  <div style={{ width: '100%', height: '160px', background: 'var(--color-bg-soft)', overflow: 'hidden' }}>
                    <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: '160px', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-sharp fa-light fa-gamepad" style={{ fontSize: '36px', color: 'var(--color-text-dim)' }} />
                  </div>
                )}
                <div style={{ padding: '12px' }}>
                  <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                  {item.platform && <p className="text-sub" style={{ fontSize: '12px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.platform}</p>}
                  {item.rating > 0 && (
                    <div style={{ display: 'flex', gap: '2px', marginBottom: '4px' }}>
                      {[1,2,3,4,5].map((n: number) => <i key={n} className={n <= item.rating ? 'fa-solid fa-star' : 'fa-regular fa-star'} style={{ fontSize: '11px', color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)' }} />)}
                    </div>
                  )}
                  {item.comment && <p className="text-dim" style={{ fontSize: '12px', marginTop: '4px', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{item.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
