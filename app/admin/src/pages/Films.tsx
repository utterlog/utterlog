import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Table, Pagination, Badge, ConfirmDialog, RowActions } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

// Films —— 影视专业模式管理页（ul_posts WHERE type='video'）。
//
// 与 Posts 页区别：
//   1. 永远只 list type=video 的 post
//   2. 「新建影视」按钮跳 /films/create（带 type=video 预设）
//   3. 「编辑」跳 /films/edit/:id（PostEdit 内部按 type 切 UI）
//   4. 列表多一列：集数（从 post.meta.total_episodes 读，或 fallback
//      数 ul_post_episodes 行数）
//   5. 没有 permalink / batch 等通用文章管理设置（影视通常不需要）
//
// 共享 postsApi 和 PostCreate/PostEdit —— 后端 ul_posts 同一张表，
// 前端只是按 type='video' 过滤 + UI 分支。

const statusVariants: Record<string, 'default' | 'success' | 'warning'> = {
  publish: 'success',
  draft: 'default',
  private: 'warning',
  pending: 'warning',
};

export default function FilmsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [films, setFilms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const perPage = 20;

  const statusLabel = (v: string) => ({
    publish: t('admin.status.published', '已发布'),
    draft: t('admin.status.draft', '草稿'),
    private: t('admin.status.private', '私密'),
  } as Record<string, string>)[v] || v;

  useEffect(() => { fetchFilms(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, status]);

  const fetchFilms = async () => {
    setLoading(true);
    try {
      const r: any = await postsApi.list({
        page, limit: perPage, type: 'video',
        status: status || undefined,
        search: search || undefined,
      });
      setFilms(r.data?.posts || r.data || []);
      setTotal(r.meta?.total || 0);
      setTotalPages(r.meta?.total_pages || 1);
    } catch { toast.error('影视列表加载失败'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try { await postsApi.delete(deleteId); toast.success('已删除'); fetchFilms(); }
    catch { toast.error('删除失败'); }
    finally { setDeleting(false); setDeleteId(null); }
  };

  // meta 字段在后端已序列化为对象，前端 postsApi 拿到时就是 object（不
  // 是 stringified JSON）。video_type 中文映射方便展示。
  const videoTypeLabel = (m: any): string => {
    const t = m?.video_type || '';
    return ({
      tv: '剧集',
      movie: '电影',
      show: '综艺',
      anime: '动漫',
      doc: '纪录片',
    } as Record<string, string>)[t] || '影视';
  };

  return (
    <div>
      {/* 顶部工具栏：状态筛选 + 新建影视 + 搜索 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { key: '', label: '全部' },
            { key: 'publish', label: '已发布' },
            { key: 'draft', label: '草稿' },
            { key: 'private', label: '私密' },
          ] as const).map(s => (
            <Button key={s.key} className="btn-toolbar" variant={status === s.key ? 'primary' : 'secondary'}
              onClick={() => { setStatus(s.key); setPage(1); }}>
              {s.label}
            </Button>
          ))}
        </div>
        <Button className="btn-square" title="新建影视" onClick={() => navigate('/films/create?type=video')}>
          <i className="fa-regular fa-plus" style={{ fontSize: 14 }} />
        </Button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <Input placeholder="检索标题"
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            onKeyDown={(e: any) => e.key === 'Enter' && (setPage(1), fetchFilms())}
            style={{ width: 220 }} />
          <Button className="btn-square" title="搜索" onClick={() => { setPage(1); fetchFilms(); }}>
            <i className="fa-regular fa-magnifying-glass" style={{ fontSize: 14 }} />
          </Button>
        </div>
      </div>

      <Table
        loading={loading}
        emptyText="暂无影视作品，点上方「+」新建第一个"
        columns={[
          {
            key: 'cover', title: '海报', width: '80px',
            render: (row: any) => row.cover_url ? (
              <img src={row.cover_url} alt="" style={{ width: 56, height: 80, objectFit: 'cover', borderRadius: 4 }} />
            ) : (
              <div style={{ width: 56, height: 80, borderRadius: 4, background: 'var(--color-bg-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-dim)' }}>
                <i className="fa-regular fa-clapperboard-play" style={{ fontSize: 18 }} />
              </div>
            ),
          },
          {
            key: 'title', title: '标题', render: (row: any) => (
              <div>
                <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/films/edit/${row.id}`); }}
                  style={{ color: 'var(--color-text-main)', fontSize: 14, fontWeight: 600 }}>{row.title}</a>
                {row.meta && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 4, display: 'flex', gap: 8 }}>
                    <span>{videoTypeLabel(row.meta)}</span>
                    {row.meta.region && <span>· {row.meta.region}</span>}
                    {row.meta.year && <span>· {row.meta.year}</span>}
                    {row.meta.total_episodes && <span>· {row.meta.total_episodes} 集</span>}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'status', title: '状态', width: '80px',
            render: (row: any) => <Badge variant={statusVariants[row.status]}>{statusLabel(row.status)}</Badge>,
          },
          {
            key: 'published_at', title: '发布时间', width: '140px',
            render: (row: any) => row.published_at ? formatDate(row.published_at) : '—',
          },
          {
            key: 'actions', title: '操作', width: '120px',
            render: (row: any) => (
              <RowActions onEdit={() => navigate(`/films/edit/${row.id}`)} onDelete={() => setDeleteId(row.id)} />
            ),
          },
        ]}
        data={films}
      />

      {totalPages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
      <ConfirmDialog isOpen={!!deleteId} title="确认删除"
        message="删除后无法恢复，关联的剧集列表也会一并删除。"
        onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        loading={deleting} />
    </div>
  );
}
