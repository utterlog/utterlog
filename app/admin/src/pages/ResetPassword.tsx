/**
 * /reset-password?token=...
 *
 * Public route (mounted outside <AuthGate />). Receives a one-time
 * token sent by the forgot-password email and lets the user pick a
 * new admin password. On success the user is redirected to /login.
 *
 * Validation only happens server-side (token validity / expiry / hash
 * generation) — the client just collects + submits + handles outcome.
 * Token comes via the URL ?token= query param; we never store it.
 */
import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useI18n } from '@/lib/i18n';

export default function ResetPassword() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!token) {
      setErr(t('admin.reset.invalidToken', '链接无效，缺少 token 参数。请回到登录页重新申请重置密码。'));
      return;
    }
    if (pw.length < 8) { setErr(t('admin.reset.passwordMin', '新密码至少 8 位')); return; }
    if (pw !== pw2)    { setErr(t('admin.reset.passwordMismatch', '两次输入的密码不一致')); return; }

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, pw);
      setDone(true);
      toast.success(t('admin.reset.toast.success', '密码已重置，3 秒后返回登录页'));
      setTimeout(() => navigate('/login'), 3000);
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.response?.data?.message || t('admin.reset.toast.failed', '重置失败');
      setErr(msg);
    }
    setSubmitting(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-main)', padding: 24,
    }}>
      <form onSubmit={submit} className="login-form" style={{
        width: 360, padding: 32, background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
      }}>
        <h1 className="font-logo" style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {t('admin.reset.title', '重置密码')}
        </h1>
        <p className="text-dim" style={{ fontSize: 13, marginBottom: 20 }}>
          {t('admin.reset.description', '请设置新的后台登录密码。')}
        </p>

        {!token && (
          <div className="text-danger" style={{
            padding: '10px 12px', background: 'var(--color-danger-soft)',
            border: '1px solid var(--color-danger)', fontSize: 12, marginBottom: 16,
          }}>
            {t('admin.reset.missingToken', '链接缺少 token 参数，无法重置。请回登录页重新申请。')}
          </div>
        )}

        {!done ? (
          <>
            <label className="text-sub" style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>
              {t('admin.reset.newPassword', '新密码')}
            </label>
            <input
              type="password"
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t('admin.reset.passwordPlaceholder', '至少 8 位')}
              autoFocus
              style={{ width: '100%', marginBottom: 14 }}
              disabled={submitting || !token}
            />

            <label className="text-sub" style={{ fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>
              {t('admin.reset.confirmPassword', '确认新密码')}
            </label>
            <input
              type="password"
              className="input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder={t('admin.reset.confirmPlaceholder', '再输一次')}
              style={{ width: '100%', marginBottom: 14 }}
              disabled={submitting || !token}
            />

            {err && (
              <div className="text-danger" style={{
                padding: '10px 12px', background: 'var(--color-danger-soft)',
                border: '1px solid var(--color-danger)', fontSize: 12, marginBottom: 14,
              }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !token || !pw || !pw2}
              style={{ width: '100%' }}
            >
              {submitting ? t('admin.common.submitting', '提交中…') : t('admin.reset.submit', '设置新密码')}
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <i className="fa-light fa-circle-check" style={{ fontSize: 36, color: 'var(--color-success)' }} />
            <p style={{ fontSize: 14, marginTop: 12 }}>{t('admin.reset.successTitle', '密码已重置成功')}</p>
            <p className="text-dim" style={{ fontSize: 12, marginTop: 4 }}>{t('admin.reset.redirecting', '3 秒后自动跳转登录页…')}</p>
          </div>
        )}

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12 }}>
          <Link to="/login" className="text-dim" style={{ textDecoration: 'none' }}>
            {t('admin.reset.backToLogin', '← 返回登录页')}
          </Link>
        </div>
      </form>
    </div>
  );
}
