
import { useEffect, useState } from 'react';
import { tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, DialogFooter, EmptyPanel, Input, Pagination, Modal, ConfirmDialog, LoadingState } from '@/components/ui';
import { useForm } from 'react-hook-form';
import { usePostsToolbar } from '@/layouts/PostsLayout';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useI18n } from '@/lib/i18n';

const tagSchema = z.object({
  name: z.string().min(1, '名称不能为空'),
  slug: z.string().min(1, 'Slug不能为空'),
  description: z.string().optional(),
});

type TagForm = z.infer<typeof tagSchema>;

export default function TagsPage() {
  const { t } = useI18n();
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<TagForm>({
    resolver: zodResolver(tagSchema),
  });

  const { setToolbar } = usePostsToolbar();

  useEffect(() => {
    setToolbar(
      <>
        <Button className="btn-square" title={t('admin.tags.newTag', '新建标签')} onClick={openCreate}>
          <i className="fa-regular fa-plus" style={{ fontSize: 14 }} />
        </Button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Input placeholder={t('admin.tags.searchPlaceholder', '搜索标签…')} value={search} onChange={(e: any) => setSearch(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && (setPage(1), fetchTags())} style={{ width: 220 }} />
          <Button className="btn-square" title={t('common.search', '搜索')} onClick={() => { setPage(1); fetchTags(); }}>
            <i className="fa-regular fa-magnifying-glass" style={{ fontSize: 14 }} />
          </Button>
        </div>
      </>
    );
    return () => setToolbar(null);
  }, [search, t]);

  useEffect(() => { fetchTags(); }, [page]);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const response: any = await tagsApi.list({ page, limit: 20, search });
      setTags(response.data || []);
      setTotalPages(response.meta?.total_pages || Math.max(1, Math.ceil((response.meta?.total || 0) / 20)) || 1);
    } catch { toast.error(t('admin.tags.toast.fetchFailed', '获取标签失败')); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); reset({ name: '', slug: '', description: '' }); setIsModalOpen(true); };
  const openEdit = (tag: any) => { setEditingId(tag.id); reset({ name: tag.name, slug: tag.slug, description: tag.description || '' }); setIsModalOpen(true); };

  const onSubmit = async (data: TagForm) => {
    setSubmitting(true);
    try {
      if (editingId) { await tagsApi.update(editingId, data); toast.success(t('admin.common.updateSuccess', '更新成功')); }
      else { await tagsApi.create(data); toast.success(t('admin.common.createSuccess', '创建成功')); }
      setIsModalOpen(false); fetchTags();
    } catch { toast.error(editingId ? t('admin.common.updateFailed', '更新失败') : t('admin.common.createFailed', '创建失败')); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await tagsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchTags(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  return (
    <div>
      {/* Cards */}
      {loading ? (
        <LoadingState label={t('common.loading', '加载中…')} padding="60px 0" />
      ) : tags.length === 0 ? (
        <EmptyPanel title={t('admin.tags.empty', '暂无标签')} actionText={t('admin.tags.newTag', '新建标签')} onAction={openCreate} padding="60px 0" fontSize="14px" />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {tags.map((tag: any) => (
            <div
              key={tag.id}
              onClick={() => openEdit(tag)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 14px', cursor: 'pointer',
                background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary) 4%, transparent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-bg-card)'; }}
            >
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-main)' }}>#{tag.name}</span>
              {tag.count > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--color-text-dim)', background: 'var(--color-bg-soft)', padding: '1px 6px', borderRadius: '8px' }}>{tag.count}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteId(tag.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--color-text-dim)', opacity: 0.4, transition: 'opacity 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#dc2626'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--color-text-dim)'; }}
              >
                <i className="fa-regular fa-xmark" style={{ fontSize: '11px' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ marginTop: '16px' }}>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? t('admin.tags.editTag', '编辑标签') : t('admin.tags.newTag', '新建标签')}>
        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input label={t('admin.common.name', '名称')} {...register('name')} error={errors.name?.message} />
          <Input label="Slug" {...register('slug')} error={errors.slug?.message} />
          <DialogFooter
            onCancel={() => setIsModalOpen(false)}
            onSubmit={handleSubmit(onSubmit)}
            submitting={submitting}
            submitText={editingId ? t('admin.common.save', '保存') : t('admin.common.create', '创建')}
            cancelText={t('admin.common.cancel', '取消')}
          />
        </form>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.tags.confirmDeleteMessage', '删除后无法恢复，是否确认删除此标签？')} />
    </div>
  );
}
