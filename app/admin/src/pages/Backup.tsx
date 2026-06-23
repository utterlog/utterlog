
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, MetricCard, MetricGrid, RowActions, Table } from '@/components/ui';

export default function BackupPage() {
  const [stats, setStats] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleteBackupName, setDeleteBackupName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = () => {
    api.get('/backup/stats').then((r: any) => setStats(r.data || r)).catch(() => {});
    api.get('/backup/list').then((r: any) => setBackups(r.data || [])).catch(() => {});
  };

  const createBackup = async () => {
    setCreating(true);
    try {
      const r: any = await api.post('/backup/create');
      toast.success('备份创建成功');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || '备份失败');
    }
    setCreating(false);
  };

  const deleteBackup = async (filename: string) => {
    try {
      await api.delete(`/backup/${filename}`);
      toast.success('已删除');
      setDeleteBackupName('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || '删除失败');
    }
  };

  const handleImportSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    if (file) setImportFile(file);
  };

  const confirmImport = async () => {
    if (!importFile) return;
    setImporting(true);
    const fd = new FormData();
    fd.append('file', importFile);
    try {
      const r: any = await api.post('/backup/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success(`恢复成功！数据库：${r.data?.db_restored ? '✓' : '✗'}, 文件：${r.data?.files || 0}`);
      setImportFile(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.response?.data?.message || '导入失败');
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

      {/* Stats */}
      {stats && (
        <MetricGrid compact>
          <MetricCard label="数据库大小" value={stats.db_size || '-'} />
          <MetricCard label="附件大小" value={stats.uploads_size || '-'} />
          <MetricCard label="备份数量" value={stats.backup_count || 0} />
        </MetricGrid>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <Button onClick={createBackup} loading={creating}>
          <i className="fa-regular fa-database" style={{ fontSize: '14px' }} /> 创建备份
        </Button>
        <label style={{ cursor: 'pointer' }}>
          <input type="file" accept=".zip" onChange={handleImportSelect} style={{ display: 'none' }} />
          <span className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} /> {importing ? '导入中…' : '导入备份'}
          </span>
        </label>
      </div>

      <p className="text-dim" style={{ fontSize: '12px', marginBottom: '16px' }}>
        备份包含：数据库完整导出 + uploads 目录所有附件。导入时自动恢复数据库和文件。
      </p>

      {/* Backup list */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <Table
          data={backups.map((backup, index) => ({ ...backup, id: backup.filename || index }))}
          emptyText={'暂无备份，点击"创建备份"开始'}
          columns={[
            { key: 'filename', title: '文件名', render: (b) => <span style={{ fontWeight: 500 }}>{b.filename}</span> },
            { key: 'size', title: '大小', render: (b) => <span className="text-dim">{formatSize(b.size || 0)}</span> },
            { key: 'created', title: '创建时间', render: (b) => <span className="text-dim">{b.created}</span> },
            {
              key: 'actions',
              title: '操作',
              width: '120px',
              render: (b) => (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <a href={b.url} download className="btn btn-secondary" style={{ fontSize: '11px', padding: '3px 8px', textDecoration: 'none' }}>下载</a>
                  <RowActions onDelete={() => setDeleteBackupName(b.filename)} />
                </div>
              ),
            },
          ]}
        />
      </div>

      <ConfirmDialog
        isOpen={!!deleteBackupName}
        onClose={() => setDeleteBackupName('')}
        onConfirm={() => deleteBackup(deleteBackupName)}
        title="删除备份"
        message="确定删除此备份？"
        confirmText="删除"
      />

      <ConfirmDialog
        isOpen={!!importFile}
        onClose={() => !importing && setImportFile(null)}
        onConfirm={confirmImport}
        title="导入备份"
        message="导入备份将覆盖当前数据，确定继续？"
        confirmText="导入备份"
        loading={importing}
      />
    </div>
  );
}
