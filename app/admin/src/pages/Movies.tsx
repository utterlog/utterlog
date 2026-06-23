
import { useEffect, useState } from 'react';
import { moviesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AdminToolbar,
  Button,
  ConfirmDialog,
  CoverInput,
  DialogFooter,
  EmptyPanel,
  Input,
  LoadingState,
  MediaItemGrid,
  Modal,
  RatingStars,
} from '@/components/ui';
import { ImportUrlModal } from '@/components/ui/import-url-modal';

export default function moviesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await moviesApi.list(); setItems(r.data || []); }
    catch { toast.error('获取失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await moviesApi.update(editingId, form); toast.success('更新成功'); }
      else { await moviesApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await moviesApi.delete(deleteId); toast.success('删除成功'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>
      <AdminToolbar
        meta={`${items.length} 部电影`}
        actions={
          <>
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <i className="fa-light fa-link" style={{ fontSize: '13px' }} /> 链接导入
          </Button>
          <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />添加电影</Button>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyPanel title="暂无内容" actionText="添加电影" onAction={openCreate} />
      ) : (
        <MediaItemGrid
          items={items}
          onEdit={openEdit}
          onDelete={setDeleteId}
          subtitle={(item) => item.artist || item.director || item.author_name || item.brand || ''}
        />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑' : '添加电影'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="标题" value={form.title || ''} onChange={(e) => setForm({...form, title: e.target.value})} />
          <Input label="导演" value={form.director || ""} onChange={(e) => setForm({...form, director: e.target.value})} />
          <div style={{ display: "flex", gap: "10px" }}>
            <Input label="年份" type="number" value={form.year || ""} onChange={(e) => setForm({...form, year: Number(e.target.value)})} style={{ width: "100px" }} />
            <Input label="类型" value={form.genre || ""} onChange={(e) => setForm({...form, genre: e.target.value})} placeholder="剧情,科幻" />
          </div>
          <Input label="豆瓣/NeoDB 链接" value={form.platform_url || ""} onChange={(e) => setForm({...form, platform_url: e.target.value})} />
          <CoverInput label="封面图片" value={form.cover_url || ''} onChange={(url) => setForm({...form, cover_url: url})} folder="movies" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评分</label>
            <RatingStars value={form.rating || 0} onChange={(v) => setForm({...form, rating: v})} />
          </div>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评价</label>
            <textarea className="input focus-ring" rows={3} value={form.comment || ''} onChange={(e) => setForm({...form, comment: e.target.value})} />
          </div>
          <DialogFooter onCancel={() => setIsModalOpen(false)} onSubmit={onSubmit} submitting={submitting} submitText={editingId ? '保存' : '添加'} />
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />

      <ImportUrlModal isOpen={showImport} onClose={() => setShowImport(false)} type="movie" onImport={(data) => {
        setForm({
          title: data.title || '', cover_url: data.cover_url || '',
          rating: Math.round(data.rating || 0), comment: data.summary || '',
          director: data.artist || '', year: data.year || '', status: 'publish',
          genre: data.extra?.genre || '', url: data.url || '',
        });
        setEditingId(null);
        setIsModalOpen(true);
      }} />
    </div>
  );
}
