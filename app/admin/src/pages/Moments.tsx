import { Check, CloudUpload, Hash, LocateFixed, MapPin, Search, Pencil, Plus, Trash2, X, Loader2 } from 'lucide-react';

import { useEffect, useState } from 'react';
import { momentsApi, optionsApi, mediaApi, geoApi } from '@/lib/api';
import toast from 'react-hot-toast';
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
import { useI18n } from '@/lib/i18n';
import { usePageBadge } from '@/layouts/DashboardLayout';

export default function MomentsPage() {
  const { t } = useI18n();
  const { setPageBadge } = usePageBadge();
  const [moments, setMoments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ content: '', location: '', mood: '', images: '', visibility: 'public' });
  const [formImages, setFormImages] = useState<string[]>([]);
  const [imgUploading, setImgUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  // Tag management
  const [tags, setTags] = useState<string[]>(['随想', '技术', '生活', '阅读']);
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [editingTag, setEditingTag] = useState<{ old: string; draft: string } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchData(); fetchTags(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try { const r: any = await momentsApi.list(); setMoments(r.data || []); }
    catch { toast.error(t('admin.moments.toast.fetchFailed', '获取失败')); }
    finally { setLoading(false); }
  };

  const fetchTags = async () => {
    try {
      const r: any = await optionsApi.get('moment_tags');
      const val = r.data?.value || r.value || '';
      if (val) setTags(val.split(',').map((t: string) => t.trim()).filter(Boolean));
    } catch {
      // 404 = option not created yet, use defaults already set in state
    }
  };

  const saveTags = async (newTags: string[]) => {
    setTags(newTags);
    try {
      await optionsApi.update('moment_tags', newTags.join(','));
    } catch {
      toast.error(t('admin.moments.toast.saveTagsFailed', '保存标签失败'));
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (!tag || tags.includes(tag)) { setNewTag(''); return; }
    saveTags([...tags, tag]);
    setNewTag('');
    toast.success(t('admin.moments.toast.tagAdded', '已添加标签「{tag}」', { tag }));
  };

  // Inline rename: 用户在胶囊里直接改名后点 ✓ 或回车 / 失焦保存。
  // 空输入 = 删除（保留删除路径，不需要再点别的按钮）。
  const commitTagEdit = (oldName: string, draft: string) => {
    const next = draft.trim();
    if (next === oldName) { setEditingTag(null); return; }
    if (!next) {
      saveTags(tags.filter(t => t !== oldName));
      setEditingTag(null);
      toast.success(t('admin.moments.toast.tagRemoved', '已删除标签「{tag}」', { tag: oldName }));
      return;
    }
    if (tags.some(t => t === next && t !== oldName)) {
      toast.error(t('admin.moments.toast.tagExists', '标签「{tag}」已存在', { tag: next }));
      return;
    }
    saveTags(tags.map(t => (t === oldName ? next : t)));
    setEditingTag(null);
    toast.success(t('admin.moments.toast.tagRenamed', '「{old}」已重命名为「{newName}」', { old: oldName, newName: next }));
  };

  const parseImages = (m: any): string[] => {
    if (!m.images) return [];
    if (Array.isArray(m.images)) return m.images;
    if (typeof m.images === 'string') {
      let str = m.images;
      // Decode base64 from older API payloads that encoded pg arrays this way.
      if (/^[A-Za-z0-9+/]+=*$/.test(str) && !str.startsWith('http') && !str.startsWith('{')) {
        try { str = atob(str); } catch {}
      }
      // PostgreSQL array literal: {url1,url2}
      if (str.startsWith('{') && str.endsWith('}')) {
        const inner = str.slice(1, -1);
        if (!inner) return [];
        return inner.split(',').map((s: string) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
      }
      try { const p = JSON.parse(str); if (Array.isArray(p)) return p; } catch {}
      return str.split(',').map((s: string) => s.trim()).filter((s: string) => s.startsWith('http'));
    }
    return [];
  };

  const openCreate = () => { setEditingId(null); setForm({ content: '', location: '', mood: '', images: '', visibility: 'public' }); setFormImages([]); setIsModalOpen(true); };
  const openEdit = (m: any) => { setEditingId(m.id); const imgs = parseImages(m); setFormImages(imgs); setForm({ content: m.content, location: m.location || '', mood: m.mood || '', images: '', visibility: m.visibility }); setIsModalOpen(true); };

  // 浏览器定位 + 反查地址。统一走后端 /api/v1/location/reverse —— 与前台
  // 说说发布（app/web/components/pages/moments/）共用同一服务端
  // 实现：Mapbox → 高德 → 腾讯三档 fallback，且全部限定到城市/区/省/国家
  // 五级，不返回街道或 POI，保证 admin / 前台写入数据库的 location 粒度
  // 一致（城市名）。
  const fetchCurrentLocation = async () => {
    if (!('geolocation' in navigator)) {
      toast.error(t('admin.moments.toast.geolocationUnsupported', '当前浏览器不支持地理位置 API'));
      return;
    }
    setLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60_000,
        });
      });
      const { latitude: lat, longitude: lng } = position.coords;

      const res: any = await geoApi.reverse(lat, lng);
      const data = res?.data || res || {};
      const resolved = String(data.location || data.city || data.region || data.country || '').trim();

      if (!resolved) {
        toast.error(t('admin.moments.toast.locationNotResolved', '未能识别城市，请手动填写位置'));
        return;
      }

      setForm(prev => ({ ...prev, location: resolved }));
      toast.success(t('admin.moments.toast.locationFetched', '位置已获取'));
    } catch (err: any) {
      let msg = t('admin.moments.toast.locationFailed', '位置获取失败');
      if (err?.code === 1) msg = t('admin.moments.toast.locationDenied', '位置权限被拒绝，请在浏览器/系统设置中允许');
      else if (err?.code === 2) msg = t('admin.moments.toast.locationUnavailable', '位置不可用，请检查 GPS / 网络');
      else if (err?.code === 3) msg = t('admin.moments.toast.locationTimeout', '位置获取超时，请重试');
      toast.error(msg);
    } finally {
      setLocating(false);
    }
  };

  const handleImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setImgUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const r: any = await mediaApi.upload(files[i], 'moments');
        const url = r.url || r.data?.url;
        if (url) setFormImages(prev => [...prev, url]);
      }
    } catch { toast.error(t('admin.common.uploadFailed', '上传失败')); }
    finally { setImgUploading(false); e.target.value = ''; }
  };

  const removeFormImage = (idx: number) => setFormImages(prev => prev.filter((_, i) => i !== idx));

  const onSubmit = async () => {
    if (!form.content.trim()) { toast.error(t('admin.moments.toast.contentRequired', '内容不能为空')); return; }
    setSubmitting(true);
    const payload: any = { ...form, images: formImages.length > 0 ? formImages : [] };
    if (!editingId) payload.source = '网页';
    try {
      if (editingId) { await momentsApi.update(editingId, payload); toast.success(t('admin.common.updateSuccess', '更新成功')); }
      else { await momentsApi.create(payload); toast.success(t('admin.moments.toast.published', '发布成功')); }
      setIsModalOpen(false); fetchData();
    } catch { toast.error(t('admin.common.operationFailed', '操作失败')); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await momentsApi.delete(deleteId); toast.success(t('admin.posts.toast.deleteSuccess', '删除成功')); fetchData(); }
    catch { toast.error(t('admin.posts.toast.deleteFailed', '删除失败')); }
    finally { setDeleteId(null); }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  };

  // Search filter — content / location / mood (关键词) 三字段命中即显示
  const searchTerm = search.trim().toLowerCase();
  const filteredMoments = searchTerm
    ? moments.filter((m: any) => {
        const haystack = [m.content, m.location, m.mood]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      })
    : moments;

  // Push count badge into the global header (next to "说说管理 · Moments")
  useEffect(() => {
    setPageBadge(
      <span>
        {searchTerm
          ? t('admin.moments.totalFiltered', '共 {count} 条说说 · 命中 {matched} 条', { count: moments.length, matched: filteredMoments.length })
          : t('admin.moments.total', '共 {count} 条说说', { count: moments.length })}
      </span>
    );
    return () => setPageBadge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moments.length, filteredMoments.length, searchTerm, t]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Left: 关键词 + 发布（正方形 icon-only） */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={showTagManager ? 'default' : 'outline'}
            size="icon"
            title={t('admin.posts.columns.keywords', '关键词')}
            aria-label={t('admin.posts.columns.keywords', '关键词')}
            onClick={() => setShowTagManager(!showTagManager)}
          >
            <Hash className="size-4" />
          </Button>
          <Button
            size="icon"
            title={t('admin.moments.publish', '发布')}
            aria-label={t('admin.moments.publish', '发布')}
            onClick={openCreate}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        {/* Right: 搜索框 + 🔍 + ✕ */}
        <div className="ml-auto flex items-center gap-1.5">
          <Input
            placeholder={t('admin.moments.searchPlaceholder', '检索内容 / 位置 / 关键词')}
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button
            variant="outline"
            size="icon"
            title={t('common.search', '搜索')}
            aria-label={t('common.search', '搜索')}
            onClick={() => { /* 即时搜索：按钮仅作视觉锚点 */ }}
          >
            <Search className="size-4" />
          </Button>
          {search && (
            <Button
              variant="outline"
              size="icon"
              title={t('admin.common.clear', '清空')}
              aria-label={t('admin.common.clear', '清空')}
              onClick={() => setSearch('')}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tag Manager */}
      {showTagManager && (
        <div className="mb-4 rounded-lg border border-border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-foreground">{t('admin.moments.tagManagerTitle', '说说关键词管理')}</h3>
          <p className="mb-4 text-xs text-muted-foreground">{t('admin.moments.tagManagerHint', '管理前台说说发布时可选的关键词标签，发布后显示在卡片右上角')}</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {tags.map(tag => {
              const isEditing = editingTag?.old === tag;
              const draft = isEditing ? editingTag!.draft : tag;
              return (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] text-muted-foreground transition-colors',
                    isEditing ? 'border-primary bg-card' : 'border-border bg-muted',
                  )}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={e => setEditingTag({ old: tag, draft: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitTagEdit(tag, draft); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditingTag(null); }
                      }}
                      onFocus={e => e.currentTarget.select()}
                      onBlur={() => commitTagEdit(tag, draft)}
                      className="border-none bg-transparent p-0 text-[13px] text-foreground outline-none"
                      // 让宽度跟着内容长度走（中英混排粗略按 1ch ≈ 1 字符宽估算）
                      style={{ width: `${Math.max(2, draft.length) + 1}ch`, fontFamily: 'inherit' }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingTag({ old: tag, draft: tag })}
                      title={t('admin.common.edit', '编辑')}
                      className="cursor-text border-none bg-transparent p-0 font-[inherit] text-inherit"
                    >
                      {tag}
                    </button>
                  )}
                  <button
                    type="button"
                    // 防止 mousedown 把 input blur 掉造成双触发；click 时显式提交
                    onMouseDown={e => { if (isEditing) e.preventDefault(); }}
                    onClick={() => {
                      if (isEditing) commitTagEdit(tag, draft);
                      else setEditingTag({ old: tag, draft: tag });
                    }}
                    title={isEditing ? t('admin.common.confirm', '确认') : t('admin.common.edit', '编辑')}
                    aria-label={isEditing ? t('admin.common.confirm', '确认') : t('admin.common.edit', '编辑')}
                    className={cn('flex cursor-pointer border-none bg-transparent p-0', isEditing ? 'text-primary' : 'text-muted-foreground')}
                  >
                    <Check className="size-4" />
                  </button>
                </span>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder={t('admin.moments.newTagPlaceholder', '输入新关键词')}
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              className="w-[180px]"
            />
            <Button variant="outline" onClick={addTag}>{t('admin.common.add', '添加')}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label={t('common.loading', '加载中…')} />
      ) : moments.length === 0 ? (
        <EmptyState title={t('admin.moments.empty', '还没有说说')} actionText={t('admin.moments.first', '发第一条')} onAction={openCreate} />
      ) : filteredMoments.length === 0 ? (
        <EmptyState title={t('admin.moments.noMatch', '没有匹配 "{q}" 的说说', { q: search })} />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredMoments.map((m) => (
            <div key={m.id} className="rounded-lg border border-border bg-card px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.content}</p>
                  {parseImages(m).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parseImages(m).map((url: string, idx: number) => (
                        <img key={idx} src={url} alt="" className="size-14 rounded border border-border object-cover" />
                      ))}
                    </div>
                  )}
                  <div className="mt-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatTime(m.created_at)}</span>
                    {m.location && <><span>&middot;</span><MapPin className="size-4" /><span>{m.location}</span></>}
                    {m.mood && (
                      <>
                        <span>&middot;</span>
                        <span className="rounded bg-muted px-2 py-px text-[11px] font-medium text-primary">{m.mood}</span>
                      </>
                    )}
                    {m.visibility !== 'public' && <><span>&middot;</span><span>{m.visibility === 'private' ? t('admin.moments.visibility.private', '仅自己') : t('admin.moments.visibility.unlisted', '不公开')}</span></>}
                  </div>
                </div>
                <div className="ml-3 flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(m)} title={t('admin.common.edit', '编辑')}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(m.id)} title={t('admin.common.delete', '删除')}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(o) => !o && setIsModalOpen(false)}>
        <DialogContent className="max-h-[calc(100vh-32px)] max-w-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('admin.moments.editMoment', '编辑说说') : t('admin.moments.publishMoment', '发布说说')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <Textarea rows={5} placeholder={t('admin.moments.contentPlaceholder', '说点什么…')} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="resize-y" />

            {/* Image upload */}
            <div>
              <Label className="mb-1.5 block">{t('admin.moments.imageAttachments', '图片附件')}</Label>
              {formImages.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {formImages.map((url, idx) => (
                    <div key={idx} className="relative size-16 overflow-hidden rounded border border-border">
                      <img src={url} alt="" className="size-full object-cover" />
                      <button onClick={() => removeFormImage(idx)} className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-black/50 text-white">
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-md border border-input bg-background transition-colors hover:bg-accent',
                  imgUploading ? 'cursor-wait opacity-60' : 'cursor-pointer',
                )}
                title={imgUploading ? t('admin.cover.uploading', '上传中…') : t('admin.cover.uploadImage', '上传图片')}
              >
                {imgUploading ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleImgUpload} disabled={imgUploading} />
              </label>
            </div>

            {/* Tag selector */}
            <div>
              <Label className="mb-1.5 block">{t('admin.posts.columns.keywords', '关键词')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setForm({ ...form, mood: form.mood === tag ? '' : tag })}
                    className={cn(
                      'rounded-md border px-3 py-1 text-xs transition-colors',
                      form.mood === tag ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                    )}
                  >
                    {tag}
                  </button>
                ))}
                <Input
                  placeholder={t('admin.posts.permalinkCustom', '自定义')}
                  value={tags.includes(form.mood) ? '' : form.mood}
                  onChange={e => setForm({ ...form, mood: e.target.value })}
                  className="h-8 w-20 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                placeholder={t('admin.moments.locationPlaceholder', '位置（可选 / 点右侧定位获取）')}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title={t('admin.moments.fetchLocation', '获取当前位置')}
                aria-label={t('admin.moments.fetchLocation', '获取当前位置')}
                onClick={fetchCurrentLocation}
                disabled={locating}
              >
                {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
              </Button>
            </div>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v as string })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{t('admin.moments.visibility.public', '公开')}</SelectItem>
                <SelectItem value="unlisted">{t('admin.moments.visibility.unlisted', '不公开')}</SelectItem>
                <SelectItem value="private">{t('admin.moments.visibility.private', '仅自己')}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>{t('admin.common.cancel', '取消')}</Button>
              <Button onClick={onSubmit} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}{editingId ? t('admin.common.save', '保存') : t('admin.moments.publish', '发布')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} onConfirm={handleDelete} title={t('admin.posts.confirmDeleteTitle', '确认删除')} message={t('admin.common.deleteIrreversible', '删除后无法恢复')} />
    </div>
  );
}
