import { useEffect, useState } from 'react';
import { tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, X } from 'lucide-react';
import {
  Button, Input, Label, Pagination, LoadingState, EmptyState, ConfirmDialog,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/shadcn';
import { usePostsToolbar } from '@/layouts/PostsLayout';
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
        <Button variant="outline" size="icon" title={t('admin.tags.newTag', '新建标签')} onClick={openCreate}>
          <Plus />
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            placeholder={t('admin.tags.searchPlaceholder', '搜索标签…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchTags())}
            className="w-56"
          />
          <Button variant="outline" size="icon" title={t('common.search', '搜索')} onClick={() => { setPage(1); fetchTags(); }}>
            <Search />
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
      {loading ? (
        <LoadingState label={t('common.loading', '加载中…')} />
      ) : tags.length === 0 ? (
        <EmptyState
          title={t('admin.tags.empty', '暂无标签')}
          actionText={t('admin.tags.newTag', '新建标签')}
          onAction={openCreate}
        />
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {tags.map((tag: any) => (
            <div
              key={tag.id}
              onClick={() => openEdit(tag)}
              className="group inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="text-sm font-medium text-foreground">#{tag.name}</span>
              {tag.count > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{tag.count}</span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteId(tag.id); }}
                className="rounded p-0.5 text-muted-foreground opacity-40 transition-colors hover:text-destructive group-hover:opacity-100"
                aria-label={t('common.delete', '删除')}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      {/* Create / edit modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? t('admin.tags.editTag', '编辑标签') : t('admin.tags.newTag', '新建标签')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t('admin.common.name', '名称')}</Label>
              <Input {...register('name')} aria-invalid={errors.name ? true : undefined} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Slug</Label>
              <Input {...register('slug')} aria-invalid={errors.slug ? true : undefined} />
              {errors.slug && <p className="text-sm text-destructive">{errors.slug.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                {t('admin.common.cancel', '取消')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {editingId ? t('admin.common.save', '保存') : t('admin.common.create', '创建')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
        title={t('admin.posts.confirmDeleteTitle', '确认删除')}
        message={t('admin.tags.confirmDeleteMessage', '删除后无法恢复，是否确认删除此标签？')}
      />
    </div>
  );
}
