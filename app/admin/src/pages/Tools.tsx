
import { useState, useEffect } from 'react';
import { optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, MetricCard, MetricGrid, RowActions, Table } from '@/components/ui';
import SyncSitesPanel from '@/components/SyncSitesPanel';
import RebuildStatsPanel from '@/components/RebuildStatsPanel';
import { useI18n } from '@/lib/i18n';

export default function ToolsPage() {
  const { t } = useI18n();
  // 2026-05: 移除「导入工具」tab —— 历史 WordPress XML 导入只是初版临时
  // 入口，已被「WordPress 同步」插件 + 推送流程完全取代。Typecho 走同样
  // 的同步插件，没必要再保留 XML 上传那个分支。
  const [activeTab, setActiveTab] = useState<'backup' | 'wp-sync' | 'typecho-sync'>('wp-sync');

  // Backup state
  const [stats, setStats] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteBackupName, setDeleteBackupName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

  // Backup settings
  const [backupDest, setBackupDest] = useState('local');
  const [backupSchedule, setBackupSchedule] = useState('off');
  const [backupKeep, setBackupKeep] = useState('10');
  const [s3Configured, setS3Configured] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { if (activeTab === 'backup') { fetchBackupData(); fetchBackupSettings(); } }, [activeTab]);

  // Backup handlers
  const fetchBackupData = () => {
    api.get('/backup/stats').then((r: any) => setStats(r.data || r)).catch(() => {});
    api.get('/backup/list').then((r: any) => setBackups(r.data || [])).catch(() => {});
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      await api.post('/backup/create');
      toast.success(t('admin.tools.toast.backupCreated', '备份创建成功'));
      fetchBackupData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || t('admin.tools.toast.backupFailed', '备份失败'));
    }
    setCreating(false);
  };

  const deleteBackup = async (filename: string) => {
    try {
      await api.delete(`/backup/${filename}`);
      toast.success(t('admin.common.deleted', '已删除'));
      setDeleteBackupName('');
      fetchBackupData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || t('admin.common.deleteFailed', '删除失败'));
    }
  };

  const fetchBackupSettings = async () => {
    try {
      const r: any = await optionsApi.list();
      const opts = r.data || r;
      setBackupDest(opts.backup_destination || 'local');
      setBackupSchedule(opts.backup_schedule || 'off');
      setBackupKeep(opts.backup_keep || '10');
      setS3Configured(!!(opts.s3_endpoint && opts.s3_bucket && opts.s3_access_key));
    } catch {}
  };

  const saveBackupSettings = async () => {
    setSavingSettings(true);
    try {
      await optionsApi.updateMany({
        backup_destination: backupDest,
        backup_schedule: backupSchedule,
        backup_keep: backupKeep,
      });
      toast.success(t('admin.tools.toast.backupSettingsSaved', '备份设置已保存'));
    } catch { toast.error(t('admin.settings.toast.saveFailed', '保存失败')); }
    setSavingSettings(false);
  };

  const handleBackupImportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (file) setImportFile(file);
  };

  const confirmBackupImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', importFile);
    try {
      const r: any = await api.post('/backup/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(t('admin.tools.toast.restoreSuccess', '恢复成功！数据库：{db}, 文件：{files}', { db: r.data?.db_restored ? '✓' : '✗', files: r.data?.files || 0 }));
      setImportFile(null);
      fetchBackupData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || t('admin.tools.toast.importFailed', '导入失败'));
    }
    setImporting(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        {[
          { key: 'wp-sync' as const, label: t('admin.tools.tabs.wpSync', 'WordPress 同步') },
          { key: 'typecho-sync' as const, label: t('admin.tools.tabs.typechoSync', 'Typecho 同步') },
          { key: 'backup' as const, label: t('admin.tools.tabs.backup', '备份恢复') },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '10px 20px', fontSize: '14px', fontWeight: activeTab === tab.key ? 600 : 400,
            color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
            borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
            background: 'none', cursor: 'pointer',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ==================== WordPress 同步 ==================== */}
      {activeTab === 'wp-sync' && (
        <>
          <SyncSitesPanel platform="wordpress" />
          <RebuildStatsPanel />
        </>
      )}

      {/* ==================== Typecho 同步 ==================== */}
      {activeTab === 'typecho-sync' && (
        <>
          <SyncSitesPanel platform="typecho" />
          <RebuildStatsPanel />
        </>
      )}

          {/* ==================== 备份恢复 ==================== */}
      {activeTab === 'backup' && (
        <>
          {stats && (
            <MetricGrid compact>
              <MetricCard label={t('admin.tools.backup.dbSize', '数据库大小')} value={stats.db_size || '-'} />
              <MetricCard label={t('admin.tools.backup.uploadsSize', '附件大小')} value={stats.uploads_size || '-'} />
              <MetricCard label={t('admin.tools.backup.count', '备份数量')} value={stats.backup_count || 0} />
            </MetricGrid>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <Button onClick={createBackup} loading={creating}>
              <i className="fa-regular fa-database" style={{ fontSize: '14px' }} /> {t('admin.tools.backup.create', '创建备份')}
            </Button>
            <label style={{ cursor: 'pointer' }}>
              <input type="file" accept=".zip" onChange={handleBackupImportSelect} style={{ display: 'none' }} />
              <span className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} /> {importing ? t('admin.common.importing', '导入中…') : t('admin.tools.backup.importBackup', '导入备份')}
              </span>
            </label>
          </div>

          {/* Backup Settings */}
          <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <i className="fa-regular fa-gear" style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
              <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600 }}>{t('admin.tools.backup.settings', '备份设置')}</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.tools.backup.autoBackup', '自动备份')}</label>
                <select className="input" value={backupSchedule} onChange={e => setBackupSchedule(e.target.value)} style={{ fontSize: '13px' }}>
                  <option value="off">{t('admin.common.off', '关闭')}</option>
                  <option value="daily">{t('admin.tools.backup.daily', '每天')}</option>
                  <option value="weekly">{t('admin.tools.backup.weekly', '每周')}</option>
                  <option value="monthly">{t('admin.tools.backup.monthly', '每月')}</option>
                </select>
              </div>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.tools.backup.destination', '存储位置')}</label>
                <select className="input" value={backupDest} onChange={e => setBackupDest(e.target.value)} style={{ fontSize: '13px' }}>
                  <option value="local">{t('admin.tools.backup.localServer', '本地服务器')}</option>
                  <option value="s3" disabled={!s3Configured}>S3 {!s3Configured ? t('admin.tools.backup.notConfigured', '(未配置)') : ''}</option>
                  <option value="r2" disabled={!s3Configured}>Cloudflare R2 {!s3Configured ? t('admin.tools.backup.notConfigured', '(未配置)') : ''}</option>
                </select>
              </div>
              <div>
                <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>{t('admin.tools.backup.keep', '保留数量')}</label>
                <select className="input" value={backupKeep} onChange={e => setBackupKeep(e.target.value)} style={{ fontSize: '13px' }}>
                  <option value="5">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 5 })}</option>
                  <option value="10">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 10 })}</option>
                  <option value="20">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 20 })}</option>
                  <option value="50">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 50 })}</option>
                  <option value="0">{t('admin.common.unlimited', '不限制')}</option>
                </select>
              </div>
            </div>
            {(backupDest === 's3' || backupDest === 'r2') && !s3Configured && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '10px' }}>
                <i className="fa-light fa-triangle-exclamation" style={{ marginRight: '4px' }} />
                {t('admin.tools.backup.configureStoragePrefix', '请先在')} <a href="/settings" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{t('admin.tools.backup.storageSettingsLink', '系统设置 > 存储')}</a> {t('admin.tools.backup.configureStorageSuffix', '中配置 {driver} 连接信息', { driver: backupDest === 'r2' ? 'R2' : 'S3' })}
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
              <p className="text-dim" style={{ fontSize: '11px' }}>
                {backupSchedule !== 'off'
                  ? t('admin.tools.backup.scheduleEnabled', '自动备份已开启（{schedule}），备份到{destination}', {
                    schedule: backupSchedule === 'daily' ? t('admin.tools.backup.daily', '每天') : backupSchedule === 'weekly' ? t('admin.tools.backup.weekly', '每周') : t('admin.tools.backup.monthly', '每月'),
                    destination: backupDest === 'local' ? t('admin.tools.backup.local', '本地') : backupDest === 'r2' ? 'R2' : 'S3',
                  })
                  : t('admin.tools.backup.scheduleOff', '自动备份未开启，仅支持手动创建')}
              </p>
              <Button onClick={saveBackupSettings} loading={savingSettings} variant="secondary" style={{ fontSize: '12px', padding: '4px 14px', height: '30px' }}>
                {t('admin.common.save', '保存')}
              </Button>
            </div>
          </div>

          <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>
            {t('admin.tools.backup.includes', '备份包含：数据库完整导出{uploads}。{cloudNote}导入时自动恢复。', {
              uploads: backupDest === 'local' ? t('admin.tools.backup.localUploads', ' + 本地附件') : '',
              cloudNote: backupDest !== 'local' ? t('admin.tools.backup.cloudNote', '附件已存储在云端，无需重复备份。') : '',
            })}
          </p>

          <div className="card" style={{ overflow: 'hidden' }}>
            <Table
              data={backups.map((backup, index) => ({ ...backup, id: backup.filename || index }))}
              emptyText={t('admin.tools.backup.empty', '暂无备份，点击“创建备份”开始')}
              columns={[
                { key: 'filename', title: t('admin.tools.backup.filename', '文件名'), render: (b) => <span style={{ fontWeight: 500 }}>{b.filename}</span> },
                { key: 'size', title: t('admin.common.size', '大小'), render: (b) => <span className="text-dim">{formatSize(b.size || 0)}</span> },
                { key: 'created', title: t('admin.common.createdAt', '创建时间'), render: (b) => <span className="text-dim">{b.created}</span> },
                {
                  key: 'actions',
                  title: t('admin.common.actions', '操作'),
                  width: '120px',
                  render: (b) => (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <a href={b.url} download className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px', textDecoration: 'none' }}>{t('admin.common.download', '下载')}</a>
                      <RowActions onDelete={() => setDeleteBackupName(b.filename)} />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        isOpen={!!deleteBackupName}
        onClose={() => setDeleteBackupName('')}
        onConfirm={() => deleteBackup(deleteBackupName)}
        title={t('admin.tools.confirm.deleteBackupTitle', '删除备份')}
        message={t('admin.tools.confirm.deleteBackup', '确定删除此备份？')}
        confirmText={t('admin.common.delete', '删除')}
      />

      <ConfirmDialog
        isOpen={!!importFile}
        onClose={() => !importing && setImportFile(null)}
        onConfirm={confirmBackupImport}
        title={t('admin.tools.confirm.backupImportTitle', '导入备份')}
        message={t('admin.tools.confirm.backupImport', '导入备份将覆盖当前数据，确定继续？')}
        confirmText={t('admin.tools.importBackup', '导入备份')}
        loading={importing}
      />

    </div>
  );
}
