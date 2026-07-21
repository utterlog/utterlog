import { Anchor, Info, Globe, Trash2 } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from '@/lib/router';
import toast from 'react-hot-toast';
import { annotationsApi } from '@/lib/api';
import {
  Button, Card, Pagination, ConfirmDialog, Spinner,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/shadcn';
import { formatDate } from '@/lib/utils';

interface AdminAnnotation {
  id: number;
  post_id: number;
  post_title: string;
  post_slug: string;
  block_id: string;
  user_name: string;
  user_email: string;
  user_avatar: string;
  user_site: string;
  utterlog_id: string;
  content: string;
  created_at: number;
}

const defaultAvatar = 'https://gravatar.bluecdn.com/avatar/0?d=mp&s=64';

export default function AnnotationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminAnnotation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(30);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // Same tab structure as Comments page for consistency
  const statusTabs = [
    { key: '', label: '全部', path: '/comments' },
    { key: 'pending', label: '待审核', path: '/comments/pending' },
    { key: 'mine', label: '我的', path: '/comments/mine' },
    { key: 'spam', label: '垃圾', path: '/comments/spam' },
    { key: 'trash', label: '回收站', path: '/comments/trash' },
    { key: 'annotations', label: '段落点评', path: '/comments/annotations' },
  ];

  const fetchList = async () => {
    setLoading(true);
    try {
      const r: any = await annotationsApi.list({ page, per_page: perPage });
      const data = r.data?.data || r.data || [];
      setItems(Array.isArray(data) ? data : []);
      const meta = r.data?.meta || r.meta;
      setTotal(meta?.total || 0);
    } catch {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, [page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / perPage)), [total, perPage]);

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const handleDelete = async (id: number) => {
    setDeleteId(null);
    try {
      await annotationsApi.remove(id);
      toast.success('已删除');
      fetchList();
    } catch { toast.error('删除失败'); }
  };

  const handleBatchDelete = async () => {
    setBatchDeleteOpen(false);
    if (selectedIds.size === 0) return;
    try {
      await annotationsApi.batchDelete(Array.from(selectedIds));
      toast.success(`已删除 ${selectedIds.size} 条`);
      setSelectedIds(new Set());
      fetchList();
    } catch { toast.error('批量删除失败'); }
  };

  return (
    <div>
      {/* Tabs — same as Comments for navigation */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {statusTabs.map(s => (
            <Button
              key={s.key}
              size="sm"
              variant={s.key === 'annotations' ? 'default' : 'outline'}
              onClick={() => navigate(s.path)}
              className="shrink-0"
            >
              {s.label}
            </Button>
          ))}
        </div>
        {selectedIds.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBatchDeleteOpen(true)}
            className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            删除所选 ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Info banner about storage */}
      <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          段落点评存储在 <code className="rounded bg-card px-1.5 py-px text-[11px]">ul_annotations</code> 表
          （post_id + block_id 定位到具体段落，支持 Utterlog 联盟身份和本地 admin 两种发表来源）。
          此处为只读查看和删除；点评本身不需审核，需要身份验证才能发表。
        </span>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    onChange={toggleSelectAll}
                    className="size-4 cursor-pointer accent-primary"
                  />
                  <span>作者</span>
                  {selectedIds.size > 0 && (
                    <span className="text-[11px] font-medium text-primary">已选 {selectedIds.size}</span>
                  )}
                </label>
              </TableHead>
              <TableHead>点评内容</TableHead>
              <TableHead className="w-[220px]">所在文章</TableHead>
              <TableHead className="w-[140px]">时间</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center">
                  <Spinner />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  暂无段落点评
                </TableCell>
              </TableRow>
            ) : (
              items.map((row: AdminAnnotation) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="size-4 shrink-0 cursor-pointer accent-primary"
                      />
                      <img
                        src={row.user_avatar || defaultAvatar}
                        alt=""
                        className="size-8 shrink-0 bg-muted object-cover"
                        style={{ clipPath: 'url(#squircle)' }}
                        onError={e => { (e.target as HTMLImageElement).src = defaultAvatar; }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {row.user_name}
                          {row.utterlog_id && (
                            <Globe className="ml-1.5 inline-block size-2.5 text-primary" aria-label="Utterlog Network" />
                          )}
                        </div>
                        {row.user_site && (
                          <div className="truncate text-[11px] text-muted-foreground">
                            <a href={row.user_site} target="_blank" rel="noopener noreferrer" className="text-inherit">
                              {row.user_site.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="m-0 break-words text-[13px] leading-relaxed text-foreground">{row.content}</p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Anchor className="size-3.5" />
                      段落 <code className="bg-muted px-1.5 py-px text-[10px]">{row.block_id}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`/posts/${row.post_slug}#${row.block_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[13px] text-primary no-underline"
                    >
                      {row.post_title || `#${row.post_id}`}
                    </a>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title="删除"
                      onClick={() => setDeleteId(row.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="删除段落点评"
        message="确定删除此条点评？此操作不可恢复。"
        confirmText="删除"
      />
      <ConfirmDialog
        open={batchDeleteOpen}
        onOpenChange={(o) => !o && setBatchDeleteOpen(false)}
        onConfirm={handleBatchDelete}
        title={`删除所选 ${selectedIds.size} 条点评？`}
        message="删除后不可恢复。"
        confirmText="删除"
      />
    </div>
  );
}
