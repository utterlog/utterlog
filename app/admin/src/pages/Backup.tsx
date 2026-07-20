import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Database, CloudUpload, Download, Trash2 } from 'lucide-react';
import {
  Button, Card, ConfirmDialog,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';

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
      await api.post('/backup/create');
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

  const metrics = [
    { label: '数据库大小', value: stats?.db_size || '-' },
    { label: '附件大小', value: stats?.uploads_size || '-' },
    { label: '备份数量', value: stats?.backup_count ?? 0 },
  ];

  return (
    <div>
      {/* Stats */}
      {stats && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <Card key={m.label} className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-2xl font-semibold">{m.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mb-5 flex gap-2">
        <Button onClick={createBackup} disabled={creating}>
          <Database /> 创建备份
        </Button>
        <label className="cursor-pointer">
          <input type="file" accept=".zip" onChange={handleImportSelect} className="hidden" />
          <span className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
            <CloudUpload className="size-4" /> {importing ? '导入中…' : '导入备份'}
          </span>
        </label>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        备份包含：数据库完整导出 + uploads 目录所有附件。导入时自动恢复数据库和文件。
      </p>

      {/* Backup list */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件名</TableHead>
              <TableHead>大小</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-32">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  暂无备份，点击"创建备份"开始
                </TableCell>
              </TableRow>
            ) : (
              backups.map((b, index) => (
                <TableRow key={b.filename || index}>
                  <TableCell className="font-medium">{b.filename}</TableCell>
                  <TableCell className="text-muted-foreground">{formatSize(b.size || 0)}</TableCell>
                  <TableCell className="text-muted-foreground">{b.created}</TableCell>
                  <TableCell>
                    <div className="flex gap-1.5">
                      <a href={b.url} download>
                        <Button variant="outline" size="sm"><Download /> 下载</Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteBackupName(b.filename)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={!!deleteBackupName}
        onOpenChange={(o) => !o && setDeleteBackupName('')}
        onConfirm={() => deleteBackup(deleteBackupName)}
        title="删除备份"
        message="确定删除此备份？"
        confirmText="删除"
      />

      <ConfirmDialog
        open={!!importFile}
        onOpenChange={(o) => !o && !importing && setImportFile(null)}
        onConfirm={confirmImport}
        title="导入备份"
        message="导入备份将覆盖当前数据，确定继续？"
        confirmText="导入备份"
      />
    </div>
  );
}
