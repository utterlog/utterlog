'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from '@/lib/navigation';
import { useAuthStore, useMusicStore, useReaderChatStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export default function Footer() {
  const pathname = usePathname();
  const { user, login: storeLogin, logout: storeLogout, isAuthenticated, validate2FA: storeValidate2FA, cancel2FA: storeCancel2FA, checkAuth } = useAuthStore();

  // Refresh persisted user (avatar, nickname, etc.) once on mount so
  // localStorage stale data (e.g. old avatar URL) is replaced with the
  // server's current response. No-op when not logged in.
  useEffect(() => { checkAuth().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const musicStore = useMusicStore();
  // 陪读卡片 store —— 文章页用户点 X 关掉陪读后，footer 上要冒出一个
  // 「重新打开陪读」的小按钮（位置在「回到顶部」左侧）。非文章页 active=false，
  // 按钮不显示。点按钮 → show() → 卡片回来。
  const readerActive = useReaderChatStore(s => s.active);
  const readerDismissed = useReaderChatStore(s => s.dismissed);
  const showReader = useReaderChatStore(s => s.show);
  const [stats, setStats] = useState<any>({});
  const [siteOptions, setSiteOptions] = useState<any>({});
  const [visitor, setVisitor] = useState<{ city?: string; code?: string }>({});
  const [onlineCount, setOnlineCount] = useState(0);
  const [onlineList, setOnlineList] = useState<any[]>([]);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [onlineEnabled, setOnlineEnabled] = useState(true);

  // Scroll to top visibility — 超过 2 倍视口高度才显示
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const main = document.querySelector('.blog-main');
    if (!main) return;
    const onScroll = () => setShowScrollTop(main.scrollTop > 300);
    main.addEventListener('scroll', onScroll, { passive: true });
    return () => main.removeEventListener('scroll', onScroll);
  }, []);

  // Login state
  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '', remember: false });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const loginRef = useRef<HTMLDivElement>(null);

  // Refresh stats on every route change
  useEffect(() => {
    fetch(`${API}/archive/stats`, { cache: 'no-store' }).then(r => r.json()).then(r => setStats(r.data || {})).catch(() => {});
  }, [pathname]);

  // Online visitors: poll every 30s
  useEffect(() => {
    const fetchOnline = () => fetch(`${API}/online`, { cache: 'no-store' }).then(r => r.json()).then(r => {
      const d = r.data || r;
      setOnlineCount(d.count || 0);
      setOnlineList(d.online || []);
      setOnlineEnabled(d.enabled !== false);
    }).catch(() => {});
    fetchOnline();
    const timer = setInterval(fetchOnline, 30000);
    return () => clearInterval(timer);
  }, []);

  // Load once: site options + visitor geo
  useEffect(() => {
    fetch(`${API}/options`, { cache: 'no-store' }).then(r => r.json()).then(r => setSiteOptions(r.data || {})).catch(() => {});
    fetch(`${API}/visitor/geo`, { cache: 'no-store' }).then(r => r.json()).then(r => {
      const data = r.data || r;
      if (data.country_code) {
        setVisitor({ city: data.city || data.country, code: data.country_code.toLowerCase() });
      }
    }).catch(() => {});
  }, []);

  // Close login popup on outside click
  useEffect(() => {
    if (!showLogin) return;
    const handleClick = (e: MouseEvent) => {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setShowLogin(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showLogin]);

  const resetLoginState = () => {
    setLoginForm({ email: '', password: '', remember: false });
    setLoginError('');
    setNeedTotp(false);
    setTotpCode('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await storeLogin(loginForm.email, loginForm.password);
      // storeLogin returns silently when 2FA is required
      const { pending2FA, accessToken } = useAuthStore.getState();
      if (pending2FA) {
        setNeedTotp(true);
        setLoginLoading(false);
        return;
      }
      if (!accessToken) {
        setLoginError('登录异常，请重试');
        setLoginLoading(false);
        return;
      }
      toast.success('登录成功');
      setShowLogin(false);
      resetLoginState();
    } catch (err: any) {
      const code = err?.response?.status;
      const msg = err?.response?.data?.error?.message;
      if (code === 401 || code === 403) {
        setLoginError(msg || '邮箱或密码错误');
      } else if (code === 429) {
        setLoginError('登录过于频繁，请稍后再试');
      } else if (!err?.response) {
        setLoginError('无法连接服务器');
      } else {
        setLoginError(msg || '登录失败');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const code = totpCode.trim();
    if (code.length < 6) {
      setLoginError('请输入 6 位验证码');
      return;
    }
    setLoginLoading(true);
    try {
      await storeValidate2FA(code);
      toast.success('登录成功');
      setShowLogin(false);
      resetLoginState();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message;
      setLoginError(msg || '验证码错误');
      setTotpCode('');
    } finally {
      setLoginLoading(false);
    }
  };

  const handle2FABack = () => {
    storeCancel2FA();
    setNeedTotp(false);
    setTotpCode('');
    setLoginError('');
  };

  // ————— Passkey login (WebAuthn) —————
  const handlePasskeyLogin = async () => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setLoginError('此浏览器不支持 Passkey');
      return;
    }
    setLoginError('');
    setLoginLoading(true);
    try {
      // 1. Ask server for challenge
      const beginRes: any = await authApi.passkeyLoginBegin();
      const { publicKey, session_id } = beginRes.data || beginRes;

      // Convert base64url strings to ArrayBuffer for browser API
      const b64urlToBuf = (s: string) => {
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64 + '==='.slice((b64.length + 3) % 4);
        return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)).buffer;
      };
      const bufToB64url = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };

      const options: any = {
        ...publicKey,
        challenge: b64urlToBuf(publicKey.challenge),
        allowCredentials: (publicKey.allowCredentials || []).map((c: any) => ({
          ...c,
          id: b64urlToBuf(c.id),
        })),
      };

      // 2. Ask browser to get assertion (biometric / security key)
      const cred: any = await navigator.credentials.get({ publicKey: options });
      if (!cred) {
        setLoginError('Passkey 验证已取消');
        setLoginLoading(false);
        return;
      }

      // 3. Send assertion back to server
      const payload = {
        id: cred.id,
        rawId: bufToB64url(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: bufToB64url(cred.response.clientDataJSON),
          authenticatorData: bufToB64url(cred.response.authenticatorData),
          signature: bufToB64url(cred.response.signature),
          userHandle: cred.response.userHandle ? bufToB64url(cred.response.userHandle) : null,
        },
      };
      const finishRes: any = await authApi.passkeyLoginFinish(payload, session_id);
      const data = finishRes.data || finishRes;
      const { user: u, access_token, refresh_token } = data;
      useAuthStore.getState().setAuth(u, access_token, refresh_token);
      toast.success('Passkey 登录成功');
      setShowLogin(false);
      resetLoginState();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setLoginError('验证已取消或超时');
      } else {
        setLoginError(err?.response?.data?.error?.message || err?.message || 'Passkey 登录失败');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    storeLogout();
  };

  const siteName = siteOptions.site_title || 'Utterlog';
  const tv = stats.total_views || 0;
  const totalViews = tv >= 10000 ? (tv / 10000).toFixed(1) + '万' : tv.toLocaleString();

  // Footer icon buttons — configurable via option `theme_footer_icons` (JSON array).
  // Each item: { icon: 'fa-light fa-rss' | '<svg .../>' | 'https://.../icon.png',
  //              label: 'RSS',
  //              href?: '/feed',
  //              copy?: 'https://site/feed' }  — when `copy` set, click copies to clipboard.
  // RSS is a fixed theme control; admin-configured icons are appended after it.
  const feedUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/feed';
  const fixedRssIcon = { icon: 'fa-light fa-rss', label: 'RSS', copy: feedUrl };
  let customIconLinks: Array<{ icon: string; label: string; href?: string; copy?: string }> = [];
  if (siteOptions.theme_footer_icons) {
    try {
      const parsed = typeof siteOptions.theme_footer_icons === 'string'
        ? JSON.parse(siteOptions.theme_footer_icons)
        : siteOptions.theme_footer_icons;
      if (Array.isArray(parsed)) {
        customIconLinks = parsed
          .map((item: any) => ({
            icon: String(item?.icon || '').trim(),
            label: String(item?.label || '').trim(),
            href: item?.href ? String(item.href).trim() : '',
            copy: item?.copy ? String(item.copy).trim() : '',
          }))
          .filter(item => item.icon && item.label)
          .filter(item => !(item.label.toLowerCase() === 'rss' && item.icon.includes('fa-rss')));
      }
    } catch {}
  }
  const iconLinks: Array<{ icon: string; label: string; href?: string; copy?: string }> = [fixedRssIcon, ...customIconLinks];

  const avatarUrl = user?.avatar || (user ? `https://gravatar.bluecdn.com/avatar/0?s=64&d=mp` : null);

  const handleIconClick = async (item: { href?: string; copy?: string; label: string }, e: React.MouseEvent) => {
    if (item.copy) {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(item.copy);
        toast.success(`${item.label} 链接已复制`);
      } catch {
        toast.error('复制失败，请手动复制');
      }
    }
  };

  const renderIcon = (icon: string) => {
    if (!icon) return null;
    // Inline SVG
    if (icon.trim().startsWith('<svg')) {
      return <span style={{ width: '15px', height: '15px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: icon }} />;
    }
    // Image URL (uploaded icon)
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/uploads/')) {
      return <img src={icon} alt="" style={{ width: '15px', height: '15px', objectFit: 'contain' }} />;
    }
    // FontAwesome class
    return <i className={icon} style={{ fontSize: '13px' }} />;
  };

  return (
    <footer className="azure-footer" style={{ borderTop: '1px solid #d9d9d9', position: 'relative' }}>
      {/* Utterlog brand logo — page left edge */}
      <a href="https://utterlog.io" target="_blank" rel="noopener noreferrer" title="Powered by Utterlog!"
        className="azure-footer-powered"
        style={{ position: 'absolute', left: '24px', top: '50%', transform: 'translateY(-50%)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.18 }}>
          <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#333" />
          <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
        </svg>
      </a>
      {/* 音乐按钮 */}
      {!musicStore.visible && pathname !== '/music' && (
        <button
          className="azure-footer-music-button"
          onClick={async () => {
            if (musicStore.playlist.length > 0) {
              musicStore.show();
            } else {
              try {
                const r = await fetch('/api/v1/music?per_page=500').then(r => r.json());
	                if (r.success && r.data?.length) {
	                  const songs = r.data.map((s: any) => ({
	                    id: s.platform_id || String(s.id), title: s.title, artist: s.artist || '',
	                    cover: s.cover_url || `/api/v1/music/proxy/${encodeURIComponent(s.platform || 'netease')}/songs/${encodeURIComponent(s.platform_id || String(s.id))}/cover`,
	                    url: s.play_url || `/api/v1/music/proxy/${encodeURIComponent(s.platform || 'netease')}/songs/${encodeURIComponent(s.platform_id || String(s.id))}/stream`,
	                    server: s.platform || 'netease',
	                  }));
                  musicStore.setPlaylist(songs, 0);
                }
              } catch {}
            }
          }}
          title="音乐"
          style={{
            position: 'absolute', left: 64, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, transition: 'opacity 0.15s', opacity: 0.18,
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.35'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.18'; }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#333" />
            <path d="M16 5.5v8a2.5 2.5 0 1 1-1.5-2.29V8.08l-5 1.15v5.27a2.5 2.5 0 1 1-1.5-2.29V6.5l8-1.84z" fill="white" transform="translate(0.5, 0.5)" />
          </svg>
        </button>
      )}

      <div className="azure-footer-inner" style={{
        maxWidth: '1400px', margin: '0 auto',
        padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: '12px', color: '#999',
      }}>
        {/* Left: Copyright + Stats */}
        <div className="azure-footer-meta" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <span>&copy; {new Date().getFullYear()} {siteName}. All rights reserved.</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <i className="fa-regular fa-eye" style={{ fontSize: '11px' }} /> 总浏览量 {totalViews}
          </span>
          {onlineEnabled && (
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <button onClick={() => setOnlineOpen(!onlineOpen)} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '12px', padding: 0,
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 4px #22c55e' }} />
                {onlineCount} 人在线
              </button>
              {onlineOpen && (
                <>
                  <div onClick={() => setOnlineOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                  <div className="azure-footer-online-popover" style={{
                    position: 'absolute', left: 0, bottom: '100%', marginBottom: '10px', zIndex: 91,
                    width: '280px', maxHeight: '300px', overflowY: 'auto',
                    background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                  }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', color: '#333' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }} />
                        实时在线访客
                      </span>
                      <button onClick={() => setOnlineOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '14px' }}>
                        <i className="fa-regular fa-xmark" />
                      </button>
                    </div>
                    {onlineList.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#999' }}>暂无在线访客</div>
                    ) : (
                      onlineList.map((u: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                          {/* Avatar or fallback icon */}
                          {u.avatar ? (
                            <img src={u.avatar} alt="" style={{ width: '28px', height: '28px', objectFit: 'cover', clipPath: 'url(#squircle)', flexShrink: 0, background: '#f0f0f0' }} />
                          ) : (
                            <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', clipPath: 'url(#squircle)', flexShrink: 0 }}>
                              <i className="fa-solid fa-user" style={{ fontSize: '12px', color: '#bbb' }} />
                            </div>
                          )}
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: u.name ? '#333' : '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {u.name || u.ip_masked || '匿名'}
                              </span>
                              {u.country_code && (
                                <img src={`https://flagcdn.io/flags/4x3/${u.country_code.toLowerCase()}.svg`} alt="" style={{ width: '14px', height: '10px', objectFit: 'cover', flexShrink: 0 }} />
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: '#999' }}>
                              {[u.country, u.city].filter(Boolean).join(' · ') || u.path}
                            </div>
                          </div>
                          {/* Green dot */}
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </span>
          )}
          {visitor.city && visitor.code && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              最近访客来自{' '}
              <img
                src={`https://flagcdn.io/flags/4x3/${visitor.code.toLowerCase()}.svg`}
                alt={visitor.code}
                style={{ width: '16px', height: '12px', objectFit: 'cover', verticalAlign: 'middle' }}
              />
              {' '}{visitor.city}
            </span>
          )}
          {siteOptions.beian_icp && (
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              style={{ color: '#999', textDecoration: 'none' }}>
              {siteOptions.beian_icp}
            </a>
          )}
          {siteOptions.beian_gongan && (
            <a href={`https://beian.mps.gov.cn/#/query/webSearch?code=${siteOptions.beian_gongan.replace(/\D/g, '')}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: '#999', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <img src="/images/beian/ghs.png" alt="" style={{ width: '14px', height: '14px' }} />
              {siteOptions.beian_gongan}
            </a>
          )}
        </div>

        {/* Right: Icon links + Login/Avatar */}
        <div className="azure-footer-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', flexShrink: 0 }}>
          {iconLinks.map((item, i) => {
            const baseStyle: React.CSSProperties = {
              width: '28px', height: '28px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid #ddd', background: 'transparent',
              color: '#bbb', textDecoration: 'none', cursor: 'pointer',
              padding: 0, transition: 'all 0.15s',
            };
            const onEnter = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = '#0052D9'; e.currentTarget.style.borderColor = '#0052D9'; };
            const onLeave = (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.borderColor = '#ddd'; };
            if (item.copy) {
              return (
                <button key={i} onClick={(e) => handleIconClick(item, e)} title={`${item.label}（点击复制）`}
                  style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                  {renderIcon(item.icon)}
                </button>
              );
            }
            return (
              <Link key={i} href={item.href || '#'} prefetch={false} title={item.label}
                style={baseStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                {renderIcon(item.icon)}
              </Link>
            );
          })}

          {/* User icon / Avatar — login trigger (与图标按钮同尺寸 28×28) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowLogin(!showLogin)}
              style={{
                background: 'none', border: '1px solid #ddd', cursor: 'pointer',
                padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                color: '#bbb', transition: 'all 0.15s',
                overflow: 'hidden',
              }}
              title={user ? user.nickname || user.username : '管理员登录'}
              onMouseEnter={e => { e.currentTarget.style.color = '#0052D9'; e.currentTarget.style.borderColor = '#0052D9'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.borderColor = '#ddd'; }}
            >
              {user ? (
                avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null
              ) : (
                <i className="fa-light fa-user" style={{ fontSize: '15px' }} />
              )}
            </button>

            {/* Login popup */}
            {showLogin && !user && (
              <div ref={loginRef} className="azure-footer-login-popover" style={{
                position: 'absolute', bottom: '40px', right: 0, zIndex: 100,
                width: '280px', background: '#fff', border: '1px solid #e0e0e0',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)', padding: '20px',
              }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '15px', fontWeight: 600, color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className={needTotp ? 'fa-solid fa-shield-halved' : 'fa-solid fa-lock'} style={{ fontSize: '13px' }} />
                  {needTotp ? '双因素验证' : '管理员登录'}
                </h3>

                {!needTotp ? (
                  <form onSubmit={handleLogin}>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>用户名 / 邮箱</label>
                      <input
                        type="text"
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        style={{
                          width: '100%', padding: '8px 10px', fontSize: '14px',
                          border: 'none', background: '#f0f2ff', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        autoFocus
                      />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>密码</label>
                      <input
                        type="password"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        style={{
                          width: '100%', padding: '8px 10px', fontSize: '14px',
                          border: 'none', background: '#f0f2ff', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#666', marginBottom: '14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={loginForm.remember} onChange={(e) => setLoginForm({ ...loginForm, remember: e.target.checked })} />
                      记住我
                    </label>
                    {loginError && (
                      <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>{loginError}</div>
                    )}
                    <button type="submit" disabled={loginLoading} style={{
                      width: '100%', padding: '10px', fontSize: '14px', fontWeight: 600,
                      background: '#0052D9', color: '#fff', border: 'none', cursor: 'pointer',
                      transition: 'opacity 0.15s', opacity: loginLoading ? 0.6 : 1,
                    }}>
                      {loginLoading ? '登录中…' : '登录'}
                    </button>

                    {/* OR divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px' }}>
                      <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                      <span style={{ fontSize: 11, color: '#999' }}>或</span>
                      <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
                    </div>

                    {/* Passkey button */}
                    <button
                      type="button"
                      onClick={handlePasskeyLogin}
                      disabled={loginLoading}
                      style={{
                        width: '100%', padding: '10px', fontSize: '13px', fontWeight: 500,
                        background: '#fff', color: '#0052D9',
                        border: '1px solid #0052D9', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f5ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                    >
                      <i className="fa-regular fa-fingerprint" style={{ fontSize: 13 }} />
                      Passkey 登录
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handle2FA}>
                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '6px' }}>
                        6 位动态验证码
                        <span style={{ fontSize: '11px', color: '#9aa5b0', marginLeft: 4 }}>（Authenticator App 生成）</span>
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={8}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        style={{
                          width: '100%', padding: '10px 12px',
                          fontSize: '18px', fontFamily: 'ui-monospace, monospace',
                          letterSpacing: '6px', textAlign: 'center',
                          border: 'none', background: '#f0f2ff', outline: 'none',
                          boxSizing: 'border-box',
                        }}
                        placeholder="000000"
                        autoFocus
                      />
                      <p style={{ fontSize: '11px', color: '#9aa5b0', margin: '6px 0 0', lineHeight: 1.6 }}>
                        没有 App？使用 8 位备用恢复码
                      </p>
                    </div>

                    {loginError && (
                      <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>{loginError}</div>
                    )}

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handle2FABack}
                        style={{
                          flex: 1, padding: '10px', fontSize: '13px', fontWeight: 500,
                          background: 'transparent', color: '#666',
                          border: '1px solid #d1d5db', cursor: 'pointer',
                        }}
                      >
                        返回
                      </button>
                      <button type="submit" disabled={loginLoading} style={{
                        flex: 2, padding: '10px', fontSize: '14px', fontWeight: 600,
                        background: '#0052D9', color: '#fff', border: 'none',
                        cursor: loginLoading ? 'wait' : 'pointer',
                        opacity: loginLoading ? 0.6 : 1,
                      }}>
                        {loginLoading ? '验证中…' : '验证'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Logged in: click avatar shows menu */}
            {user && showLogin && (
              <div ref={loginRef} className="azure-footer-login-popover" style={{
                position: 'absolute', bottom: '36px', right: 0, zIndex: 100,
                background: '#fff', border: '1px solid #e0e0e0', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                padding: '8px 0', minWidth: '120px',
              }}>
                <Link href="/admin" prefetch={false} style={{ display: 'block', padding: '8px 16px', fontSize: '13px', color: '#333', textDecoration: 'none' }}>
                  <i className="fa-light fa-gauge" style={{ marginRight: '6px' }} />控制台
                </Link>
                <button onClick={handleLogout} style={{
                  display: 'block', width: '100%', padding: '8px 16px', fontSize: '13px', color: '#0052D9',
                  background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                }}>
                  <i className="fa-light fa-right-from-bracket" style={{ marginRight: '6px' }} />退出登录
                </button>
              </div>
            )}
          </div>

        </div>

        {/* 重新打开陪读 —— 仅当当前页有 AIReaderChat 挂载（active）且
            用户点过 X 关掉了卡片（dismissed）时才显示。位置在「回到顶部」
            左侧 32px（right:64），跟音乐卡片关闭后 footer 左侧的音乐按钮
            是镜像关系。 */}
        {readerActive && readerDismissed && (
          <button
            className="azure-footer-reader-button"
            onClick={showReader}
            title="重新打开陪读"
            style={{
              position: 'absolute', right: '64px', top: '50%', transform: 'translateY(-50%)',
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', opacity: 0.18, transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.35'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.18'; }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#333" />
              <path d="M7 8h10v6H10l-2.5 2.5V14H7V8zm2 1.5v3h7v-3H9z" fill="white" />
            </svg>
          </button>
        )}

        {/* Scroll to top — footer 内，垂直居中，靠页面最右边 */}
        <button
          className="azure-footer-scroll-top"
          onClick={() => document.querySelector('.blog-main')?.scrollTo({ top: 0, behavior: 'smooth' })}
          title="回到顶部"
          style={{
            position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)',
            width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', opacity: 0.18, transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.35'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.18'; }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="#333" />
            <path d="M12 8l-4 5h3v3h2v-3h3l-4-5z" fill="white" />
          </svg>
        </button>
      </div>
    </footer>
  );
}
