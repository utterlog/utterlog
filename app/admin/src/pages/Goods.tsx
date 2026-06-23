
import { useEffect, useState } from 'react';
import { goodsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AdminToolbar,
  Button,
  ConfirmDialog,
  DialogFooter,
  EmptyPanel,
  Input,
  LoadingState,
  MediaItemGrid,
  Modal,
  RatingStars,
} from '@/components/ui';

export default function goodsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await goodsApi.list(); setItems(r.data || []); }
    catch { toast.error('获取失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await goodsApi.update(editingId, form); toast.success('更新成功'); }
      else { await goodsApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await goodsApi.delete(deleteId); toast.success('删除成功'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>
      <AdminToolbar
        meta={`${items.length} 件好物`}
        actions={<Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />添加好物</Button>}
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyPanel title="暂无内容" actionText="添加好物" onAction={openCreate} />
      ) : (
        <MediaItemGrid
          items={items}
          onEdit={openEdit}
          onDelete={setDeleteId}
          subtitle={(item) => item.artist || item.director || item.author_name || item.brand || ''}
        />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑' : '添加好物'} size="md">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="标题" value={form.title || ''} onChange={(e) => setForm({...form, title: e.target.value})} />
          <div style={{ display: "flex", gap: "10px" }}>
            <Input label="品牌" value={form.brand || ""} onChange={(e) => setForm({...form, brand: e.target.value})} />
            <Input label="价格" value={form.price || ""} onChange={(e) => setForm({...form, price: e.target.value})} placeholder="¥99" style={{ width: "120px" }} />
          </div>
          <Input label="购买链接" value={form.purchase_url || ""} onChange={(e) => setForm({...form, purchase_url: e.target.value})} />
          <div>
            <label className="text-sub" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>分类</label>
            <select className="input" value={form.category || "other"} onChange={(e) => setForm({...form, category: e.target.value})}>
              <option value="tech">数码</option>
              <option value="home">家居</option>
              <option value="fashion">穿搭</option>
              <option value="food">美食</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className="text-sub" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>优点</label>
            <textarea className="input focus-ring" rows={2} value={form.pros || ""} onChange={(e) => setForm({...form, pros: e.target.value})} />
          </div>
          <div>
            <label className="text-sub" style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>缺点</label>
            <textarea className="input focus-ring" rows={2} value={form.cons || ""} onChange={(e) => setForm({...form, cons: e.target.value})} />
          </div>
          <Input label="封面图片 URL" value={form.cover_url || ''} onChange={(e) => setForm({...form, cover_url: e.target.value})} placeholder="https://..." />
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
    </div>
  );
}
