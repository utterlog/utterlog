
import { useEffect, useState, useCallback } from 'react';
import { mediaApi } from '@/lib/api';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Modal, ConfirmDialog, EmptyPanel, LoadingState } from '@/components/ui';
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
  const [storageDriver, setStorageDriver] = useState('local');

  useEffect(() => {
    fetchFiles();
  }, [category]);

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
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    // Upload sequentially so each file's progress is surfaced via toast,
    // and so a failure on one doesn't abort the rest. Parallel would be
    // faster but messier for feedback + risks local disk thrash on big
    // batches.
    let ok = 0, fail = 0;
    for (const file of files) {
      try {
        await mediaApi.upload(file);
        ok++;
      } catch {
        fail++;
      }
    }
    if (ok > 0 && fail === 0) toast.success(t('admin.media.toast.uploadSuccess', '上传成功 · {count} 个文件', { count: ok }));
    else if (ok > 0 && fail > 0) toast(t('admin.media.toast.uploadPartial', '成功 {ok} 个，失败 {fail} 个', { ok, fail }), { icon: '!' });
    else toast.error(t('admin.media.toast.uploadFailed', '上传失败'));
    fetchFiles();
    setUploading(false);
    // Allow re-selecting the same files right after (browser won't fire
    // change again otherwise).
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
    <div className="">
      
      {/* Category tabs + upload */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
          {categories.map(c => (
            <Button key={c.key} variant={category === c.key ? 'primary' : 'secondary'} onClick={() => setCategory(c.key)} style={{ flexShrink: 0, fontSize: '13px', padding: '6px 14px' }}>
              {t(c.labelKey, c.fallback)}
            </Button>
          ))}
        </div>
        {/* Only show storage selector if multiple drivers configured */}
        <label className="cursor-pointer flex-shrink-0" title={uploading ? t('admin.media.uploading', '上传中…') : t('admin.media.uploadFile', '上传文件')}>
          <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.zip,.rar,.7z" onChange={handleUpload} className="hidden" />
          <span className="btn-primary btn btn-square inline-flex items-center justify-center">
            <i className={uploading ? 'fa-regular fa-spinner fa-spin' : 'fa-regular fa-cloud-arrow-up'} style={{ fontSize: '14px' }} />
          </span>
        </label>
      </div>

      {loading ? (
        <LoadingState label={t('admin.common.loading', '加载中…')} padding="80px 0" />
      ) : files.length === 0 ? (
        <EmptyPanel title={t('admin.media.empty', '暂无文件')} padding="80px 0" fontSize="14px" />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {files.map((file) => (
            <div
              key={file.id}
              className="group relative aspect-square bg-soft rounded-[4px] overflow-hidden border border-line hover:border-blue-500 transition-colors"
            >
              <div className="w-full h-full flex items-center justify-center">
                {file.mime_type?.startsWith('image/') ? (
                  <img src={file.url} alt={file.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewUrl(file.url)} />
                ) : (
                  <i className="fa-regular fa-image text-dim" style={{ fontSize: '28px' }} />
                )}
              </div>
              {/* Hover Actions */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={() => copyUrl(file.url, file.id)}
                  style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: copiedId === file.id ? '#16a34a' : 'var(--color-primary, #0052D9)', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: 0, transition: 'background 0.15s' }}
                  title={t('admin.media.copyLink', '复制链接')}
                >
                  {copiedId === file.id ? <i className="fa-solid fa-check" style={{ fontSize: '14px' }} /> : <i className="fa-regular fa-copy" style={{ fontSize: '14px' }} />}
                </button>
                <button
                  onClick={() => setDeleteId(file.id)}
                  className="action-btn danger"
                  title={t('admin.common.delete', '删除')}
                >
                  <i className="fa-regular fa-trash" style={{ fontSize: '14px' }} />
                </button>
              </div>

              {/* Source badge for resource category */}
              {file.source_type && (
                <div className="absolute top-1 left-1">
                  <span style={{ fontSize: '10px', padding: '1px 5px', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '2px' }}>
                    {{ music: t('admin.content.music', '音乐'), movies: t('admin.content.movies', '电影'), books: t('admin.content.books', '图书'), games: t('admin.content.games', '游戏'), goods: t('admin.content.goods', '好物') }[file.source_type as string] || file.source_type}
                  </span>
                </div>
              )}

              {/* File Info */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-xs text-white truncate">{file.name}</p>
                <p className="text-xs text-dim">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <Modal isOpen={!!previewUrl} onClose={() => setPreviewUrl(null)} size="lg">
        <div className="relative">
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute -top-2 -right-2 p-1 bg-soft rounded-full hover:bg-soft"
          >
            <i className="fa-solid fa-xmark" style={{ fontSize: '14px' }} />
          </button>
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="w-full rounded-[4px]" />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('admin.common.confirmDelete', '确认删除')}
        message={t('admin.media.confirmDelete', '删除后无法恢复，是否确认删除此文件？')}
      />
    </div>
  );
}
