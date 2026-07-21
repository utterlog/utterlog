
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from '@/lib/router';
import { postsApi, categoriesApi, mediaApi, optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Button, Input, Textarea, Label, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/shadcn';
import {
  Sparkles, Loader2, CloudUpload, X, PenLine,
  WandSparkles, UserRound, Smile, Shrink, Expand, AlignLeft, Search, Code, ListTree,
} from 'lucide-react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { firstMarkdownH1, resolveMarkdownTitle } from '@/lib/markdown';

import MarkdownEditor from '@/components/editor/MarkdownEditor';
import { adminDateYMDHM } from '@/lib/timezone';
import FootprintEditor, { type FootprintFormValue, normalizeFootprintsForPayload } from '@/components/FootprintEditor';
import VideoFormSection from '@/components/VideoFormSection';

export default function CreatePostPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // /films/create 路由或 ?type=video 都视为新建影视
  const initialType = useMemo(() => {
    if (location.pathname.startsWith('/films')) return 'video';
    if (searchParams.get('type') === 'video') return 'video';
    return 'post';
  }, [location.pathname, searchParams]);
  const [postType] = useState<string>(initialType);
  const [videoData, setVideoData] = useState<{ meta: any; episodes: any[] }>({ meta: {}, episodes: [] });
  const backTarget = postType === 'video' ? '/films' : '/posts';
  const [submitting, setSubmitting] = useState(false);
  const mdFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [slug, setSlug] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState<'draft' | 'publish' | 'private' | 'pending'>('publish');
  const [publishAt, setPublishAt] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [password, setPassword] = useState('');
  const [allowComment, setAllowComment] = useState(true);
  const [allowRss, setAllowRss] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [footprintsEnabled, setFootprintsEnabled] = useState(false);
  const [footprints, setFootprints] = useState<FootprintFormValue[]>([]);
  const [coverUploading, setCoverUploading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [slugLoading, setSlugLoading] = useState(false);
  const [excerptLoading, setExcerptLoading] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [coverAiLoading, setCoverAiLoading] = useState(false);
  const [insertType, setInsertType] = useState<string | null>(null);
  const [insertItems, setInsertItems] = useState<any[]>([]);
  const [insertLoading, setInsertLoading] = useState(false);

  const [categories, setCategories] = useState<any[]>([]);

  // AI feature flags from options
  const [aiFlags, setAiFlags] = useState({ summary: false, image: false, slug: false, keywords: false, polish: false });

  // Auto-restore from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('draft_post');
    if (saved) {
      try {
        const d = JSON.parse(saved);
        if (d.title) setTitle(d.title);
        if (d.content) setContent(d.content);
        if (d.slug) setSlug(d.slug);
        if (d.coverUrl) setCoverUrl(d.coverUrl);
        if (d.categoryId) setCategoryId(d.categoryId);
        if (d.tagInput) setTagInput(d.tagInput);
        if (d.excerpt) setExcerpt(d.excerpt);
        if (Array.isArray(d.footprints)) setFootprints(d.footprints);
        if (d.footprintsEnabled) setFootprintsEnabled(true);
      } catch {}
    }
    categoriesApi.list().then((r: any) => setCategories(r.data || [])).catch(() => {});
    optionsApi.list().then((r: any) => {
      const o = r.data || r || {};
      setAiFlags({ summary: o.ai_summary_auto === 'true', image: o.ai_image_auto === 'true', slug: o.ai_slug_auto === 'true', keywords: o.ai_keywords_auto === 'true', polish: o.ai_polish_auto === 'true' });
    }).catch(() => {});
    // 默认发布时间填"现在"，按 site_timezone 渲染（远程站长 / 跨时区
     // admin 都能看到跟站点一致的时间）。
    setPublishAt(adminDateYMDHM(new Date()));
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      if (title || content) {
        localStorage.setItem('draft_post', JSON.stringify({ title, content, slug, coverUrl, categoryId, tagInput, excerpt, footprintsEnabled, footprints }));
      }
    }, 1000); // debounce 1s
    return () => clearTimeout(timer);
  }, [title, content, slug, coverUrl, categoryId, tagInput, excerpt, footprintsEnabled, footprints]);

  const handleSave = async (saveStatus?: string) => {
    const resolved = resolveMarkdownTitle(title, content);
    if (!resolved.title.trim()) { toast.error(t('admin.postEditor.toast.titleRequired', '标题不能为空')); return; }
    if (resolved.title !== title) setTitle(resolved.title);
    if (resolved.content !== content) setContent(resolved.content);
    setSubmitting(true);
    try {
      const tagNames = tagInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      const nextStatus = saveStatus || status;
      const payload: any = {
        title: resolved.title.trim(), content: resolved.content,
        slug: slug || undefined,
        cover_url: coverUrl || undefined,
        category_ids: categoryId ? [categoryId] : [],
        tag_names: tagNames.length ? tagNames : undefined,
        status: nextStatus,
        excerpt: excerpt || undefined,
        password: password || undefined,
        allow_comment: allowComment,
        pinned,
        footprints: footprintsEnabled ? normalizeFootprintsForPayload(footprints, coverUrl, publishAt) : [],
      };
      if (postType !== 'post') {
        payload.type = postType;
      }
      if (postType === 'video') {
        payload.meta = videoData.meta;
        payload.episodes = videoData.episodes;
      }
      if (nextStatus === 'publish' && publishAt) {
        payload.published_at = publishAt;
      }
      await postsApi.create(payload);
      localStorage.removeItem('draft_post');
      toast.success(t('admin.postEditor.toast.created', postType === 'video' ? '影视创建成功' : '文章创建成功'));
      navigate(backTarget);
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err?.message
        || t('admin.common.createFailed', '创建失败');
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  // Upload .md file
  const handleMdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
      // Extract title from first # heading or filename
      const h1 = firstMarkdownH1(text);
      if (h1 && !title.trim()) {
        setTitle(h1.title);
        setContent(h1.content);
      } else {
        if (!title.trim()) setTitle(file.name.replace(/\.(md|markdown|txt)$/i, ''));
        setContent(text.trim());
      }
      toast.success(t('admin.postEditor.toast.markdownImported', 'Markdown 文件已导入'));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Upload cover image
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const r: any = await mediaApi.upload(file, 'covers');
      const url = r.url || r.data?.url;
      if (url) { setCoverUrl(url); toast.success(t('admin.postEditor.toast.coverUploaded', '封面已上传')); }
    } catch { toast.error(t('admin.common.uploadFailed', '上传失败')); }
    finally { setCoverUploading(false); e.target.value = ''; }
  };

  return (
    <>
      {/* Main layout */}
      <div className="flex h-[calc(100vh-80px)] gap-0">
        {/* Editor area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border border-r-0 border-border">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('admin.postEditor.titlePlaceholder', '在此输入标题…')}
            className="border-0 border-b border-border bg-transparent px-5 py-3.5 text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          <input ref={mdFileRef} type="file" accept=".md,.markdown,.txt" className="hidden" onChange={handleMdUpload} />
          {/* Editor —— 影视模式上方先渲染元数据 + 剧集，下方留 Markdown 编辑器写简介 */}
          {postType === 'video' ? (
            <div className="flex-1 overflow-auto bg-muted p-4">
              <VideoFormSection
                onChange={setVideoData}
                onImportedExtras={(ex) => {
                  if (ex.coverUrl && !coverUrl) setCoverUrl(ex.coverUrl);
                  if (ex.title && !title.trim()) setTitle(ex.title);
                  if (ex.summary && !excerpt) setExcerpt(ex.summary);
                }}
              />
              <div className="mb-2 mt-1 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <PenLine className="size-3.5" />
                影视简介 / 剧情（Markdown）
              </div>
              <div className="border border-border bg-card">
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  minHeight="360px"
                  onImportMd={() => mdFileRef.current?.click()}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <MarkdownEditor
                value={content}
                onChange={(val) => {
                  if (!title.trim()) {
                    const resolved = resolveMarkdownTitle(title, val);
                    if (resolved.title) {
                      setTitle(resolved.title);
                      setContent(resolved.content);
                      return;
                    }
                  }
                  setContent(val);
                }}
                className="h-full rounded-none border-0"
                minHeight="100%"
                onImportMd={() => mdFileRef.current?.click()}
                onInsertContent={async (type) => {
                  setInsertType(type);
                  setInsertLoading(true);
                  setInsertItems([]);
                  try {
                    const endpoint = type === '音乐' ? '/music' : type === '图书' ? '/books' : type === '电影' ? '/movies' : '/moments';
                    const r: any = await api.get(endpoint, { params: { per_page: 500 } });
                    setInsertItems(r.data || []);
                  } catch {}
                  setInsertLoading(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-[280px] shrink-0 overflow-x-hidden overflow-y-auto border border-border bg-card">
          {/* Publish */}
          <div className="border-b border-border p-4">
            <div className="mb-2 flex gap-1.5">
              <Button className="min-w-0 flex-1 px-2" disabled={submitting} onClick={() => handleSave('publish')}>
                {t('admin.postEditor.publish', '发布')}
              </Button>
              <Button variant="outline" className="min-w-0 flex-1 px-2" disabled={submitting} onClick={() => handleSave('draft')}>
                {t('admin.common.save', '保存')}
              </Button>
              <Button variant="outline" className="min-w-0 flex-1 px-2" onClick={() => navigate(backTarget)}>
                {t('admin.common.back', '返回')}
              </Button>
            </div>
            {aiFlags.polish && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                onClick={() => setShowAiModal(true)}
              >
                <Sparkles className="size-3.5" /> {t('admin.postEditor.aiProcessArticle', 'AI 处理文章')}
              </Button>
            )}
          </div>

          {/* Settings */}
          <div className="border-b border-border p-4">
            <h3 className="mb-3.5 text-[13px] font-semibold text-foreground">{t('admin.postEditor.settings', '设置')}</h3>
            <div className="flex flex-col gap-3.5">
              {/* Cover */}
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('admin.postEditor.coverUrl', '自定义封面图 URL')}</Label>
                {coverUrl && (
                  <div className="relative mb-1.5">
                    <img src={coverUrl} alt="" className="h-20 w-full border border-border object-cover" />
                    <button
                      onClick={() => setCoverUrl('')}
                      className="absolute right-1 top-1 flex size-[18px] items-center justify-center rounded bg-black/50 text-white"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-stretch gap-1.5">
                  <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder={t('admin.postEditor.coverPlaceholder', '留空自动回退为正文首图')} className="h-9 flex-1 text-xs" />
                  {aiFlags.image && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0"
                      title={t('admin.postEditor.aiGenerateCover', 'AI 生成封面')}
                      disabled={coverAiLoading}
                      onClick={async () => {
                        if (!title) { toast.error(t('admin.postEditor.toast.fillTitleFirst', '请先填写标题')); return; }
                        setCoverAiLoading(true);
                        // Surface real backend error — same change as PostEdit.tsx.
                        try {
                          const r: any = await api.post('/ai/cover', { title, content: content.slice(0, 500) });
                          const url = r.data?.url || r.url;
                          if (url) { setCoverUrl(url); toast.success(t('admin.postEditor.toast.coverGenerated', '封面已生成')); }
                          else toast.error(t('admin.postEditor.toast.noCoverUrl', '生成失败：响应中没有 url'));
                        } catch (err: any) {
                          const detail = err?.response?.data?.error?.message
                                      || err?.response?.data?.message
                                      || err?.message
                                      || t('admin.postEditor.toast.checkAiProvider', '请检查 AI 设置 → 提供商');
                          toast.error(t('admin.postEditor.toast.aiCoverFailed', 'AI 生成封面失败：{reason}', { reason: detail }));
                        }
                        setCoverAiLoading(false);
                      }}
                    >
                      {coverAiLoading
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <Sparkles className="size-3.5" />}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={() => coverFileRef.current?.click()}
                    title={coverUploading ? t('admin.media.uploading', '上传中…') : t('admin.postEditor.uploadCover', '上传封面')}
                  >
                    {coverUploading
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <CloudUpload className="size-3.5" />}
                  </Button>
                  <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {t('admin.postEditor.coverHint', '如果这里有值，封面优先使用它；为空时自动回退到正文首图。')}
                </p>
              </div>

              {/* Slug */}
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('admin.postEditor.slug', '别名 (Slug)')}</Label>
                <div className="flex gap-1.5">
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('admin.postEditor.slugPlaceholder', '留空自动分配唯一数字')} className="h-9 flex-1 text-xs" />
                  {aiFlags.slug && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1 px-2 text-[11px]"
                    disabled={slugLoading}
                    onClick={async () => {
                      if (!title) return;
                      setSlugLoading(true);
                      try {
                        const r: any = await api.post('/ai/slug', { title, content });
                        if (r.success && r.data?.slug) { setSlug(r.data.slug); toast.success(t('admin.postEditor.toast.slugGenerated', 'Slug 已生成')); }
                      } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setSlugLoading(false);
                    }}
                  >
                    {slugLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />} AI
                  </Button>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('admin.postEditor.category', '分类')}</Label>
                <Select value={String(categoryId)} onValueChange={(v) => setCategoryId(v ? Number(v) : '')}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('admin.postEditor.uncategorized', '未分类')}</SelectItem>
                    {categories.map((cat) => (<SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">{t('admin.postEditor.tagsComma', '标签 (逗号分隔)')}</Label>
                  {aiFlags.keywords && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={tagsLoading}
                    className="h-auto gap-1 p-0 text-[11px] text-primary hover:bg-transparent hover:text-primary/80"
                    onClick={async () => {
                      if (!title && !content) { toast.error(t('admin.postEditor.toast.fillTitleOrContentFirst', '请先填写标题或内容')); return; }
                      setTagsLoading(true);
                      try {
                        const r: any = await api.post('/ai/tags', { title, content: content.slice(0, 1000) });
                        if (r.data?.tags) {
                          const tags = Array.isArray(r.data.tags) ? r.data.tags.join(', ') : r.data.tags;
                          setTagInput(tags);
                          toast.success(t('admin.postEditor.toast.tagsGenerated', '标签已生成'));
                        }
                      } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setTagsLoading(false);
                    }}
                  >
                    {tagsLoading ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />} {t('admin.postEditor.aiExtract', 'AI 提取')}
                  </Button>
                  )}
                </div>
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder={t('admin.postEditor.tagsPlaceholder', 'Tag1, Tag2（默认提取 3 个关键词）')} className="h-9 text-xs" />
              </div>

              {/* Publish time */}
              <div>
                <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('admin.postEditor.publishTime', '发布时间')}</Label>
                <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="h-9 text-xs" />
              </div>

              <FootprintEditor
                enabled={footprintsEnabled}
                onEnabledChange={setFootprintsEnabled}
                value={footprints}
                onChange={setFootprints}
                defaultDate={publishAt}
                fallbackCoverUrl={coverUrl}
              />
            </div>
          </div>

          {/* Advanced */}
          <div className="border-b border-border p-4">
            <h3 className="mb-3.5 text-[13px] font-semibold text-foreground">{t('admin.postEditor.advanced', '高级')}</h3>
            <div className="flex flex-col gap-3.5">
              {/* Excerpt */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">{t('admin.postEditor.excerpt', '摘要')}</Label>
                  {aiFlags.summary && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={excerptLoading}
                    className="h-auto gap-1 p-0 text-[11px] text-primary hover:bg-transparent hover:text-primary/80"
                    onClick={async () => {
                      if (!content) { toast.error(t('admin.postEditor.toast.fillContentFirst', '请先填写内容')); return; }
                      setExcerptLoading(true);
                      try {
                        const r: any = await api.post('/ai/summary', { title, content });
                        if (r.success && r.data?.summary) { setExcerpt(r.data.summary); toast.success(t('admin.postEditor.toast.excerptGenerated', '摘要已生成')); }
                      } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setExcerptLoading(false);
                    }}
                  >
                    {excerptLoading ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />} {t('admin.postEditor.aiGenerate', 'AI 生成')}
                  </Button>
                  )}
                </div>
                <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder={t('admin.postEditor.excerptPlaceholder', '留空自动截取')} rows={3} className="resize-y text-xs" />
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="allowComment" className="cursor-pointer text-xs font-normal text-foreground">{t('admin.postEditor.allowComments', '允许评论')}</Label>
                  <Switch id="allowComment" checked={allowComment} onCheckedChange={setAllowComment} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="allowRss" className="cursor-pointer text-xs font-normal text-foreground">{t('admin.postEditor.allowRss', '允许本文出现在 RSS 聚合')}</Label>
                  <Switch id="allowRss" checked={allowRss} onCheckedChange={setAllowRss} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pinned" className="cursor-pointer text-xs font-normal text-foreground">{t('admin.postEditor.pinned', '置顶文章')}</Label>
                  <Switch id="pinned" checked={pinned} onCheckedChange={setPinned} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="privatePost" className="cursor-pointer text-xs font-normal text-foreground">{t('admin.postEditor.privatePost', '私密文章')}</Label>
                  <Switch id="privatePost" checked={status === 'private'} onCheckedChange={(v) => setStatus(v ? 'private' : 'publish')} />
                </div>
                {status === 'private' && (
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('admin.postEditor.passwordPlaceholder', '输入访问密码')} className="h-9 text-xs" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Insert Modal */}
      <Dialog open={!!insertType} onOpenChange={(o) => !o && setInsertType(null)}>
        <DialogContent className="flex max-h-[70vh] w-[500px] max-w-[90vw] flex-col gap-0 p-0">
          <DialogHeader className="border-b border-border px-5 py-3.5">
            <DialogTitle className="text-sm">
              {t('admin.postEditor.insertType', '插入{type}', { type: insertType ?? '' })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto px-5 py-3">
            {insertLoading && <p className="py-5 text-center text-[13px] text-muted-foreground">{t('admin.common.loading', '加载中…')}</p>}
            {!insertLoading && insertItems.length === 0 && (
              <p className="py-5 text-center text-[13px] text-muted-foreground">
                {t('admin.postEditor.noInsertData', '暂无{type}数据，请先在对应页面添加', { type: insertType ?? '' })}
              </p>
            )}
            {insertItems.map((item: any) => (
              <div
                key={item.id}
                onClick={() => {
                  let md = '';
                  if (insertType === '音乐') {
                    md = '\n[music platform="' + (item.platform || 'netease') + '" id="' + (item.platform_id || item.id || '') + '" title="' + (item.title || '') + '" artist="' + (item.artist || '') + '" cover="' + (item.cover_url || '') + '"][/music]\n';
                  } else if (insertType === '图书') {
                    md = '\n> **' + (item.title || '') + '**' + (item.author ? ' - ' + item.author : '') + (item.rating ? ' ' + item.rating + '/5' : '') + (item.comment ? '\n> ' + item.comment : '') + '\n';
                  } else if (insertType === '电影') {
                    md = '\n> **' + (item.title || '') + '**' + (item.rating ? ' ' + item.rating + '/5' : '') + (item.comment ? '\n> ' + item.comment : '') + '\n';
                  } else if (insertType === '说说') {
                    md = '\n[moment id="' + item.id + '"][/moment]\n';
                  }
                  if (md) {
                    setContent(content + md);
                  }
                  setInsertType(null);
                  toast.success(t('admin.postEditor.toast.insertedType', '已插入{type}', { type: insertType ?? '' }));
                }}
                className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors hover:bg-muted"
              >
                {(item.cover_url || item.image) && (
                  <img src={item.cover_url || item.image} alt="" className="size-10 shrink-0 object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium">
                    {item.title || item.content?.slice(0, 50)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {item.artist || item.author || item.platform || ''}
                    {item.rating ? ` · ${t('admin.postEditor.ratingValue', '{rating}分', { rating: item.rating })}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-primary">{t('admin.postEditor.insert', '插入')}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Processing Modal */}
      <Dialog open={showAiModal} onOpenChange={(o) => { if (!o && !aiProcessing) setShowAiModal(false); }}>
        <DialogContent className="flex max-h-[80vh] w-[560px] max-w-[90vw] flex-col gap-0 p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-1.5 text-[15px]">
              <Sparkles className="size-4" /> {t('admin.postEditor.aiProcessArticle', 'AI 处理文章')}
            </DialogTitle>
          </DialogHeader>

          <div className="border-b border-border px-5 py-4">
            <p className="mb-3 text-xs text-muted-foreground">{t('admin.postEditor.aiProcessHint', '选择 AI 处理方式，处理完成后可预览并插入到编辑器')}</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'polish', label: t('admin.postEditor.aiAction.polish', '润色优化'), icon: WandSparkles, prompt: 'Proofread and lightly polish this Markdown article. Preserve facts, meaning, tone, language, code blocks, links, images, front matter, technical terms, and version numbers. Fix only clear grammar, spelling, punctuation, spacing, and structure issues. Do not add or remove information. Output only the complete Markdown:' },
                { key: 'formal', label: t('admin.postEditor.aiAction.formal', '正式风格'), icon: UserRound, prompt: 'Rewrite this article in a clear, professional tone. Preserve all facts, meaning, structure, links, images, code blocks, technical terms, and the original language. Do not invent information. Output only the complete Markdown:' },
                { key: 'casual', label: t('admin.postEditor.aiAction.casual', '轻松风格'), icon: Smile, prompt: 'Rewrite this article in a natural, friendly, conversational tone. Preserve all facts, meaning, structure, links, images, code blocks, technical terms, and the original language. Do not invent information. Output only the complete Markdown:' },
                { key: 'concise', label: t('admin.postEditor.aiAction.concise', '精简压缩'), icon: Shrink, prompt: 'Shorten this article while preserving its core facts, conclusions, necessary context, links, images, code blocks, and the original language. Remove repetition, not essential information. Output only the complete Markdown:' },
                { key: 'expand', label: t('admin.postEditor.aiAction.expand', '扩展丰富'), icon: Expand, prompt: 'Expand this article only where useful by clarifying existing ideas and adding practical detail without inventing facts. Preserve the original language and all existing links, images, code blocks, and technical terms. Output only the complete Markdown:' },
                { key: 'format', label: t('admin.postEditor.aiAction.format', '智能排版'), icon: AlignLeft, prompt: `Reformat this article for readability in Markdown without changing its meaning or removing information. Add a clear H2/H3 hierarchy only where the structure is implied, use lists for parallel items, tables for genuine comparisons, and blockquotes for existing quotations. Preserve front matter, links, images, code blocks, HTML, technical terms, and the original language. Output only the complete Markdown:` },
                { key: 'seo', label: t('admin.postEditor.aiAction.seo', 'SEO 优化'), icon: Search, prompt: 'Improve this article for SEO without inventing facts or changing its meaning. Clarify heading hierarchy, make key terms natural, improve the opening context, and suggest image alt text only when appropriate. Preserve the original language, links, images, code blocks, and technical terms. Output only the complete Markdown:' },
                { key: 'html2md', label: 'HTML→MD', icon: Code, prompt: 'Convert this HTML content to clean Markdown. Preserve every piece of content, heading hierarchy, links, images, tables, code blocks, and meaningful attributes. Remove presentation-only markup. Output only the Markdown:' },
                { key: 'toc', label: t('admin.postEditor.aiAction.toc', '生成目录'), icon: ListTree, prompt: 'Create a concise Markdown table of contents from the article headings, then return the complete article with a consistent heading hierarchy. Preserve all original content, links, images, code blocks, technical terms, and language. Output the TOC first and nothing else:' },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    disabled={aiProcessing}
                    onClick={async () => {
                      if (!content.trim()) { toast.error(t('admin.postEditor.toast.fillContentFirst', '请先填写内容')); return; }
                      setAiProcessing(true);
                      setAiResult('');
                      try {
                        const text = content.length > 3000 ? content.slice(0, 3000) : content;
                        const r: any = await api.post('/ai/format', { content: item.prompt + '\n\n' + text });
                        if (r.data?.content || r.content) {
                          setAiResult(r.data?.content || r.content);
                        } else {
                          toast.error(t('admin.postEditor.toast.processFailed', '处理失败'));
                        }
                      } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setAiProcessing(false);
                    }}
                    className="flex flex-col items-center gap-1 rounded-md border border-border bg-muted p-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary disabled:cursor-wait disabled:opacity-50"
                  >
                    <Icon className="size-[18px]" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Result */}
          <div className="min-h-[150px] flex-1 overflow-auto px-5 py-4">
            {aiProcessing && (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t('admin.postEditor.aiProcessing', 'AI 处理中…')}
              </div>
            )}
            {aiResult && !aiProcessing && (
              <pre className="m-0 max-h-[300px] overflow-auto whitespace-pre-wrap break-words bg-muted p-3 font-mono text-xs leading-[1.7] text-foreground">
                {aiResult}
              </pre>
            )}
            {!aiResult && !aiProcessing && (
              <p className="py-10 text-center text-[13px] text-muted-foreground">
                {t('admin.postEditor.aiEmptyHint', '选择上方处理方式，AI 将处理你的文章内容')}
              </p>
            )}
          </div>

          {/* Actions */}
          {aiResult && !aiProcessing && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" onClick={() => {
                navigator.clipboard.writeText(aiResult);
                toast.success(t('admin.postEditor.toast.copied', '已复制到剪贴板'));
              }}>
                {t('admin.common.copy', '复制')}
              </Button>
              <Button variant="outline" onClick={() => {
                setContent(content + '\n\n' + aiResult);
                setShowAiModal(false);
                setAiResult('');
                toast.success(t('admin.postEditor.toast.appended', '已追加到内容末尾'));
              }}>
                {t('admin.postEditor.append', '追加')}
              </Button>
              <Button onClick={() => {
                setContent(aiResult);
                setShowAiModal(false);
                setAiResult('');
                toast.success(t('admin.postEditor.toast.replaced', '已替换内容'));
              }}>
                {t('admin.postEditor.replaceContent', '替换内容')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
