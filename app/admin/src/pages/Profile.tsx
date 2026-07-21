
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';
import {
  Button, Input, Label, Textarea, Card, Badge, ConfirmDialog,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/shadcn';
import {
  Globe, Plus, QrCode, Eraser, X, ShieldCheck, ShieldOff,
  TriangleAlert, Copy, KeyRound, Fingerprint, Trash2, Save, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api, { authApi, optionsApi } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { useI18n } from '@/lib/i18n';
import { formatWithAdminTimeZone } from '@/lib/timezone';

// WebAuthn helpers
function base64urlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function ProfilePage() {
  const { locale, t } = useI18n();
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [gravatarUrl, setGravatarUrl] = useState('');
  const [utterlogAvatar, setUtterlogAvatar] = useState('');
  const [utterlogBound, setUtterlogBound] = useState(false);
  const [avatarSource, setAvatarSource] = useState('gravatar');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Original values for detecting changes
  const [origEmail, setOrigEmail] = useState('');
  const [origUsername, setOrigUsername] = useState('');

  // Verification dialog
  const [showVerify, setShowVerify] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pendingData, setPendingData] = useState<any>(null);


  // 2FA (TOTP)
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupMode, setTotpSetupMode] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpShowBackup, setTotpShowBackup] = useState(false);
  const [totpDisableMode, setTotpDisableMode] = useState(false);
  const [totpDisablePw, setTotpDisablePw] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  // Passkeys
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [passkeyName, setPasskeyName] = useState('');
  const [passkeyNaming, setPasskeyNaming] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [deletePasskeyId, setDeletePasskeyId] = useState<number | null>(null);

  // Social links
  interface SocialLink { icon: string; name: string; url: string; qr?: string }
  const defaultSocialNames = ['GitHub', 'X', 'YouTube', 'Telegram', 'Instagram', '微信'];
  const defaultSocials: SocialLink[] = [
    { icon: 'fa-brands fa-github', name: 'GitHub', url: '' },
    { icon: 'fa-brands fa-x-twitter', name: 'X', url: '' },
    { icon: 'fa-brands fa-youtube', name: 'YouTube', url: '' },
    { icon: 'fa-brands fa-telegram', name: 'Telegram', url: '' },
    { icon: 'fa-brands fa-instagram', name: 'Instagram', url: '' },
    { icon: 'fa-brands fa-weixin', name: '微信', url: '' },
  ];
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>(defaultSocials);
  const [socialSaving, setSocialSaving] = useState(false);
  const [showAddSocial, setShowAddSocial] = useState(false);
  const [newSocial, setNewSocial] = useState<SocialLink>({ icon: '', name: '', url: '' });
  const socialQrRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, getValues } = useForm({
    defaultValues: { nickname: '', email: '', username: '', bio: '', url: '' },
  });

  const { register: registerPw, handleSubmit: handlePwSubmit, reset: resetPw } = useForm({
    defaultValues: { current_password: '', new_password: '', confirm_password: '', verify_code: '' },
  });
  const [pwCodeSent, setPwCodeSent] = useState(false);
  const [pwSendingCode, setPwSendingCode] = useState(false);
  const [pwCountdown, setPwCountdown] = useState(0);

  // Fetch profile
  useEffect(() => {
    api.get('/profile').then((r: any) => {
      const d = r.data || r;
      reset({
        nickname: d.nickname || '',
        email: d.email || '',
        username: d.username || '',
        bio: d.bio || '',
        url: d.url || '',
      });
      setOrigEmail(d.email || '');
      setOrigUsername(d.username || '');
      if (d.gravatar_url) setGravatarUrl(d.gravatar_url);
      if (d.avatar) setAvatarUrl(d.avatar);
      if (d.utterlog_avatar) { setUtterlogAvatar(d.utterlog_avatar); setUtterlogBound(true); }
      if (d.utterlog_id) setUtterlogBound(true);
      if (d.avatar_source) setAvatarSource(d.avatar_source);
      if (d.totp_enabled) setTotpEnabled(true);
    }).catch(() => {});

    // Fetch passkeys
    api.get('/passkeys').then((r: any) => {
      setPasskeys(r.data || []);
    }).catch(() => {});

    // Fetch social links — merge saved data with defaults so defaults always present
    optionsApi.list().then((r: any) => {
      const opts = r.data || r;
      try {
        const saved: SocialLink[] = opts.social_links ? JSON.parse(opts.social_links) : [];
        if (Array.isArray(saved) && saved.length > 0) {
          const merged = defaultSocials.map(d => {
            const found = saved.find(s => s.name === d.name);
            return found ? { ...d, ...found } : d;
          });
          const custom = saved.filter(s => !defaultSocialNames.includes(s.name));
          setSocialLinks([...merged, ...custom]);
        }
      } catch {}
    }).catch(() => {});

  }, []);

  const deletePasskey = async () => {
    if (!deletePasskeyId) return;
    try {
      await api.delete(`/passkeys/${deletePasskeyId}`);
      setPasskeys(prev => prev.filter(p => p.id !== deletePasskeyId));
      setDeletePasskeyId(null);
      toast.success(t('admin.profile.toast.deleted', '已删除'));
    } catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
  };

  // Countdown timers
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);
  useEffect(() => {
    if (pwCountdown <= 0) return;
    const t = setTimeout(() => setPwCountdown(pwCountdown - 1), 1000);
    return () => clearTimeout(t);
  }, [pwCountdown]);

  const onSaveProfile = async (data: any) => {
    const emailChanged = data.email !== origEmail;
    const usernameChanged = data.username !== origUsername;

    if (emailChanged || usernameChanged) {
      // Need verification
      setPendingData(data);
      setShowVerify(true);
      setVerifyPassword('');
      setVerifyCode('');
      setCodeSent(false);
      return;
    }

    // No sensitive change, save directly
    setSaving(true);
    try {
      await api.put('/profile', { ...data, avatar: avatarUrl || undefined });
      toast.success(t('admin.profile.toast.saved', '资料已保存'));
    } catch { toast.error(t('admin.settings.toast.saveFailed', '保存失败')); }
    finally { setSaving(false); }
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    try {
      const r: any = await api.post('/profile/send-code');
      toast.success(r.data?.message || r.message || t('admin.profile.toast.codeSent', '验证码已发送'));
      setCodeSent(true);
      setCountdown(60);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.error?.message || t('admin.profile.toast.sendFailed', '发送失败');
      toast.error(msg);
    }
    finally { setSendingCode(false); }
  };

  const handleVerifyAndSave = async () => {
    if (!verifyPassword) { toast.error(t('admin.profile.toast.enterCurrentPassword', '请输入当前密码')); return; }
    if (!verifyCode) { toast.error(t('admin.profile.toast.enterCode', '请输入验证码')); return; }

    setSaving(true);
    try {
      await api.put('/profile', {
        ...pendingData,
        avatar: avatarUrl || undefined,
        password: verifyPassword,
        verify_code: verifyCode,
      });
      toast.success(t('admin.profile.toast.saved', '资料已保存'));
      setOrigEmail(pendingData.email);
      setOrigUsername(pendingData.username);
      setShowVerify(false);
      setPendingData(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.error?.message || t('admin.settings.toast.saveFailed', '保存失败');
      toast.error(msg);
    }
    finally { setSaving(false); }
  };

  const handlePwSendCode = async () => {
    setPwSendingCode(true);
    try {
      const r: any = await api.post('/profile/send-code');
      toast.success(r.data?.message || r.message || t('admin.profile.toast.codeSent', '验证码已发送'));
      setPwCodeSent(true);
      setPwCountdown(60);
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.error?.message || t('admin.profile.toast.sendFailed', '发送失败'));
    }
    finally { setPwSendingCode(false); }
  };

  const onChangePassword = async (data: any) => {
    if (data.new_password !== data.confirm_password) { toast.error(t('admin.profile.toast.passwordMismatch', '两次密码不一致')); return; }
    if (!data.verify_code) { toast.error(t('admin.profile.toast.enterEmailCode', '请输入邮箱验证码')); return; }
    setChangingPassword(true);
    try {
      await api.put('/auth/password', {
        current_password: data.current_password,
        new_password: data.new_password,
        verify_code: data.verify_code,
      });
      toast.success(t('admin.profile.toast.passwordChanged', '密码已修改'));
      resetPw();
      setPwCodeSent(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.error?.message || t('admin.profile.toast.changeFailed', '修改失败');
      toast.error(msg);
    }
    finally { setChangingPassword(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error(t('admin.profile.toast.selectImage', '请选择图片文件')); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'avatars');
      const r: any = await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url || r.url;
      if (url) {
        setAvatarUrl(url);
        await api.put('/profile', { avatar: url });
        toast.success(t('admin.profile.toast.avatarUpdated', '头像已更新'));
      }
    } catch { toast.error(t('admin.common.uploadFailed', '上传失败')); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const saveSocialLinks = async () => {
    setSocialSaving(true);
    try {
      const filtered = socialLinks.filter(s => s.url || s.qr);
      await optionsApi.updateMany({ social_links: JSON.stringify(filtered) });
      toast.success(t('admin.profile.toast.socialSaved', '社交链接已保存'));
    } catch { toast.error(t('admin.settings.toast.saveFailed', '保存失败')); }
    finally { setSocialSaving(false); }
  };

  const handleSocialQr = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData(); fd.append('file', file);
      const r: any = await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url || r.url;
      if (url) setSocialLinks(prev => prev.map((s, i) => i === idx ? { ...s, qr: url } : s));
    } catch { toast.error(t('admin.common.uploadFailed', '上传失败')); }
    if (e.target) e.target.value = '';
  };

  return (
    <div>
      <div className="grid grid-cols-2 items-start gap-4">
        {/* Left column: Profile Info + Change Password */}
        <div className="flex flex-col gap-4">
        <Card className="p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">{t('admin.profile.basicInfo', '基本信息')}</h2>

          {/* Avatar */}
          <div className="mb-5 flex items-start gap-4">
            {/* Gravatar */}
            <div
              className="cursor-pointer text-center"
              onClick={async () => {
                setAvatarSource('gravatar');
                try { await optionsApi.updateMany({ avatar_source: 'gravatar' }); toast.success(t('admin.profile.toast.switchedGravatar', '已切换为 Gravatar')); } catch {}
              }}
            >
              <div className={cn(
                'size-[72px] overflow-hidden rounded-full bg-muted transition-colors',
                avatarSource === 'gravatar' ? 'border-[3px] border-primary' : 'border-2 border-border',
              )}>
                {gravatarUrl && <img src={gravatarUrl} alt="" className="size-full object-cover" />}
              </div>
              <span className={cn('mt-1 block text-[10px]', avatarSource === 'gravatar' ? 'font-semibold text-primary' : 'text-muted-foreground')}>Gravatar</span>
            </div>
            {/* Utterlog */}
            <div
              className={cn('text-center', utterlogBound ? 'cursor-pointer opacity-100' : 'cursor-default opacity-50')}
              onClick={async () => {
                if (!utterlogBound) { toast.error(t('admin.profile.toast.bindUtterlogFirst', '请先绑定 Utterlog ID')); return; }
                setAvatarSource('utterlog');
                try { await optionsApi.updateMany({ avatar_source: 'utterlog' }); toast.success(t('admin.profile.toast.switchedFederatedAvatar', '已切换为联盟头像')); } catch {}
              }}
            >
              <div className={cn(
                'flex size-[72px] items-center justify-center overflow-hidden rounded-full bg-muted transition-colors',
                avatarSource === 'utterlog' ? 'border-[3px] border-primary' : utterlogBound ? 'border-2 border-border' : 'border-2 border-dashed border-border',
              )}>
                {utterlogAvatar ? (
                  <img src={utterlogAvatar} alt="" className="size-full object-cover" />
                ) : (
                  <Globe className="size-6 text-muted-foreground" />
                )}
              </div>
              <span className={cn('mt-1 block text-[10px]', avatarSource === 'utterlog' ? 'font-semibold text-primary' : 'text-muted-foreground')}>{t('admin.profile.federatedAvatar', '联盟头像')}</span>
            </div>
            <div className="flex-1 pt-2">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('admin.profile.avatarSourceHint', '点击头像切换前端显示来源。')}
                {!utterlogBound && <> <a href="/utterlog" className="text-primary hover:underline">{t('admin.profile.bindUtterlogId', '绑定 Utterlog ID')}</a> {t('admin.profile.avatarBindSuffix', '后可使用联盟头像。')}</>}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSaveProfile)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.username', '登录账号')}</Label>
              <Input {...register('username')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.email', '邮箱')}</Label>
              <Input type="email" {...register('email')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.nickname', '昵称')}</Label>
              <Input {...register('nickname')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.website', '个人网站')}</Label>
              <Input placeholder="https://" {...register('url')} />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('admin.profile.bio', '简介')}</Label>
              <Textarea rows={3} {...register('bio')} placeholder={t('admin.profile.bioPlaceholder', '介绍一下自己…')} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('admin.profile.sensitiveChangeHint', '修改登录账号或邮箱需要验证当前密码和邮箱验证码')}
            </p>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t('admin.common.save', '保存')}
              </Button>
            </div>
          </form>
        </Card>

        {/* Change Password */}
        <Card className="p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">{t('admin.profile.changePassword', '修改密码')}</h2>
          <form onSubmit={handlePwSubmit(onChangePassword)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.currentPassword', '当前密码')}</Label>
              <Input type="password" {...registerPw('current_password')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.newPassword', '新密码')}</Label>
              <Input type="password" {...registerPw('new_password')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.confirmNewPassword', '确认新密码')}</Label>
              <Input type="password" {...registerPw('confirm_password')} />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('admin.profile.emailCode', '邮箱验证码')}</Label>
              <div className="flex gap-2">
                <Input className="flex-1" placeholder={t('admin.profile.codePlaceholder', '输入验证码')} {...registerPw('verify_code')} />
                <Button type="button" variant="outline" onClick={handlePwSendCode} disabled={pwSendingCode || pwCountdown > 0} className="shrink-0 whitespace-nowrap">
                  {pwSendingCode ? t('admin.login.sending', '发送中…') : pwCountdown > 0 ? `${pwCountdown}s` : pwCodeSent ? t('admin.profile.resendCode', '重新发送') : t('admin.profile.sendCode', '发送验证码')}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={changingPassword}>
                {changingPassword && <Loader2 className="size-4 animate-spin" />}
                {t('admin.profile.changePassword', '修改密码')}
              </Button>
            </div>
          </form>
        </Card>
        </div>{/* end left column */}

        {/* Right column: Social + 2FA + Passkeys */}
        <div className="flex flex-col gap-4">

        {/* Social Links */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-foreground">{t('admin.profile.socialLinks', '社交链接')}</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddSocial(true)}>
              <Plus className="size-4" />{t('admin.common.add', '添加')}
            </Button>
          </div>

          <div className="flex flex-col gap-2.5">
            {socialLinks.map((link, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <i className={cn(link.icon || 'fa-light fa-link', 'w-5 shrink-0 text-center text-sm text-primary')} />
                <span className="w-[60px] shrink-0 text-xs text-muted-foreground">{link.name}</span>
                <Input
                  className="h-9 flex-1 text-xs"
                  placeholder={t('admin.profile.socialUrlPlaceholder', '输入 {name} 链接', { name: link.name === '微信' ? t('admin.profile.social.wechat', '微信') : link.name })}
                  value={link.url}
                  onChange={e => setSocialLinks(prev => prev.map((s, i) => i === idx ? { ...s, url: e.target.value } : s))}
                />
                {link.qr !== undefined || link.name === '微信' ? (
                  <>
                    <input type="file" accept="image/*" className="hidden" ref={el => { if (el) el.dataset.idx = String(idx); }} onChange={e => handleSocialQr(e, idx)} />
                    <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={() => {
                      const inp = document.querySelector(`input[data-idx="${idx}"]`) as HTMLInputElement;
                      inp?.click();
                    }} title={t('admin.profile.uploadQr', '上传二维码')}>
                      {link.qr ? <img src={link.qr} alt="" className="size-[18px] object-cover" /> : <QrCode className="size-3.5" />}
                    </Button>
                  </>
                ) : null}
                {defaultSocialNames.includes(link.name) ? (
                  <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={() => setSocialLinks(prev => prev.map((s, i) => i === idx ? { ...s, url: '', qr: undefined } : s))} title={t('admin.profile.clear', '清空')}>
                    <Eraser className="size-3.5" />
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setSocialLinks(prev => prev.filter((_, i) => i !== idx))}>
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {showAddSocial && (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="grid grid-cols-2 gap-2">
                <Input className="h-9 text-xs" placeholder={t('admin.profile.iconPlaceholder', '图标 (如 fa-brands fa-bilibili)')} value={newSocial.icon} onChange={e => setNewSocial(p => ({ ...p, icon: e.target.value }))} />
                <Input className="h-9 text-xs" placeholder={t('admin.profile.namePlaceholder', '名称 (如 B站)')} value={newSocial.name} onChange={e => setNewSocial(p => ({ ...p, name: e.target.value }))} />
              </div>
              <Input className="h-9 text-xs" placeholder={t('admin.import.urlLabel', '链接地址')} value={newSocial.url} onChange={e => setNewSocial(p => ({ ...p, url: e.target.value }))} />
              <div className="flex justify-end gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddSocial(false); setNewSocial({ icon: '', name: '', url: '' }); }}>{t('admin.common.cancel', '取消')}</Button>
                <Button type="button" size="sm" onClick={() => {
                  if (!newSocial.name) { toast.error(t('admin.profile.toast.enterName', '请输入名称')); return; }
                  setSocialLinks(prev => [...prev, { ...newSocial }]);
                  setNewSocial({ icon: '', name: '', url: '' });
                  setShowAddSocial(false);
                }}>{t('admin.common.add', '添加')}</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('admin.profile.commonIcons', '常用图标：fa-brands fa-bilibili, fa-brands fa-weixin, fa-brands fa-tiktok, fa-brands fa-xiaohongshu')}
              </p>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={saveSocialLinks} disabled={socialSaving}>
              {socialSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t('admin.common.save', '保存')}
            </Button>
          </div>
        </Card>

          {/* Two-Factor Authentication */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <ShieldCheck className="size-[18px] text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">{t('admin.profile.twoFactor', '两步验证')}</h2>
            {totpEnabled && (
              <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                {t('admin.profile.enabled', '已启用')}
              </Badge>
            )}
          </div>

          {totpShowBackup ? (
            /* Show backup codes after enabling */
            <div>
              <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/15 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                  <TriangleAlert className="size-4" />
                  {t('admin.profile.saveBackupCodes', '请保存以下备用码')}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t('admin.profile.backupCodesHint', '备用码仅显示一次，丢失验证器时可使用备用码登录。每个备用码只能使用一次。')}
                </p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {totpBackupCodes.map((code, i) => (
                  <div key={i} className="rounded bg-muted px-3 py-2 text-center font-mono text-sm font-semibold tracking-wider text-foreground">
                    {code}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(totpBackupCodes.join('\n'));
                  toast.success(t('admin.profile.toast.copiedClipboard', '已复制到剪贴板'));
                }}
                className="mb-2 w-full"
              >
                <Copy className="size-4" />
                {t('admin.profile.copyBackupCodes', '复制备用码')}
              </Button>
              <Button
                onClick={() => { setTotpShowBackup(false); setTotpBackupCodes([]); }}
                className="w-full"
              >
                {t('admin.profile.backupSaved', '我已保存')}
              </Button>
            </div>
          ) : totpSetupMode ? (
            /* Setup flow */
            <div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                {t('admin.profile.totpSetupHint', '使用验证器应用（如 Google Authenticator、1Password、Authy）扫描下方二维码，或手动输入密钥。')}
              </p>

              {/* QR Code - using Google Charts API for QR generation */}
              <div className="mb-4 text-center">
                {totpUri && (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUri)}`}
                    alt="TOTP QR Code"
                    className="inline-block size-[200px] [image-rendering:pixelated]"
                  />
                )}
              </div>

              {/* Manual secret */}
              <div className="mb-4">
                <Label className="mb-1 block text-[11px] text-muted-foreground">{t('admin.profile.manualSecret', '手动输入密钥')}</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-muted px-3 py-2 text-[13px] font-semibold tracking-wider text-foreground">
                    {totpSecret}
                  </code>
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { navigator.clipboard.writeText(totpSecret); toast.success(t('admin.profile.toast.copied', '已复制')); }}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Verify code */}
              <div className="mb-4">
                <Label className="mb-1.5 block">{t('admin.profile.confirmCode', '输入验证码确认')}</Label>
                <Input
                  value={totpVerifyCode}
                  onChange={e => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && totpVerifyCode.length === 6) {
                      setTotpLoading(true);
                      try {
                        const r: any = await authApi.totpVerify(totpVerifyCode);
                        setTotpEnabled(true);
                        setTotpSetupMode(false);
                        setTotpBackupCodes(r.data?.backup_codes || []);
                        setTotpShowBackup(true);
                        toast.success(t('admin.profile.toast.totpEnabled', '两步验证已启用'));
                      } catch (err: any) {
                        toast.error(err?.response?.data?.error?.message || t('admin.profile.toast.verifyFailed', '验证失败'));
                      }
                      setTotpLoading(false);
                    }
                  }}
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  className="text-center text-lg font-semibold tracking-[0.2em]"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setTotpSetupMode(false)}>{t('admin.common.cancel', '取消')}</Button>
                <Button
                  className="flex-1"
                  onClick={async () => {
                    if (totpVerifyCode.length < 6) return;
                    setTotpLoading(true);
                    try {
                      const r: any = await authApi.totpVerify(totpVerifyCode);
                      setTotpEnabled(true);
                      setTotpSetupMode(false);
                      setTotpBackupCodes(r.data?.backup_codes || []);
                      setTotpShowBackup(true);
                      toast.success(t('admin.profile.toast.totpEnabled', '两步验证已启用'));
                    } catch (err: any) {
                      toast.error(err?.response?.data?.error?.message || t('admin.profile.toast.verifyFailed', '验证失败'));
                    }
                    setTotpLoading(false);
                  }}
                  disabled={totpLoading || totpVerifyCode.length < 6}
                >
                  {totpLoading ? t('admin.login.verifying', '验证中…') : t('admin.profile.enableTwoFactor', '启用两步验证')}
                </Button>
              </div>
            </div>
          ) : totpDisableMode ? (
            /* Disable flow */
            <div>
              <p className="mb-4 text-[13px] text-muted-foreground">
                {t('admin.profile.disableTotpHint', '关闭两步验证需要当前密码和验证码确认。')}
              </p>
              <div className="mb-4 flex flex-col gap-3">
                <div>
                  <Label className="mb-1.5 block">{t('admin.profile.currentPassword', '当前密码')}</Label>
                  <Input value={totpDisablePw} onChange={e => setTotpDisablePw(e.target.value)} type="password" />
                </div>
                <div>
                  <Label className="mb-1.5 block">{t('admin.profile.codeOrBackup', '验证码或备用码')}</Label>
                  <Input value={totpDisableCode} onChange={e => setTotpDisableCode(e.target.value)} type="text" placeholder="000000" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setTotpDisableMode(false); setTotpDisablePw(''); setTotpDisableCode(''); }}>{t('admin.common.cancel', '取消')}</Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={async () => {
                    if (!totpDisablePw || !totpDisableCode) return;
                    setTotpLoading(true);
                    try {
                      await authApi.totpDisable(totpDisablePw, totpDisableCode);
                      setTotpEnabled(false);
                      setTotpDisableMode(false);
                      setTotpDisablePw('');
                      setTotpDisableCode('');
                      toast.success(t('admin.profile.toast.totpDisabled', '两步验证已关闭'));
                    } catch (err: any) {
                      toast.error(err?.response?.data?.error?.message || t('admin.common.operationFailed', '操作失败'));
                    }
                    setTotpLoading(false);
                  }}
                  disabled={totpLoading || !totpDisablePw || !totpDisableCode}
                >
                  {totpLoading ? t('admin.profile.processing', '处理中…') : t('admin.profile.disableTwoFactor', '关闭两步验证')}
                </Button>
              </div>
            </div>
          ) : totpEnabled ? (
            /* Already enabled */
            <div>
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                {t('admin.profile.totpEnabledDescription', '两步验证已启用，每次登录时需要输入验证器应用生成的验证码。')}
              </p>
              <Button variant="outline" className="gap-2.5 px-6 text-destructive hover:text-destructive" onClick={() => setTotpDisableMode(true)}>
                <ShieldOff className="size-4" />
                {t('admin.profile.disableTwoFactor', '关闭两步验证')}
              </Button>
            </div>
          ) : (
            /* Not enabled */
            <div>
              <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
                {t('admin.profile.totpDescription', '启用两步验证后，除密码外还需要验证器应用（如 Google Authenticator）生成的验证码才能登录，大幅提升账户安全性。')}
              </p>
              <Button
                onClick={async () => {
                  setTotpLoading(true);
                  try {
                    const r: any = await authApi.totpSetup();
                    const data = r?.data || r;
                    const secret = data?.secret || '';
                    const uri = data?.uri || '';
                    if (!secret) {
                      toast.error(t('admin.profile.toast.secretFailed', '生成密钥失败，请重试'));
                      setTotpLoading(false);
                      return;
                    }
                    setTotpSecret(secret);
                    setTotpUri(uri);
                    setTotpSetupMode(true);
                    setTotpVerifyCode('');
                  } catch (err: any) {
                    console.error('TOTP setup error:', err);
                    const msg = err?.response?.data?.error?.message
                      || err?.data?.error?.message
                      || (typeof err === 'object' && err?.success === false ? err?.error?.message : null)
                      || err?.message
                      || t('admin.profile.toast.setupFailed', '设置失败，请刷新页面重试');
                    toast.error(msg);
                  } finally {
                    setTotpLoading(false);
                  }
                }}
                disabled={totpLoading}
              >
                <ShieldCheck className="size-4" />
                {totpLoading ? t('admin.profile.preparing', '准备中…') : t('admin.profile.enableTwoFactor', '启用两步验证')}
              </Button>
            </div>
          )}
        </Card>

        {/* Passkeys */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2.5">
            <KeyRound className="size-[18px] text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">{t('admin.profile.passkeys', '通行密钥')}</h2>
            {passkeys.length > 0 && (
              <span className="text-xs text-muted-foreground">{t('admin.profile.passkeyCount', '{count} 个', { count: passkeys.length })}</span>
            )}
          </div>

          <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
            {t('admin.profile.passkeyDescription', '通行密钥（Passkey）使用设备生物识别（指纹、面容）或安全密钥替代密码登录，更安全便捷。')}
          </p>

          {passkeys.length > 0 && (
            <div className="mb-4">
              {passkeys.map((pk: any) => (
                <div key={pk.id} className="flex items-center gap-3 border-b border-border py-2.5">
                  <Fingerprint className="size-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-foreground">{pk.name || t('admin.profile.unnamedPasskey', '未命名密钥')}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('admin.profile.passkeyCreatedAt', '添加于 {date}', { date: formatWithAdminTimeZone(new Date(pk.created_at * 1000), locale || 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) })}
                      {pk.last_used_at > 0 && <> · {t('admin.profile.passkeyLastUsed', '最后使用 {date}', { date: formatWithAdminTimeZone(new Date(pk.last_used_at * 1000), locale || 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) })}</>}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletePasskeyId(pk.id)}
                    title={t('admin.common.delete', '删除')}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {passkeyNaming ? (
            <div className="flex gap-2">
              <Input
                value={passkeyName}
                onChange={e => setPasskeyName(e.target.value)}
                placeholder={t('admin.profile.passkeyNamePlaceholder', '为此密钥命名（如：MacBook）')}
                className="flex-1 text-[13px]"
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') { setPasskeyNaming(false); setPasskeyName(''); } }}
              />
              <Button
                onClick={async () => {
                  setPasskeyLoading(true);
                  try {
                    // Step 1: Get creation options from server
                    const beginRes: any = await authApi.passkeyRegisterBegin();
                    const resData = beginRes.data;
                    const sessionId = resData.session_id;
                    const options = resData.publicKey;

                    // Decode base64url fields for WebAuthn API
                    options.challenge = base64urlToBuffer(options.challenge);
                    options.user.id = base64urlToBuffer(options.user.id);
                    if (options.excludeCredentials) {
                      options.excludeCredentials = options.excludeCredentials.map((c: any) => ({
                        ...c, id: base64urlToBuffer(c.id),
                      }));
                    }

                    // Step 2: Create credential via browser WebAuthn API
                    const credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential;
                    if (!credential) throw new Error(t('admin.profile.toast.createFailed', '创建失败'));

                    const attestation = credential.response as AuthenticatorAttestationResponse;

                    // Step 3: Send attestation to server for verification
	                    await authApi.passkeyRegisterFinish({
	                      id: credential.id,
	                      rawId: bufferToBase64url(credential.rawId),
	                      type: credential.type,
	                      name: passkeyName.trim() || undefined,
	                      response: {
	                        attestationObject: bufferToBase64url(attestation.attestationObject),
	                        clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
                      },
                    }, sessionId);

                    // Set name via query
                    if (passkeyName) {
                      // Name was already set in header, but let's also update via separate call if needed
                    }

                    toast.success(t('admin.profile.toast.passkeyAdded', '通行密钥已添加'));
                    setPasskeyNaming(false);
                    setPasskeyName('');
                    // Refresh list
                    const r: any = await api.get('/passkeys');
                    setPasskeys(r.data || []);
                  } catch (err: any) {
                    const msg = err?.response?.data?.error?.message || err?.message || t('admin.profile.toast.addFailed', '添加失败');
                    toast.error(msg);
                  }
                  setPasskeyLoading(false);
                }}
                disabled={passkeyLoading}
              >
                {passkeyLoading ? t('admin.profile.registering', '注册中…') : t('admin.profile.register', '注册')}
              </Button>
              <Button variant="outline" onClick={() => { setPasskeyNaming(false); setPasskeyName(''); }}>{t('admin.common.cancel', '取消')}</Button>
            </div>
          ) : (
            <Button
              className="gap-2.5 px-6"
              onClick={() => {
                if (!window.PublicKeyCredential) {
                  toast.error(t('admin.profile.toast.passkeyUnsupported', '当前浏览器不支持通行密钥'));
                  return;
                }
                setPasskeyNaming(true);
              }}
            >
              <Plus className="size-4" />
              {t('admin.profile.addPasskey', '添加通行密钥')}
            </Button>
          )}
        </Card>
        </div>{/* end right column */}
      </div>{/* end main grid */}


      {/* Verification Dialog */}
      <Dialog open={showVerify} onOpenChange={(o) => !o && setShowVerify(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('admin.profile.securityVerification', '安全验证')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <p className="text-[13px] text-muted-foreground">
              {t('admin.profile.securityVerificationHint', '修改登录账号或邮箱需要验证身份，验证码将发送到当前邮箱。')}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.profile.currentPassword', '当前密码')}</Label>
              <Input type="password" value={verifyPassword} onChange={(e: any) => setVerifyPassword(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 block">{t('admin.profile.emailCode', '邮箱验证码')}</Label>
              <div className="flex gap-2">
                <Input
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value)}
                  placeholder={t('admin.profile.sixDigitCodePlaceholder', '6 位验证码')}
                  className="flex-1"
                  maxLength={6}
                />
                <Button
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={sendingCode || countdown > 0}
                  className="shrink-0 whitespace-nowrap"
                >
                  {countdown > 0 ? `${countdown}s` : codeSent ? t('admin.profile.resendCode', '重新发送') : t('admin.profile.sendCode', '发送验证码')}
                </Button>
              </div>
            </div>
            <div className="mt-1 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowVerify(false)}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={handleVerifyAndSave} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {t('admin.profile.confirmChange', '确认修改')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deletePasskeyId !== null}
        onOpenChange={(o) => !o && setDeletePasskeyId(null)}
        onConfirm={deletePasskey}
        title={t('admin.profile.deletePasskeyTitle', '删除通行密钥')}
        message={t('admin.profile.confirmDeletePasskey', '确定删除此通行密钥？')}
        confirmText={t('admin.common.delete', '删除')}
      />
    </div>
  );
}
