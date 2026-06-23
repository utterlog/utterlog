
import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, SaveButton } from '@/components/ui';
import api, { networkApi, optionsApi } from '@/lib/api';

export default function UtterlogCenterPage() {
  // Network status
  const [networkStatus, setNetworkStatus] = useState<{ connected: boolean; site_id: string; hub: string; fingerprint: string }>({
    connected: false, site_id: '', hub: 'https://id.utterlog.com', fingerprint: '',
  });

  // Utterlog ID
  const [utterlogId, setUtterlogId] = useState('');
  const [utterlogAvatar, setUtterlogAvatar] = useState('');
  const [utterlogBound, setUtterlogBound] = useState(false);
  const [bindingUtterlog, setBindingUtterlog] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState(false);

  // Avatar source
  const [avatarSource, setAvatarSource] = useState('gravatar');
  const [gravatarUrl, setGravatarUrl] = useState('');
  const [localAvatar, setLocalAvatar] = useState('');

  // Content sharing
  const [shareSettings, setShareSettings] = useState({
    utterlog_share_posts: true,
    utterlog_share_moments: false,
    utterlog_share_comments: false,
    utterlog_share_music: false,
    utterlog_share_movies: false,
    utterlog_share_games: false,
    utterlog_share_goods: false,
    utterlog_share_books: false,
    utterlog_auto_push: true,
  });
  const [savingShare, setSavingShare] = useState(false);

  useEffect(() => {
    // Network status
    networkApi.status().then((r: any) => {
      const d = r.data || r;
      setNetworkStatus({ connected: d.connected || false, site_id: d.site_id || '', hub: d.hub || 'https://id.utterlog.com', fingerprint: d.fingerprint || '' });
    }).catch(() => {});

    // Utterlog profile
    networkApi.utterlogProfile().then((r: any) => {
      const d = r.data || r;
      if (d.bound) {
        setUtterlogBound(true);
        setUtterlogId(d.utterlog_id || '');
        setUtterlogAvatar(d.utterlog_avatar || '');
      }
    }).catch(() => {});

    // Profile (for avatar sources)
    api.get('/profile').then((r: any) => {
      const d = r.data || r;
      if (d.gravatar_url) setGravatarUrl(d.gravatar_url);
      if (d.avatar) setLocalAvatar(d.avatar);
      if (d.utterlog_avatar) setUtterlogAvatar(d.utterlog_avatar);
      if (d.utterlog_id) { setUtterlogId(d.utterlog_id); setUtterlogBound(true); }
      if (d.avatar_source) setAvatarSource(d.avatar_source);
    }).catch(() => {});

    // Options (sharing settings)
    optionsApi.list().then((r: any) => {
      const s = r.data || r;
      const toBool = (v: any, def: boolean) => v === true || v === 'true' || (v == null && def);
      setShareSettings({
        utterlog_share_posts: toBool(s.utterlog_share_posts, true),
        utterlog_share_moments: toBool(s.utterlog_share_moments, false),
        utterlog_share_comments: toBool(s.utterlog_share_comments, false),
        utterlog_share_music: toBool(s.utterlog_share_music, false),
        utterlog_share_movies: toBool(s.utterlog_share_movies, false),
        utterlog_share_games: toBool(s.utterlog_share_games, false),
        utterlog_share_goods: toBool(s.utterlog_share_goods, false),
        utterlog_share_books: toBool(s.utterlog_share_books, false),
        utterlog_auto_push: toBool(s.utterlog_auto_push, true),
      });
    }).catch(() => {});
  }, []);

  const unbindUtterlogID = async () => {
    try {
      await networkApi.unbindUtterlogID();
      setUtterlogBound(false);
      setUtterlogId('');
      setUtterlogAvatar('');
      setConfirmUnbind(false);
      toast.success('已解绑');
    } catch { toast.error('解绑失败'); }
  };

  const saveShareSettings = async () => {
    setSavingShare(true);
    try {
      await optionsApi.updateMany(shareSettings);
      toast.success('共享设置已保存');
    } catch { toast.error('保存失败'); }
    setSavingShare(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>
      {/* Left column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Network Status */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-sharp fa-light fa-network-wired" style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
              <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>网络状态</h2>
            </div>
            <div style={{
              padding: '4px 12px', fontSize: '12px', fontWeight: 600,
              background: networkStatus.connected ? '#dcfce7' : '#fef3c7',
              color: networkStatus.connected ? '#16a34a' : '#d97706',
            }}>
              {networkStatus.connected ? '已连接' : '连接中…'}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: '认证中心', value: networkStatus.hub },
              { label: '站点 ID', value: networkStatus.site_id || '自动分配中…' },
              { label: '站点指纹', value: networkStatus.fingerprint || '...' },
            ].map((item, idx) => (
              <div key={item.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0',
                borderBottom: idx < 2 ? '1px solid var(--color-divider)' : 'none',
              }}>
                <span className="text-sub" style={{ fontSize: '13px' }}>{item.label}</span>
                <code className="text-main" style={{ fontSize: '12px', fontFamily: 'monospace' }}>{item.value}</code>
              </div>
            ))}
          </div>

          <p className="text-dim" style={{ fontSize: '11px', marginTop: '14px', lineHeight: 1.8 }}>
            站点安装后自动连接 id.utterlog.com 认证中心，基于唯一指纹自动注册，无需手动配置。
          </p>

          {networkStatus.connected && (
            <div style={{ marginTop: '14px' }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: '12px', minWidth: '180px', padding: '0 28px', whiteSpace: 'nowrap' }} onClick={async () => {
                try { await networkApi.pushInfo(); toast.success('站点信息已推送'); } catch { toast.error('推送失败'); }
              }}>
                手动推送站点信息
              </button>
            </div>
          )}
        </div>

        {/* Content Sharing */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>内容共享</h2>
          <p className="text-dim" style={{ fontSize: '12px', marginBottom: '20px' }}>选择哪些内容可以被其他 Utterlog 站点订阅和发现</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { key: 'utterlog_share_posts', label: '共享文章', desc: '其他站点可订阅你的文章更新' },
              { key: 'utterlog_share_moments', label: '共享说说', desc: '说说和动态也参与网络共享' },
              { key: 'utterlog_share_comments', label: '共享评论', desc: '评论可跨站显示' },
              { key: 'utterlog_share_music', label: '共享音乐', desc: '分享你的音乐收藏和歌单' },
              { key: 'utterlog_share_movies', label: '共享电影', desc: '分享你的观影记录和影评' },
              { key: 'utterlog_share_games', label: '共享游戏', desc: '分享你的游戏库和评价' },
              { key: 'utterlog_share_goods', label: '共享好物', desc: '分享你推荐的好物清单' },
              { key: 'utterlog_share_books', label: '共享图书', desc: '分享你的阅读记录和书评' },
              { key: 'utterlog_auto_push', label: '自动推送新内容', desc: '发布内容时自动通知网络中的订阅者' },
            ].map(item => (
              <label key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={(shareSettings as any)[item.key] || false}
                  onChange={e => setShareSettings(prev => ({ ...prev, [item.key]: e.target.checked }))}
                  style={{ marginTop: '3px', accentColor: 'var(--color-primary)' }}
                />
                <div>
                  <div className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>{item.label}</div>
                  <div className="text-dim" style={{ fontSize: '11px', marginTop: '2px' }}>{item.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <SaveButton onClick={saveShareSettings} loading={savingShare} />
          </div>
        </div>

      </div>

      {/* Right column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Utterlog ID */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <i className="fa-regular fa-globe" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>Utterlog ID</h2>
            {utterlogBound && (
              <span style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 600, background: '#dcfce7', color: '#16a34a' }}>已绑定</span>
            )}
          </div>

          {utterlogBound ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px', padding: '14px', background: 'var(--color-bg-soft)' }}>
                {utterlogAvatar ? (
                  <img src={utterlogAvatar} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-primary)', color: '#fff', fontSize: '18px', fontWeight: 700 }}>U</div>
                )}
                <div>
                  <p className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{utterlogId}</p>
                  <p className="text-dim" style={{ fontSize: '12px' }}>全网通用身份</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <a href="https://id.utterlog.com/profile" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 14px', height: '32px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '12px' }} /> ID 中心管理
                </a>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ fontSize: '12px', padding: '6px 14px', height: '32px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setConfirmUnbind(true)}
                >
                  <i className="fa-regular fa-link-slash" style={{ fontSize: '12px' }} /> 解绑
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-dim" style={{ fontSize: '13px', lineHeight: 1.8, marginBottom: '14px' }}>
                绑定 Utterlog ID 后，头像和昵称在所有 Utterlog 联盟站点间共享，使用统一身份评论和互动。
              </p>
              <button type="button" className="btn btn-primary" style={{ fontSize: '13px', width: '100%', justifyContent: 'center' }} disabled={bindingUtterlog} onClick={async () => {
                setBindingUtterlog(true);
                try {
                  const r: any = await networkApi.oauthAuthorize();
                  const authUrl = r.data?.auth_url || r.auth_url;
                  if (authUrl) window.open(authUrl, '_blank', 'width=600,height=700');
                  else toast.error('无法获取授权链接');
                } catch (e: any) {
                  // Distinguish "hub down" from generic network errors so users
                  // know to retry later vs check their own connection.
                  const code = e?.response?.data?.error?.code;
                  const status = e?.response?.status;
                  if (status === 502 || code === 'NOT_CONNECTED') {
                    toast.error('Utterlog 联盟中心暂不可用，请稍后重试');
                  } else {
                    toast.error('请检查网络连接');
                  }
                }
                finally { setBindingUtterlog(false); }
              }}>
                <i className="fa-regular fa-globe" style={{ fontSize: '14px' }} /> {bindingUtterlog ? '跳转中…' : '绑定 Utterlog ID'}
              </button>
            </div>
          )}
        </div>

        {/* Avatar Source */}
        {utterlogBound && (
          <div className="card" style={{ padding: '24px' }}>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>站点头像来源</h2>
            <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>选择博客前端显示哪个头像</p>

            <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={async () => { setAvatarSource('gravatar'); await optionsApi.updateMany({ avatar_source: 'gravatar' }); toast.success('已切换'); }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', border: avatarSource === 'gravatar' ? '3px solid var(--color-primary)' : '2px solid var(--color-border)' }}>
                  {gravatarUrl && <img src={gravatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <span className="text-dim" style={{ fontSize: '11px', fontWeight: avatarSource === 'gravatar' ? 600 : 400, color: avatarSource === 'gravatar' ? 'var(--color-primary)' : undefined }}>Gravatar</span>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={async () => { setAvatarSource('utterlog'); await optionsApi.updateMany({ avatar_source: 'utterlog' }); toast.success('已切换'); }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', border: avatarSource === 'utterlog' ? '3px solid var(--color-primary)' : '2px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-soft)' }}>
                  {utterlogAvatar ? (
                    <img src={utterlogAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span className="text-dim" style={{ fontSize: '18px', fontWeight: 700 }}>U</span>
                  )}
                </div>
                <span className="text-dim" style={{ fontSize: '11px', fontWeight: avatarSource === 'utterlog' ? 600 : 400, color: avatarSource === 'utterlog' ? 'var(--color-primary)' : undefined }}>Utterlog ID</span>
              </label>
            </div>
            <p className="text-dim" style={{ fontSize: '11px' }}>
              当前使用：{avatarSource === 'gravatar' ? 'Gravatar (邮箱头像)' : 'Utterlog ID (联盟头像)'}
            </p>
          </div>
        )}

        {/* Quick Links */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>快捷链接</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Utterlog ID 中心', url: 'https://id.utterlog.com', icon: 'fa-solid fa-id-card' },
              { label: 'ID 个人资料', url: 'https://id.utterlog.com/profile', icon: 'fa-solid fa-user' },
              { label: 'Utterlog 社区', url: 'https://utterlog.com', icon: 'fa-solid fa-users' },
              { label: 'Utterlog 程序发布', url: 'https://utterlog.io', icon: 'fa-solid fa-code-branch' },
              { label: 'Utterlog AI 中心', url: 'https://utterlog.ai', icon: 'fa-solid fa-robot' },
            ].map(link => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                border: '1px solid var(--color-border)', textDecoration: 'none',
                fontSize: '13px', color: 'var(--color-text-sub)', transition: 'border-color 0.15s',
              }} className="hover:border-primary">
                <i className={link.icon} style={{ width: '18px', textAlign: 'center', color: 'var(--color-primary)' }} />
                <span style={{ flex: 1 }}>{link.label}</span>
                <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '12px', color: 'var(--color-text-dim)' }} />
              </a>
            ))}
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmUnbind}
        onClose={() => setConfirmUnbind(false)}
        onConfirm={unbindUtterlogID}
        title="解绑 Utterlog ID"
        message="确定要解绑 Utterlog ID？解绑后头像、昵称将不再跨站同步。"
        confirmText="解绑"
      />
    </div>
  );
}
