import { CloudUpload, Database, Settings as SettingsIcon, AlertTriangle, Loader2 } from 'lucide-react';

import { useState, useEffect } from 'react';
import { optionsApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { MetricCard, MetricGrid, RowActions } from '@/components/ui';
import {
  Button, buttonVariants, Card, ConfirmDialog, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
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

  const tabs = [
    { key: 'wp-sync' as const, label: t('admin.tools.tabs.wpSync', 'WordPress 同步') },
    { key: 'typecho-sync' as const, label: t('admin.tools.tabs.typechoSync', 'Typecho 同步') },
    { key: 'backup' as const, label: t('admin.tools.tabs.backup', '备份恢复') },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="mb-5 flex gap-0 border-b border-border">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'border-b-2 px-5 py-2.5 text-sm transition-colors',
              activeTab === tab.key
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
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

          <div className="mb-5 flex gap-2">
            <Button onClick={createBackup} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} {t('admin.tools.backup.create', '创建备份')}
            </Button>
            <label className={cn(buttonVariants({ variant: 'outline' }), 'cursor-pointer')}>
              <input type="file" accept=".zip" onChange={handleBackupImportSelect} className="hidden" />
              <CloudUpload className="size-4" /> {importing ? t('admin.common.importing', '导入中…') : t('admin.tools.backup.importBackup', '导入备份')}
            </label>
          </div>

          {/* Backup Settings */}
          <Card className="mb-5 p-5">
            <div className="mb-4 flex items-center gap-2">
              <SettingsIcon className="size-4" />
              <h3 className="text-sm font-semibold text-foreground">{t('admin.tools.backup.settings', '备份设置')}</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.tools.backup.autoBackup', '自动备份')}</Label>
                <Select value={backupSchedule} onValueChange={(v) => setBackupSchedule((v as string) ?? '')}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t('admin.common.off', '关闭')}</SelectItem>
                    <SelectItem value="daily">{t('admin.tools.backup.daily', '每天')}</SelectItem>
                    <SelectItem value="weekly">{t('admin.tools.backup.weekly', '每周')}</SelectItem>
                    <SelectItem value="monthly">{t('admin.tools.backup.monthly', '每月')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.tools.backup.destination', '存储位置')}</Label>
                <Select value={backupDest} onValueChange={(v) => setBackupDest((v as string) ?? '')}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">{t('admin.tools.backup.localServer', '本地服务器')}</SelectItem>
                    <SelectItem value="s3" disabled={!s3Configured}>S3 {!s3Configured ? t('admin.tools.backup.notConfigured', '(未配置)') : ''}</SelectItem>
                    <SelectItem value="r2" disabled={!s3Configured}>Cloudflare R2 {!s3Configured ? t('admin.tools.backup.notConfigured', '(未配置)') : ''}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.tools.backup.keep', '保留数量')}</Label>
                <Select value={backupKeep} onValueChange={(v) => setBackupKeep((v as string) ?? '')}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 5 })}</SelectItem>
                    <SelectItem value="10">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 20 })}</SelectItem>
                    <SelectItem value="50">{t('admin.tools.backup.keepRecent', '最近 {count} 份', { count: 50 })}</SelectItem>
                    <SelectItem value="0">{t('admin.common.unlimited', '不限制')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(backupDest === 's3' || backupDest === 'r2') && !s3Configured && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="size-4" />
                {t('admin.tools.backup.configureStoragePrefix', '请先在')} <a href="/settings" className="font-medium text-primary">{t('admin.tools.backup.storageSettingsLink', '系统设置 > 存储')}</a> {t('admin.tools.backup.configureStorageSuffix', '中配置 {driver} 连接信息', { driver: backupDest === 'r2' ? 'R2' : 'S3' })}
              </p>
            )}
            <div className="mt-3.5 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {backupSchedule !== 'off'
                  ? t('admin.tools.backup.scheduleEnabled', '自动备份已开启（{schedule}），备份到{destination}', {
                    schedule: backupSchedule === 'daily' ? t('admin.tools.backup.daily', '每天') : backupSchedule === 'weekly' ? t('admin.tools.backup.weekly', '每周') : t('admin.tools.backup.monthly', '每月'),
                    destination: backupDest === 'local' ? t('admin.tools.backup.local', '本地') : backupDest === 'r2' ? 'R2' : 'S3',
                  })
                  : t('admin.tools.backup.scheduleOff', '自动备份未开启，仅支持手动创建')}
              </p>
              <Button onClick={saveBackupSettings} disabled={savingSettings} variant="secondary" size="sm">
                {savingSettings && <Loader2 className="size-4 animate-spin" />}
                {t('admin.common.save', '保存')}
              </Button>
            </div>
          </Card>

          <p className="mb-4 text-xs text-muted-foreground">
            {t('admin.tools.backup.includes', '备份包含：数据库完整导出{uploads}。{cloudNote}导入时自动恢复。', {
              uploads: backupDest === 'local' ? t('admin.tools.backup.localUploads', ' + 本地附件') : '',
              cloudNote: backupDest !== 'local' ? t('admin.tools.backup.cloudNote', '附件已存储在云端，无需重复备份。') : '',
            })}
          </p>

          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.tools.backup.filename', '文件名')}</TableHead>
                  <TableHead>{t('admin.common.size', '大小')}</TableHead>
                  <TableHead>{t('admin.common.createdAt', '创建时间')}</TableHead>
                  <TableHead className="w-[120px]">{t('admin.common.actions', '操作')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                      {t('admin.tools.backup.empty', '暂无备份，点击“创建备份”开始')}
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((b: any, index: number) => (
                    <TableRow key={b.filename || index}>
                      <TableCell className="font-medium text-foreground">{b.filename}</TableCell>
                      <TableCell className="text-muted-foreground">{formatSize(b.size || 0)}</TableCell>
                      <TableCell className="text-muted-foreground">{b.created}</TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <a href={b.url} download className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-7 px-2 text-[11px]')}>{t('admin.common.download', '下载')}</a>
                          <RowActions onDelete={() => setDeleteBackupName(b.filename)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!deleteBackupName}
        onOpenChange={(o) => !o && setDeleteBackupName('')}
        onConfirm={() => deleteBackup(deleteBackupName)}
        title={t('admin.tools.confirm.deleteBackupTitle', '删除备份')}
        message={t('admin.tools.confirm.deleteBackup', '确定删除此备份？')}
        confirmText={t('admin.common.delete', '删除')}
      />

      <ConfirmDialog
        open={!!importFile}
        onOpenChange={(o) => !o && !importing && setImportFile(null)}
        onConfirm={confirmBackupImport}
        title={t('admin.tools.confirm.backupImportTitle', '导入备份')}
        message={t('admin.tools.confirm.backupImport', '导入备份将覆盖当前数据，确定继续？')}
        confirmText={t('admin.tools.importBackup', '导入备份')}
      />

    </div>
  );
}
