import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button, Table } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  icon: string;
  pluginName: string;
  uploadsPath: string;
}> = {
  wordpress: {
    icon: 'fa-brands fa-wordpress',
    pluginName: 'utterlog-sync',
    uploadsPath: '/wp-content/uploads/',
  },
  typecho: {
    icon: 'fa-regular fa-feather',
    pluginName: 'utterlog-sync-typecho',
    uploadsPath: '/usr/uploads/',
  },
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
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className={meta.icon} style={{ color: 'var(--color-primary)' }} />
        {platformLabel} 同步
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-dim)', lineHeight: 1.7, marginBottom: 20 }}>
        授权一个 {platformLabel} 站点推送内容到 Utterlog。每个站点生成独立的 Site UUID + Token，装 <code>{meta.pluginName}</code> 插件后填入对应字段即可。Token <b>只显示一次</b>。
      </p>

      {/* Sites list */}
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)', marginBottom: 20 }}>
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {t('admin.syncSites.authorizedSites', '已授权站点')} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, marginLeft: 6 }}>({sites.length})</span>
          </div>
          <Button size="sm" className="btn-square" title={t('admin.syncSites.newAuthorization', '新建授权')} onClick={() => setCreateOpen(true)}>
            <i className="fa-solid fa-plus" />
          </Button>
        </div>

        {loading ? (
          <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
            <i className="fa-solid fa-spinner fa-spin" /> {t('admin.common.loading', '加载中…')}
          </div>
        ) : sites.length === 0 ? (
          <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: 13 }}>
            <div style={{ fontSize: 32, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              <i className={meta.icon} />
            </div>
            还没有授权任何 {platformLabel} 站点。
            <br />
            {t('admin.syncSites.emptyHint', '点上方「新建授权」生成第一个。')}
          </div>
        ) : (
          <Table
            data={sites.map((site, index) => ({ ...site, id: site.site_uuid || `site-${index}` }))}
            columns={[
              {
                key: 'label',
                title: t('admin.syncSites.siteName', '站点名称'),
                render: (s) => <span style={{ fontWeight: 500 }}>{s.label || t('admin.common.unnamedWrapped', '(未命名)')}</span>,
              },
              {
                key: 'site_uuid',
                title: 'Site UUID',
                render: (s) => {
                const uuid = s.site_uuid || '';
                return (
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11 }}>
                    {uuid ? uuid.slice(0, 16) + '…' : <span style={{ color: 'var(--color-text-muted)' }}>{t('admin.syncSites.noUuid', '(无 UUID)')}</span>}
                    {uuid && (
                      <button
                        type="button"
                        onClick={() => copy(uuid, 's-' + uuid)}
                        title={t('admin.syncSites.copyFullUuid', '复制完整 UUID')}
                        style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                      >
                        <i className={`fa-solid ${copiedField === 's-' + uuid ? 'fa-check' : 'fa-copy'}`} style={{ fontSize: 11 }} />
                      </button>
                    )}
                  </span>
                );
                },
              },
              {
                key: 'source_url',
                title: t('admin.syncSites.sourceUrl', '源站地址'),
                render: (s) => <span className="text-dim" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{s.source_url || '—'}</span>,
              },
              {
                key: 'last_seen_at',
                title: t('admin.syncSites.lastUsed', '最后使用'),
                render: (s) => <span className="text-dim" style={{ fontSize: 11 }}>{s.last_seen_at ? fmtTime(s.last_seen_at, locale) : <span style={{ color: 'var(--color-text-muted)' }}>{t('admin.common.never', '从未')}</span>}</span>,
              },
              {
                key: 'recent_jobs',
                title: t('admin.syncSites.jobs', '任务'),
                width: '80px',
                render: (s) => <span style={{ display: 'block', textAlign: 'center' }}>{s.recent_jobs || 0}</span>,
              },
              {
                key: 'actions',
                title: '',
                render: (s) => (
                  <div style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(s)}
                      style={{ background: 'none', border: '1px solid var(--color-border)', padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'var(--color-danger, #dc2626)', fontFamily: 'inherit' }}
                    >
                      <i className="fa-solid fa-trash" /> {t('admin.common.delete', '删除')}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>

      {/* Active jobs — big progress cards for running/processing jobs */}
      {jobs.filter((j) => j.status === 'running' || j.status === 'processing').map((j) => (
        <div key={'active-' + j.job_id} style={{
          border: '2px solid var(--color-primary)', background: 'var(--color-primary-soft, #E6EEFB)',
          padding: '16px 20px', marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: 'var(--color-primary)' }}>
              <i className="fa-solid fa-spinner fa-spin" />
              {t('admin.syncSites.job.running', '任务进行中')}
              <span style={{ fontSize: 11, color: 'var(--color-text-dim)', fontFamily: 'ui-monospace,monospace', fontWeight: 400 }}>
                {(j.job_id || '').slice(0, 16)}…
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
              {t('admin.syncSites.job.elapsed', '已运行')} <b style={{ fontFamily: 'ui-monospace,monospace' }}>{fmtElapsed(j.started_at)}</b>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--color-text)', marginBottom: 10 }}>
            <b>{t('admin.syncSites.job.currentStage', '当前阶段：')}</b> {stageLabel(j.stage, t)}
          </div>

          {/* Media progress bar */}
          {j.media_total > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-dim)', marginBottom: 4 }}>
                <span>{t('admin.syncSites.job.mediaDownload', '媒体文件下载')}</span>
                <span style={{ fontFamily: 'ui-monospace,monospace' }}>{j.media_done} / {j.media_total} ({mediaPercent(j)}%)</span>
              </div>
              <div style={{ height: 6, background: 'var(--color-surface,#fff)', border: '1px solid var(--color-border)' }}>
                <div style={{
                  width: mediaPercent(j) + '%',
                  height: '100%',
                  background: 'var(--color-primary)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )}

          {/* Posts rewritten */}
          {j.posts_rewritten > 0 && (
            <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
              <i className="fa-solid fa-pen-to-square" style={{ marginRight: 4 }} />
              {t('admin.syncSites.job.rewrittenLinks', '已改写 {count} 篇文章的链接', { count: j.posts_rewritten })}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
            {t('admin.syncSites.job.autoRefresh', '自动刷新中 · 每 3 秒 · 完成后会自动停止')}
          </div>
        </div>
      ))}

      {/* Job history */}
      {jobs.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 600 }}>
            <i className="fa-solid fa-clock-rotate-left" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
            {t('admin.syncSites.recentJobs', '最近同步任务')}
          </div>
          <Table
            data={jobs.map((job, index) => ({ ...job, id: job.job_id || `job-${index}` }))}
            columns={[
              {
                key: 'job_id',
                title: 'Job ID',
                render: (j) => {
                const jid = j.job_id || '';
                return <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10 }}>{jid ? jid.slice(0, 16) + '…' : '—'}</span>;
                },
              },
              {
                key: 'status',
                title: t('admin.common.status', '状态'),
                render: (j) => (
                  <span style={{
                    display: 'inline-block', padding: '1px 6px', fontSize: 10, fontWeight: 600,
                    background: j.status === 'finished' ? '#16a34a' : j.status === 'failed' ? '#dc2626' : '#0052D9',
                    color: '#fff',
                  }}>
                    {j.status}
                  </span>
                ),
              },
              { key: 'stage', title: t('admin.syncSites.stage', '阶段'), render: (j) => <span className="text-dim">{stageLabel(j.stage, t)}</span> },
              { key: 'media', title: t('admin.syncSites.media', '媒体'), render: (j) => <span style={{ display: 'block', textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}>{j.media_done}/{j.media_total}</span> },
              { key: 'rewrite', title: t('admin.syncSites.rewrite', '改写'), render: (j) => <span style={{ display: 'block', textAlign: 'right', fontFamily: 'ui-monospace,monospace' }}>{j.posts_rewritten}</span> },
              { key: 'started_at', title: t('admin.syncSites.startedAt', '开始时间'), render: (j) => <span className="text-dim" style={{ fontSize: 11 }}>{fmtTime(j.started_at, locale)}</span> },
            ]}
          />
          <div style={{ padding: '8px 14px', textAlign: 'right', background: 'var(--color-bg-soft, #fafafa)' }}>
            <button type="button" onClick={refreshAll} style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              <i className="fa-solid fa-arrows-rotate" style={{ marginRight: 4 }} /> {t('admin.common.refresh', '刷新')}
            </button>
          </div>
        </div>
      )}

      {/* Create site modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title={`新建 ${platformLabel} 同步授权`} size="sm">
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>{t('admin.syncSites.siteNamePrivate', '站点名称（自己记）')}</div>
            <input
              type="text"
              value={createForm.label}
              onChange={(e) => setCreateForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={t('admin.syncSites.siteNamePlaceholder', '例如：我的旧博客')}
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13 }}
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>源站地址（旧 {platformLabel} 博客 URL）</div>
            <input
              type="text"
              value={createForm.source_url}
              onChange={(e) => setCreateForm((f) => ({ ...f, source_url: e.target.value }))}
              placeholder={platform === 'typecho' ? 'https://your-old-typecho-site.com' : 'https://your-old-wp-site.com'}
              style={{ width: '100%', height: 40, padding: '0 12px', border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
              server 扫文章内容里的图片 URL 时会匹配这个域名下的 <code>{meta.uploadsPath}</code> 路径。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
            <Button onClick={submitCreate}>{t('admin.syncSites.generateToken', '生成授权')}</Button>
          </div>
        </div>
      </Modal>

      {/* Created token — shown ONCE */}
      {created && (
        <Modal isOpen={!!created} onClose={() => setCreated(null)} title={t('admin.syncSites.createdTitle', '授权已生成 · 请立即保存')} size="md">
          <div>
            <div style={{ padding: '10px 14px', background: '#fefce8', border: '1px solid #fde68a', fontSize: 12, color: '#713f12', marginBottom: 18, lineHeight: 1.6 }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6 }} />
              <b>{t('admin.syncSites.tokenOnce', 'Token 只显示这一次')}</b>。{t('admin.syncSites.tokenOnceHint', '关闭后无法再次查看，丢失需要重新生成。')}
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6 }}>{t('admin.syncSites.siteName', '站点名称')}</div>
              <div style={{ padding: '8px 12px', background: 'var(--color-bg-soft, #fafafa)', border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: 13 }}>
                {created.label || t('admin.common.unnamedWrapped', '(未命名)')}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Site UUID</span>
                <button type="button" onClick={() => copy(created.site_uuid, 'uuid')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 11, fontFamily: 'inherit' }}>
                  <i className={`fa-solid ${copiedField === 'uuid' ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 3 }} />
                  {copiedField === 'uuid' ? t('admin.common.copied', '已复制') : t('admin.common.copy', '复制')}
                </button>
              </div>
              <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid var(--color-border)', fontFamily: 'ui-monospace,monospace', fontSize: 12, wordBreak: 'break-all' }}>
                {created.site_uuid}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Sync Token</span>
                <button type="button" onClick={() => copy(created.token, 'tok')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontSize: 11, fontFamily: 'inherit' }}>
                  <i className={`fa-solid ${copiedField === 'tok' ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 3 }} />
                  {copiedField === 'tok' ? t('admin.common.copied', '已复制') : t('admin.common.copy', '复制')}
                </button>
              </div>
              <div style={{ padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', fontFamily: 'ui-monospace,monospace', fontSize: 12, wordBreak: 'break-all', color: '#0c4a6e' }}>
                {created.token}
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: '#f0fdf4', borderLeft: '3px solid #16a34a', fontSize: 12, color: '#166534', marginBottom: 16, lineHeight: 1.6 }}>
              <b>{t('admin.syncSites.nextStep', '下一步')}</b>：在你的 {platformLabel} 后台装 <code>{meta.pluginName}</code> 插件，设置页填：
              <br />
              URL: <code>{window.location.origin}</code>
              <br />
              Site UUID: <code>{created.site_uuid}</code>
              <br />
              Sync Token: <code>{created.token.slice(0, 8)}…{created.token.slice(-4)}</code>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={() => {
                  copy(
                    `Utterlog URL: ${window.location.origin}\nSite UUID: ${created.site_uuid}\nSync Token: ${created.token}`,
                    'all'
                  );
                }}
              >
                <i className={`fa-solid ${copiedField === 'all' ? 'fa-check' : 'fa-copy'}`} style={{ marginRight: 6 }} />
                {copiedField === 'all' ? t('admin.syncSites.copiedAll', '已复制全部') : t('admin.syncSites.copyAll', '复制三行配置')}
              </Button>
              <Button onClick={() => setCreated(null)}>{t('admin.syncSites.closeSaved', '我已保存，关闭')}</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDeleteSite}
        title={t('admin.syncSites.deleteTitle', '删除同步授权')}
        message={t('admin.syncSites.confirmDelete', '确定删除站点「{name}」？\n\n只删除授权，不影响已导入的内容。\n要删除内容请另外用 rollback 接口。', { name: deleteTarget?.label || deleteTarget?.site_uuid || '' })}
        confirmText={t('admin.common.delete', '删除')}
        loading={deleting}
      />
    </div>
  );
}
