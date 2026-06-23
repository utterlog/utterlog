'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/lib/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

function base64urlToBuffer(b64: string): ArrayBuffer {
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const bin = atob(base64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱'),
  password: z.string().min(1, '请输入密码'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  // Passkey state
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [supportsPasskey, setSupportsPasskey] = useState(false);
  useEffect(() => { setSupportsPasskey(!!window.PublicKeyCredential); }, []);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('reset_token') || '';
    if (token) setResetToken(token);
  }, []);

  const redirectAfterLogin = () => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/admin';
    router.push(next.startsWith('/') && !next.startsWith('//') ? next : '/admin');
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response: any = await authApi.login(data.email, data.password);
      const resData = response.data;

      if (resData.require_2fa) {
        setTempToken(resData.temp_token);
        setShow2FA(true);
        setIsLoading(false);
        return;
      }

      const { user, access_token, refresh_token } = resData;
      setAuth(user, access_token, refresh_token);
      toast.success('登录成功');
      redirectAfterLogin();
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || '登录失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      // Step 1: Get assertion options from server
      const beginRes: any = await authApi.passkeyLoginBegin();
      const resData = beginRes.data;
      const sessionId = resData.session_id;
      const options = resData.publicKey;

      // Decode base64url fields
      options.challenge = base64urlToBuffer(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((c: any) => ({
          ...c, id: base64urlToBuffer(c.id),
        }));
      }

      // Step 2: Get assertion from browser
      const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
      if (!credential) throw new Error('认证取消');

      const assertion = credential.response as AuthenticatorAssertionResponse;

      // Step 3: Send to server
      const response: any = await authApi.passkeyLoginFinish({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(assertion.authenticatorData),
          clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
          signature: bufferToBase64url(assertion.signature),
          userHandle: assertion.userHandle ? bufferToBase64url(assertion.userHandle) : undefined,
        },
      }, sessionId);

      const { user, access_token, refresh_token } = response.data;
      setAuth(user, access_token, refresh_token);
      toast.success('登录成功');
      redirectAfterLogin();
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error?.message || '通行密钥验证失败';
      if (!msg.includes('取消')) toast.error(msg);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handle2FASubmit = async () => {
    if (!totpCode || totpCode.length < 6) return;
    setTotpLoading(true);
    try {
      const response: any = await authApi.validate2FA(tempToken, totpCode);
      const { user, access_token, refresh_token } = response.data;
      setAuth(user, access_token, refresh_token);
      toast.success('登录成功');
      redirectAfterLogin();
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || '验证码错误');
      setTotpCode('');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (!forgotEmail.trim()) return;
    setForgotSending(true);
    try {
      await authApi.forgotPassword(forgotEmail.trim());
      setForgotSent(true);
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || '发送失败，请稍后再试');
    } finally {
      setForgotSending(false);
    }
  };

  const handleResetSubmit = async () => {
    if (resetPassword.length < 8) {
      toast.error('密码至少需要 8 个字符');
      return;
    }
    setResetSubmitting(true);
    try {
      await authApi.resetPassword(resetToken, resetPassword);
      toast.success('密码已重置，请重新登录');
      setResetToken('');
      setResetPassword('');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || '重置失败，请重新申请链接');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-main" style={{ padding: '24px' }}>
      <div className="w-full" style={{ maxWidth: '420px' }}>
        {/* Logo + Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' }}>
          <svg width="52" height="52" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '12px' }}>
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
          <h1 className="font-logo text-main" style={{ fontSize: '26px', letterSpacing: '0.02em' }}>Utterlog!</h1>
          <p className="text-dim" style={{ fontSize: '14px', marginTop: '4px' }}>登录管理后台</p>
        </div>

        {/* Form Card */}
        <div style={{ maxWidth: '380px', width: '100%', margin: '0 auto', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '40px 32px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)' }}>
          {show2FA ? (
            /* 2FA Verification */
            <div>
              <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <i className="fa-light fa-shield-keyhole" style={{ fontSize: '36px', color: 'var(--color-primary)', marginBottom: '12px', display: 'block' }} />
                <h2 className="text-main" style={{ fontSize: '16px', fontWeight: 700 }}>两步验证</h2>
                <p className="text-dim" style={{ fontSize: '13px', marginTop: '6px' }}>请输入验证器应用中的 6 位数字验证码</p>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <input
                  value={totpCode}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setTotpCode(v);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handle2FASubmit(); }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  className="input focus-ring"
                  placeholder="000000"
                  style={{ height: '52px', fontSize: '24px', textAlign: 'center', letterSpacing: '0.3em', fontWeight: 600 }}
                />
                <p className="text-dim" style={{ fontSize: '11px', marginTop: '8px', textAlign: 'center' }}>
                  也可输入备用码
                </p>
              </div>

              <button
                onClick={handle2FASubmit}
                disabled={totpLoading || totpCode.length < 6}
                className="btn btn-primary w-full"
                style={{ height: '44px', fontSize: '15px', marginBottom: '12px' }}
              >
                {totpLoading ? (<><i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '18px' }} />验证中…</>) : '验证'}
              </button>
              <button
                onClick={() => { setShow2FA(false); setTotpCode(''); setTempToken(''); }}
                className="btn btn-secondary w-full"
                style={{ height: '40px', fontSize: '13px' }}
              >
                返回登录
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)}>
              {/* Email */}
              <div style={{ marginBottom: '24px' }}>
                <label htmlFor="email" className="text-main block" style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  邮箱
                </label>
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="input focus-ring"
                  placeholder="name@example.com"
                  style={{ height: '44px', fontSize: '14px' }}
                />
                {errors.email && (
                  <p className="text-red-500" style={{ fontSize: '13px', marginTop: '6px' }}>{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label htmlFor="password" className="text-main" style={{ fontSize: '14px', fontWeight: 500 }}>
                    密码
                  </label>
                  <button type="button" onClick={() => setShowForgot(true)} className="text-primary-themed" style={{ fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    找回密码
                  </button>
                </div>
                <input
                  {...register('password')}
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="input focus-ring"
                  placeholder="输入密码"
                  style={{ height: '44px', fontSize: '14px' }}
                />
                {errors.password && (
                  <p className="text-red-500" style={{ fontSize: '13px', marginTop: '6px' }}>{errors.password.message}</p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full"
                style={{ height: '44px', fontSize: '15px' }}
              >
                {isLoading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '18px' }} />
                    登录中…
                  </>
                ) : (
                  '登录'
                )}
              </button>

              {/* Passkey login */}
              {supportsPasskey && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0 16px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                    <span className="text-dim" style={{ fontSize: '12px' }}>或</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    className="btn btn-secondary w-full"
                    style={{ height: '44px', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <i className="fa-light fa-fingerprint" style={{ fontSize: '18px' }} />
                    {passkeyLoading ? '验证中…' : '使用通行密钥登录'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-dim" style={{ fontSize: '12px', marginTop: '32px' }}>
          &copy; {new Date().getFullYear()} <a href="https://utterlog.io" target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>Utterlog!</a>
        </p>
      </div>

      {/* Forgot password modal */}
      {showForgot && (
        <>
          <div onClick={() => setShowForgot(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: '380px', maxWidth: '90vw',
            background: 'var(--color-bg-card)', borderRadius: '8px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: '28px',
          }}>
            <h2 className="text-main" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>找回密码</h2>
            <p className="text-dim" style={{ fontSize: '13px', marginBottom: '20px' }}>输入管理员邮箱，系统将发送密码重置链接</p>

            {forgotSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>
                  <i className="fa-light fa-envelope-open-text" style={{ color: 'var(--color-primary)' }} />
                </div>
                <p className="text-main" style={{ fontSize: '14px', fontWeight: 500 }}>重置链接已发送</p>
                <p className="text-dim" style={{ fontSize: '13px', marginTop: '6px' }}>请检查 {forgotEmail} 的收件箱</p>
                <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }} className="btn btn-primary" style={{ marginTop: '16px', width: '100%' }}>
                  返回登录
                </button>
              </div>
            ) : (
              <>
                <input
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  type="email"
                  placeholder="管理员邮箱"
                  className="input focus-ring"
                  style={{ height: '44px', fontSize: '14px', marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setShowForgot(false)} className="btn btn-secondary" style={{ flex: 1 }}>取消</button>
                  <button
                    type="button"
                    disabled={forgotSending || !forgotEmail}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleForgotSubmit}
                  >
                    {forgotSending ? '发送中…' : '发送重置链接'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {resetToken && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: '380px', maxWidth: '90vw',
            background: 'var(--color-bg-card)', borderRadius: '8px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: '28px',
          }}>
            <h2 className="text-main" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>重置密码</h2>
            <p className="text-dim" style={{ fontSize: '13px', marginBottom: '20px' }}>请输入新的管理员登录密码</p>
            <input
              value={resetPassword}
              onChange={e => setResetPassword(e.target.value)}
              type="password"
              placeholder="新密码"
              className="input focus-ring"
              style={{ height: '44px', fontSize: '14px', marginBottom: '16px' }}
              autoFocus
            />
            <button
              type="button"
              disabled={resetSubmitting || resetPassword.length < 8}
              className="btn btn-primary"
              style={{ width: '100%', height: '44px' }}
              onClick={handleResetSubmit}
            >
              {resetSubmitting ? '重置中…' : '确认重置'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
