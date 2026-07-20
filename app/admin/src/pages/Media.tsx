import { useEffect, useState, useCallback } from 'react';
import { mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { CloudUpload, Loader2, ImageIcon, Copy, Check, Trash2, X } from 'lucide-react';
import {
  Button, LoadingState, EmptyState,
  Dialog, DialogContent,
  ConfirmDialog,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const categories = [
  { key: '', labelKey: 'admin.media.category.all', fallback: '全部' },
  { key: 'image', labelKey: 'admin.media.category.image', fallback: '图片' },
  { key: 'video', labelKey: 'admin.media.category.video', fallback: '视频' },
  { key: 'audio', labelKey: 'admin.media.category.audio', fallback: '音乐' },
  { key: 'document', labelKey: 'admin.media.category.document', fallback: '文档' },
  { key: 'archive', labelKey: 'admin.media.category.archive', fallback: '附件' },
  { key: 'other', labelKey: 'admin.media.category.other', fallback: '其他' },
  { key: 'resource', labelKey: 'admin.media.category.resource', fallback: '资源' },
];

export default function MediaPage() {
  const { t } = useI18n();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [category, setCategory] = useState('');

  useEffect(() => { fetchFiles(); }, [category]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response: any = await mediaApi.list(category ? { category } : { exclude_category: 'resource' });
      setFiles(response.data?.files || response.data || []);
    } catch {
      toast.error(t('admin.media.toast.fetchFailed', '获取文件失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of list) {
      try { await mediaApi.upload(file); ok++; } catch { fail++; }
    }
    if (ok > 0 && fail === 0) toast.success(t('admin.media.toast.uploadSuccess', '上传成功 · {count} 个文件', { count: ok }));
    else if (ok > 0 && fail > 0) toast(t('admin.media.toast.uploadPartial', '成功 {ok} 个，失败 {fail} 个', { ok, fail }), { icon: '!' });
    else toast.error(t('admin.media.toast.uploadFailed', '上传失败'));
    fetchFiles();
    setUploading(false);
    e.target.value = '';
  }, [t]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await mediaApi.delete(deleteId);
      toast.success(t('admin.common.deleteSuccess', '删除成功'));
      fetchFiles();
    } catch {
      toast.error(t('admin.common.deleteFailed', '删除失败'));
    } finally {
      setDeleteId(null);
    }
  };

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const copyUrl = (url: string, id: number) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div>
      {/* Category tabs + upload */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {categories.map(c => (
            <Button
              key={c.key}
              size="sm"
              variant={category === c.key ? 'default' : 'outline'}
              onClick={() => setCategory(c.key)}
            >
              {t(c.labelKey, c.fallback)}
            </Button>
          ))}
        </div>
        <label
          className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          title={uploading ? t('admin.media.uploading', '上传中…') : t('admin.media.uploadFile', '上传文件')}
        >
          <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z" onChange={handleUpload} className="hidden" />
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
        </label>
      </div>

      {loading ? (
        <LoadingState label={t('admin.common.loading', '加载中…')} />
      ) : files.length === 0 ? (
        <EmptyState title={t('admin.media.empty', '暂无文件')} />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-primary"
            >
              <div className="flex size-full items-center justify-center">
                {file.mime_type?.startsWith('image/') ? (
                  <img src={file.url} alt={file.name} className="size-full cursor-pointer object-cover" onClick={() => setPreviewUrl(file.url)} />
                ) : (
                  <ImageIcon className="size-7 text-muted-foreground" />
                )}
              </div>
              {/* Hover actions */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => copyUrl(file.url, file.id)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-white transition-colors',
                    copiedId === file.id ? 'bg-emerald-500' : 'bg-primary hover:bg-primary/90',
                  )}
                  title={t('admin.media.copyLink', '复制链接')}
                >
                  {copiedId === file.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </button>
                <button
                  onClick={() => setDeleteId(file.id)}
                  className="flex size-8 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
                  title={t('admin.common.delete', '删除')}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              {/* Source badge */}
              {file.source_type && (
                <div className="absolute left-1 top-1">
                  <span className="rounded-sm bg-black/60 px-1.5 py-px text-[10px] text-white">
                    {{ music: t('admin.content.music', '音乐'), movies: t('admin.content.movies', '电影'), books: t('admin.content.books', '图书'), games: t('admin.content.games', '游戏'), goods: t('admin.content.goods', '好物') }[file.source_type as string] || file.source_type}
                  </span>
                </div>
              )}

              {/* File info */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="truncate text-xs text-white">{file.name}</p>
                <p className="text-xs text-white/60">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Dialog open={!!previewUrl} onOpenChange={(o) => !o && setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl" showClose={false}>
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute -right-2 -top-2 rounded-full bg-muted p-1 hover:bg-accent"
          >
            <X className="size-3.5" />
          </button>
          {previewUrl && <img src={previewUrl} alt="Preview" className="w-full" />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('admin.common.confirmDelete', '确认删除')}
        message={t('admin.media.confirmDelete', '删除后无法恢复，是否确认删除此文件？')}
      />
    </div>
  );
}
