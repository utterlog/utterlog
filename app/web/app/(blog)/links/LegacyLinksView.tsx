'use client';

// 非 Nebula 主题（Azure / Chred / Flux / Renascent / Utterlog 等）走的
// 友链页：v2.3.0 inline-style 版本 —— 简单分组 tabs + 申请按钮 + 卡片
// 网格，跨主题兼容（不依赖任何 .links-toolbar / .links-view-btn /
// .links-group-tab 这些只在 Nebula CSS 里有定义的 class）。
//
// Nebula 主题走 NebulaLinksView：toolbar + 视图切换 (card/compact/dice)。

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import PageTitle from '@/components/blog/PageTitle';
import { siteFaviconUrl } from '@/lib/site-favicon';

interface Link {
  id: number;
  name: string;
  url: string;
  description?: string;
  logo?: string;
  group_name?: string;
  rss_url?: string;
}

type LinkGroupStyle = 'card' | 'compact';

interface LinkGroupConfig {
  key: string;
  name: string;
  style: LinkGroupStyle;
  icon?: string;
}

const DEFAULT_GROUP_KEY = 'default';

function normalizeGroupKey(value: unknown) {
  return String(value || '').trim() || DEFAULT_GROUP_KEY;
}

function normalizeGroupStyle(style: unknown): LinkGroupStyle {
  return style === 'compact' ? 'compact' : 'card';
}

function normalizeGroupIcon(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/class=["']([^"']+)["']/i);
  return (match ? match[1] : raw).replace(/\s+/g, ' ').trim();
}

function parseLinkGroups(raw: unknown): LinkGroupConfig[] {
  const fallback: LinkGroupConfig[] = [{ key: DEFAULT_GROUP_KEY, name: '默认', style: 'card', icon: '' }];
  if (!raw) return fallback;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return fallback;
    const seen = new Set<string>();
    const groups: LinkGroupConfig[] = [];
    parsed.forEach((item: any) => {
      const key = normalizeGroupKey(typeof item === 'string' ? item : item?.key ?? item?.name);
      if (seen.has(key)) return;
      seen.add(key);
      groups.push({
        key,
        name: String(typeof item === 'string' ? (key === DEFAULT_GROUP_KEY ? '默认' : item) : item?.name ?? (key === DEFAULT_GROUP_KEY ? '默认' : item?.key) ?? key).trim() || key,
        style: normalizeGroupStyle(typeof item === 'string' ? 'card' : item?.style),
        icon: normalizeGroupIcon(typeof item === 'string' ? '' : item?.icon),
      });
    });
    if (!seen.has(DEFAULT_GROUP_KEY)) groups.unshift(fallback[0]);
    return groups;
  } catch {
    return fallback;
  }
}

function getFavicon(url: string) {
  return siteFaviconUrl(url);
}

export default function LegacyLinksView() {
  const [links, setLinks] = useState<Link[]>([]);
  const [linkGroups, setLinkGroups] = useState<LinkGroupConfig[]>([{ key: DEFAULT_GROUP_KEY, name: '默认', style: 'card', icon: '' }]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState('all');
  const [showApply, setShowApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', description: '', logo: '', avatar: '', rss_url: '', email: '' });

  useEffect(() => {
    fetchLinks();
  }, []);

  useEffect(() => {
    if (!showApply) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !applying) setShowApply(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [showApply, applying]);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const [linksRes, optionsRes]: any[] = await Promise.all([
        api.get('/links', { params: { per_page: 500 } }),
        api.get('/options'),
      ]);
      const data = linksRes.data || [];
      setLinks(data.filter((l: any) => l.status === 'publish' || l.status === 1));
      setLinkGroups(parseLinkGroups((optionsRes.data || optionsRes || {}).link_groups));
    } catch {} finally {
      setLoading(false);
    }
  };

  const groupMap = new Map(linkGroups.map(group => [group.key, group]));
  const linkGroupKeys = Array.from(new Set(links.map(link => normalizeGroupKey(link.group_name))));
  const configuredVisibleKeys = linkGroups.map(group => group.key).filter(key => linkGroupKeys.includes(key));
  const orphanVisibleKeys = linkGroupKeys.filter(key => !groupMap.has(key));
  const visibleGroupKeys = [...configuredVisibleKeys, ...orphanVisibleKeys];
  const groups = ['all', ...visibleGroupKeys];
  const groupLabel = (key: string) => key === 'all' ? '全部' : groupMap.get(key)?.name || (key === DEFAULT_GROUP_KEY ? '默认' : key);
  const groupStyle = (key: string) => groupMap.get(key)?.style || 'card';
  const groupIcon = (key: string) => groupMap.get(key)?.icon || 'fa-regular fa-folder';
  const filteredLinks = activeGroup === 'all' ? links : links.filter(l => normalizeGroupKey(l.group_name) === activeGroup);

  // Group links by group_name for display
  const groupedLinks = new Map<string, Link[]>();
  filteredLinks.forEach(l => {
    const g = normalizeGroupKey(l.group_name);
    if (!groupedLinks.has(g)) groupedLinks.set(g, []);
    groupedLinks.get(g)!.push(l);
  });
  const displayGroupKeys = activeGroup === 'all' ? visibleGroupKeys : [activeGroup];

  const handleApply = async () => {
    if (!form.name.trim()) { toast.error('请输入站点名称'); return; }
    if (!form.url.trim()) { toast.error('请输入站点地址'); return; }
    setApplying(true);
    try {
      await api.post('/links/apply', {
        name: form.name.trim(),
        url: form.url.trim(),
        description: form.description.trim(),
        logo: form.logo.trim() || getFavicon(form.url.trim()),
        avatar: form.avatar.trim(),
        rss_url: form.rss_url.trim(),
        email: form.email.trim(),
      });
      toast.success('申请已提交，审核通过后将显示');
      setForm({ name: '', url: '', description: '', logo: '', avatar: '', rss_url: '', email: '' });
      setShowApply(false);
    } catch {
      toast.error('提交失败，请稍后重试');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle
        title="友链"
        icon="fa-sharp fa-light fa-link"
        actions={
          <button
            onClick={() => setShowApply(true)}
            style={{
              padding: '6px 16px', fontSize: '13px', fontWeight: 600,
              border: '1px solid var(--color-primary, #0052D9)', color: 'var(--color-primary, #0052D9)',
              background: '#fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary, #0052D9)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = 'var(--color-primary, #0052D9)'; }}
          >
            <i className="fa-regular fa-handshake" style={{ fontSize: '12px' }} />
            我要申请
          </button>
        }
        meta={<><strong>{links.length}</strong> 个友链</>}
      />

      <div style={{ padding: '32px' }}>
        {/* Group tabs */}
        {groups.length > 2 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {groups.map(g => (
              <button key={g} onClick={() => setActiveGroup(g)} style={{
                padding: '6px 16px', fontSize: '13px', fontWeight: activeGroup === g ? 600 : 400,
                border: '1px solid',
                borderColor: activeGroup === g ? 'var(--color-primary, #0052D9)' : '#d9d9d9',
                background: activeGroup === g ? 'var(--color-primary, #0052D9)' : '#fff',
                color: activeGroup === g ? '#fff' : '#555',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {groupLabel(g)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>加载中…</div>
        ) : links.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>暂无友链</div>
        ) : (
          /* Grouped display */
          displayGroupKeys.map((groupName) => {
            const groupLinks = groupedLinks.get(groupName) || [];
            if (groupLinks.length === 0) return null;
            return (
            <div key={groupName} style={{ marginBottom: '32px' }}>
              {/* Group title — only show when viewing all */}
              {activeGroup === 'all' && groups.length > 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <i className={groupIcon(groupName)} style={{ color: 'var(--color-primary, #0052D9)', fontSize: '14px', width: '16px', textAlign: 'center' }} />
                  <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{groupLabel(groupName)}</h2>
                  <span style={{ fontSize: '12px', color: '#999' }}>{groupLinks.length} 个</span>
                </div>
              )}

              <div className={groupStyle(groupName) === 'compact' ? 'friend-link-compact-grid' : 'friend-link-card-grid'}>
                {groupLinks.map(link => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={groupStyle(groupName) === 'compact' ? 'friend-link-compact-item' : 'friend-link-card-item'}
                  >
                    <img
                      src={link.logo || getFavicon(link.url)}
                      alt=""
                      className="friend-link-logo"
                      onError={e => { (e.target as HTMLImageElement).src = getFavicon(link.url); }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="friend-link-name">
                        {link.name}
                      </div>
                      {groupStyle(groupName) !== 'compact' && link.description && (
                        <div className="friend-link-description">
                          {link.description}
                        </div>
                      )}
                    </div>
                    {groupStyle(groupName) !== 'compact' && (
                      <i className="fa-regular fa-arrow-up-right-from-square friend-link-external" />
                    )}
                  </a>
                ))}
              </div>
            </div>
            );
          })
        )}

      </div>

      {/* Apply Modal */}
      {showApply && (
        <div
          onClick={() => !applying && setShowApply(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: '640px', maxHeight: 'calc(100vh - 48px)',
              background: '#fff', border: '1px solid #e5e5e5',
              boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e5e5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-regular fa-handshake" style={{ color: 'var(--color-primary, #0052D9)', fontSize: '16px' }} />
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>申请友链</h2>
              </div>
              <button
                onClick={() => !applying && setShowApply(false)}
                disabled={applying}
                aria-label="关闭"
                style={{
                  width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', cursor: applying ? 'not-allowed' : 'pointer',
                  color: '#999', fontSize: '16px', transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; e.currentTarget.style.color = '#333'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#999'; }}
              >
                <i className="fa-regular fa-xmark" />
              </button>
            </div>

            {/* Modal body — scrollable */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px', lineHeight: 1.6 }}>
                欢迎互换友链！请填写以下信息，审核通过后将自动显示在本页。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点名称 *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="我的博客"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点地址 *</label>
                  <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点描述</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="一句话介绍你的站点"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>站点图标</label>
                  <input value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder="留空自动获取"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>头像地址</label>
                  <input value={form.avatar} onChange={e => setForm({ ...form, avatar: e.target.value })} placeholder="https://example.com/avatar.png"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>RSS / Feed 地址</label>
                  <input value={form.rss_url} onChange={e => setForm({ ...form, rss_url: e.target.value })} placeholder="https://example.com/feed.xml"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>联系邮箱</label>
                  <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="方便通知审核结果（选填）" type="email"
                    style={{ width: '100%', padding: '8px 12px', fontSize: '13px', border: '1px solid #d9d9d9', outline: 'none', background: '#fff', color: '#1a1a1a', boxSizing: 'border-box' }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-primary, #0052D9)')} onBlur={e => (e.currentTarget.style.borderColor = '#d9d9d9')}
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px', borderTop: '1px solid #e5e5e5', background: '#fafafa' }}>
              <button
                onClick={() => !applying && setShowApply(false)}
                disabled={applying}
                style={{
                  padding: '7px 18px', fontSize: '13px', fontWeight: 500,
                  border: '1px solid #d9d9d9', background: '#fff', color: '#555',
                  cursor: applying ? 'not-allowed' : 'pointer',
                }}
              >
                取消
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                style={{
                  padding: '8px 24px', fontSize: '13px', fontWeight: 600,
                  border: 'none', background: 'var(--color-primary, #0052D9)', color: '#fff',
                  cursor: applying ? 'wait' : 'pointer', opacity: applying ? 0.6 : 1,
                }}
              >
                {applying ? '提交中…' : '提交申请'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
