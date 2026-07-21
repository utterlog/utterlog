
import { useEffect, useState } from 'react';
import { playlistsApi, musicApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Music, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  EmptyState,
  Input,
  Label,
  LoadingState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Textarea,
} from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', description: '', cover_url: '', is_default: false });
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importForm, setImportForm] = useState({ server: 'netease', playlist_id: '', title: '' });
  const [importing, setImporting] = useState(false);

  // Songs management
  const [activePlaylist, setActivePlaylist] = useState<any | null>(null);
  const [playlistSongs, setPlaylistSongs] = useState<any[]>([]);
  const [allMusic, setAllMusic] = useState<any[]>([]);
  const [showAddSong, setShowAddSong] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  useEffect(() => { fetchPlaylists(); }, []);

  const fetchPlaylists = async () => {
    setLoading(true);
    try { const r: any = await playlistsApi.list(); setPlaylists(r.data || []); }
    catch { toast.error('获取歌单失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', description: '', cover_url: '', is_default: false }); setShowModal(true); };
  const openEdit = (p: any) => { setEditingId(p.id); setForm({ title: p.title, description: p.description || '', cover_url: p.cover_url || '', is_default: p.is_default }); setShowModal(true); };

  const onSubmit = async () => {
    if (!form.title.trim()) { toast.error('歌单名称不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await playlistsApi.update(editingId, form); toast.success('更新成功'); }
      else { await playlistsApi.create(form); toast.success('创建成功'); }
      setShowModal(false); fetchPlaylists();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await playlistsApi.delete(deleteId); toast.success('删除成功'); fetchPlaylists(); if (activePlaylist?.id === deleteId) setActivePlaylist(null); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const handleImport = async () => {
    if (!importForm.playlist_id.trim()) { toast.error('请输入歌单 ID'); return; }
    setImporting(true);
    try {
      const r: any = await playlistsApi.import(importForm.server, importForm.playlist_id, importForm.title || '导入歌单');
      toast.success(`导入成功，共 ${r.data?.imported || 0} 首`);
      setShowImport(false); fetchPlaylists();
    } catch (e: any) { toast.error(e?.response?.data?.error?.message || '导入失败'); }
    finally { setImporting(false); }
  };

  // Open playlist detail
  const openPlaylist = async (p: any) => {
    setActivePlaylist(p);
    try {
      const r: any = await playlistsApi.get(p.id);
      setPlaylistSongs(r.data?.songs || []);
    } catch { toast.error('获取歌曲失败'); }
  };

  // Add song to playlist
  const addSongToPlaylist = async (musicId: number) => {
    if (!activePlaylist) return;
    try {
      await playlistsApi.addSong(activePlaylist.id, musicId);
      toast.success('添加成功');
      openPlaylist(activePlaylist); // Refresh
      fetchPlaylists();
    } catch { toast.error('添加失败'); }
  };

  // Remove song from playlist
  const removeSong = async (musicId: number) => {
    if (!activePlaylist) return;
    try {
      await playlistsApi.removeSong(activePlaylist.id, musicId);
      toast.success('已移除');
      openPlaylist(activePlaylist);
      fetchPlaylists();
    } catch { toast.error('移除失败'); }
  };

  // Load all music for add-song picker
  const loadAllMusic = async () => {
    try { const r: any = await musicApi.list({ per_page: 500 }); setAllMusic(r.data || []); }
    catch {}
    setShowAddSong(true);
  };

  const filteredMusic = searchKeyword
    ? allMusic.filter(m => m.title?.includes(searchKeyword) || m.artist?.includes(searchKeyword))
    : allMusic;

  const songIds = new Set(playlistSongs.map((s: any) => s.id));

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Music className="size-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">歌单管理</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>导入歌单</Button>
          <Button onClick={openCreate}><Plus className="size-4" />创建歌单</Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Left: playlist list */}
        <div className="w-[300px] shrink-0">
          {loading ? (
            <LoadingState />
          ) : playlists.length === 0 ? (
            <EmptyState title="暂无歌单" actionText="创建" onAction={openCreate} />
          ) : (
            <div className="flex flex-col gap-2">
              {playlists.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openPlaylist(p)}
                  className={cn(
                    'cursor-pointer rounded-lg border bg-card px-4 py-3.5 transition-colors hover:border-primary',
                    activePlaylist?.id === p.id ? 'border-primary' : 'border-border',
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-0.5 text-sm font-semibold text-foreground">
                        {p.title}
                        {p.is_default && <span className="ml-1.5 rounded-sm bg-muted px-1 py-px text-[10px] text-primary">默认</span>}
                      </h3>
                      <p className="text-xs text-muted-foreground">{p.song_count || 0} 首</p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); openEdit(p); }} title="编辑"><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }} title="删除"><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: playlist songs */}
        <div className="flex-1">
          {activePlaylist ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3.5 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold text-foreground">{activePlaylist.title}</h2>
                <Button size="sm" onClick={loadAllMusic}><Plus className="size-4" />添加歌曲</Button>
              </div>

              {playlistSongs.length === 0 ? (
                <EmptyState title="歌单暂无歌曲" />
              ) : (
                <div>
                  {playlistSongs.map((s: any, i: number) => (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center gap-2.5 px-1 py-2',
                        i < playlistSongs.length - 1 && 'border-b border-border',
                      )}
                    >
                      <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}</span>
                      {s.cover_url && <img src={s.cover_url} alt="" className="size-9 shrink-0 rounded-sm object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground">{s.artist || ''}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {{ netease: '网易云', tencent: 'QQ', kugou: '酷狗', local: '本地' }[s.platform as string] || s.platform || ''}
                      </span>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => removeSong(s.id)} title="移除"><X className="size-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="选择左侧歌单查看歌曲" />
          )}
        </div>
      </div>

      {/* Create/Edit modal */}
      <Dialog open={showModal} onOpenChange={(o) => !o && setShowModal(false)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑歌单' : '创建歌单'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>歌单名称</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>封面 URL</Label>
              <Input value={form.cover_url} onChange={e => setForm({ ...form, cover_url: e.target.value })} placeholder="可选" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>描述</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} className="size-4 cursor-pointer accent-primary" />
              <span className="text-muted-foreground">设为默认歌单</span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowModal(false)}>取消</Button>
              <Button onClick={onSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}{editingId ? '保存' : '创建'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import modal */}
      <Dialog open={showImport} onOpenChange={(o) => !o && setShowImport(false)}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>导入外部歌单</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>平台</Label>
              <Select value={importForm.server} onValueChange={v => setImportForm({ ...importForm, server: v as string })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="netease">网易云音乐</SelectItem>
                  <SelectItem value="kugou">酷狗音乐</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>歌单 ID</Label>
              <Input value={importForm.playlist_id} onChange={e => setImportForm({ ...importForm, playlist_id: e.target.value })} placeholder="从歌单链接中获取数字 ID" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>歌单名称</Label>
              <Input value={importForm.title} onChange={e => setImportForm({ ...importForm, title: e.target.value })} placeholder="可选，不填默认为'导入歌单'" />
            </div>
            <p className="text-xs text-muted-foreground">网易云歌单 ID 在链接中：music.163.com/playlist?id=<strong>数字</strong></p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowImport(false)}>取消</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="size-4 animate-spin" />}导入
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add song picker modal */}
      <Dialog open={showAddSong} onOpenChange={(o) => !o && setShowAddSong(false)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>添加歌曲到歌单</DialogTitle>
          </DialogHeader>
          <div>
            <Input placeholder="搜索已有歌曲…" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} className="mb-3" />
            <div className="max-h-[400px] overflow-auto">
              {filteredMusic.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">
                  {allMusic.length === 0 ? '暂无歌曲，请先在音乐管理中添加' : '无匹配结果'}
                </p>
              ) : filteredMusic.map((m: any) => (
                <div key={m.id} className="flex items-center gap-2.5 border-b border-border px-1 py-2">
                  {m.cover_url && <img src={m.cover_url} alt="" className="size-8 shrink-0 rounded-sm object-cover" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">{m.title}</p>
                    <p className="text-[11px] text-muted-foreground">{m.artist}</p>
                  </div>
                  {songIds.has(m.id) ? (
                    <span className="text-[11px] text-muted-foreground">已添加</span>
                  ) : (
                    <Button size="sm" onClick={() => addSongToPlaylist(m.id)}><Plus className="size-4" /></Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除歌单后歌曲不会被删除" />
    </div>
  );
}
