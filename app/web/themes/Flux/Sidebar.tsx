'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PostLink from '@/components/blog/PostLink';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

// Simple MD5 for gravatar hash
function md5(s: string): string {
  function L(k: number, d: number) { return (k << d) | (k >>> (32 - d)); }
  function K(G: number, k: number) { const I = G & 2147483648, d = k & 2147483648, F = G & 1073741824, E = k & 1073741824, B = (G & 1073741823) + (k & 1073741823); if (F & E) return B ^ 2147483648 ^ I ^ d; if (F | E) { if (B & 1073741824) return B ^ 3221225472 ^ I ^ d; else return B ^ 1073741824 ^ I ^ d; } return B ^ I ^ d; }
  function r(d: number, F: number, E: number) { return (d & F) | (~d & E); }
  function q(d: number, F: number, E: number) { return (d & E) | (F & ~E); }
  function p(d: number, F: number, E: number) { return d ^ F ^ E; }
  function n(d: number, F: number, E: number) { return F ^ (d | ~E); }
  function u(G: number, F: number, aa: number, Z: number, k: number, H: number, I: number) { G = K(G, K(K(r(F, aa, Z), k), I)); return K(L(G, H), F); }
  function f(G: number, F: number, aa: number, Z: number, k: number, H: number, I: number) { G = K(G, K(K(q(F, aa, Z), k), I)); return K(L(G, H), F); }
  function D(G: number, F: number, aa: number, Z: number, k: number, H: number, I: number) { G = K(G, K(K(p(F, aa, Z), k), I)); return K(L(G, H), F); }
  function t(G: number, F: number, aa: number, Z: number, k: number, H: number, I: number) { G = K(G, K(K(n(F, aa, Z), k), I)); return K(L(G, H), F); }
  function e(G: string) { let Z; const F = G.length; const x = F + 8; const k = (((x - (x % 64)) / 64) + 1) * 16; const I = new Array(k - 1); let aa = 0; let d = 0; while (d < F) { Z = (d - (d % 4)) / 4; aa = (d % 4) * 8; I[Z] = (I[Z] | (G.charCodeAt(d) << aa)); d++; } Z = (d - (d % 4)) / 4; aa = (d % 4) * 8; I[Z] = I[Z] | (128 << aa); I[k - 2] = F << 3; I[k - 1] = F >>> 29; return I; }
  function B(d: number) { let k = '', F = '', G, I; for (I = 0; I <= 3; I++) { G = (d >>> (I * 8)) & 255; F = '0' + G.toString(16); k = k + F.substr(F.length - 2, 2); } return k; }
  const C = e(unescape(encodeURIComponent(s)));
  let a = 1732584193, b = 4023233417, c = 2562383102, d = 271733878;
  for (let S = 0; S < C.length; S += 16) {
    const AA = a, BB = b, CC = c, DD = d;
    a=u(a,b,c,d,C[S+0],7,3614090360);d=u(d,a,b,c,C[S+1],12,3905402710);c=u(c,d,a,b,C[S+2],17,606105819);b=u(b,c,d,a,C[S+3],22,3250441966);a=u(a,b,c,d,C[S+4],7,4118548399);d=u(d,a,b,c,C[S+5],12,1200080426);c=u(c,d,a,b,C[S+6],17,2821735955);b=u(b,c,d,a,C[S+7],22,4249261313);a=u(a,b,c,d,C[S+8],7,1770035416);d=u(d,a,b,c,C[S+9],12,2336552879);c=u(c,d,a,b,C[S+10],17,4294925233);b=u(b,c,d,a,C[S+11],22,2304563134);a=u(a,b,c,d,C[S+12],7,1804603682);d=u(d,a,b,c,C[S+13],12,4254626195);c=u(c,d,a,b,C[S+14],17,2792965006);b=u(b,c,d,a,C[S+15],22,1236535329);
    a=f(a,b,c,d,C[S+1],5,4129170786);d=f(d,a,b,c,C[S+6],9,3225465664);c=f(c,d,a,b,C[S+11],14,643717713);b=f(b,c,d,a,C[S+0],20,3921069994);a=f(a,b,c,d,C[S+5],5,3593408605);d=f(d,a,b,c,C[S+10],9,38016083);c=f(c,d,a,b,C[S+15],14,3634488961);b=f(b,c,d,a,C[S+4],20,3889429448);a=f(a,b,c,d,C[S+9],5,568446438);d=f(d,a,b,c,C[S+14],9,3275163606);c=f(c,d,a,b,C[S+3],14,4107603335);b=f(b,c,d,a,C[S+8],20,1163531501);a=f(a,b,c,d,C[S+13],5,2850285829);d=f(d,a,b,c,C[S+2],9,4243563512);c=f(c,d,a,b,C[S+7],14,1735328473);b=f(b,c,d,a,C[S+12],20,2368359562);
    a=D(a,b,c,d,C[S+5],4,4294588738);d=D(d,a,b,c,C[S+8],11,2272392833);c=D(c,d,a,b,C[S+11],16,1839030562);b=D(b,c,d,a,C[S+14],23,4259657740);a=D(a,b,c,d,C[S+1],4,2763975236);d=D(d,a,b,c,C[S+4],11,1272893353);c=D(c,d,a,b,C[S+7],16,4139469664);b=D(b,c,d,a,C[S+10],23,3200236656);a=D(a,b,c,d,C[S+13],4,681279174);d=D(d,a,b,c,C[S+0],11,3936430074);c=D(c,d,a,b,C[S+3],16,3572445317);b=D(b,c,d,a,C[S+6],23,76029189);a=D(a,b,c,d,C[S+9],4,3654602809);d=D(d,a,b,c,C[S+12],11,3873151461);c=D(c,d,a,b,C[S+15],16,530742520);b=D(b,c,d,a,C[S+2],23,3299628645);
    a=t(a,b,c,d,C[S+0],6,4096336452);d=t(d,a,b,c,C[S+7],10,1126891415);c=t(c,d,a,b,C[S+14],15,2878612391);b=t(b,c,d,a,C[S+5],21,4237533241);a=t(a,b,c,d,C[S+12],6,1700485571);d=t(d,a,b,c,C[S+3],10,2399980690);c=t(c,d,a,b,C[S+10],15,4293915773);b=t(b,c,d,a,C[S+1],21,2240044497);a=t(a,b,c,d,C[S+8],6,1873313359);d=t(d,a,b,c,C[S+15],10,4264355552);c=t(c,d,a,b,C[S+6],15,2734768916);b=t(b,c,d,a,C[S+13],21,1309151649);a=t(a,b,c,d,C[S+4],6,4149444226);d=t(d,a,b,c,C[S+11],10,3174756917);c=t(c,d,a,b,C[S+2],15,718787259);b=t(b,c,d,a,C[S+9],21,3951481745);
    a=K(a,AA);b=K(b,BB);c=K(c,CC);d=K(d,DD);
  }
  return (B(a)+B(b)+B(c)+B(d)).toLowerCase();
}

import { getCategoryIcon } from './constants';

function timeAgo(ts: string | number) {
  const t = typeof ts === 'number' ? ts * 1000 : new Date(ts).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return Math.floor(diff / 86400) + ' 天前';
}

export default function Sidebar() {
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [activeTab, setActiveTab] = useState<'latest' | 'hot' | 'random'>('latest');
  const [tabPosts, setTabPosts] = useState<any[]>([]);
  const [archiveOpen, setArchiveOpen] = useState<string | null>(null);
  const [author, setAuthor] = useState<any>(null);
  const [siteOptions, setSiteOptions] = useState<any>({}); // year string or null

  useEffect(() => {
    fetch(`${API}/categories`).then(r => r.json()).then(r => setCategories(r.data || [])).catch(() => {});
    fetch(`${API}/tags`).then(r => r.json()).then(r => {
      const t = (r.data || []).sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
      setTags(t.slice(0, 20));
    }).catch(() => {});
    fetch(`${API}/comments?per_page=5&status=approved&exclude_admin=1`).then(r => r.json()).then(r => {
      const all = r.data?.comments || r.data || [];
      setComments(all);
    }).catch(() => {});
    fetch(`${API}/archive/stats`).then(r => r.json()).then(r => setStats(r.data || {})).catch(() => {});
    fetch(`${API}/options`).then(r => r.json()).then(r => setSiteOptions(r.data || {})).catch(() => {});
    fetch(`${API}/owner`).then(r => r.json()).then(r => { if (r.data) setAuthor(r.data); }).catch(() => {});
    fetchTabPosts('latest');
  }, []);

  const fetchTabPosts = (tab: string) => {
    let url = `${API}/posts?per_page=5&status=publish`;
    if (tab === 'hot') url += '&order_by=comment_count&order=desc';
    if (tab === 'random') url += '&order_by=random&_t=' + Date.now();
    fetch(url).then(r => r.json()).then(r => setTabPosts((r.data?.posts || r.data || []).slice(0, 5))).catch(() => {});
  };

  const switchTab = (tab: 'latest' | 'hot' | 'random') => {
    setActiveTab(tab);
    fetchTabPosts(tab);
  };

  const sectionTitle = (icon: string, label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: 600, color: '#333' }}>
      <i className={icon} style={{ color: '#0052D9' }} /> {label}
    </div>
  );

  return (
    <aside style={{ width: '100%' }}>

      {/* Author profile card — `author.avatar` is resolved by
          theme-data.ts from /owner's `avatar` field (always a URL via
          resolveDisplayAvatar). Same source Footer uses. */}
      <div style={{ borderBottom: '1px solid #e5e5e5', padding: '20px 16px', textAlign: 'center' }}>
        {author?.avatar && (
          <img
            src={author.avatar}
            alt=""
            style={{ width: 64, height: 64, objectFit: 'cover', margin: '0 auto 8px', display: 'block', background: '#f0f0f0', clipPath: 'url(#squircle)' }}
          />
        )}
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>
          {author?.nickname || siteOptions.site_title || '博主'}
        </div>
        {(author?.bio || siteOptions.site_description) && (
          <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 10px' }}>{author?.bio || siteOptions.site_description}</p>
        )}
        {/* Social links */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', fontSize: '16px' }}>
          {siteOptions.social_github && (
            <a href={siteOptions.social_github} target="_blank" rel="noopener noreferrer" style={{ color: '#666', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#333')} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
              <i className="fa-brands fa-github" />
            </a>
          )}
          {siteOptions.social_twitter && (
            <a href={siteOptions.social_twitter} target="_blank" rel="noopener noreferrer" style={{ color: '#666', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1da1f2')} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
              <i className="fa-brands fa-x-twitter" />
            </a>
          )}
          {siteOptions.social_weibo && (
            <a href={siteOptions.social_weibo} target="_blank" rel="noopener noreferrer" style={{ color: '#666', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e6162d')} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
              <i className="fa-brands fa-weibo" />
            </a>
          )}
          {siteOptions.social_telegram && (
            <a href={siteOptions.social_telegram} target="_blank" rel="noopener noreferrer" style={{ color: '#666', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#0088cc')} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
              <i className="fa-brands fa-telegram" />
            </a>
          )}
          {siteOptions.social_email && (
            <a href={`mailto:${siteOptions.social_email}`} style={{ color: '#666', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#333')} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
              <i className="fa-regular fa-envelope" />
            </a>
          )}
          {siteOptions.site_url && (
            <a href={siteOptions.site_url} target="_blank" rel="noopener noreferrer" style={{ color: '#666', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#0052D9')} onMouseLeave={e => (e.currentTarget.style.color = '#666')}>
              <i className="fa-solid fa-globe" />
            </a>
          )}
        </div>
      </div>

      {/* Post tabs */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        <div style={{ display: 'flex' }}>
          {[
            { key: 'latest' as const, icon: 'fa-regular fa-clock', label: '最新日志' },
            { key: 'hot' as const, icon: 'fa-solid fa-fire', label: '热评日志' },
            { key: 'random' as const, icon: 'fa-solid fa-shuffle', label: '随机日志' },
          ].map(tab => (
            <button key={tab.key} onClick={() => switchTab(tab.key)} style={{
              flex: 1, padding: '8px 0', fontSize: '11px', fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#fff' : '#666',
              background: activeTab === tab.key ? '#0052D9' : '#fafafa',
              border: 'none', borderBottom: activeTab === tab.key ? 'none' : '1px solid #e5e5e5',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            }}>
              <i className={tab.icon} style={{ fontSize: '10px' }} /> {tab.label}
            </button>
          ))}
        </div>
        <div>
          {tabPosts.map((post: any, idx: number) => {
            const numIcons = ['fa-solid fa-1', 'fa-solid fa-2', 'fa-solid fa-3', 'fa-solid fa-4', 'fa-solid fa-5'];
            return (
            <PostLink key={post.id} post={post} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 10px', fontSize: '13px', color: '#333',
              textDecoration: 'none', borderBottom: idx < tabPosts.length - 1 ? '1px solid #f0f0f0' : 'none',
              transition: 'background 0.1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i className={`${numIcons[idx] || 'fa-solid fa-5'}`} style={{ color: idx < 3 ? '#0052D9' : '#bbb', fontSize: '12px', width: '14px', textAlign: 'center' as const, flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.title}</span>
            </PostLink>
            );
          })}
        </div>
      </div>

      {/* Recent comments */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-regular fa-comments', '最新评论')}
        {comments.map((c: any, idx: number) => (
          <div key={c.id} style={{ display: 'flex', gap: '10px', padding: '10px 16px', borderBottom: idx < comments.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
            <img
              src={c.avatar_url || `https://gravatar.bluecdn.com/avatar/${c.author_email ? md5(String(c.author_email).trim().toLowerCase()) : '0'}?s=40&d=mp`}
              alt="" style={{ width: 32, height: 32, objectFit: 'cover', flexShrink: 0, clipPath: 'url(#squircle)' }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{c.author_name || c.author}</span>
                <span style={{ fontSize: '11px', color: '#bbb' }}>{timeAgo(c.created_at)}</span>
              </div>
              <p style={{ fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0 0' }}>
                {c.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tags — colorful cloud */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-solid fa-tags', '关键词')}
        <div style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {tags.map((tag, i) => {
            const colors = ['#0052D9', '#e53935', '#43a047', '#f57c00', '#8e24aa', '#00838f', '#c62828', '#1565c0', '#2e7d32', '#d84315'];
            const c = colors[i % colors.length];
            const size = tag.count > 5 ? 14 : tag.count > 2 ? 13 : 12;
            return (
              <Link prefetch={false} key={tag.id} href={`/tags/${tag.slug}`} style={{
                padding: '4px 10px', fontSize: `${size}px`,
                border: `1px solid ${c}40`, color: c, background: `${c}08`,
                textDecoration: 'none', transition: 'all 0.15s',
                fontWeight: tag.count > 3 ? 600 : 400,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = c; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = c; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${c}08`; e.currentTarget.style.color = c; e.currentTarget.style.borderColor = `${c}40`; }}
              >
                {tag.name} <span style={{ fontSize: '10px', opacity: 0.6 }}>{tag.count}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Categories — full list */}
      {/* 过滤掉 0 篇文章的分类（用户要求只展示有内容的） */}
      {(() => {
        const visibleCategories = (categories || []).filter((c: any) => (c.count || 0) > 0);
        if (visibleCategories.length === 0) return null;
        return (
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-solid fa-folder-tree', '文章分类')}
        {visibleCategories.map((cat, idx) => (
          <Link prefetch={false} key={cat.id} href={`/categories/${cat.slug}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 16px', fontSize: '13px', color: '#333',
            textDecoration: 'none', borderBottom: idx < visibleCategories.length - 1 ? '1px solid #f5f5f5' : 'none',
            transition: 'background 0.1s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className={`${getCategoryIcon(cat)} fa-fw`} style={{ color: '#0052D9' }} />
              {cat.name}
            </span>
            <span style={{ fontSize: '12px', color: '#bbb' }}>{cat.count || 0}</span>
          </Link>
        ))}
      </div>
        );
      })()}

      {/* Archive — current year expanded, other years collapsed */}
      <div style={{ borderBottom: '1px solid #e5e5e5' }}>
        {sectionTitle('fa-solid fa-calendar-days', '文章归档')}
        {(() => {
          const hm: any[] = stats.heatmap || [];
          const monthMap: Record<string, number> = {};
          hm.forEach((d: any) => {
            if (!d.date) return;
            const ym = d.date.substring(0, 7);
            monthMap[ym] = (monthMap[ym] || 0) + (d.count || 0);
          });
          const yearMap: Record<string, { month: string; count: number }[]> = {};
          Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).forEach(([ym, count]) => {
            const [y, m] = ym.split('-');
            if (!yearMap[y]) yearMap[y] = [];
            yearMap[y].push({ month: m, count });
          });
          const currentYear = String(new Date().getFullYear());
          const years = Object.keys(yearMap).sort((a, b) => b.localeCompare(a));

          return years.map((year, yi) => {
            const isCurrentYear = year === currentYear;
            const isOpen = isCurrentYear || archiveOpen === year;
            const yearTotal = yearMap[year].reduce((s, m) => s + m.count, 0);
            const isLastYear = yi === years.length - 1;
            return (
              <div key={year}>
                <button onClick={() => setArchiveOpen(isOpen && !isCurrentYear ? null : year)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '8px 16px', fontSize: '13px', fontWeight: 600,
                  background: 'none', border: 'none', borderBottom: (isLastYear && !isOpen) ? 'none' : '1px solid #f5f5f5',
                  cursor: 'pointer', color: '#333',
                }}>
                  <span>
                    {!isCurrentYear && <i className={`fa-solid fa-chevron-${isOpen ? 'down' : 'right'} fa-fw`} style={{ fontSize: '10px', color: '#bbb', marginRight: '4px' }} />}
                    {year} 年
                  </span>
                  <span style={{ fontSize: '12px', color: '#bbb' }}>{yearTotal} 篇</span>
                </button>
                {isOpen && yearMap[year].map((m, mi) => (
                  <Link prefetch={false} key={m.month} href={`/date/${year}/${m.month}`} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 16px 6px 32px', fontSize: '12px', color: '#666',
                    textDecoration: 'none', borderBottom: (isLastYear && mi === yearMap[year].length - 1) ? 'none' : '1px solid #f8f8f8',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>{parseInt(m.month)} 月</span>
                    <span style={{ color: '#bbb' }}>{m.count}</span>
                  </Link>
                ))}
              </div>
            );
          });
        })()}
      </div>

      {/* Stats */}
      <div>
        {sectionTitle('fa-solid fa-chart-simple', '统计信息')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '0' }}>
          {[
            { label: '文章', value: stats.post_count || 0 },
            { label: '评论', value: stats.comment_count || 0 },
            { label: '建站天数', value: stats.days || 0 },
            { label: '全部字数', value: stats.word_count || 0 },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '12px 16px', height: '60px',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              borderBottom: i < 2 ? '1px solid #f0f0f0' : 'none',
              borderRight: i % 2 === 0 ? '1px solid #f0f0f0' : 'none',
            }}>
              <div style={{ fontSize: '11px', color: '#999', lineHeight: 1 }}>{s.label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
