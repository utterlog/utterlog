
import { useState, useEffect } from 'react';
import api, { mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  AdminToolbar,
  Button,
  ConfirmDialog,
  DialogFooter,
  EmptyPanel,
  Input,
  LoadingState,
  Modal,
  RowActions,
} from '@/components/ui';

interface Album {
  id: number;
  title: string;
  slug: string;
  description: string;
  cover_url: string;
  status: string;
  sort_order: number;
  photo_count: number;
  created_at: number;
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', description: '', status: 'private' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Photo management
  const [manageAlbum, setManageAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [showAddPhotos, setShowAddPhotos] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<number[]>([]);

  useEffect(() => { fetchAlbums(); }, []);

  const fetchAlbums = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/albums?per_page=500');
      setAlbums(r.data?.albums || r.data || []);
    } catch {}
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title) { toast.error('请输入相册标题'); return; }
    setSaving(true);
    try {
      await api.post('/albums', form);
      toast.success('相册已创建');
      setShowCreate(false);
      setForm({ title: '', slug: '', description: '', status: 'private' });
      fetchAlbums();
    } catch { toast.error('创建失败'); }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editAlbum) return;
    setSaving(true);
    try {
      await api.put(`/albums/${editAlbum.id}`, form);
      toast.success('已更新');
      setEditAlbum(null);
      fetchAlbums();
    } catch { toast.error('更新失败'); }
    setSaving(false);
  };

  const openCreate = () => {
    setShowCreate(true);
    setForm({ title: '', slug: '', description: '', status: 'private' });
  };

  const openEdit = (album: Album) => {
    setEditAlbum(album);
    setForm({ title: album.title, slug: album.slug, description: album.description, status: album.status });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/albums/${deleteId}`);
      toast.success('已删除');
      fetchAlbums();
    } catch { toast.error('删除失败'); }
    finally { setDeleting(false); setDeleteId(null); }
  };

  const toggleStatus = async (album: Album) => {
    const newStatus = album.status === 'public' ? 'private' : 'public';
    try {
      await api.put(`/albums/${album.id}`, { status: newStatus });
      toast.success(newStatus === 'public' ? '已公开' : '已设为私有');
      fetchAlbums();
    } catch { toast.error('操作失败'); }
  };

  // Photo management
  const openManage = async (album: Album) => {
    setManageAlbum(album);
    try {
      const r: any = await api.get(`/albums/${album.id}/photos?per_page=500`);
      setPhotos(r.data?.photos || r.data || []);
    } catch {}
  };

  const openAddPhotos = async () => {
    setShowAddPhotos(true);
    setSelectedMedia([]);
    try {
      const r: any = await mediaApi.list({ category: 'image', per_page: 500 });
      const files = r.data?.files || r.data || [];
      // Filter out photos already in this album
      const albumPhotoIds = new Set(photos.map((p: any) => p.id));
      setMediaList(files.filter((f: any) => !albumPhotoIds.has(f.id)));
    } catch {}
  };

  const addSelectedPhotos = async () => {
    if (!manageAlbum || selectedMedia.length === 0) return;
    try {
      await api.post(`/albums/${manageAlbum.id}/photos`, { media_ids: selectedMedia });
      toast.success(`已添加 ${selectedMedia.length} 张照片`);
      setShowAddPhotos(false);
      openManage(manageAlbum);
      fetchAlbums();
    } catch { toast.error('添加失败'); }
  };

  const removePhoto = async (mediaId: number) => {
    if (!manageAlbum) return;
    try {
      await api.delete(`/albums/${manageAlbum.id}/photos/${mediaId}`);
      setPhotos(prev => prev.filter((p: any) => p.id !== mediaId));
      fetchAlbums();
    } catch { toast.error('移除失败'); }
  };

  return (
    <div>
      <AdminToolbar
        meta="管理照片相册，公开相册将在前端展示"
        actions={
          <Button className="btn-square" title="新建相册" onClick={openCreate}>
            <i className="fa-regular fa-plus" style={{ fontSize: '14px' }} />
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : albums.length === 0 ? (
        <EmptyPanel title="暂无相册" actionText="创建第一个相册" onAction={openCreate} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {albums.map(album => (
            <div key={album.id} className="card" style={{ overflow: 'hidden' }}>
              {/* Cover */}
              <div style={{ height: '160px', background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }} onClick={() => openManage(album)}>
                {album.cover_url ? (
                  <img src={album.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="fa-regular fa-image" style={{ fontSize: '32px', color: 'var(--color-text-dim)' }} />
                )}
                <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '2px 8px', fontSize: '11px', fontWeight: 600, background: album.status === 'public' ? '#dcfce7' : 'var(--color-bg-soft)', color: album.status === 'public' ? '#16a34a' : 'var(--color-text-dim)' }}>
                  {album.status === 'public' ? '公开' : '私有'}
                </div>
              </div>
              {/* Info */}
              <div style={{ padding: '14px' }}>
                <h3 className="text-main" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{album.title}</h3>
                {album.description && <p className="text-dim" style={{ fontSize: '12px', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{album.description}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="text-dim" style={{ fontSize: '12px' }}>{album.photo_count} 张照片</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => toggleStatus(album)} className={`action-btn${album.status === 'private' ? ' warning' : ''}`} title={album.status === 'public' ? '设为私有' : '公开'}>
                      {album.status === 'public' ? <i className="fa-regular fa-eye-slash" style={{ fontSize: '14px' }} /> : <i className="fa-regular fa-eye" style={{ fontSize: '14px' }} />}
                    </button>
                    <RowActions onEdit={() => openEdit(album)} onDelete={() => setDeleteId(album.id)} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showCreate || !!editAlbum} onClose={() => { setShowCreate(false); setEditAlbum(null); }} title={editAlbum ? '编辑相册' : '新建相册'} size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="标题" value={form.title} onChange={(e: any) => setForm(p => ({ ...p, title: e.target.value }))} />
          <Input label="别名 (URL)" value={form.slug} onChange={(e: any) => setForm(p => ({ ...p, slug: e.target.value }))} placeholder="自动生成" />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>描述</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="相册描述…" />
          </div>
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>可见性</label>
            <select className="input" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="private">私有</option>
              <option value="public">公开</option>
            </select>
          </div>
          <DialogFooter
            onCancel={() => { setShowCreate(false); setEditAlbum(null); }}
            onSubmit={editAlbum ? handleUpdate : handleCreate}
            submitting={saving}
            submitText={editAlbum ? '更新' : '创建'}
          />
        </div>
      </Modal>

      {/* Photo Management Modal */}
      <Modal isOpen={!!manageAlbum} onClose={() => { setManageAlbum(null); setPhotos([]); }} title={manageAlbum ? `${manageAlbum.title} — 照片管理` : ''} size="lg">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className="text-dim" style={{ fontSize: '13px' }}>{photos.length} 张照片</span>
            <Button onClick={openAddPhotos}><i className="fa-regular fa-plus" style={{ fontSize: '14px' }} /> 从媒体库添加</Button>
          </div>
          {photos.length === 0 ? (
            <EmptyPanel title="暂无照片，从媒体库添加" padding="40px 0" fontSize="13px" />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
              {photos.map((photo: any) => (
                <div key={photo.id} className="group" style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: 'var(--color-bg-soft)' }}>
                  <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removePhoto(photo.id)} style={{
                    position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px',
                    background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.15s',
                  }} className="group-hover:opacity-100">
                    <i className="fa-regular fa-trash" style={{ fontSize: '12px' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Add Photos from Media Library Modal */}
      <Modal isOpen={showAddPhotos} onClose={() => setShowAddPhotos(false)} title="从媒体库选择照片" size="lg">
        <div>
          {mediaList.length === 0 ? (
            <EmptyPanel title="媒体库中暂无可用图片" padding="40px 0" fontSize="13px" />
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginBottom: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                {mediaList.map((file: any) => {
                  const selected = selectedMedia.includes(file.id);
                  return (
                    <div key={file.id} onClick={() => setSelectedMedia(prev => selected ? prev.filter(id => id !== file.id) : [...prev, file.id])} style={{
                      position: 'relative', aspectRatio: '1', overflow: 'hidden', cursor: 'pointer',
                      border: selected ? '3px solid var(--color-primary)' : '2px solid var(--color-border)',
                    }}>
                      <img src={file.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {selected && (
                        <div style={{ position: 'absolute', top: '4px', right: '4px', width: '20px', height: '20px', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                          <i className="fa-solid fa-check" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="secondary" onClick={() => setShowAddPhotos(false)}>取消</Button>
                <Button onClick={addSelectedPhotos} disabled={selectedMedia.length === 0}>
                  添加 {selectedMedia.length > 0 ? `(${selectedMedia.length})` : ''}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="确认删除"
        message="删除后无法恢复，照片不会被删除，只是取消关联。"
      />
    </div>
  );
}
