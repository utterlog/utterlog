
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, Input, SaveButton, Modal } from '@/components/ui';
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Left column: Profile Info + Change Password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>{t('admin.profile.basicInfo', '基本信息')}</h2>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
            {/* Gravatar */}
            <div
              style={{ textAlign: 'center', cursor: 'pointer' }}
              onClick={async () => {
                setAvatarSource('gravatar');
                try { await api.put('/options', { avatar_source: 'gravatar' }); toast.success(t('admin.profile.toast.switchedGravatar', '已切换为 Gravatar')); } catch {}
              }}
            >
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden',
                background: 'var(--color-bg-soft)', transition: 'border-color 0.15s',
                border: avatarSource === 'gravatar' ? '3px solid var(--color-primary)' : '2px solid var(--color-border)',
              }}>
                {gravatarUrl && <img src={gravatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <span style={{ fontSize: '10px', marginTop: '4px', display: 'block', fontWeight: avatarSource === 'gravatar' ? 600 : 400, color: avatarSource === 'gravatar' ? 'var(--color-primary)' : 'var(--color-text-dim)' }}>Gravatar</span>
            </div>
            {/* Utterlog */}
            <div
              style={{ textAlign: 'center', cursor: utterlogBound ? 'pointer' : 'default', opacity: utterlogBound ? 1 : 0.5 }}
              onClick={async () => {
                if (!utterlogBound) { toast.error(t('admin.profile.toast.bindUtterlogFirst', '请先绑定 Utterlog ID')); return; }
                setAvatarSource('utterlog');
                try { await api.put('/options', { avatar_source: 'utterlog' }); toast.success(t('admin.profile.toast.switchedFederatedAvatar', '已切换为联盟头像')); } catch {}
              }}
            >
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden',
                background: 'var(--color-bg-soft)', transition: 'border-color 0.15s',
                border: avatarSource === 'utterlog' ? '3px solid var(--color-primary)' : utterlogBound ? '2px solid var(--color-border)' : '2px dashed var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {utterlogAvatar ? (
                  <img src={utterlogAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="fa-regular fa-globe" style={{ fontSize: '24px', color: 'var(--color-text-dim)' }} />
                )}
              </div>
              <span style={{ fontSize: '10px', marginTop: '4px', display: 'block', fontWeight: avatarSource === 'utterlog' ? 600 : 400, color: avatarSource === 'utterlog' ? 'var(--color-primary)' : 'var(--color-text-dim)' }}>{t('admin.profile.federatedAvatar', '联盟头像')}</span>
            </div>
            <div style={{ flex: 1, paddingTop: '8px' }}>
              <p className="text-dim" style={{ fontSize: '11px', lineHeight: 1.8 }}>
                {t('admin.profile.avatarSourceHint', '点击头像切换前端显示来源。')}
                {!utterlogBound && <> <a href="/utterlog" style={{ color: 'var(--color-primary)' }}>{t('admin.profile.bindUtterlogId', '绑定 Utterlog ID')}</a> {t('admin.profile.avatarBindSuffix', '后可使用联盟头像。')}</>}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSaveProfile)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input label={t('admin.profile.username', '登录账号')} {...register('username')} />
            <Input label={t('admin.profile.email', '邮箱')} type="email" {...register('email')} />
            <Input label={t('admin.profile.nickname', '昵称')} {...register('nickname')} />
            <Input label={t('admin.profile.website', '个人网站')} placeholder="https://" {...register('url')} />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.profile.bio', '简介')}</label>
              <textarea rows={3} className="input focus-ring" {...register('bio')} placeholder={t('admin.profile.bioPlaceholder', '介绍一下自己…')} />
            </div>
            <p className="text-dim" style={{ fontSize: '11px' }}>
              {t('admin.profile.sensitiveChangeHint', '修改登录账号或邮箱需要验证当前密码和邮箱验证码')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SaveButton type="submit" loading={saving} />
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>{t('admin.profile.changePassword', '修改密码')}</h2>
          <form onSubmit={handlePwSubmit(onChangePassword)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input label={t('admin.profile.currentPassword', '当前密码')} type="password" {...registerPw('current_password')} />
            <Input label={t('admin.profile.newPassword', '新密码')} type="password" {...registerPw('new_password')} />
            <Input label={t('admin.profile.confirmNewPassword', '确认新密码')} type="password" {...registerPw('confirm_password')} />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.profile.emailCode', '邮箱验证码')}</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="input" style={{ flex: 1 }} placeholder={t('admin.profile.codePlaceholder', '输入验证码')} {...registerPw('verify_code')} />
                <button type="button" onClick={handlePwSendCode} disabled={pwSendingCode || pwCountdown > 0} className="btn btn-secondary" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {pwSendingCode ? t('admin.login.sending', '发送中…') : pwCountdown > 0 ? `${pwCountdown}s` : pwCodeSent ? t('admin.profile.resendCode', '重新发送') : t('admin.profile.sendCode', '发送验证码')}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" loading={changingPassword}>{t('admin.profile.changePassword', '修改密码')}</Button>
            </div>
          </form>
        </div>
        </div>{/* end left column */}

        {/* Right column: Social + 2FA + Passkeys */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Social Links */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.profile.socialLinks', '社交链接')}</h2>
            <button type="button" onClick={() => setShowAddSocial(true)} className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}>
              <i className="fa-light fa-plus" style={{ marginRight: '4px' }} />{t('admin.common.add', '添加')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {socialLinks.map((link, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className={link.icon || 'fa-light fa-link'} style={{ width: '20px', textAlign: 'center', fontSize: '14px', color: 'var(--color-primary)', flexShrink: 0 }} />
                <span className="text-sub" style={{ fontSize: '12px', width: '60px', flexShrink: 0 }}>{link.name}</span>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }}
                  placeholder={t('admin.profile.socialUrlPlaceholder', '输入 {name} 链接', { name: link.name === '微信' ? t('admin.profile.social.wechat', '微信') : link.name })}
                  value={link.url}
                  onChange={e => setSocialLinks(prev => prev.map((s, i) => i === idx ? { ...s, url: e.target.value } : s))}
                />
                {link.qr !== undefined || link.name === '微信' ? (
                  <>
                    <input type="file" accept="image/*" style={{ display: 'none' }} ref={el => { if (el) el.dataset.idx = String(idx); }} onChange={e => handleSocialQr(e, idx)} />
                    <button type="button" onClick={() => {
                      const inp = document.querySelector(`input[data-idx="${idx}"]`) as HTMLInputElement;
                      inp?.click();
                    }} className="action-btn" title={t('admin.profile.uploadQr', '上传二维码')}>
                      {link.qr ? <img src={link.qr} alt="" style={{ width: '18px', height: '18px', objectFit: 'cover' }} /> : <i className="fa-light fa-qrcode" style={{ fontSize: '12px' }} />}
                    </button>
                  </>
                ) : null}
                {defaultSocialNames.includes(link.name) ? (
                  <button type="button" onClick={() => setSocialLinks(prev => prev.map((s, i) => i === idx ? { ...s, url: '', qr: undefined } : s))} className="action-btn" title={t('admin.profile.clear', '清空')}>
                    <i className="fa-light fa-eraser" style={{ fontSize: '12px' }} />
                  </button>
                ) : (
                  <button type="button" onClick={() => setSocialLinks(prev => prev.filter((_, i) => i !== idx))} className="action-btn danger">
                    <i className="fa-light fa-xmark" style={{ fontSize: '12px' }} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {showAddSocial && (
            <div style={{ marginTop: '12px', padding: '12px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input className="input" style={{ fontSize: '12px', padding: '6px 10px' }} placeholder={t('admin.profile.iconPlaceholder', '图标 (如 fa-brands fa-bilibili)')} value={newSocial.icon} onChange={e => setNewSocial(p => ({ ...p, icon: e.target.value }))} />
                <input className="input" style={{ fontSize: '12px', padding: '6px 10px' }} placeholder={t('admin.profile.namePlaceholder', '名称 (如 B站)')} value={newSocial.name} onChange={e => setNewSocial(p => ({ ...p, name: e.target.value }))} />
              </div>
              <input className="input" style={{ fontSize: '12px', padding: '6px 10px' }} placeholder={t('admin.import.urlLabel', '链接地址')} value={newSocial.url} onChange={e => setNewSocial(p => ({ ...p, url: e.target.value }))} />
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowAddSocial(false); setNewSocial({ icon: '', name: '', url: '' }); }} className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}>{t('admin.common.cancel', '取消')}</button>
                <button type="button" onClick={() => {
                  if (!newSocial.name) { toast.error(t('admin.profile.toast.enterName', '请输入名称')); return; }
                  setSocialLinks(prev => [...prev, { ...newSocial }]);
                  setNewSocial({ icon: '', name: '', url: '' });
                  setShowAddSocial(false);
                }} className="btn btn-primary" style={{ fontSize: '12px', padding: '4px 10px', height: '28px' }}>{t('admin.common.add', '添加')}</button>
              </div>
              <p className="text-dim" style={{ fontSize: '11px' }}>
                {t('admin.profile.commonIcons', '常用图标：fa-brands fa-bilibili, fa-brands fa-weixin, fa-brands fa-tiktok, fa-brands fa-xiaohongshu')}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <SaveButton onClick={saveSocialLinks} loading={socialSaving} />
          </div>
        </div>

          {/* Two-Factor Authentication */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <i className="fa-light fa-shield-keyhole" style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.profile.twoFactor', '两步验证')}</h2>
            {totpEnabled && (
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#16a34a' }}>
                {t('admin.profile.enabled', '已启用')}
              </span>
            )}
          </div>

          {totpShowBackup ? (
            /* Show backup codes after enabling */
            <div>
              <div style={{ padding: '16px', background: '#fffbeb', border: '1px solid #fbbf24', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
                  <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '6px' }} />
                  {t('admin.profile.saveBackupCodes', '请保存以下备用码')}
                </p>
                <p style={{ fontSize: '12px', color: '#92400e' }}>
                  {t('admin.profile.backupCodesHint', '备用码仅显示一次，丢失验证器时可使用备用码登录。每个备用码只能使用一次。')}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                {totpBackupCodes.map((code, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'var(--color-bg-soft)', fontFamily: 'monospace', fontSize: '14px', fontWeight: 600, letterSpacing: '0.05em', textAlign: 'center' }}>
                    {code}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(totpBackupCodes.join('\n'));
                  toast.success(t('admin.profile.toast.copiedClipboard', '已复制到剪贴板'));
                }}
                className="btn btn-secondary"
                style={{ marginBottom: '8px', width: '100%' }}
              >
                <i className="fa-light fa-copy" style={{ marginRight: '6px' }} />
                {t('admin.profile.copyBackupCodes', '复制备用码')}
              </button>
              <button
                onClick={() => { setTotpShowBackup(false); setTotpBackupCodes([]); }}
                className="btn btn-primary"
                style={{ width: '100%' }}
              >
                {t('admin.profile.backupSaved', '我已保存')}
              </button>
            </div>
          ) : totpSetupMode ? (
            /* Setup flow */
            <div>
              <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px', lineHeight: 1.8 }}>
                {t('admin.profile.totpSetupHint', '使用验证器应用（如 Google Authenticator、1Password、Authy）扫描下方二维码，或手动输入密钥。')}
              </p>

              {/* QR Code - using Google Charts API for QR generation */}
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                {totpUri && (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUri)}`}
                    alt="TOTP QR Code"
                    style={{ width: '200px', height: '200px', imageRendering: 'pixelated' }}
                  />
                )}
              </div>

              {/* Manual secret */}
              <div style={{ marginBottom: '16px' }}>
                <label className="text-dim" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>{t('admin.profile.manualSecret', '手动输入密钥')}</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '8px 12px', background: 'var(--color-bg-soft)', fontSize: '13px', fontWeight: 600, letterSpacing: '0.1em', wordBreak: 'break-all' }}>
                    {totpSecret}
                  </code>
                  <button onClick={() => { navigator.clipboard.writeText(totpSecret); toast.success(t('admin.profile.toast.copied', '已复制')); }} className="btn btn-ghost" style={{ flexShrink: 0, padding: '8px' }}>
                    <i className="fa-light fa-copy" />
                  </button>
                </div>
              </div>

              {/* Verify code */}
              <div style={{ marginBottom: '16px' }}>
                <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.profile.confirmCode', '输入验证码确认')}</label>
                <input
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
                  className="input focus-ring"
                  style={{ fontSize: '18px', textAlign: 'center', letterSpacing: '0.2em', fontWeight: 600 }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setTotpSetupMode(false)} className="btn btn-secondary" style={{ flex: 1 }}>{t('admin.common.cancel', '取消')}</button>
                <button
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
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {totpLoading ? t('admin.login.verifying', '验证中…') : t('admin.profile.enableTwoFactor', '启用两步验证')}
                </button>
              </div>
            </div>
          ) : totpDisableMode ? (
            /* Disable flow */
            <div>
              <p className="text-dim" style={{ fontSize: '13px', marginBottom: '16px' }}>
                {t('admin.profile.disableTotpHint', '关闭两步验证需要当前密码和验证码确认。')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.profile.currentPassword', '当前密码')}</label>
                  <input value={totpDisablePw} onChange={e => setTotpDisablePw(e.target.value)} type="password" className="input focus-ring" />
                </div>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.profile.codeOrBackup', '验证码或备用码')}</label>
                  <input value={totpDisableCode} onChange={e => setTotpDisableCode(e.target.value)} type="text" className="input focus-ring" placeholder="000000" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setTotpDisableMode(false); setTotpDisablePw(''); setTotpDisableCode(''); }} className="btn btn-secondary" style={{ flex: 1 }}>{t('admin.common.cancel', '取消')}</button>
                <button
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
                  className="btn btn-primary"
                  style={{ flex: 1, background: '#ef4444' }}
                >
                  {totpLoading ? t('admin.profile.processing', '处理中…') : t('admin.profile.disableTwoFactor', '关闭两步验证')}
                </button>
              </div>
            </div>
          ) : totpEnabled ? (
            /* Already enabled */
            <div>
              <p className="text-dim" style={{ fontSize: '13px', lineHeight: 1.8, marginBottom: '16px' }}>
                {t('admin.profile.totpEnabledDescription', '两步验证已启用，每次登录时需要输入验证器应用生成的验证码。')}
              </p>
              <button onClick={() => setTotpDisableMode(true)} className="btn btn-secondary" style={{ color: '#ef4444', padding: '0 24px', gap: '10px' }}>
                <i className="fa-light fa-shield-xmark" />
                {t('admin.profile.disableTwoFactor', '关闭两步验证')}
              </button>
            </div>
          ) : (
            /* Not enabled */
            <div>
              <p className="text-dim" style={{ fontSize: '13px', lineHeight: 1.8, marginBottom: '16px' }}>
                {t('admin.profile.totpDescription', '启用两步验证后，除密码外还需要验证器应用（如 Google Authenticator）生成的验证码才能登录，大幅提升账户安全性。')}
              </p>
              <button
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
                className="btn btn-primary"
              >
                <i className="fa-light fa-shield-keyhole" style={{ marginRight: '6px' }} />
                {totpLoading ? t('admin.profile.preparing', '准备中…') : t('admin.profile.enableTwoFactor', '启用两步验证')}
              </button>
            </div>
          )}
        </div>

        {/* Passkeys */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <i className="fa-light fa-key" style={{ fontSize: '18px', color: 'var(--color-primary)' }} />
            <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600 }}>{t('admin.profile.passkeys', '通行密钥')}</h2>
            {passkeys.length > 0 && (
              <span className="text-dim" style={{ fontSize: '12px' }}>{t('admin.profile.passkeyCount', '{count} 个', { count: passkeys.length })}</span>
            )}
          </div>

          <p className="text-dim" style={{ fontSize: '13px', lineHeight: 1.8, marginBottom: '16px' }}>
            {t('admin.profile.passkeyDescription', '通行密钥（Passkey）使用设备生物识别（指纹、面容）或安全密钥替代密码登录，更安全便捷。')}
          </p>

          {passkeys.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {passkeys.map((pk: any) => (
                <div key={pk.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <i className="fa-light fa-fingerprint" style={{ fontSize: '20px', color: 'var(--color-primary)' }} />
                  <div style={{ flex: 1 }}>
                    <p className="text-main" style={{ fontSize: '13px', fontWeight: 500 }}>{pk.name || t('admin.profile.unnamedPasskey', '未命名密钥')}</p>
                    <p className="text-dim" style={{ fontSize: '11px' }}>
                      {t('admin.profile.passkeyCreatedAt', '添加于 {date}', { date: formatWithAdminTimeZone(new Date(pk.created_at * 1000), locale || 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) })}
                      {pk.last_used_at > 0 && <> · {t('admin.profile.passkeyLastUsed', '最后使用 {date}', { date: formatWithAdminTimeZone(new Date(pk.last_used_at * 1000), locale || 'zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) })}</>}
                    </p>
                  </div>
                  <button
                    onClick={() => setDeletePasskeyId(pk.id)}
                    className="action-btn danger"
                    title={t('admin.common.delete', '删除')}
                  >
                    <i className="fa-light fa-trash" style={{ fontSize: '14px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {passkeyNaming ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={passkeyName}
                onChange={e => setPasskeyName(e.target.value)}
                placeholder={t('admin.profile.passkeyNamePlaceholder', '为此密钥命名（如：MacBook）')}
                className="input focus-ring"
                style={{ flex: 1, fontSize: '13px' }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') { setPasskeyNaming(false); setPasskeyName(''); } }}
              />
              <button
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
                className="btn btn-primary"
              >
                {passkeyLoading ? t('admin.profile.registering', '注册中…') : t('admin.profile.register', '注册')}
              </button>
              <button onClick={() => { setPasskeyNaming(false); setPasskeyName(''); }} className="btn btn-secondary">{t('admin.common.cancel', '取消')}</button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!window.PublicKeyCredential) {
                  toast.error(t('admin.profile.toast.passkeyUnsupported', '当前浏览器不支持通行密钥'));
                  return;
                }
                setPasskeyNaming(true);
              }}
              className="btn btn-primary"
              style={{ padding: '0 24px', gap: '10px' }}
            >
              <i className="fa-light fa-plus" />
              {t('admin.profile.addPasskey', '添加通行密钥')}
            </button>
          )}
        </div>
        </div>{/* end right column */}
      </div>{/* end main grid */}


      {/* Verification Dialog */}
      <Modal isOpen={showVerify} onClose={() => setShowVerify(false)} title={t('admin.profile.securityVerification', '安全验证')} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p className="text-sub" style={{ fontSize: '13px' }}>
            {t('admin.profile.securityVerificationHint', '修改登录账号或邮箱需要验证身份，验证码将发送到当前邮箱。')}
          </p>
          <Input label={t('admin.profile.currentPassword', '当前密码')} type="password" value={verifyPassword} onChange={(e: any) => setVerifyPassword(e.target.value)} />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.profile.emailCode', '邮箱验证码')}</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value)}
                placeholder={t('admin.profile.sixDigitCodePlaceholder', '6 位验证码')}
                className="input"
                style={{ flex: 1 }}
                maxLength={6}
              />
              <Button
                variant="secondary"
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {countdown > 0 ? `${countdown}s` : codeSent ? t('admin.profile.resendCode', '重新发送') : t('admin.profile.sendCode', '发送验证码')}
              </Button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <Button variant="secondary" onClick={() => setShowVerify(false)}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={handleVerifyAndSave} loading={saving}>{t('admin.profile.confirmChange', '确认修改')}</Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={deletePasskeyId !== null}
        onClose={() => setDeletePasskeyId(null)}
        onConfirm={deletePasskey}
        title={t('admin.profile.deletePasskeyTitle', '删除通行密钥')}
        message={t('admin.profile.confirmDeletePasskey', '确定删除此通行密钥？')}
        confirmText={t('admin.common.delete', '删除')}
      />
    </div>
  );
}
