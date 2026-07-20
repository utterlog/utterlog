/**
 * /reset-password?token=...
 *
 * Public route (mounted outside <AuthGate />). Receives a one-time
 * token sent by the forgot-password email and lets the user pick a
 * new admin password. On success the user is redirected to /login.
 */
import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from '@/lib/router';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { CheckCircle2 } from 'lucide-react';
import { Button, Input, Label, Card } from '@/components/ui/shadcn';
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
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-[360px] max-w-full p-8">
        <form onSubmit={submit} className="login-form flex flex-col">
          <h1 className="font-logo text-xl font-bold">{t('admin.reset.title', '重置密码')}</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            {t('admin.reset.description', '请设置新的后台登录密码。')}
          </p>

          {!token && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              {t('admin.reset.missingToken', '链接缺少 token 参数，无法重置。请回登录页重新申请。')}
            </div>
          )}

          {!done ? (
            <>
              <div className="mb-3.5 flex flex-col gap-1.5">
                <Label>{t('admin.reset.newPassword', '新密码')}</Label>
                <Input
                  type="password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder={t('admin.reset.passwordPlaceholder', '至少 8 位')}
                  autoFocus
                  disabled={submitting || !token}
                />
              </div>

              <div className="mb-3.5 flex flex-col gap-1.5">
                <Label>{t('admin.reset.confirmPassword', '确认新密码')}</Label>
                <Input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  placeholder={t('admin.reset.confirmPlaceholder', '再输一次')}
                  disabled={submitting || !token}
                />
              </div>

              {err && (
                <div className="mb-3.5 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  {err}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || !token || !pw || !pw2}>
                {submitting ? t('admin.common.submitting', '提交中…') : t('admin.reset.submit', '设置新密码')}
              </Button>
            </>
          ) : (
            <div className="py-3 text-center">
              <CheckCircle2 className="mx-auto size-8 text-primary" />
              <p className="mt-3 text-sm">{t('admin.reset.successTitle', '密码已重置成功')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('admin.reset.redirecting', '3 秒后自动跳转登录页…')}</p>
            </div>
          )}

          <div className="mt-[18px] text-center text-xs">
            <Link to="/login" className="text-muted-foreground no-underline hover:text-foreground">
              {t('admin.reset.backToLogin', '← 返回登录页')}
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
