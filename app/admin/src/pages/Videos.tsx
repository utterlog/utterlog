
import { useEffect, useState } from 'react';
import { videosApi } from '@/lib/api';
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
  Modal,
  RowActions,
} from '@/components/ui';
import { ImportUrlModal } from '@/components/ui/import-url-modal';

// Generate embed URL from video URL
function getEmbedUrl(url: string, platform?: string): string {
  if (!url) return '';
  // YouTube
  const ytMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  // Bilibili
  const bvMatch = url.match(/(BV[a-zA-Z0-9]+)/);
  if (bvMatch) return `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0`;
  const avMatch = url.match(/av(\d+)/);
  if (avMatch) return `https://player.bilibili.com/player.html?aid=${avMatch[1]}&autoplay=0`;
  // Direct video file
  if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(url)) return url;
  return '';
}

function VideoPlayer({ url, embed, platform }: { url: string; embed?: string; platform?: string }) {
  const embedUrl = embed || getEmbedUrl(url, platform);
  if (!embedUrl && !url) return null;

  // Direct video file
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(embedUrl || url)) {
    return (
      <video controls style={{ width: '100%', maxHeight: '360px', background: '#000' }}>
        <source src={embedUrl || url} />
      </video>
    );
  }

  // Iframe embed
  if (embedUrl) {
    return (
      <iframe
        src={embedUrl}
        style={{ width: '100%', height: '360px', border: 'none', background: '#000' }}
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    );
  }

  // Fallback: link
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: '40px', textAlign: 'center', background: '#1a1a1a', color: '#fff', textDecoration: 'none' }}>
      <i className="fa-regular fa-play" style={{ fontSize: '32px', marginBottom: '8px', display: 'block' }} />
      点击观看
    </a>
  );
}

export default function VideosPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await videosApi.list(); setItems(r.data || []); }
    catch {}
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', video_url: '', embed_url: '', platform: '', comment: '', status: 'publish' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    // Auto-generate embed URL
    if (form.video_url && !form.embed_url) {
      form.embed_url = getEmbedUrl(form.video_url);
    }
    setSubmitting(true);
    try {
      if (editingId) { await videosApi.update(editingId, form); toast.success('更新成功'); }
      else { await videosApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await videosApi.delete(deleteId); toast.success('已删除'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  return (
    <div>
      <AdminToolbar
        meta={`${items.length} 个视频`}
        actions={
          <>
        <Button variant="secondary" onClick={() => setShowImport(true)}>
          <i className="fa-light fa-link" style={{ fontSize: '13px' }} /> 链接导入
        </Button>
        <Button onClick={openCreate}><i className="fa-regular fa-plus" style={{ fontSize: '16px' }} />添加视频</Button>
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyPanel title="暂无视频" actionText="添加视频" onAction={openCreate} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
          {items.map((item: any) => (
            <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Video player or thumbnail */}
              {playingId === item.id ? (
                <VideoPlayer url={item.video_url} embed={item.embed_url} platform={item.platform} />
              ) : (
                <div
                  onClick={() => setPlayingId(item.id)}
                  style={{ position: 'relative', cursor: 'pointer', background: '#1a1a1a', height: '180px' }}
                >
                  {item.cover_url ? (
                    <img src={item.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                  ) : (
                    <div style={{ height: '100%' }} />
                  )}
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{
                      width: '48px', height: '48px', background: 'rgba(255,255,255,0.9)',
                      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <i className="fa-solid fa-play" style={{ fontSize: '18px', color: '#1a1a1a', marginLeft: '3px' }} />
                    </div>
                  </div>
                  {item.platform && (
                    <span style={{
                      position: 'absolute', top: '8px', right: '8px', fontSize: '10px', padding: '2px 6px',
                      background: 'rgba(0,0,0,0.6)', color: '#fff',
                    }}>
                      {({ youtube: 'YouTube', bilibili: 'B站', tencent_video: '腾讯', youku: '优酷', iqiyi: '爱奇艺' } as Record<string, string>)[item.platform] || item.platform}
                    </span>
                  )}
                </div>
              )}
              <div style={{ padding: '12px', display: 'flex', alignItems: 'start', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="text-main" style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</h3>
                  {item.comment && <p className="text-dim" style={{ fontSize: '11px', marginTop: '4px' }}>{item.comment}</p>}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <RowActions onEdit={() => openEdit(item)} onDelete={() => setDeleteId(item.id)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? '编辑视频' : '添加视频'}>
        <div className="space-y-4">
          <Input label="标题" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
          <Input label="视频链接" value={form.video_url || ''} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="YouTube/B站/直链 URL" />
          <Input label="嵌入地址 (自动生成)" value={form.embed_url || ''} onChange={e => setForm({ ...form, embed_url: e.target.value })} placeholder="留空自动从视频链接生成" />
          <CoverInput label="封面图片" value={form.cover_url || ''} onChange={(url) => setForm({ ...form, cover_url: url })} folder="videos" />
          <Input label="平台" value={form.platform || ''} onChange={e => setForm({ ...form, platform: e.target.value })} placeholder="youtube / bilibili / ..." />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>备注</label>
            <textarea className="input" rows={2} value={form.comment || ''} onChange={e => setForm({ ...form, comment: e.target.value })} style={{ resize: 'vertical' }} />
          </div>
          <DialogFooter onCancel={() => setIsModalOpen(false)} onSubmit={onSubmit} submitting={submitting} submitText={editingId ? '保存' : '添加'} />
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />

      <ImportUrlModal isOpen={showImport} onClose={() => setShowImport(false)} type="movie"
        platforms="YouTube、B站、优酷、腾讯视频、爱奇艺、直链视频"
        onImport={(data) => {
          setForm({
            title: data.title || '', cover_url: data.cover_url || '',
            video_url: data.url || '',
            embed_url: data.extra?.embed_url || getEmbedUrl(data.url || ''),
            platform: data.platform || '', comment: data.summary || '',
            status: 'publish',
          });
          setEditingId(null);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
}
