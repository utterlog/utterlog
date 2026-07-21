
import { useEffect, useState } from 'react';
import { musicApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Search, Link2, Plus, Music as MusicIcon, Eye, EyeOff, Pencil, Trash2, Loader2 } from 'lucide-react';
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
import { CoverInput, RatingStars } from '@/components/ui';
import { ImportUrlModal } from '@/components/ui/import-url-modal';
import { cn } from '@/lib/utils';

function musicProxy(platform: string, id: string, asset: 'cover' | 'stream') {
  return `/api/v1/music/proxy/${encodeURIComponent(platform)}/songs/${encodeURIComponent(id)}/${asset}`;
}

export default function MusicPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await musicApi.list(); setItems(r.data || []); }
    catch { toast.error('获取失败'); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditingId(null); setForm({ title: '', cover_url: '', rating: 0, comment: '', status: 'publish' }); setIsModalOpen(true); };
  const openEdit = (item: any) => { setEditingId(item.id); setForm({ ...item }); setIsModalOpen(true); };

  const onSubmit = async () => {
    if (!form.title?.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      if (editingId) { await musicApi.update(editingId, form); toast.success('更新成功'); }
      else { await musicApi.create(form); toast.success('添加成功'); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error('操作失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await musicApi.delete(deleteId); toast.success('删除成功'); fetchData(); }
    catch { toast.error('删除失败'); }
    finally { setDeleteId(null); }
  };

  const toggleVisibility = async (item: any) => {
    const newStatus = item.status === 'publish' ? 'draft' : 'publish';
    try {
      await musicApi.update(item.id, { ...item, status: newStatus });
      toast.success(newStatus === 'publish' ? '已显示' : '已隐藏');
      fetchData();
    } catch { toast.error('操作失败'); }
  };

  // Search music through the Bun app proxy.
  const [searchPlatform, setSearchPlatform] = useState('netease');
  const doSearch = async () => {
    if (!keyword.trim()) return;
    setSearching(true);
    setSearchResults([]);
    const kw = encodeURIComponent(keyword);
    try {
      const resp = await fetch(`/api/v1/music/search?platform=${encodeURIComponent(searchPlatform)}&q=${kw}&page=1&limit=20`);
      const json = await resp.json();
      const data = json.data || json;
      const items = data.items || data.songs || [];
      setSearchResults(items.map((d: any) => ({
        ...d,
        _src: { netease: '网易云', kugou: '酷狗', kuwo: '酷我', tencent: 'QQ音乐' }[searchPlatform] || searchPlatform,
        _platform: searchPlatform,
      })));
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const addFromSearch = async (item: any) => {
    const key = item.id;
    setAdding(key);
    try {
      await musicApi.create({
        title: item.name || item.title,
        artist: item.artist || (item.artists || []).join(', '),
        album: item.album || '',
        platform: item._platform || 'netease',
        platform_id: String(item.id),
        cover_url: musicProxy(item._platform || 'netease', String(item.id), 'cover'),
        play_url: musicProxy(item._platform || 'netease', String(item.id), 'stream'),
        status: 'publish',
      });
      toast.success(`已添加：${item.name || item.title}`);
      fetchData();
    } catch { toast.error('添加失败'); }
    setAdding(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="mr-auto text-sm text-muted-foreground">{items.length} 首歌曲</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowSearch(!showSearch)}>
            <Search className="size-4" />{showSearch ? '关闭搜索' : '搜索添加'}
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Link2 className="size-4" /> 链接导入
          </Button>
          <Button onClick={openCreate}><Plus className="size-4" />手动添加</Button>
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex gap-2">
            <Select value={searchPlatform} onValueChange={(v) => setSearchPlatform((v as string) || 'netease')}>
              <SelectTrigger className="w-[100px] shrink-0 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="netease">网易云</SelectItem>
                <SelectItem value="tencent">QQ音乐</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doSearch()}
                placeholder="搜索歌曲名或歌手…"
                className="pl-8"
              />
            </div>
            <Button size="icon" title="搜索" onClick={doSearch} disabled={searching}>
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="max-h-[300px] overflow-auto">
              {searchResults.slice(0, 20).map((r: any, i: number) => {
                const key = String(r.id);
                const exists = items.some((it: any) => it.platform_id === key);
                return (
                  <div key={i} className="flex items-center gap-2.5 border-b border-border p-2">
                    {r.cover && (
                      <img src={r.cover} alt="" className="size-9 shrink-0 object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">{r.name || r.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {r.artist || (r.artists || []).join(', ')}
                        {r.album && <span> · {r.album}</span>}
                        <span className="ml-1.5 rounded-sm bg-muted px-1 text-[10px]">{r._src}</span>
                      </p>
                    </div>
                    {exists ? (
                      <span className="text-xs text-muted-foreground">已添加</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => addFromSearch(r)} disabled={adding === key}>
                        {adding === key ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}添加
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {searchResults.length === 0 && keyword && !searching && (
            <p className="py-4 text-center text-[13px] text-muted-foreground">无搜索结果</p>
          )}
        </div>
      )}

      {/* Music list */}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="暂无内容" actionText="搜索添加" onAction={() => setShowSearch(true)} />
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-opacity',
                item.status === 'draft' && 'opacity-50',
              )}
            >
              {/* Cover */}
              <div className="h-[200px] w-full shrink-0 overflow-hidden bg-muted">
                {item.cover_url ? (
                  <img src={item.cover_url} alt={item.title} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <MusicIcon className="size-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="flex-1 p-3">
                <h3 className="mb-0.5 truncate text-sm font-semibold text-foreground">{item.title}</h3>
                <p className="truncate text-xs text-muted-foreground">{item.artist || ''}</p>
                {item.rating > 0 && (
                  <div className="mt-1.5">
                    <RatingStars value={item.rating} size={12} gap={2} />
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2">
                <span className="rounded-sm bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                  {{ netease: '网易云', tencent: 'QQ', kugou: '酷狗', kuwo: '酷我', baidu: '百度', local: '本地' }[item.platform as string] || item.platform || '本地'}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => toggleVisibility(item)} title={item.status === 'publish' ? '隐藏' : '显示'}>
                    {item.status === 'publish' ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(item)} title="编辑"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(item.id)} title="删除"><Trash2 className="size-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(o) => !o && setIsModalOpen(false)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑' : '添加音乐'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label>标题</Label>
              <Input value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>艺术家</Label>
              <Input value={form.artist || ''} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>专辑</Label>
              <Input value={form.album || ''} onChange={(e) => setForm({ ...form, album: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>来源平台</Label>
              <Select value={form.platform || 'netease'} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="netease">网易云音乐</SelectItem>
                  <SelectItem value="tencent">QQ音乐</SelectItem>
                  <SelectItem value="kugou">酷狗音乐</SelectItem>
                  <SelectItem value="kuwo">酷我音乐</SelectItem>
                  <SelectItem value="local">本地</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>平台歌曲 ID</Label>
              <Input value={form.platform_id || ''} onChange={(e) => setForm({ ...form, platform_id: e.target.value })} placeholder="可选，用于获取歌词和封面" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>播放链接</Label>
              <Input value={form.play_url || ''} onChange={(e) => setForm({ ...form, play_url: e.target.value })} placeholder="直接音频链接（可选）" />
            </div>
            <CoverInput label="封面图片" value={form.cover_url || ''} onChange={(url) => setForm({ ...form, cover_url: url })} folder="music" />
            <div className="flex flex-col gap-1.5">
              <Label>状态</Label>
              <Select value={form.status || 'publish'} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="publish">显示</SelectItem>
                  <SelectItem value="draft">隐藏</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>评分</Label>
              <RatingStars value={form.rating || 0} onChange={(v) => setForm({ ...form, rating: v })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>评价</Label>
              <Textarea rows={3} value={form.comment || ''} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>取消</Button>
              <Button onClick={onSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}{editingId ? '保存' : '添加'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title="确认删除" message="删除后无法恢复" />

      <ImportUrlModal isOpen={showImport} onClose={() => setShowImport(false)} type="music" onImport={(data) => {
        setForm({
          title: data.title || '', artist: data.artist || '', album: data.album || '',
          cover_url: data.cover_url || '', rating: Math.round(data.rating || 0),
          platform: data.platform || '', platform_id: '', play_url: data.url || '',
          comment: data.summary || '', status: 'publish',
        });
        setEditingId(null);
        setIsModalOpen(true);
      }} />
    </div>
  );
}
