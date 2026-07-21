import { useState, useEffect } from 'react';
import {
  Network, Globe, ExternalLink, Unlink, IdCard, User, Users, GitBranch, Bot,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { SaveButton } from '@/components/ui';
import { Button, buttonVariants, Card, Switch, ConfirmDialog } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
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

  const quickLinks = [
    { label: 'Utterlog ID 中心', url: 'https://id.utterlog.com', Icon: IdCard },
    { label: 'ID 个人资料', url: 'https://id.utterlog.com/profile', Icon: User },
    { label: 'Utterlog 社区', url: 'https://utterlog.com', Icon: Users },
    { label: 'Utterlog 程序发布', url: 'https://utterlog.io', Icon: GitBranch },
    { label: 'Utterlog AI 中心', url: 'https://utterlog.ai', Icon: Bot },
  ];

  return (
    <div className="grid grid-cols-2 items-start gap-4">
      {/* Left column */}
      <div className="flex flex-col gap-4">

        {/* Network Status */}
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Network className="size-[18px] text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">网络状态</h2>
            </div>
            <div className={cn(
              'rounded px-3 py-1 text-xs font-semibold',
              networkStatus.connected
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            )}>
              {networkStatus.connected ? '已连接' : '连接中…'}
            </div>
          </div>

          <div className="flex flex-col">
            {[
              { label: '认证中心', value: networkStatus.hub },
              { label: '站点 ID', value: networkStatus.site_id || '自动分配中…' },
              { label: '站点指纹', value: networkStatus.fingerprint || '...' },
            ].map((item, idx) => (
              <div key={item.label} className={cn(
                'flex items-center justify-between py-2.5',
                idx < 2 && 'border-b border-border',
              )}>
                <span className="text-[13px] text-muted-foreground">{item.label}</span>
                <code className="font-mono text-xs text-foreground">{item.value}</code>
              </div>
            ))}
          </div>

          <p className="mt-3.5 text-[11px] leading-relaxed text-muted-foreground">
            站点安装后自动连接 id.utterlog.com 认证中心，基于唯一指纹自动注册，无需手动配置。
          </p>

          {networkStatus.connected && (
            <div className="mt-3.5">
              <Button variant="outline" size="sm" className="min-w-[180px]" onClick={async () => {
                try { await networkApi.pushInfo(); toast.success('站点信息已推送'); } catch { toast.error('推送失败'); }
              }}>
                手动推送站点信息
              </Button>
            </div>
          )}
        </Card>

        {/* Content Sharing */}
        <Card className="p-6">
          <h2 className="mb-1.5 text-[15px] font-semibold text-foreground">内容共享</h2>
          <p className="mb-5 text-xs text-muted-foreground">选择哪些内容可以被其他 Utterlog 站点订阅和发现</p>

          <div className="flex flex-col gap-4">
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
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground">{item.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{item.desc}</div>
                </div>
                <Switch
                  checked={(shareSettings as any)[item.key] || false}
                  onCheckedChange={(checked) => setShareSettings(prev => ({ ...prev, [item.key]: checked }))}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <SaveButton onClick={saveShareSettings} loading={savingShare} />
          </div>
        </Card>

      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">

        {/* Utterlog ID */}
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Globe className="size-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">Utterlog ID</h2>
            {utterlogBound && (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">已绑定</span>
            )}
          </div>

          {utterlogBound ? (
            <div>
              <div className="mb-4 flex items-center gap-3.5 rounded-md bg-muted p-3.5">
                {utterlogAvatar ? (
                  <img src={utterlogAvatar} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">U</div>
                )}
                <div>
                  <p className="text-[15px] font-semibold text-foreground">{utterlogId}</p>
                  <p className="text-xs text-muted-foreground">全网通用身份</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href="https://id.utterlog.com/profile" target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
                  <ExternalLink className="size-3.5" /> ID 中心管理
                </a>
                <Button variant="destructive" size="sm" onClick={() => setConfirmUnbind(true)}>
                  <Unlink className="size-3.5" /> 解绑
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-3.5 text-[13px] leading-relaxed text-muted-foreground">
                绑定 Utterlog ID 后，头像和昵称在所有 Utterlog 联盟站点间共享，使用统一身份评论和互动。
              </p>
              <Button className="w-full" disabled={bindingUtterlog} onClick={async () => {
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
                <Globe className="size-4" /> {bindingUtterlog ? '跳转中…' : '绑定 Utterlog ID'}
              </Button>
            </div>
          )}
        </Card>

        {/* Avatar Source */}
        {utterlogBound && (
          <Card className="p-6">
            <h2 className="mb-1.5 text-[15px] font-semibold text-foreground">站点头像来源</h2>
            <p className="mb-4 text-xs text-muted-foreground">选择博客前端显示哪个头像</p>

            <div className="mb-3 flex gap-5">
              <label className="flex cursor-pointer flex-col items-center gap-2" onClick={async () => { setAvatarSource('gravatar'); await optionsApi.updateMany({ avatar_source: 'gravatar' }); toast.success('已切换'); }}>
                <div className={cn('size-14 overflow-hidden rounded-full', avatarSource === 'gravatar' ? 'border-[3px] border-primary' : 'border-2 border-border')}>
                  {gravatarUrl && <img src={gravatarUrl} alt="" className="size-full object-cover" />}
                </div>
                <span className={cn('text-[11px]', avatarSource === 'gravatar' ? 'font-semibold text-primary' : 'text-muted-foreground')}>Gravatar</span>
              </label>
              <label className="flex cursor-pointer flex-col items-center gap-2" onClick={async () => { setAvatarSource('utterlog'); await optionsApi.updateMany({ avatar_source: 'utterlog' }); toast.success('已切换'); }}>
                <div className={cn('flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted', avatarSource === 'utterlog' ? 'border-[3px] border-primary' : 'border-2 border-border')}>
                  {utterlogAvatar ? (
                    <img src={utterlogAvatar} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-muted-foreground">U</span>
                  )}
                </div>
                <span className={cn('text-[11px]', avatarSource === 'utterlog' ? 'font-semibold text-primary' : 'text-muted-foreground')}>Utterlog ID</span>
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              当前使用：{avatarSource === 'gravatar' ? 'Gravatar (邮箱头像)' : 'Utterlog ID (联盟头像)'}
            </p>
          </Card>
        )}

        {/* Quick Links */}
        <Card className="p-6">
          <h2 className="mb-4 text-[15px] font-semibold text-foreground">快捷链接</h2>
          <div className="flex flex-col gap-2.5">
            {quickLinks.map(link => {
              const LinkIcon = link.Icon;
              return (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:border-primary">
                  <LinkIcon className="size-[18px] text-primary" />
                  <span className="flex-1">{link.label}</span>
                  <ExternalLink className="size-3 text-muted-foreground" />
                </a>
              );
            })}
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={confirmUnbind}
        onOpenChange={(o) => !o && setConfirmUnbind(false)}
        onConfirm={unbindUtterlogID}
        title="解绑 Utterlog ID"
        message="确定要解绑 Utterlog ID？解绑后头像、昵称将不再跨站同步。"
        confirmText="解绑"
      />
    </div>
  );
}
