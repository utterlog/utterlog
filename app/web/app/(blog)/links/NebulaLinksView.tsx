'use client';

// Nebula 主题专用的友链页：toolbar 集成分组 tabs + 视图切换 (card /
// compact / dice 随机访问) + 申请按钮，class 驱动的暗色 UI。
// 所有 .links-toolbar / .links-view-btn / .links-group-tab 等样式定义在
// app/web/themes/Nebula/styles.css 里。
//
// 其他主题走 LegacyLinksView（v2.3.0 简单分组 + inline 样式）。

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import PageTitle from '@/components/blog/PageTitle';
import { siteFaviconUrl } from '@/lib/site-favicon';

type ViewMode = 'card' | 'compact';

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

export default function NebulaLinksView() {
  const [links, setLinks] = useState<Link[]>([]);
  const [linkGroups, setLinkGroups] = useState<LinkGroupConfig[]>([{ key: DEFAULT_GROUP_KEY, name: '默认', style: 'card', icon: '' }]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState('all');
  const [showApply, setShowApply] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', description: '', logo: '', avatar: '', rss_url: '', email: '' });
  // 用户视图切换：null = 跟随 admin per-group 配置；'card' / 'compact' = 全局覆盖
  const [viewOverride, setViewOverride] = useState<ViewMode | null>(null);
  // 随机骰子访问：rolling 摇动 1.2s → result 展示卡片 + 5s 倒计时
  const [diceState, setDiceState] = useState<'idle' | 'rolling' | 'result'>('idle');
  const [dicePoints, setDicePoints] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [rolledLink, setRolledLink] = useState<Link | null>(null);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);

  useEffect(() => {
    fetchLinks();
    // 持久化用户视图选择
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('links-view-mode');
      if (saved === 'card' || saved === 'compact') setViewOverride(saved);
    }
  }, []);

  const setView = (mode: ViewMode) => {
    setViewOverride(mode);
    try { window.localStorage.setItem('links-view-mode', mode); } catch {}
  };

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
  // 视图覆盖优先：用户选了模式就强制全局，否则跟随 admin per-group
  const groupStyle = (key: string): LinkGroupStyle => viewOverride || groupMap.get(key)?.style || 'card';
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

  const visitRandomLink = () => {
    if (links.length === 0) {
      toast.error('暂无可访问的友链');
      return;
    }
    setRolledLink(null);
    setAutoCountdown(null);
    setDiceState('rolling');
  };

  const closeDiceModal = () => {
    setDiceState('idle');
    setRolledLink(null);
    setAutoCountdown(null);
  };

  const visitRolledLink = () => {
    if (rolledLink?.url) {
      window.open(rolledLink.url, '_blank', 'noopener,noreferrer');
    }
    closeDiceModal();
  };

  // 摇动动画：每 80ms 切换骰子点数；1200ms 后定格在最终点数 + 锁定友链
  useEffect(() => {
    if (diceState !== 'rolling') return;
    const startTime = Date.now();
    const duration = 1200;
    const tick = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        clearInterval(tick);
        const idx = Math.floor(Math.random() * links.length);
        const finalPoints = ((idx % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
        setDicePoints(finalPoints);
        setRolledLink(links[idx]);
        setDiceState('result');
        setAutoCountdown(5);
        return;
      }
      setDicePoints((((elapsed / 100) | 0) % 6 + 1) as 1 | 2 | 3 | 4 | 5 | 6);
    }, 80);
    return () => clearInterval(tick);
  }, [diceState, links]);

  // 5 秒倒计时：每秒 -1，到 0 自动新窗口打开
  useEffect(() => {
    if (autoCountdown === null) return;
    if (autoCountdown <= 0) {
      visitRolledLink();
      return;
    }
    const t = setTimeout(() => setAutoCountdown(autoCountdown - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCountdown]);

  // ESC 关闭
  useEffect(() => {
    if (diceState === 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDiceModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diceState]);

  return (
    <div style={{ minHeight: 'calc(100vh - 200px)' }}>
      <PageTitle
        title="友链"
        icon="fa-sharp fa-light fa-link"
        actions={
          <span className="links-actions-count" style={{ fontSize: '13px', color: 'var(--color-text-sub, #555)' }}>
            <strong style={{ color: 'var(--color-text-main, #1a1a1a)' }}>{links.length}</strong> 个友链
          </span>
        }
      />

      <div style={{ padding: '32px' }}>
        {/* 顶部 toolbar：分组切换 + 视图切换 */}
        <div className="links-toolbar">
          <div className="links-group-tabs">
            {groups.length > 2 && groups.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`links-group-tab${activeGroup === g ? ' active' : ''}`}
              >
                {groupLabel(g)}
              </button>
            ))}
          </div>
          <div className="links-view-toggle" aria-label="视图模式与操作">
            <button
              type="button"
              aria-selected={groupStyle(displayGroupKeys[0] || DEFAULT_GROUP_KEY) === 'card'}
              className={`links-view-btn${(viewOverride || 'card') === 'card' ? ' active' : ''}`}
              onClick={() => setView('card')}
              title="卡片视图"
              aria-label="卡片视图"
            >
              <i className="fa-solid fa-table-cells-large" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-selected={viewOverride === 'compact'}
              className={`links-view-btn${viewOverride === 'compact' ? ' active' : ''}`}
              onClick={() => setView('compact')}
              title="紧凑列表"
              aria-label="紧凑列表"
            >
              <i className="fa-solid fa-grip" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="links-view-btn"
              onClick={visitRandomLink}
              title="随机访问一个友链"
              aria-label="随机访问一个友链"
            >
              <i className="fa-solid fa-dice" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="links-view-btn"
              onClick={() => setShowApply(true)}
              title="我要申请友链"
              aria-label="我要申请友链"
            >
              <i className="fa-solid fa-plus" aria-hidden="true" />
            </button>
          </div>
        </div>

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
                <div className="friend-link-group-head" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <i className={groupIcon(groupName)} style={{ color: 'var(--color-primary, #0052D9)', fontSize: '14px', width: '16px', textAlign: 'center' }} />
                  <h2 className="friend-link-group-title" style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{groupLabel(groupName)}</h2>
                  <span className="friend-link-group-count" style={{ fontSize: '12px', color: '#999' }}>{groupLinks.length} 个</span>
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
          className="links-apply-backdrop"
          onClick={() => !applying && setShowApply(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}
        >
          <div
            className="links-apply-modal"
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

      {/* ==================== 随机骰子访问弹窗 ==================== */}
      {diceState !== 'idle' && (
        <div
          className="dice-modal-backdrop"
          onClick={() => diceState === 'result' && closeDiceModal()}
          onMouseEnter={() => setAutoCountdown(null)}
        >
          <div className="dice-modal-content" onClick={e => e.stopPropagation()}>
            {diceState === 'result' && (
              <button
                className="dice-modal-close"
                onClick={closeDiceModal}
                title="关闭"
                aria-label="关闭"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            )}

            <div className={`dice-icon dice-icon--${diceState}`}>
              <i className={`fa-solid fa-dice-${diceFaceClassMap[dicePoints]}`} aria-hidden="true" />
            </div>

            {diceState === 'rolling' && (
              <p className="dice-hint">正在摇骰子……</p>
            )}

            {diceState === 'result' && rolledLink && (
              <>
                <div className="dice-result-card">
                  <img
                    className="friend-link-logo"
                    src={rolledLink.logo || getFavicon(rolledLink.url)}
                    alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = getFavicon(rolledLink.url); }}
                  />
                  <div className="dice-result-info">
                    <h3>{rolledLink.name}</h3>
                    {rolledLink.description && <p>{rolledLink.description}</p>}
                    <div className="dice-result-url">{rolledLink.url}</div>
                  </div>
                </div>
                <div className="dice-actions">
                  <button className="dice-btn-secondary" onClick={visitRandomLink}>
                    <i className="fa-solid fa-rotate-right" /> 再摇一次
                  </button>
                  <button className="dice-btn-primary" onClick={visitRolledLink}>
                    <i className="fa-solid fa-arrow-up-right-from-square" />
                    立即访问{autoCountdown !== null ? ` (${autoCountdown})` : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// FA dice 图标对应表：1→one, 2→two, ..., 6→six
const diceFaceClassMap: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
};
