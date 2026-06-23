import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { annotationsApi } from '@/lib/api';
import { Button, Table, Pagination, ConfirmDialog } from '@/components/ui';
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

  const columns = [
    {
      key: 'select',
      title: (
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox"
            checked={items.length > 0 && selectedIds.size === items.length}
            onChange={toggleSelectAll}
            style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }} />
          <span>作者</span>
          {selectedIds.size > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
              已选 {selectedIds.size}
            </span>
          )}
        </label>
      ),
      width: '200px',
      render: (row: AdminAnnotation) => (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)}
            style={{ accentColor: 'var(--color-primary)', cursor: 'pointer', flexShrink: 0 }} />
          <img
            src={row.user_avatar || defaultAvatar}
            alt=""
            style={{ width: '32px', height: '32px', objectFit: 'cover', flexShrink: 0, background: 'var(--color-bg-soft)', clipPath: 'url(#squircle)' }}
            onError={e => { (e.target as HTMLImageElement).src = defaultAvatar; }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="text-main" style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.user_name}
              {row.utterlog_id && (
                <i className="fa-sharp fa-light fa-globe" title="Utterlog Network"
                  style={{ fontSize: '10px', marginLeft: '6px', color: 'var(--color-primary)' }} />
              )}
            </div>
            {row.user_site && (
              <div className="text-dim" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <a href={row.user_site} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                  {row.user_site.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'content',
      title: '点评内容',
      render: (row: AdminAnnotation) => (
        <div>
          <p className="text-main" style={{ fontSize: '13px', lineHeight: 1.6, margin: 0, wordBreak: 'break-word' }}>{row.content}</p>
          <div className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>
            <i className="fa-regular fa-anchor" style={{ marginRight: '4px' }} />
            段落 <code style={{ background: 'var(--color-bg-soft)', padding: '1px 5px', fontSize: '10px' }}>{row.block_id}</code>
          </div>
        </div>
      ),
    },
    {
      key: 'post',
      title: '所在文章',
      width: '220px',
      render: (row: AdminAnnotation) => (
        <a href={`/posts/${row.post_slug}#${row.block_id}`} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: '13px', color: 'var(--color-primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {row.post_title || `#${row.post_id}`}
        </a>
      ),
    },
    {
      key: 'date',
      title: '时间',
      width: '140px',
      render: (row: AdminAnnotation) => (
        <span className="text-dim" style={{ fontSize: '12px' }}>{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      title: '',
      width: '100px',
      render: (row: AdminAnnotation) => (
        <button onClick={() => setDeleteId(row.id)} title="删除" className="action-btn danger">
          <i className="fa-regular fa-trash" />
        </button>
      ),
    },
  ];

  return (
    <div>
      {/* Tabs — same as Comments for navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {statusTabs.map(s => (
            <Button
              key={s.key}
              variant={s.key === 'annotations' ? 'primary' : 'secondary'}
              onClick={() => navigate(s.path)}
              style={{ flexShrink: 0 }}
            >
              {s.label}
            </Button>
          ))}
        </div>
        {selectedIds.size > 0 && (
          <Button variant="secondary"
            onClick={() => setBatchDeleteOpen(true)}
            style={{ color: '#dc2626', borderColor: '#dc2626' }}>
            <i className="fa-regular fa-trash" style={{ marginRight: '6px' }} />
            删除所选 ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Info banner about storage */}
      <div className="text-dim" style={{
        fontSize: '12px', padding: '10px 14px', marginBottom: '16px',
        background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)',
        lineHeight: 1.6,
      }}>
        <i className="fa-regular fa-circle-info" style={{ marginRight: '6px', color: 'var(--color-primary)' }} />
        段落点评存储在 <code style={{ background: 'var(--color-bg-card)', padding: '1px 5px', fontSize: '11px' }}>ul_annotations</code> 表
        （post_id + block_id 定位到具体段落，支持 Utterlog 联盟身份和本地 admin 两种发表来源）。
        此处为只读查看和删除；点评本身不需审核，需要身份验证才能发表。
      </div>

      {/* Table */}
      <Table
        columns={columns as any}
        data={items}
        loading={loading}
        emptyText="暂无段落点评"
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => deleteId && handleDelete(deleteId)}
        title="删除段落点评"
        message="确定删除此条点评？此操作不可恢复。"
        confirmText="删除"
      />
      <ConfirmDialog
        isOpen={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        onConfirm={handleBatchDelete}
        title={`删除所选 ${selectedIds.size} 条点评？`}
        message="删除后不可恢复。"
        confirmText="删除"
      />
    </div>
  );
}
