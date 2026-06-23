import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';

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

export default function Login() {
  const { t } = useI18n();
  const { login, validate2FA, cancel2FA, setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);

  // Passkey — show button only if browser supports WebAuthn AND the server
  // has at least one passkey registered (otherwise the option is dead).
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  useEffect(() => {
    if (!window.PublicKeyCredential) return;
    authApi.passkeyAvailable()
      .then((res: any) => { if (res?.data?.available) setShowPasskey(true); })
      .catch(() => { /* silent — just hide the button */ });
  }, []);

  // Forgot/reset password modal
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('reset_token') || '';
    if (token) setResetToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error(t('admin.login.toast.enterEmailPassword', '请输入邮箱和密码'));
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const { pending2FA, accessToken } = useAuthStore.getState();
      if (pending2FA) {
        setNeedTotp(true);
        setSubmitting(false);
        toast(t('admin.login.toast.enterTotp', '请输入动态验证码'), { icon: 'i' });
        return;
      }
      if (!accessToken) {
        toast.error(t('admin.login.toast.abnormal', '登录异常，请重试'));
        setSubmitting(false);
        return;
      }
      toast.success(t('admin.login.toast.success', '登录成功'));
      // Delay redirect so the toast is actually visible before navigation wipes it
      setTimeout(() => { window.location.href = '/admin/'; }, 800);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || t('admin.login.toast.failed', '登录失败'));
      setSubmitting(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = totpCode.trim();
    if (code.length < 6) {
      toast.error(t('admin.login.toast.enterSixDigitCode', '请输入 6 位验证码'));
      return;
    }
    setSubmitting(true);
    try {
      await validate2FA(code);
      toast.success(t('admin.login.toast.success', '登录成功'));
      // Delay redirect so the toast is actually visible before navigation wipes it
      setTimeout(() => { window.location.href = '/admin/'; }, 800);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || t('admin.login.toast.invalidCode', '验证码错误'));
      setSubmitting(false);
      setTotpCode('');
    }
  };

  const handleBack = () => {
    cancel2FA();
    setNeedTotp(false);
    setTotpCode('');
    setSubmitting(false);
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      const beginRes: any = await authApi.passkeyLoginBegin();
      const resData = beginRes.data;
      const sessionId = resData.session_id;
      const options = resData.publicKey;

      options.challenge = base64urlToBuffer(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((c: any) => ({
          ...c, id: base64urlToBuffer(c.id),
        }));
      }

      const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
      if (!credential) throw new Error(t('admin.login.passkeyCancelled', '认证取消'));

      const assertion = credential.response as AuthenticatorAssertionResponse;
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
      toast.success(t('admin.login.toast.success', '登录成功'));
      // Delay redirect so the toast is actually visible before navigation wipes it
      setTimeout(() => { window.location.href = '/admin/'; }, 800);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || t('admin.login.passkeyFailed', '通行密钥验证失败');
      if (!msg.includes(t('admin.login.cancelKeyword', '取消'))) toast.error(msg);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (!forgotEmail) return;
    setForgotSending(true);
    try {
      // Backend always returns success regardless of whether the
      // email is registered (anti-enumeration). The success screen
      // tells the user to check inbox + spam — if the address isn't
      // in the system nothing went out, but they shouldn't know that.
      await authApi.forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t('admin.login.forgotSendFailed', '发送失败，请稍后再试'));
    }
    setForgotSending(false);
  };

  const handleResetSubmit = async () => {
    if (!resetPassword || resetPassword.length < 8) {
      toast.error(t('admin.login.passwordTooShort', '密码至少需要 8 个字符'));
      return;
    }
    setResetSubmitting(true);
    try {
      await authApi.resetPassword(resetToken, resetPassword);
      toast.success(t('admin.login.passwordResetSuccess', '密码已重置，请重新登录'));
      setResetToken('');
      setResetPassword('');
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || t('admin.login.passwordResetFailed', '重置失败，请重新申请链接'));
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-main)', padding: 24,
    }}>
      <form
        onSubmit={needTotp ? handle2FA : handleSubmit}
        className="login-form"
        style={{
          width: '100%', maxWidth: 380, background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)', borderRadius: 0, padding: '32px 28px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <svg
            width="64" height="64" viewBox="0 0 24 24"
            className="login-logo"
            style={{ margin: '0 auto', display: 'block' }}
          >
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '12px 0 4px', fontFamily: "'Ubuntu', -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif", letterSpacing: '-0.01em' }}>Utterlog</h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-dim)', margin: 0 }}>
            {needTotp ? t('admin.login.enterTotpSubtitle', '请输入动态验证码') : t('admin.login.subtitle', '管理后台登录')}
          </p>
        </div>

        {!needTotp ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{t('admin.login.email', '邮箱')}</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="input" placeholder="you@example.com" autoFocus
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500 }}>{t('admin.login.password', '密码')}</label>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowForgot(true)}
                  style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {t('admin.login.forgotPassword', '找回密码')}
                </button>
              </div>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? t('admin.login.signingIn', '登录中…') : t('admin.login.signIn', '登录')}
            </button>

            {showPasskey && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{t('admin.login.or', '或')}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                </div>
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="btn btn-secondary"
                  style={{ width: '100%', gap: 8 }}
                >
                  <i className="fa-light fa-fingerprint" style={{ fontSize: 16 }} />
                  {passkeyLoading ? t('admin.login.verifying', '验证中…') : t('admin.login.usePasskey', '使用通行密钥登录')}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                {t('admin.login.sixDigitCode', '6 位验证码')}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-dim)', marginLeft: 6 }}>
                  {t('admin.login.authenticatorHint', '（Authenticator App 生成）')}
                </span>
              </label>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={8}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="input"
                placeholder="000000"
                autoFocus
                style={{
                  textAlign: 'center', fontSize: 20, letterSpacing: 6,
                  fontFamily: 'ui-monospace, monospace',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 6, margin: '6px 0 0' }}>
                {t('admin.login.recoveryCodeHint', '没有 App？使用 8 位备用恢复码')}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleBack}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                {t('admin.common.back', '返回')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 2 }}>
                {submitting ? t('admin.login.verifying', '验证中…') : t('admin.login.verify', '验证')}
              </button>
            </div>
          </>
        )}
      </form>

      {showForgot && (
        <>
          <div
            onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: 380, maxWidth: '90vw',
            background: 'var(--color-bg-card)', borderRadius: 0,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: 28,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t('admin.login.forgotPassword', '找回密码')}</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 20 }}>
              {t('admin.login.forgotDescription', '输入管理员邮箱，系统将发送密码重置链接')}
            </p>

            {forgotSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>
                  <i className="fa-light fa-envelope-open-text" style={{ color: 'var(--color-primary)' }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{t('admin.login.resetLinkSent', '重置链接已发送')}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 6 }}>
                  {t('admin.login.checkInbox', '请检查 {email} 的收件箱', { email: forgotEmail })}
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
                  className="btn btn-primary"
                  style={{ marginTop: 16, width: '100%' }}
                >
                  {t('admin.login.backToLogin', '返回登录')}
                </button>
              </div>
            ) : (
              <>
                <input
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  type="email"
                  placeholder={t('admin.login.adminEmailPlaceholder', '管理员邮箱')}
                  className="input"
                  style={{ marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setForgotEmail(''); }}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    {t('admin.common.cancel', '取消')}
                  </button>
                  <button
                    type="button"
                    disabled={forgotSending || !forgotEmail}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleForgotSubmit}
                  >
                    {forgotSending ? t('admin.login.sending', '发送中…') : t('admin.login.sendResetLink', '发送重置链接')}
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
            zIndex: 51, width: 380, maxWidth: '90vw',
            background: 'var(--color-bg-card)', borderRadius: 0,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: 28,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t('admin.login.resetPassword', '重置密码')}</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 20 }}>
              {t('admin.login.resetPasswordDescription', '请输入新的管理员登录密码')}
            </p>
            <input
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              type="password"
              placeholder={t('admin.login.newPasswordPlaceholder', '新密码')}
              className="input"
              style={{ marginBottom: 16 }}
              autoFocus
            />
            <button
              type="button"
              disabled={resetSubmitting || resetPassword.length < 8}
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleResetSubmit}
            >
              {resetSubmitting ? t('admin.login.resetting', '重置中…') : t('admin.login.confirmReset', '确认重置')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
