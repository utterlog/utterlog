import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Globe, Feather, Plus, Loader2, Copy, Check, Trash2,
  TriangleAlert, SquarePen, History, RefreshCw, type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import {
  Button, Badge, Input, ConfirmDialog,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { formatWithAdminTimeZone } from '@/lib/timezone';

interface SyncSite {
  site_uuid: string;
  label: string;
  source_url: string;
  disabled: boolean;
  last_seen_at: number;
  created_at: number;
  recent_jobs: number;
}

interface SyncJob {
  job_id: string;
  site_uuid: string;
  status: string;
  stage: string;
  media_total: number;
  media_done: number;
  posts_rewritten: number;
  started_at: number;
  finished_at: number | null;
}

interface CreatedToken {
  site_uuid: string;
  token: string;
  label: string;
}

type SyncPlatform = 'wordpress' | 'typecho';

interface SyncSitesPanelProps {
  /** 哪一类源站同步面板。决定 API 路径前缀、UI 文案、图标 */
  platform?: SyncPlatform;
}

// UI 文案 / 图标 / 插件名按平台分流；handler 完全共享，差异只在标签
const PLATFORM_META: Record<SyncPlatform, {
  icon: LucideIcon;
  pluginName: string;
  uploadsPath: string;
}> = {
  wordpress: {
    icon: Globe,
    pluginName: 'utterlog-sync',
    uploadsPath: '/wp-content/uploads/',
  },
  typecho: {
    icon: Feather,
    pluginName: 'utterlog-sync-typecho',
    uploadsPath: '/usr/uploads/',
  },
};

const jobStatusBadge: Record<string, string> = {
  finished: 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'border-transparent bg-destructive/15 text-destructive',
};

function fmtTime(ts: number, locale = 'zh-CN') {
  if (!ts) return '—';
  return formatWithAdminTimeZone(new Date(ts * 1000), locale, {});
}

function stageLabel(stage: string, t: (key: string, fallback?: string, vars?: Record<string, string | number>) => string) {
  const map: Record<string, string> = {
    import: t('admin.syncSites.stage.import', '导入数据中'),
    media_scan: t('admin.syncSites.stage.mediaScan', '扫描媒体文件'),
    media_pull: t('admin.syncSites.stage.mediaPull', '下载媒体'),
    rewrite: t('admin.syncSites.stage.rewrite', '改写文章链接'),
    geoip: t('admin.syncSites.stage.geoip', '填充 IP 地理'),
    done: t('admin.syncSites.stage.done', '完成'),
  };
  return map[stage] || stage;
}

export default function SyncSitesPanel({ platform = 'wordpress' }: SyncSitesPanelProps) {
  const { t, locale } = useI18n();
  const meta = PLATFORM_META[platform];
  const PlatformIcon = meta.icon;
  const platformLabel = platform === 'typecho' ? 'Typecho' : 'WordPress';
  const apiBase = `/admin/sync/${platform}`;

  const [sites, setSites] = useState<SyncSite[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ label: '', source_url: '' });
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SyncSite | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadSites() {
    try {
      const r = await api.get<any>(`${apiBase}/sites?platform=${platform}`);
      setSites(r.data?.sites || []);
    } catch (e: any) {
      toast.error(t('admin.syncSites.toast.loadSitesFailed', '加载站点失败：{reason}', { reason: e?.message || t('admin.common.unknownError', '未知错误') }));
    }
  }

  async function loadJobs() {
    try {
      const r = await api.get<any>(`${apiBase}/jobs?limit=10&platform=${platform}`);
      setJobs(r.data?.jobs || []);
    } catch (e: any) {
      // quietly ignore — jobs empty initially
    }
  }

  async function refreshAll() {
    setLoading(true);
    await Promise.all([loadSites(), loadJobs()]);
    setLoading(false);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  // Auto-poll while any job is running/processing. Also tick a local
  // clock so "elapsed time" displays update every second without
  // hitting the backend.
  useEffect(() => {
    const hasActiveJob = jobs.some((j) => j.status === 'running' || j.status === 'processing');
    if (hasActiveJob && !pollRef.current) {
      pollRef.current = setInterval(() => {
        loadJobs();
        setNow(Math.floor(Date.now() / 1000));
      }, 3000);
    } else if (!hasActiveJob && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !hasActiveJob) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobs]);

  // Local "elapsed time" ticker — updates every second while there's
  // an active job so the UI feels alive even between polls.
  useEffect(() => {
    const hasActiveJob = jobs.some((j) => j.status === 'running' || j.status === 'processing');
    if (!hasActiveJob) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [jobs]);

  function fmtElapsed(startedAt: number) {
    if (!startedAt) return '';
    const s = Math.max(0, now - startedAt);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, '0')}`;
  }

  function mediaPercent(j: SyncJob) {
    if (!j.media_total) return 0;
    return Math.round((j.media_done / j.media_total) * 100);
  }

  async function submitCreate() {
    if (!createForm.label.trim()) {
      toast.error(t('admin.syncSites.toast.siteNameRequired', '请填写站点名称'));
      return;
    }
    try {
      const r = await api.post<any>(`${apiBase}/sites`, { ...createForm, platform });
      setCreated(r.data);
      setCreateOpen(false);
      setCreateForm({ label: '', source_url: '' });
      await loadSites();
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message;
      toast.error(t('admin.syncSites.toast.createFailed', '创建失败：{reason}', { reason: msg || t('admin.common.unknownError', '未知错误') }));
    }
  }

  async function confirmDeleteSite() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`${apiBase}/sites/${encodeURIComponent(deleteTarget.site_uuid)}`);
      toast.success(t('admin.common.deleted', '已删除'));
      await loadSites();
      setDeleteTarget(null);
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message;
      toast.error(t('admin.syncSites.toast.deleteFailed', '删除失败：{reason}', { reason: msg || t('admin.common.unknownError', '未知错误') }));
    } finally {
      setDeleting(false);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(key);
      setTimeout(() => setCopiedField(''), 1800);
    } catch {
      toast.error(t('admin.syncSites.toast.copyFailed', '复制失败，请手动选择'));
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-foreground">
        <PlatformIcon className="size-4 text-primary" />
        {platformLabel} 同步
      </div>
      <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.7, marginBottom: 20 }}>
        授权一个 {platformLabel} 站点推送内容到 Utterlog。每个站点生成独立的 Site UUID + Token，装 <code>{meta.pluginName}</code> 插件后填入对应字段即可。Token <b>只显示一次</b>。
      </p>

      {/* Sites list */}
      <div className="rounded-lg border border-border bg-card" style={{ marginBottom: 20 }}>
        <div className="flex items-center justify-between border-b border-border" style={{ padding: '12px 16px' }}>
          <div className="text-sm font-semibold text-foreground">
            {t('admin.syncSites.authorizedSites', '已授权站点')} <span className="ml-1.5 font-normal text-muted-foreground">({sites.length})</span>
          </div>
          <Button size="icon" className="size-8" title={t('admin.syncSites.newAuthorization', '新建授权')} onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" style={{ padding: '30px 16px' }}>
            <Loader2 className="size-4 animate-spin" /> {t('admin.common.loading', '加载中…')}
          </div>
        ) : sites.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground" style={{ padding: '40px 16px' }}>
            <div className="mb-2.5 flex justify-center text-muted-foreground">
              <PlatformIcon className="size-8" />
            </div>
            还没有授权任何 {platformLabel} 站点。
            <br />
            {t('admin.syncSites.emptyHint', '点上方「新建授权」生成第一个。')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.syncSites.siteName', '站点名称')}</TableHead>
                <TableHead>Site UUID</TableHead>
                <TableHead>{t('admin.syncSites.sourceUrl', '源站地址')}</TableHead>
                <TableHead>{t('admin.syncSites.lastUsed', '最后使用')}</TableHead>
                <TableHead className="w-20">{t('admin.syncSites.jobs', '任务')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s, index) => {
                const uuid = s.site_uuid || '';
                return (
                  <TableRow key={uuid || `site-${index}`}>
                    <TableCell>
                      <span className="font-medium text-foreground">{s.label || t('admin.common.unnamedWrapped', '(未命名)')}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-[11px]">
                        {uuid ? uuid.slice(0, 16) + '…' : <span className="text-muted-foreground">{t('admin.syncSites.noUuid', '(无 UUID)')}</span>}
                        {uuid && (
                          <button
                            type="button"
                            onClick={() => copy(uuid, 's-' + uuid)}
                            title={t('admin.syncSites.copyFullUuid', '复制完整 UUID')}
                            className="ml-1.5 text-muted-foreground hover:text-foreground"
                          >
                            {copiedField === 's-' + uuid ? <Check className="inline size-3" /> : <Copy className="inline size-3" />}
                          </button>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="inline-block max-w-[240px] truncate text-muted-foreground">{s.source_url || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground">{s.last_seen_at ? fmtTime(s.last_seen_at, locale) : t('admin.common.never', '从未')}</span>
                    </TableCell>
                    <TableCell>
                      <span className="block text-center">{s.recent_jobs || 0}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                        <Trash2 className="size-3.5" /> {t('admin.common.delete', '删除')}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Active jobs — big progress cards for running/processing jobs */}
      {jobs.filter((j) => j.status === 'running' || j.status === 'processing').map((j) => (
        <div key={'active-' + j.job_id} className="border-2 border-primary bg-primary/10" style={{ padding: '16px 20px', marginBottom: 16, borderRadius: 8 }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-primary">
              <Loader2 className="size-4 animate-spin" />
              {t('admin.syncSites.job.running', '任务进行中')}
              <span className="font-mono text-[11px] font-normal text-muted-foreground">
                {(j.job_id || '').slice(0, 16)}…
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t('admin.syncSites.job.elapsed', '已运行')} <b className="font-mono">{fmtElapsed(j.started_at)}</b>
            </div>
          </div>

          <div className="mb-2.5 text-xs text-foreground">
            <b>{t('admin.syncSites.job.currentStage', '当前阶段：')}</b> {stageLabel(j.stage, t)}
          </div>

          {/* Media progress bar */}
          {j.media_total > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{t('admin.syncSites.job.mediaDownload', '媒体文件下载')}</span>
                <span className="font-mono">{j.media_done} / {j.media_total} ({mediaPercent(j)}%)</span>
              </div>
              <div className="border border-border bg-background" style={{ height: 6 }}>
                <div
                  className="h-full bg-primary"
                  style={{ width: mediaPercent(j) + '%', transition: 'width 0.4s ease' }}
                />
              </div>
            </div>
          )}

          {/* Posts rewritten */}
          {j.posts_rewritten > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <SquarePen className="size-3" />
              {t('admin.syncSites.job.rewrittenLinks', '已改写 {count} 篇文章的链接', { count: j.posts_rewritten })}
            </div>
          )}

          <div className="mt-2 text-[11px] text-muted-foreground">
            {t('admin.syncSites.job.autoRefresh', '自动刷新中 · 每 3 秒 · 完成后会自动停止')}
          </div>
        </div>
      ))}

      {/* Job history */}
      {jobs.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-1.5 border-b border-border text-sm font-semibold text-foreground" style={{ padding: '12px 16px' }}>
            <History className="size-4 text-primary" />
            {t('admin.syncSites.recentJobs', '最近同步任务')}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job ID</TableHead>
                <TableHead>{t('admin.common.status', '状态')}</TableHead>
                <TableHead>{t('admin.syncSites.stage', '阶段')}</TableHead>
                <TableHead className="text-right">{t('admin.syncSites.media', '媒体')}</TableHead>
                <TableHead className="text-right">{t('admin.syncSites.rewrite', '改写')}</TableHead>
                <TableHead>{t('admin.syncSites.startedAt', '开始时间')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j, index) => {
                const jid = j.job_id || '';
                return (
                  <TableRow key={jid || `job-${index}`}>
                    <TableCell>
                      <span className="font-mono text-[10px]">{jid ? jid.slice(0, 16) + '…' : '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(jobStatusBadge[j.status] || 'border-transparent bg-primary/15 text-primary')}>{j.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{stageLabel(j.stage, t)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{j.media_done}/{j.media_total}</TableCell>
                    <TableCell className="text-right font-mono">{j.posts_rewritten}</TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground">{fmtTime(j.started_at, locale)}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t border-border bg-muted text-right" style={{ padding: '8px 14px' }}>
            <button type="button" onClick={refreshAll} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <RefreshCw className="size-3" /> {t('admin.common.refresh', '刷新')}
            </button>
          </div>
        </div>
      )}

      {/* Create site modal */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{`新建 ${platformLabel} 同步授权`}</DialogTitle>
          </DialogHeader>
          <div>
            <div style={{ marginBottom: 14 }}>
              <div className="mb-1.5 text-xs text-muted-foreground">{t('admin.syncSites.siteNamePrivate', '站点名称（自己记）')}</div>
              <Input
                value={createForm.label}
                onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={t('admin.syncSites.siteNamePlaceholder', '例如：我的旧博客')}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <div className="mb-1.5 text-xs text-muted-foreground">源站地址（旧 {platformLabel} 博客 URL）</div>
              <Input
                value={createForm.source_url}
                onChange={(e) => setCreateForm((f) => ({ ...f, source_url: e.target.value }))}
                placeholder={platform === 'typecho' ? 'https://your-old-typecho-site.com' : 'https://your-old-wp-site.com'}
              />
              <div className="mt-1.5 text-[11px] text-muted-foreground">
                server 扫文章内容里的图片 URL 时会匹配这个域名下的 <code>{meta.uploadsPath}</code> 路径。
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={submitCreate}>{t('admin.syncSites.generateToken', '生成授权')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Created token — shown ONCE */}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-w-[520px] max-h-[calc(100vh-32px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('admin.syncSites.createdTitle', '授权已生成 · 请立即保存')}</DialogTitle>
          </DialogHeader>
          {created && (
            <div>
              <div className="mb-[18px] flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-xs leading-relaxed text-amber-700 dark:text-amber-300" style={{ padding: '10px 14px' }}>
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span><b>{t('admin.syncSites.tokenOnce', 'Token 只显示这一次')}</b>。{t('admin.syncSites.tokenOnceHint', '关闭后无法再次查看，丢失需要重新生成。')}</span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div className="mb-1.5 text-xs text-muted-foreground">{t('admin.syncSites.siteName', '站点名称')}</div>
                <div className="rounded-md border border-border bg-muted text-sm text-foreground" style={{ padding: '8px 12px' }}>
                  {created.label || t('admin.common.unnamedWrapped', '(未命名)')}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Site UUID</span>
                  <button type="button" onClick={() => copy(created.site_uuid, 'uuid')} className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">
                    {copiedField === 'uuid' ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copiedField === 'uuid' ? t('admin.common.copied', '已复制') : t('admin.common.copy', '复制')}
                  </button>
                </div>
                <div className="break-all rounded-md border border-border bg-muted font-mono text-xs text-foreground" style={{ padding: '8px 12px' }}>
                  {created.site_uuid}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>Sync Token</span>
                  <button type="button" onClick={() => copy(created.token, 'tok')} className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">
                    {copiedField === 'tok' ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copiedField === 'tok' ? t('admin.common.copied', '已复制') : t('admin.common.copy', '复制')}
                  </button>
                </div>
                <div className="break-all rounded-md border border-primary/20 bg-primary/5 font-mono text-xs text-foreground" style={{ padding: '8px 12px' }}>
                  {created.token}
                </div>
              </div>

              <div className="mb-4 rounded-md border-l-[3px] border-emerald-600 bg-emerald-500/10 text-xs leading-relaxed text-emerald-700 dark:text-emerald-300" style={{ padding: '10px 14px' }}>
                <b>{t('admin.syncSites.nextStep', '下一步')}</b>：在你的 {platformLabel} 后台装 <code>{meta.pluginName}</code> 插件，设置页填：
                <br />
                URL: <code>{window.location.origin}</code>
                <br />
                Site UUID: <code>{created.site_uuid}</code>
                <br />
                Sync Token: <code>{created.token.slice(0, 8)}…{created.token.slice(-4)}</code>
              </div>

              <div className="flex justify-end gap-2.5">
                <Button
                  variant="outline"
                  onClick={() => {
                    copy(
                      `Utterlog URL: ${window.location.origin}\nSite UUID: ${created.site_uuid}\nSync Token: ${created.token}`,
                      'all'
                    );
                  }}
                >
                  {copiedField === 'all' ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiedField === 'all' ? t('admin.syncSites.copiedAll', '已复制全部') : t('admin.syncSites.copyAll', '复制三行配置')}
                </Button>
                <Button onClick={() => setCreated(null)}>{t('admin.syncSites.closeSaved', '我已保存，关闭')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}
        onConfirm={confirmDeleteSite}
        title={t('admin.syncSites.deleteTitle', '删除同步授权')}
        message={t('admin.syncSites.confirmDelete', '确定删除站点「{name}」？\n\n只删除授权，不影响已导入的内容。\n要删除内容请另外用 rollback 接口。', { name: deleteTarget?.label || deleteTarget?.site_uuid || '' })}
        confirmText={t('admin.common.delete', '删除')}
      />
    </div>
  );
}
