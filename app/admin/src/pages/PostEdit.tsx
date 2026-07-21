
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import { postsApi, categoriesApi, mediaApi, optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Button, Input, Textarea, Label, Switch,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/shadcn';
import {
  Loader2, Sparkles, PenLine, UploadCloud, X,
  WandSparkles, Briefcase, Smile, Shrink, Expand, AlignLeft,
} from 'lucide-react';
import api from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { firstMarkdownH1, resolveMarkdownTitle } from '@/lib/markdown';

import MarkdownEditor from '@/components/editor/MarkdownEditor';
import { adminDateYMDHM } from '@/lib/timezone';
import FootprintEditor, { type FootprintFormValue, normalizeFootprintsForPayload } from '@/components/FootprintEditor';
import VideoFormSection from '@/components/VideoFormSection';

// Convert a backend date (RFC3339 string, unix int seconds, or ISO-ish)
// into the "YYYY-MM-DDTHH:mm" shape that <input type="datetime-local">
// expects. Rendered in site_timezone so admins editing remotely see the
// wall-clock time that matches the site, not their browser's local zone.
// Backend parsePostPublishedAt also parses with siteclock.Location(),
// so the round-trip is consistent.
function toLocalDatetime(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const n = Number(val);
  const d = !isNaN(n) && n > 1e9 && n < 1e10
    ? new Date(n * 1000)
    : new Date(val as any);
  if (isNaN(d.getTime())) return '';
  return adminDateYMDHM(d);
}

function toLocalDate(val: string | number | null | undefined): string {
  return toLocalDatetime(val).slice(0, 10);
}

export default function EditPostPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const postId = Number(params.id);
  const mdFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

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
  const [slugLoading, setSlugLoading] = useState(false);
  const [excerptLoading, setExcerptLoading] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [coverAiLoading, setCoverAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [insertType, setInsertType] = useState<string | null>(null);
  const [insertItems, setInsertItems] = useState<any[]>([]);
  const [insertLoading, setInsertLoading] = useState(false);
  const [aiFlags, setAiFlags] = useState({ summary: false, image: false, slug: false, keywords: false, polish: false });

  // v2.4.2 影视模式 —— 文章 type=video 时启用元数据 + 剧集编辑
  const [postType, setPostType] = useState<string>('post');
  const [initialVideoMeta, setInitialVideoMeta] = useState<any>({});
  const [initialVideoEpisodes, setInitialVideoEpisodes] = useState<any[]>([]);
  const [videoData, setVideoData] = useState<{ meta: any; episodes: any[] }>({ meta: {}, episodes: [] });
  const backTarget = postType === 'video' ? '/films' : '/posts';

  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    fetchPost();
    categoriesApi.list().then((r: any) => setCategories(r.data || [])).catch(() => {});
    optionsApi.list().then((r: any) => {
      const o = r.data || r || {};
      setAiFlags({ summary: o.ai_summary_auto === 'true', image: o.ai_image_auto === 'true', slug: o.ai_slug_auto === 'true', keywords: o.ai_keywords_auto === 'true', polish: o.ai_polish_auto === 'true' });
    }).catch(() => {});
  }, [postId]);

  const fetchPost = async () => {
    setLoading(true);
    try {
      const response: any = await postsApi.get(postId);
      const post = response.data;
      setTitle(post.title || '');
      setContent(post.content || '');
      setSlug(post.slug || '');
      setCoverUrl(post.cover_url || '');
      setStatus(post.status || 'draft');
      setExcerpt(post.excerpt || '');
      setPassword(post.password || '');
      setAllowComment(post.allow_comment !== false);
      setPinned(post.pinned === true);
      // Drafts that have never been published keep this blank so first
      // publish uses the current time; drafts moved back from published keep
      // their original published_at and restore it when republished.
      setPublishAt(toLocalDatetime(post.published_at) || (post.status === 'draft' ? '' : toLocalDatetime(post.created_at)));
      if (post.categories?.length) setCategoryId(post.categories[0].id);
      if (post.tags?.length) setTagInput(post.tags.map((t: any) => t.name).join(', '));
      const nextFootprints = Array.isArray(post.footprints)
        ? post.footprints.map((fp: any) => ({
            place_id: fp.place_id || fp.place?.id || 0,
            country_name: fp.place?.country_name || '',
            country_code: fp.place?.country_code || '',
            city_name: fp.place?.city_name || '',
            latitude: fp.place?.latitude ?? '',
            longitude: fp.place?.longitude ?? '',
            cover_url: fp.place?.cover_url || '',
            route_id: fp.route_id || fp.route?.id || 0,
            route_name: fp.route?.name || '',
            visited_at: toLocalDate(fp.visited_at),
            route_order: fp.route_order || '',
            keywords: fp.keywords || '',
            note: fp.note || '',
          }))
        : [];
      setFootprints(nextFootprints);
      setFootprintsEnabled(nextFootprints.length > 0);

      // v2.4.2: 加载影视专用数据。后端返回 meta（JSONB object）+ episodes（[]）
      setPostType(post.type || 'post');
      if (post.type === 'video') {
        let metaObj: any = {};
        if (post.meta && typeof post.meta === 'object') metaObj = post.meta;
        else if (typeof post.meta === 'string') {
          try { metaObj = JSON.parse(post.meta); } catch {}
        }
        setInitialVideoMeta(metaObj);
        setInitialVideoEpisodes(Array.isArray(post.episodes) ? post.episodes : []);
        // 编辑时初始 videoData 也要直接装上，避免用户没碰表单就保存丢数据
        setVideoData({ meta: metaObj, episodes: Array.isArray(post.episodes) ? post.episodes : [] });
      }
    } catch {
      toast.error(t('admin.postEditor.toast.fetchFailed', '获取文章失败'));
    } finally {
      setLoading(false);
    }
  };

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
        // 始终发送 cover_url 字段（即使空串）—— 后端用指针区分「没传」
        // 和「传空串」，空串 = 清空封面回退到首图 / 随机图。之前用
        // `coverUrl || undefined` 会让空值被 JSON.stringify 整段丢掉，
        // 后端收不到字段就不会更新，admin 删 URL 保存对前台不生效。
        cover_url: coverUrl,
        category_ids: categoryId ? [categoryId] : [],
        tag_names: tagNames,
        status: nextStatus,
        excerpt: excerpt || undefined,
        password: password || undefined,
        allow_comment: allowComment,
        pinned,
        footprints: footprintsEnabled ? normalizeFootprintsForPayload(footprints, coverUrl, publishAt) : [],
      };
      if (postType === 'video') {
        payload.type = 'video';
        payload.meta = videoData.meta;
        payload.episodes = videoData.episodes;
      }
      if (nextStatus === 'publish' && publishAt) {
        payload.published_at = publishAt;
      }
      const response: any = await postsApi.update(postId, payload);
      toast.success(t('admin.postEditor.toast.updated', '文章更新成功'));
      const nextId = response?.data?.id || response?.id;
      if (nextId && nextId !== postId) {
        navigate(`${postType === 'video' ? '/films' : '/posts'}/edit/${nextId}`, { replace: true });
      }
    } catch (err: any) {
      const detail = err?.response?.data?.error?.message
        || err?.response?.data?.message
        || err?.message
        || t('admin.common.updateFailed', '更新失败');
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (!text) return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 100px)' }}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex" style={{ height: 'calc(100vh - 80px)' }}>
        {/* Editor area */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border border-r-0 border-border">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('admin.postEditor.titlePlaceholder', '在此输入标题…')}
            className="border-0 border-b border-border bg-transparent px-5 py-3.5 text-lg font-semibold text-foreground outline-none"
          />
          <input ref={mdFileRef} type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={handleMdUpload} />
          {postType === 'video' ? (
            <div className="flex-1 overflow-auto bg-muted p-4">
              <VideoFormSection
                initialMeta={initialVideoMeta}
                initialEpisodes={initialVideoEpisodes}
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

        {/* Right sidebar — same as create page */}
        <div className="w-[280px] shrink-0 overflow-y-auto overflow-x-hidden border border-border bg-card">
          {/* Publish */}
          <div className="border-b border-border p-4">
            <div className="mb-2 flex gap-1.5">
              <Button onClick={() => handleSave()} disabled={submitting} className="min-w-0 flex-1 px-2">
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {t('admin.common.save', '保存')}
              </Button>
              <Button variant="outline" onClick={() => navigate(backTarget)} className="min-w-0 flex-1 px-2">
                {t('admin.common.back', '返回')}
              </Button>
            </div>
            {aiFlags.polish && (
              <Button
                variant="outline"
                onClick={() => setShowAiModal(true)}
                className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
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
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.postEditor.coverUrl', '自定义封面图 URL')}</Label>
                {coverUrl && (
                  <div className="relative mb-1.5">
                    <img src={coverUrl} alt="" className="h-20 w-full border border-border object-cover" />
                    <button
                      onClick={() => setCoverUrl('')}
                      className="absolute right-1 top-1 flex size-[18px] items-center justify-center bg-black/50 text-white"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-stretch gap-1.5">
                  <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder={t('admin.postEditor.coverPlaceholder', '留空自动回退为正文首图')} className="flex-1 text-xs" />
                  {aiFlags.image && (
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={coverAiLoading}
                      className="shrink-0"
                      title={t('admin.postEditor.aiGenerateCover', 'AI 生成封面')}
                      onClick={async () => {
                        if (!title) { toast.error(t('admin.postEditor.toast.fillTitleFirst', '请先填写标题')); return; }
                        setCoverAiLoading(true);
                        // Surface the backend's real error message (NO_PROVIDER,
                        // GENERATION_FAILED + provider response, etc.) instead of
                        // the old blanket 'AI 服务不可用' toast which masked every
                        // failure mode. Common causes shown verbatim:
                        //   - 'NO_PROVIDER'        → user hasn't added a type=图片 provider
                        //   - 'GENERATION_FAILED'  → API key wrong / model not granted / rate limit
                        //   - 'UNSUPPORTED_ENDPOINT' → custom endpoint URL not recognised
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
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => coverFileRef.current?.click()}
                    title={coverUploading ? t('admin.media.uploading', '上传中…') : t('admin.postEditor.uploadCover', '上传封面')}
                  >
                    {coverUploading
                      ? <Loader2 className="size-3.5 animate-spin" />
                      : <UploadCloud className="size-3.5" />}
                  </Button>
                  <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
                </div>
              </div>
              {/* Slug */}
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.postEditor.slug', '别名 (Slug)')}</Label>
                <div className="flex gap-1.5">
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('admin.postEditor.slugPlaceholderShort', '留空自动分配')} className="flex-1 text-xs" />
                  {aiFlags.slug && (
                    <Button variant="outline" disabled={slugLoading} className="h-10 shrink-0 gap-1 px-2 text-[11px]" onClick={async () => {
                      if (!title) return; setSlugLoading(true);
                      try { const r: any = await api.post('/ai/slug', { title, content }); if (r.success && r.data?.slug) { setSlug(r.data.slug); toast.success(t('admin.postEditor.toast.slugGenerated', 'Slug 已生成')); } } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setSlugLoading(false);
                    }}>
                      {slugLoading ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />} AI
                    </Button>
                  )}
                </div>
              </div>
              {/* Category */}
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.postEditor.category', '分类')}</Label>
                <Select value={categoryId === '' ? '' : String(categoryId)} onValueChange={(v) => setCategoryId(v ? Number(v) : '')}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('admin.postEditor.uncategorized', '未分类')}</SelectItem>
                    {categories.map((cat) => (<SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {/* Tags */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t('admin.postEditor.tags', '标签')}</Label>
                  {aiFlags.keywords && (
                    <Button variant="ghost" disabled={tagsLoading} className="h-auto gap-1 p-0 text-[11px] text-primary hover:bg-transparent hover:text-primary/80" onClick={async () => {
                      if (!title && !content) return; setTagsLoading(true);
                      try { const r: any = await api.post('/ai/tags', { title, content: content.slice(0, 1000) }); if (r.data?.tags) { setTagInput(Array.isArray(r.data.tags) ? r.data.tags.join(', ') : r.data.tags); toast.success(t('admin.postEditor.toast.tagsGenerated', '标签已生成')); } } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setTagsLoading(false);
                    }}>
                      {tagsLoading ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />} {t('admin.postEditor.aiExtract', 'AI 提取')}
                    </Button>
                  )}
                </div>
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Tag1, Tag2" className="text-xs" />
              </div>
              {/* Publish time */}
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">{t('admin.postEditor.publishTime', '发布时间')}</Label>
                <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="text-xs" />
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
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{t('admin.postEditor.excerpt', '摘要')}</Label>
                  {aiFlags.summary && (
                    <Button variant="ghost" disabled={excerptLoading} className="h-auto gap-1 p-0 text-[11px] text-primary hover:bg-transparent hover:text-primary/80" onClick={async () => {
                      if (!content) { toast.error(t('admin.postEditor.toast.fillContentFirst', '请先填写内容')); return; } setExcerptLoading(true);
                      try { const r: any = await api.post('/ai/summary', { title, content }); if (r.success && r.data?.summary) { setExcerpt(r.data.summary); toast.success(t('admin.postEditor.toast.excerptGenerated', '摘要已生成')); } } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                      setExcerptLoading(false);
                    }}>
                      {excerptLoading ? <Loader2 className="size-2.5 animate-spin" /> : <Sparkles className="size-2.5" />} {t('admin.postEditor.aiGenerate', 'AI 生成')}
                    </Button>
                  )}
                </div>
                <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder={t('admin.postEditor.excerptPlaceholder', '留空自动截取')} rows={3} className="resize-y text-xs" />
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{t('admin.postEditor.allowComments', '允许评论')}</span>
                  <Switch checked={allowComment} onCheckedChange={setAllowComment} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{t('admin.postEditor.allowRss', '允许本文出现在 RSS 聚合')}</span>
                  <Switch checked={allowRss} onCheckedChange={setAllowRss} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{t('admin.postEditor.pinned', '置顶文章')}</span>
                  <Switch checked={pinned} onCheckedChange={setPinned} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{t('admin.postEditor.privatePost', '私密文章')}</span>
                  <Switch checked={status === 'private'} onCheckedChange={(v) => setStatus(v ? 'private' : 'publish')} />
                </div>
                {status === 'private' && (
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('admin.postEditor.passwordPlaceholder', '输入访问密码')} className="text-xs" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Insert Modal */}
      {insertType && (
        <>
          <div onClick={() => setInsertType(null)} className="fixed inset-0 z-50 bg-black/30" />
          <div className="fixed left-1/2 top-1/2 z-[51] flex max-h-[70vh] w-[500px] max-w-[90vw] flex-col border border-border bg-card shadow-lg" style={{ transform: 'translate(-50%,-50%)' }}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h3 className="text-sm font-semibold">{t('admin.postEditor.insertType', '插入{type}', { type: insertType })}</h3>
              <button onClick={() => setInsertType(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-3">
              {insertLoading && <p className="py-5 text-center text-[13px] text-muted-foreground">{t('admin.common.loading', '加载中…')}</p>}
              {!insertLoading && insertItems.length === 0 && <p className="py-5 text-center text-[13px] text-muted-foreground">{t('admin.common.noData', '暂无数据')}</p>}
              {insertItems.map((item: any) => (
                <div key={item.id} onClick={() => {
                  let md = '';
                  if (insertType === '音乐') {
                    md = '\n[music platform="' + (item.platform || 'netease') + '" id="' + (item.platform_id || item.id || '') + '" title="' + (item.title || '') + '" artist="' + (item.artist || '') + '" cover="' + (item.cover_url || '') + '"][/music]\n';
                  } else if (insertType === '图书') {
                    md = '\n> **' + (item.title || '') + '**' + (item.author ? ' - ' + item.author : '') + '\n';
                  } else if (insertType === '电影') {
                    md = '\n> **' + (item.title || '') + '**' + (item.rating ? ' ' + item.rating + '/5' : '') + '\n';
                  } else if (insertType === '说说') {
                    md = '\n[moment id="' + item.id + '"][/moment]\n';
                  }
                  if (md) setContent(content + md);
                  setInsertType(null);
                  toast.success(t('admin.postEditor.toast.inserted', '已插入'));
                }} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors hover:bg-muted">
                  {(item.cover_url || item.image) && <img src={item.cover_url || item.image} alt="" className="size-10 shrink-0 object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{item.title || item.content?.slice(0, 50)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{item.artist || item.author || ''}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-primary">{t('admin.postEditor.insert', '插入')}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* AI Processing Modal — same as create page */}
      {showAiModal && (
        <>
          <div onClick={() => { if (!aiProcessing) setShowAiModal(false); }} className="fixed inset-0 z-50 bg-black/30" />
          <div className="fixed left-1/2 top-1/2 z-[51] flex max-h-[80vh] w-[560px] max-w-[90vw] flex-col border border-border bg-card shadow-lg" style={{ transform: 'translate(-50%,-50%)' }}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="flex items-center gap-1.5 text-[15px] font-semibold"><Sparkles className="size-4" /> {t('admin.postEditor.aiProcessArticle', 'AI 处理文章')}</h3>
              <button onClick={() => setShowAiModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="border-b border-border px-5 py-4">
              <p className="mb-3 text-xs text-muted-foreground">{t('admin.postEditor.aiProcessShortHint', '选择 AI 处理方式')}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'polish', label: t('admin.postEditor.aiAction.polish', '润色优化'), Icon: WandSparkles, prompt: 'Proofread and lightly polish this Markdown article. Preserve facts, meaning, tone, language, code blocks, links, images, front matter, technical terms, and version numbers. Fix only clear grammar, spelling, punctuation, spacing, and structure issues. Do not add or remove information. Output only the complete Markdown:' },
                  { key: 'formal', label: t('admin.postEditor.aiAction.formal', '正式风格'), Icon: Briefcase, prompt: 'Rewrite this article in a clear, professional tone. Preserve all facts, meaning, structure, links, images, code blocks, technical terms, and the original language. Do not invent information. Output only the complete Markdown:' },
                  { key: 'casual', label: t('admin.postEditor.aiAction.casual', '轻松风格'), Icon: Smile, prompt: 'Rewrite this article in a natural, friendly, conversational tone. Preserve all facts, meaning, structure, links, images, code blocks, technical terms, and the original language. Do not invent information. Output only the complete Markdown:' },
                  { key: 'concise', label: t('admin.postEditor.aiAction.concise', '精简压缩'), Icon: Shrink, prompt: 'Shorten this article while preserving its core facts, conclusions, necessary context, links, images, code blocks, and the original language. Remove repetition, not essential information. Output only the complete Markdown:' },
                  { key: 'expand', label: t('admin.postEditor.aiAction.expand', '扩展丰富'), Icon: Expand, prompt: 'Expand this article only where useful by clarifying existing ideas and adding practical detail without inventing facts. Preserve the original language and all existing links, images, code blocks, and technical terms. Output only the complete Markdown:' },
                  { key: 'format', label: t('admin.postEditor.aiAction.format', '智能排版'), Icon: AlignLeft, prompt: 'Reformat this article for readability in Markdown without changing its meaning or removing information. Add a clear H2/H3 hierarchy only where the structure is implied, use lists for parallel items, tables for genuine comparisons, and blockquotes for existing quotations. Preserve front matter, links, images, code blocks, HTML, technical terms, and the original language. Output only the complete Markdown:' },
                ].map(item => (
                  <button key={item.key} disabled={aiProcessing} onClick={async () => {
                    if (!content.trim()) { toast.error(t('admin.postEditor.toast.fillContentFirst', '请先填写内容')); return; }
                    setAiProcessing(true); setAiResult('');
                    try {
                      const r: any = await api.post('/ai/format', { content: item.prompt + '\n\n' + content.slice(0, 3000) });
                      if (r.data?.content || r.content) setAiResult(r.data?.content || r.content);
                      else toast.error(t('admin.postEditor.toast.processFailed', '处理失败'));
                    } catch { toast.error(t('admin.postEditor.toast.aiUnavailable', 'AI 服务不可用')); }
                    setAiProcessing(false);
                  }} className="flex flex-col items-center gap-1 border border-border bg-muted px-2 py-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary disabled:cursor-wait disabled:opacity-50">
                    <item.Icon className="size-[18px]" />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-[150px] flex-1 overflow-auto px-5 py-4">
              {aiProcessing && <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t('admin.postEditor.aiProcessing', 'AI 处理中…')}</div>}
              {aiResult && !aiProcessing && <pre className="m-0 max-h-[300px] overflow-auto bg-muted p-3 font-mono text-xs leading-relaxed" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{aiResult}</pre>}
              {!aiResult && !aiProcessing && <p className="py-10 text-center text-[13px] text-muted-foreground">{t('admin.postEditor.chooseProcessMode', '选择处理方式')}</p>}
            </div>
            {aiResult && !aiProcessing && (
              <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(aiResult); toast.success(t('admin.postEditor.toast.copiedShort', '已复制')); }}>{t('admin.common.copy', '复制')}</Button>
                <Button variant="secondary" onClick={() => { setContent(content + '\n\n' + aiResult); setShowAiModal(false); setAiResult(''); toast.success(t('admin.postEditor.toast.appendedShort', '已追加')); }}>{t('admin.postEditor.append', '追加')}</Button>
                <Button onClick={() => { setContent(aiResult); setShowAiModal(false); setAiResult(''); toast.success(t('admin.postEditor.toast.replacedShort', '已替换')); }}>{t('admin.postEditor.replaceContent', '替换内容')}</Button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
