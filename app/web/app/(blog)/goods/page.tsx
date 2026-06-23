import type { Metadata } from 'next';
import { getGoods } from '@/lib/blog-api';
import PageTitle from '@/components/blog/PageTitle';

export const metadata: Metadata = { title: '好物' };

export default async function GoodsPage() {
  let items: any[] = [];
  try { const r = await getGoods({ per_page: 60 }); items = r.data || []; } catch {}

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle
        title="好物"
        icon="fa-sharp fa-light fa-bag-shopping"
        subtitle="我用过的"
        meta={<><strong>{items.length}</strong> 件好物</>}
      />

      <div style={{ padding: '32px' }}>
        {items.length === 0 ? (
          <p className="text-dim" style={{ textAlign: 'center', padding: '80px 0' }}>暂无内容</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
            {items.map((item: any) => (
              <div key={item.id} style={{ border: '1px solid var(--color-border)', background: 'var(--color-bg)', overflow: 'hidden' }}>
                {item.cover_url ? (
                  <div style={{ width: '100%', height: '180px', background: 'var(--color-bg-soft)', overflow: 'hidden' }}>
                    <img src={item.cover_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ width: '100%', height: '180px', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa-sharp fa-light fa-bag-shopping" style={{ fontSize: '36px', color: 'var(--color-text-dim)' }} />
                  </div>
                )}
                <div style={{ padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                    <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                    {item.price && <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', flexShrink: 0 }}>{item.price}</span>}
                  </div>
                  {item.brand && <p className="text-sub" style={{ fontSize: '12px', marginBottom: '6px' }}>{item.brand}</p>}
                  {item.rating > 0 && (
                    <div style={{ display: 'flex', gap: '2px', marginBottom: '6px' }}>
                      {[1,2,3,4,5].map((n: number) => <i key={n} className={n <= item.rating ? 'fa-solid fa-star' : 'fa-regular fa-star'} style={{ fontSize: '11px', color: n <= item.rating ? '#f59e0b' : 'var(--color-text-dim)' }} />)}
                    </div>
                  )}
                  {item.comment && <p className="text-dim" style={{ fontSize: '12px', marginBottom: '6px', lineHeight: 1.5 }}>{item.comment}</p>}
                  {item.pros && <p style={{ fontSize: '12px', color: '#16a34a', marginBottom: '2px' }}><i className="fa-regular fa-plus" style={{ marginRight: '4px' }} />{item.pros}</p>}
                  {item.cons && <p style={{ fontSize: '12px', color: '#dc2626' }}><i className="fa-regular fa-minus" style={{ marginRight: '4px' }} />{item.cons}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
