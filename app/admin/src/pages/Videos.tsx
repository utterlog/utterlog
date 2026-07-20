import { useEffect, useState } from 'react';
import { videosApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Link2, Plus, Play, Pencil, Trash2 } from 'lucide-react';
import {
  Button, Input, Label, Textarea, Card, LoadingState, EmptyState, ConfirmDialog,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/shadcn';
// Shared composites still on the legacy design system — to be migrated in the
// shared-component pass (used across Videos/Books/Games/Goods/Movies).
import { CoverInput } from '@/components/ui';
import { ImportUrlModal } from '@/components/ui/import-url-modal';

function getEmbedUrl(url: string): string {
  if (!url) return '';
  const ytMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
  const bvMatch = url.match(/(BV[a-zA-Z0-9]+)/);
  if (bvMatch) return `https://player.bilibili.com/player.html?bvid=${bvMatch[1]}&autoplay=0`;
  const avMatch = url.match(/av(\d+)/);
  if (avMatch) return `https://player.bilibili.com/player.html?aid=${avMatch[1]}&autoplay=0`;
  if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(url)) return url;
  return '';
}

function VideoPlayer({ url, embed }: { url: string; embed?: string }) {
  const embedUrl = embed || getEmbedUrl(url);
  if (!embedUrl && !url) return null;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(embedUrl || url)) {
    return <video controls className="max-h-[360px] w-full bg-black"><source src={embedUrl || url} /></video>;
  }
  if (embedUrl) {
    return (
      <iframe
        src={embedUrl}
        className="h-[360px] w-full border-none bg-black"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block bg-neutral-900 p-10 text-center text-white no-underline">
      <Play className="mx-auto mb-2 size-8" />
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
    if (form.video_url && !form.embed_url) form.embed_url = getEmbedUrl(form.video_url);
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
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{items.length} 个视频</span>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}><Link2 /> 链接导入</Button>
          <Button onClick={openCreate}><Plus /> 添加视频</Button>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="暂无视频" actionText="添加视频" onAction={openCreate} />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
          {items.map((item: any) => (
            <Card key={item.id} className="overflow-hidden p-0">
              {playingId === item.id ? (
                <VideoPlayer url={item.video_url} embed={item.embed_url} />
              ) : (
                <div onClick={() => setPlayingId(item.id)} className="relative h-[180px] cursor-pointer bg-neutral-900">
                  {item.cover_url && <img src={item.cover_url} alt="" className="size-full object-cover opacity-80" />}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-white/90">
                      <Play className="ml-0.5 size-[18px] text-neutral-900" />
                    </div>
                  </div>
                  {item.platform && (
                    <span className="absolute right-2 top-2 bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {({ youtube: 'YouTube', bilibili: 'B站', tencent_video: '腾讯', youku: '优酷', iqiyi: '爱奇艺' } as Record<string, string>)[item.platform] || item.platform}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">{item.title}</h3>
                  {item.comment && <p className="mt-1 text-[11px] text-muted-foreground">{item.comment}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(item)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑视频' : '添加视频'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5"><Label>标题</Label><Input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div className="flex flex-col gap-1.5"><Label>视频链接</Label><Input value={form.video_url || ''} onChange={e => setForm({ ...form, video_url: e.target.value })} placeholder="YouTube/B站/直链 URL" /></div>
            <div className="flex flex-col gap-1.5"><Label>嵌入地址 (自动生成)</Label><Input value={form.embed_url || ''} onChange={e => setForm({ ...form, embed_url: e.target.value })} placeholder="留空自动从视频链接生成" /></div>
            <CoverInput label="封面图片" value={form.cover_url || ''} onChange={(url) => setForm({ ...form, cover_url: url })} folder="videos" />
            <div className="flex flex-col gap-1.5"><Label>平台</Label><Input value={form.platform || ''} onChange={e => setForm({ ...form, platform: e.target.value })} placeholder="youtube / bilibili / ..." /></div>
            <div className="flex flex-col gap-1.5"><Label>备注</Label><Textarea rows={2} value={form.comment || ''} onChange={e => setForm({ ...form, comment: e.target.value })} /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>取消</Button>
              <Button onClick={onSubmit} disabled={submitting}>{editingId ? '保存' : '添加'}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />

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
