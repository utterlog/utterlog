
import { useEffect, useState } from 'react';
import { gamesApi } from '@/lib/api';
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

export default function GamesPage() {
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
    try { const r: any = await gamesApi.list(); setItems(r.data || []); }
    catch { toast.error('加载失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '', platform: '', status: 'publish' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await gamesApi.update(editingId, form); toast.success('更新成功'); }
      else { await gamesApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await gamesApi.delete(deleteId); toast.success('已删除'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>
      <AdminToolbar
        meta={`${items.length} 款游戏`}
        actions={
          <>
        <Button variant="secondary" onClick={() => setShowImport(true)}>
          <i className="fa-light fa-link" style={{ fontSize: '13px' }} /> 链接导入
        </Button>
        <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />添加游戏</Button>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyPanel title="暂无内容" actionText="添加游戏" onAction={openCreate} />
      ) : (
        <MediaItemGrid
          items={items}
          onEdit={openEdit}
          onDelete={setDeleteId}
          subtitle={(item) => item.platform || ''}
        />
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑' : '添加游戏'} size="md">
        <div className="space-y-4">
          <Input label="标题" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input label="平台" value={form.platform || ''} onChange={e => setForm({ ...form, platform: e.target.value })} placeholder="Steam / PS5 / Switch / Xbox" />
          <CoverInput label="封面图片" value={form.cover_url || ''} onChange={(url) => setForm({ ...form, cover_url: url })} folder="games" />
          <Input label="链接" value={form.url || ''} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="Steam/NeoDB 链接" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评分</label>
            <RatingStars value={form.rating || 0} onChange={v => setForm({ ...form, rating: v })} />
          </div>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>评价</label>
            <textarea className="input" rows={3} value={form.comment || ''} onChange={e => setForm({ ...form, comment: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <DialogFooter onCancel={() => setIsModalOpen(false)} onSubmit={onSubmit} submitting={submitting} submitText={editingId ? '保存' : '添加'} />
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />

      <ImportUrlModal isOpen={showImport} onClose={() => setShowImport(false)} type="game"
        platforms="NeoDB、Steam"
        onImport={(data) => {
          setForm({
            title: data.title || '', cover_url: data.cover_url || '',
            rating: Math.round(data.rating || 0), comment: data.summary || '',
            platform: data.extra?.genre || data.platform || '', url: data.url || '',
            status: 'publish',
          });
          setEditingId(null);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
