import { useEffect, useState } from 'react';
import { useNavigate } from '@/lib/router';
import { postsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Search, Clapperboard, Pencil, Trash2 } from 'lucide-react';
import {
  Button, Input, Badge, Pagination, ConfirmDialog, Card,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';
import { cn, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

// Films —— 影视专业模式管理页（ul_posts WHERE type='video'）。共享 postsApi 与
// PostCreate/PostEdit，前端按 type='video' 过滤 + UI 分支。

const statusBadge: Record<string, string> = {
  publish: 'border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  draft: 'border-transparent bg-muted text-muted-foreground',
  private: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
  pending: 'border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400',
};

export default function FilmsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [films, setFilms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [, setDeleting] = useState(false);
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

  const videoTypeLabel = (m: any): string => {
    const ty = m?.video_type || '';
    return ({ tv: '剧集', movie: '电影', show: '综艺', anime: '动漫', doc: '纪录片' } as Record<string, string>)[ty] || '影视';
  };

  const statusFilters = [
    { key: '', label: '全部' },
    { key: 'publish', label: '已发布' },
    { key: 'draft', label: '草稿' },
    { key: 'private', label: '私密' },
  ] as const;

  return (
    <div>
      {/* Toolbar: status filter + new + search */}
      <div className="mb-4 flex flex-wrap items-center gap-1">
        <div className="flex gap-1">
          {statusFilters.map(s => (
            <Button
              key={s.key}
              size="sm"
              variant={status === s.key ? 'default' : 'outline'}
              onClick={() => { setStatus(s.key); setPage(1); }}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="icon" title="新建影视" onClick={() => navigate('/films/create?type=video')}>
          <Plus />
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            placeholder="检索标题"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (setPage(1), fetchFilms())}
            className="w-56"
          />
          <Button variant="outline" size="icon" title="搜索" onClick={() => { setPage(1); fetchFilms(); }}>
            <Search />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">海报</TableHead>
              <TableHead>标题</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-36">发布时间</TableHead>
              <TableHead className="w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && films.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  暂无影视作品，点上方「+」新建第一个
                </TableCell>
              </TableRow>
            ) : (
              films.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.cover_url ? (
                      <img src={row.cover_url} alt="" className="h-20 w-14 rounded object-cover" />
                    ) : (
                      <div className="flex h-20 w-14 items-center justify-center rounded bg-muted text-muted-foreground">
                        <Clapperboard className="size-[18px]" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <button className="text-sm font-semibold text-foreground hover:text-primary" onClick={() => navigate(`/films/edit/${row.id}`)}>
                      {row.title}
                    </button>
                    {row.meta && (
                      <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                        <span>{videoTypeLabel(row.meta)}</span>
                        {row.meta.region && <span>· {row.meta.region}</span>}
                        {row.meta.year && <span>· {row.meta.year}</span>}
                        {row.meta.total_episodes && <span>· {row.meta.total_episodes} 集</span>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(statusBadge[row.status])}>{statusLabel(row.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.published_at ? formatDate(row.published_at) : '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => navigate(`/films/edit/${row.id}`)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(row.id)}><Trash2 className="size-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
      <ConfirmDialog
        open={!!deleteId}
        title="确认删除"
        message="删除后无法恢复，关联的剧集列表也会一并删除。"
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
