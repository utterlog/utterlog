'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { useThemeContext } from '@/lib/theme-context';
import { useMiniMusic } from '@/lib/use-mini-music';
import BackToTop from './BackToTop';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

function formatViews(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

export default function Footer() {
  const { site, options, menus, archiveStats } = useThemeContext();
  const year = new Date().getFullYear();
  const siteName = site.title || 'Utterlog';
  const footerItems = menus.footer || [];
  const { open: miniMusicOpen, toggle: toggleMiniMusic } = useMiniMusic();

  // ── 登录态 ──
  const {
    user,
    login: storeLogin,
    logout: storeLogout,
    validate2FA: storeValidate2FA,
    cancel2FA: storeCancel2FA,
    checkAuth,
  } = useAuthStore();
  useEffect(() => { checkAuth().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showLogin, setShowLogin] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const loginRef = useRef<HTMLDivElement>(null);

  // 点外部关闭
  useEffect(() => {
    if (!showLogin) return;
    const handler = (e: MouseEvent) => {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setShowLogin(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLogin]);

  const resetLoginState = () => {
    setLoginForm({ email: '', password: '' });
    setLoginError('');
    setNeedTotp(false);
    setTotpCode('');
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      await storeLogin(loginForm.email, loginForm.password);
      const { pending2FA, accessToken } = useAuthStore.getState();
      if (pending2FA) { setNeedTotp(true); setLoginLoading(false); return; }
      if (!accessToken) { setLoginError('登录异常，请重试'); setLoginLoading(false); return; }
      toast.success('登录成功');
      setShowLogin(false);
      resetLoginState();
    } catch (err: any) {
      const code = err?.response?.status;
      const msg = err?.response?.data?.error?.message;
      if (code === 401 || code === 403) setLoginError(msg || '邮箱或密码错误');
      else if (code === 429) setLoginError('登录过于频繁，请稍后再试');
      else if (!err?.response) setLoginError('无法连接服务器');
      else setLoginError(msg || '登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const handle2FA = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (totpCode.trim().length < 6) { setLoginError('请输入 6 位验证码'); return; }
    setLoginLoading(true);
    try {
      await storeValidate2FA(totpCode.trim());
      toast.success('登录成功');
      setShowLogin(false);
      resetLoginState();
    } catch (err: any) {
      setLoginError(err?.response?.data?.error?.message || '验证码错误');
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

  const handlePasskeyLogin = async () => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setLoginError('此浏览器不支持 Passkey'); return;
    }
    setLoginError('');
    setLoginLoading(true);
    try {
      const beginRes: any = await authApi.passkeyLoginBegin();
      const { publicKey, session_id } = beginRes.data || beginRes;
      const b64urlToBuf = (s: string) => {
        const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64 + '==='.slice((b64.length + 3) % 4);
        return Uint8Array.from(atob(pad), c => c.charCodeAt(0)).buffer;
      };
      const bufToB64url = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      };
      const opts: any = {
        ...publicKey,
        challenge: b64urlToBuf(publicKey.challenge),
        allowCredentials: (publicKey.allowCredentials || []).map((c: any) => ({ ...c, id: b64urlToBuf(c.id) })),
      };
      const cred: any = await navigator.credentials.get({ publicKey: opts });
      if (!cred) { setLoginError('Passkey 验证已取消'); setLoginLoading(false); return; }
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
      useAuthStore.getState().setAuth(data.user, data.access_token, data.refresh_token);
      toast.success('Passkey 登录成功');
      setShowLogin(false);
      resetLoginState();
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') setLoginError('验证已取消或超时');
      else setLoginError(err?.response?.data?.error?.message || err?.message || 'Passkey 登录失败');
    } finally {
      setLoginLoading(false);
    }
  };

  const avatarUrl = user?.avatar || (user ? 'https://gravatar.bluecdn.com/avatar/0?s=64&d=mp' : null);

  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  // 当前访客地理（来自第三方 IP API），跟 Azure 主题保持一致：
  //   "最近访客来自 [国旗] [城市]"
  const [visitor, setVisitor] = useState<{ city?: string; code?: string }>({});

  useEffect(() => {
    let alive = true;
    const fetchOnline = async () => {
      try {
        const resp = await fetch(`${API_BASE}/online`, { cache: 'no-store' });
        const json = await resp.json();
        if (!alive) return;
        const data = json?.data;
        if (data) {
          setOnlineCount(data.count || 0);
          setOnlineEnabled(data.enabled !== false);
        }
      } catch {}
    };
    fetchOnline();
    const id = window.setInterval(fetchOnline, 30000);

    // 当前访客 geo
    fetch(`${API_BASE}/visitor/geo`, { cache: 'no-store' })
      .then(r => r.json())
      .then(r => {
        if (!alive) return;
        const data = r.data || r;
        if (data.country_code) {
          setVisitor({
            city: data.city || data.country,
            code: data.country_code.toLowerCase(),
          });
        }
      })
      .catch(() => {});

    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const totalViews = archiveStats?.total_views || 0;
  const siteDays = archiveStats?.days || 0;
  const beianIcp = options?.beian_icp;
  const beianGongan = options?.beian_gongan;

  return (
    <>
      <footer className="nebula-footer">
        {/* 回到顶部按钮：贴在 footer 右侧、container 之外。
            滚动 ≤ 400px 时 visibility:hidden（组件内 .is-hidden 处理） */}
        <BackToTop />
        <span className="nebula-footer-left-actions" aria-label="页脚快捷入口">
          <a
            href="https://utterlog.io"
            target="_blank"
            rel="noopener noreferrer"
            className="nebula-footer-tag"
            title="Powered by Utterlog"
            aria-label="Powered by Utterlog"
          >
            <svg
              className="nebula-footer-utterlog-logo"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              aria-hidden="true"
            >
              <path
                d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z"
                fill="currentColor"
              />
              <path
                d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z"
                fill="var(--nebula-black)"
              />
            </svg>
          </a>
          <button
            type="button"
            title="音乐"
            aria-label="打开迷你播放器"
            className={`nebula-footer-music-btn${miniMusicOpen ? ' is-hidden' : ''}`}
            onClick={() => toggleMiniMusic(true)}
            aria-hidden={miniMusicOpen}
            tabIndex={miniMusicOpen ? -1 : 0}
          >
            <i className="fa-solid fa-music" aria-hidden="true" />
            <svg
              className="nebula-footer-music-logo"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              aria-hidden="true"
            >
              <path
                d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z"
                fill="currentColor"
              />
              <path
                d="M16 5.5v8a2.5 2.5 0 1 1-1.5-2.29V8.08l-5 1.15v5.27a2.5 2.5 0 1 1-1.5-2.29V6.5l8-1.84z"
                fill="var(--nebula-black)"
                transform="translate(0.5, 0.5)"
              />
            </svg>
          </button>
        </span>
        <div className="nebula-container nebula-footer-row">
          {/* 版权 */}
          <span className="nebula-footer-copy">
            © {year} <strong>{siteName}</strong>
          </span>

          {/* 在线人数（绿色脉动） */}
          {onlineEnabled && (
            <span className="nebula-footer-stat">
              <i className="fa-solid fa-circle nebula-footer-pulse" aria-hidden="true" />
              <strong>{onlineCount}</strong> 人在线
            </span>
          )}

          {/* 建站天数 */}
          {siteDays > 0 && (
            <span className="nebula-footer-stat">
              <i className="fa-solid fa-calendar-day" aria-hidden="true" />
              <strong>{siteDays.toLocaleString()}</strong> 天建站
            </span>
          )}

          {/* 总浏览量（≥10000 显示 X.X 万） */}
          <span className="nebula-footer-stat">
            <i className="fa-solid fa-eye" aria-hidden="true" />
            <strong>{formatViews(totalViews)}</strong> 总浏览
          </span>

          {/* 最近访客来自 */}
          {visitor.city && visitor.code && (
            <span className="nebula-footer-stat">
              <span className="nebula-footer-stat-label">最近访客来自</span>
              <img
                className="nebula-footer-flag"
                src={`https://flagcdn.io/flags/1x1/${visitor.code}.svg`}
                alt={visitor.code}
              />
              <strong>{visitor.city}</strong>
            </span>
          )}

          {/* 链接（右） */}
          <span className="nebula-footer-links">
            {footerItems.map(item => (
              <Link prefetch={false} key={`${item.href}-${item.label}`} href={item.href || '#'}>
                {item.label}
              </Link>
            ))}

            {/* 登录按钮 / 头像 */}
            <span className="nebula-footer-auth" ref={loginRef}>
              <button
                type="button"
                className="nebula-footer-auth-btn"
                title={user ? user.nickname || user.username : '管理员登录'}
                aria-label={user ? '账号' : '登录'}
                onClick={() => setShowLogin(v => !v)}
              >
                {user && avatarUrl ? (
                  <img src={avatarUrl} alt="" className="nebula-footer-auth-avatar" />
                ) : (
                  <i className="fa-solid fa-user" aria-hidden="true" />
                )}
              </button>

              {/* 登录弹窗（未登录） */}
              {showLogin && !user && (
                <div className="nebula-footer-login">
                  <h3 className="nebula-footer-login-title">
                    <i className={needTotp ? 'fa-solid fa-shield-halved' : 'fa-solid fa-lock'} aria-hidden="true" />
                    {needTotp ? '双因素验证' : '管理员登录'}
                  </h3>
                  {!needTotp ? (
                    <form onSubmit={handleLogin} className="nebula-footer-login-form">
                      <label>
                        <span>用户名 / 邮箱</span>
                        <input
                          type="text"
                          value={loginForm.email}
                          onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
                          autoFocus
                        />
                      </label>
                      <label>
                        <span>密码</span>
                        <input
                          type="password"
                          value={loginForm.password}
                          onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                        />
                      </label>
                      {loginError && <p className="nebula-footer-login-error">{loginError}</p>}
                      <button type="submit" disabled={loginLoading} className="nebula-footer-login-submit">
                        {loginLoading ? '登录中…' : '登录'}
                      </button>
                      <div className="nebula-footer-login-divider"><span>或</span></div>
                      <button
                        type="button"
                        onClick={handlePasskeyLogin}
                        disabled={loginLoading}
                        className="nebula-footer-login-passkey"
                      >
                        <i className="fa-regular fa-fingerprint" aria-hidden="true" /> Passkey 登录
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handle2FA} className="nebula-footer-login-form">
                      <label>
                        <span>6 位动态验证码</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={8}
                          value={totpCode}
                          onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="000000"
                          className="nebula-footer-totp-input"
                          autoFocus
                        />
                      </label>
                      {loginError && <p className="nebula-footer-login-error">{loginError}</p>}
                      <div className="nebula-footer-login-actions">
                        <button type="button" onClick={handle2FABack} className="nebula-footer-login-back">
                          返回
                        </button>
                        <button type="submit" disabled={loginLoading} className="nebula-footer-login-submit">
                          {loginLoading ? '验证中…' : '验证'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* 已登录菜单 */}
              {showLogin && user && (
                <div className="nebula-footer-login nebula-footer-login-menu">
                  <Link href="/admin" prefetch={false} className="nebula-footer-login-menu-item">
                    <i className="fa-light fa-gauge" aria-hidden="true" /> 控制台
                  </Link>
                  <button
                    type="button"
                    onClick={() => { storeLogout(); setShowLogin(false); }}
                    className="nebula-footer-login-menu-item nebula-footer-login-logout"
                  >
                    <i className="fa-light fa-right-from-bracket" aria-hidden="true" /> 退出登录
                  </button>
                </div>
              )}
            </span>
          </span>
        </div>

        {/* 第二行：备案号（默认灰、hover 还原） */}
        {(beianIcp || beianGongan) && (
          <div className="nebula-container nebula-footer-beian-row">
            {beianIcp && (
              <a
                className="nebula-footer-beian"
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg
                  className="nebula-footer-icp-icon"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    d="M763.392 185.232C691.832 147.08 608.832 128 512.472 128c-96.36 0-179.344 19.08-250.896 57.232H137.544l21.944 314.832c7.624 105.896 62.952 202.256 151.688 261.4L511.52 896l200.352-134.528c89.672-59.144 145.016-155.504 152.624-261.4l21.952-314.832H763.392z m43.888 311.016c-6.688 87.784-52.488 168.856-125.936 217.512l-168.872 112.592-168.864-112.584c-73.464-49.608-120.208-129.736-125.92-217.512l-18.136-253.768h126.888V217.68c54.384-21.944 116.392-32.448 186.032-32.448 69.64 0 131.656 11.456 186.024 32.448v24.808h126.888l-18.104 253.76z"
                    fill="#0649D0"
                  />
                  <path
                    d="M676.56 338.84v-42.936H462.864c1.904-3.824 5.728-8.584 10.504-14.312 4.768-6.68 8.584-11.448 10.488-14.304l-54.376-10.504c-29.568 42.928-70.6 81.096-124.016 115.44 3.824 3.824 9.536 10.504 17.168 20.04l16.224 16.216c21.936-14.312 41.976-29.576 59.152-46.752 24.808 23.848 45.792 40.072 62.952 47.704-42.92 14.304-97.312 25.76-163.136 33.392 1.904 4.768 5.728 12.4 8.592 22.896 3.808 10.496 5.72 18.12 6.672 22.896l37.208-6.68v203.208h50.56v-18.128h222.288v18.128h50.56v-204.16H362.688c56.288-11.44 106.848-25.76 152.648-42.928 45.784 18.136 110.664 32.448 196.536 42.928 4.768-16.208 9.528-32.432 16.2-47.696-58.184-3.824-108.752-11.448-150.72-22.896 36.256-19.08 69.648-42.928 99.208-71.552zM536.328 520.104h87.768v39.12H536.328v-39.12z m0 73.456h87.768v39.128H536.328v-39.128z m-134.512-73.456h87.768v39.12H536.328v-39.12z m0 73.456h87.768v39.128H536.328v-39.128z m-134.512-73.456h87.76v39.12h-87.76v-39.12z m0 73.456h87.76v39.128h-87.76v-39.128z m32.432-256.632h169.816c-24.816 20.984-53.424 39.12-87.768 53.432a390.96 390.96 0 0 1-82.048-53.432z"
                    fill="#0649D0"
                  />
                </svg>
                {beianIcp}
              </a>
            )}
            {beianGongan && (
              <a
                className="nebula-footer-beian"
                href={`https://beian.mps.gov.cn/#/query/webSearch?code=${beianGongan.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src="/images/beian/ghs.png" alt="" className="nebula-footer-gh-icon" />
                {beianGongan}
              </a>
            )}
          </div>
        )}
      </footer>
    </>
  );
}
