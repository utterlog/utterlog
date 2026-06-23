
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { formatWithAdminTimeZone } from '@/lib/timezone';

export default function NotificationBell() {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingComments, setPendingComments] = useState(0);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000); // poll every minute
    // 实时事件总线 —— 评论页 / 通知页操作完成后调
    // window.dispatchEvent(new Event('admin:notifications-changed'))，
    // 铃铛立刻重拉一次。之前要等下一轮 60s 轮询，红点不消失体验差。
    const onChanged = () => fetchUnread();
    window.addEventListener('admin:notifications-changed', onChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('admin:notifications-changed', onChanged);
    };
  }, []);

  const fetchUnread = async () => {
    try {
      const r: any = await api.get('/notifications/unread-count');
      setUnread(r.data?.count || 0);
    } catch {}
    try {
      const r: any = await api.get('/comments/pending-count');
      setPendingComments(r.data?.pending || 0);
    } catch {}
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/notifications?page=1&per_page=10');
      setNotifications(r.data || []);
    } catch {}
    setLoading(false);
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setUnread(0);
      setNotifications(ns => ns.map(n => ({ ...n, is_read: true })));
      // 同步重拉 pendingComments —— 万一这次刚好审批了评论让数据
      // 跟服务器端短暂不一致，再 fetch 一次保证准确
      window.dispatchEvent(new Event('admin:notifications-changed'));
    } catch {}
  };

  const handleOpen = () => {
    if (!open) fetchNotifications();
    setOpen(!open);
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const num = typeof ts === 'number' ? ts : parseInt(ts);
    const d = new Date(num * 1000);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return t('admin.time.justNow', '刚刚');
    if (diff < 3600) return t('admin.time.minutesAgo', '{count} 分钟前', { count: Math.floor(diff / 60) });
    if (diff < 86400) return t('admin.time.hoursAgo', '{count} 小时前', { count: Math.floor(diff / 3600) });
    return formatWithAdminTimeZone(d, locale || 'zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={handleOpen} className="relative p-2 text-sub btn-ghost" style={{ borderRadius: '1px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="fa-regular fa-bell" style={{ fontSize: '17px' }} />
        {(unread + pendingComments) > 0 && (
          <span style={{
            position: 'absolute', top: '4px', right: '4px',
            minWidth: '16px', height: '16px', borderRadius: '8px',
            background: '#F53F3F', color: '#fff', fontSize: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', fontWeight: 600,
          }}>
            {(unread + pendingComments) > 99 ? '99+' : unread + pendingComments}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: '8px',
            width: '340px', maxHeight: '400px', zIndex: 41,
            background: 'var(--color-bg-card)', borderRadius: '1px',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>{t('admin.notification.title', '通知')}</span>
              {unread > 0 && (
                <button onClick={markAllRead} style={{ fontSize: '12px', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {t('admin.notification.markAllRead', '全部已读')}
                </button>
              )}
            </div>

            {/* Pending comments alert */}
            {pendingComments > 0 && (
              <Link to="/comments/pending" onClick={() => setOpen(false)} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 16px', background: '#fef3c7', borderBottom: '1px solid #fde68a',
                textDecoration: 'none', color: '#92400e', fontSize: '13px',
              }}>
                <i className="fa-solid fa-comment-dots" style={{ fontSize: '14px' }} />
                <span>{t('admin.notification.pendingComments', '{count} 条评论等待审核', { count: pendingComments })}</span>
                <i className="fa-solid fa-chevron-right" style={{ fontSize: '10px', marginLeft: 'auto', opacity: 0.5 }} />
              </Link>
            )}

            {/* List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>{t('common.loading', '加载中…')}</div>
              ) : notifications.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px' }}>{t('admin.notification.empty', '暂无通知')}</div>
              ) : (
                notifications.map((n, i) => (
                  <div key={i} style={{
                    padding: '10px 16px', borderBottom: '1px solid var(--color-divider)',
                    background: n.is_read ? 'transparent' : 'var(--color-bg-soft)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                      <p style={{ fontSize: '13px', fontWeight: n.is_read ? 400 : 600, flex: 1 }}>
                        {typeof n.title === 'string' ? n.title : String(n.title || '')}
                      </p>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', flexShrink: 0, marginLeft: '8px' }}>
                        {formatTime(n.created_at)}
                      </span>
                    </div>
                    {n.content && <p style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof n.content === 'string' ? n.content : ''}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
