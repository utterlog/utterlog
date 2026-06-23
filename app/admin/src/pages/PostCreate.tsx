
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { postsApi, categoriesApi, tagsApi, mediaApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
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
    api.get('/options').then((r: any) => {
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

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--color-text-sub)', marginBottom: '6px', fontWeight: 500 };
  const sectionStyle: React.CSSProperties = { padding: '16px', borderBottom: '1px solid var(--color-border)' };

  return (
    <>
      {/* Main layout */}
      <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 80px)' }}>
        {/* Editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, border: '1px solid var(--color-border)', borderRight: 'none', overflow: 'hidden' }}>
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('admin.postEditor.titlePlaceholder', '在此输入标题…')}
            style={{
              padding: '14px 20px', fontSize: '18px', fontWeight: 600,
              border: 'none', borderBottom: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-main)',
              outline: 'none',
            }}
          />
          <input ref={mdFileRef} type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={handleMdUpload} />
          {/* Editor —— 影视模式上方先渲染元数据 + 剧集，下方留 Markdown 编辑器写简介 */}
          {postType === 'video' ? (
            <div style={{ flex: 1, overflow: 'auto', padding: 16, background: 'var(--color-bg-soft)' }}>
              <VideoFormSection
                onChange={setVideoData}
                onImportedExtras={(ex) => {
                  if (ex.coverUrl && !coverUrl) setCoverUrl(ex.coverUrl);
                  if (ex.title && !title.trim()) setTitle(ex.title);
                  if (ex.summary && !excerpt) setExcerpt(ex.summary);
                }}
              />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)', margin: '4px 0 8px' }}>
                <i className="fa-regular fa-pen-line" style={{ marginRight: 6 }} />
                影视简介 / 剧情（Markdown）
              </div>
              <div style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  minHeight="360px"
                  onImportMd={() => mdFileRef.current?.click()}
                />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'hidden' }}>
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
        <div style={{
          width: '280px', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
          border: '1px solid var(--color-border)', background: 'var(--color-bg-card)',
        }}>
          {/* Publish */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <Button onClick={() => handleSave('publish')} loading={submitting} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
                {t('admin.postEditor.publish', '发布')}
              </Button>
              <Button variant="secondary" onClick={() => handleSave('draft')} loading={submitting} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
                {t('admin.common.save', '保存')}
              </Button>
              <Button variant="secondary" onClick={() => navigate(backTarget)} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>
                {t('admin.common.back', '返回')}
              </Button>
            </div>
            {aiFlags.polish && <button onClick={() => setShowAiModal(true)} style={{
              width: '100%', padding: '7px', fontSize: '12px', fontWeight: 500,
              background: 'none', border: '1px solid var(--color-primary)', color: 'var(--color-primary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--color-primary)'; }}
            >
              <i className="fa-regular fa-sparkles" style={{ fontSize: '13px' }} /> {t('admin.postEditor.aiProcessArticle', 'AI 处理文章')}
            </button>}
          </div>

          {/* Settings */}
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--color-text-main)' }}>{t('admin.postEditor.settings', '设置')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Cover */}
              <div>
                <label style={labelStyle}>{t('admin.postEditor.coverUrl', '自定义封面图 URL')}</label>
                {coverUrl && (
                  <div style={{ marginBottom: '6px', position: 'relative' }}>
                    <img src={coverUrl} alt="" style={{ width: '100%', height: '80px', objectFit: 'cover', border: '1px solid var(--color-border)' }} />
                    <button onClick={() => setCoverUrl('')} style={{
                      position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px',
                      background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer',
                      fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder={t('admin.postEditor.coverPlaceholder', '留空自动回退为正文首图')} className="input" style={{ flex: 1, fontSize: '12px' }} />
                  {aiFlags.image && (
                    <button
                      className="btn btn-secondary btn-toolbar-square"
                      title={t('admin.postEditor.aiGenerateCover', 'AI 生成封面')}
                      disabled={coverAiLoading}
                      style={{ opacity: coverAiLoading ? 0.5 : 1 }}
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
                        ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 14 }} />
                        : <i className="fa-regular fa-sparkles" style={{ fontSize: 14 }} />}
                    </button>
                  )}
                  <button
                    onClick={() => coverFileRef.current?.click()}
                    className="btn btn-secondary btn-toolbar-square"
                    title={coverUploading ? t('admin.media.uploading', '上传中…') : t('admin.postEditor.uploadCover', '上传封面')}
                  >
                    {coverUploading
                      ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 14 }} />
                      : <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: 14 }} />}
                  </button>
                  <input ref={coverFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverUpload} />
                </div>
                <p style={{ fontSize: '10px', color: 'var(--color-text-dim)', marginTop: '4px', lineHeight: 1.5 }}>
                  {t('admin.postEditor.coverHint', '如果这里有值，封面优先使用它；为空时自动回退到正文首图。')}
                </p>
              </div>

              {/* Slug */}
              <div>
                <label style={labelStyle}>{t('admin.postEditor.slug', '别名 (Slug)')}</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('admin.postEditor.slugPlaceholder', '留空自动分配唯一数字')} className="input" style={{ flex: 1, fontSize: '12px', padding: '6px 10px' }} />
                  {aiFlags.slug && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '11px', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '3px' }}
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
                    {slugLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '11px' }} /> : <i className="fa-regular fa-sparkles" style={{ fontSize: '11px' }} />} AI
                  </button>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <label style={labelStyle}>{t('admin.postEditor.category', '分类')}</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : '')} className="input" style={{ fontSize: '12px', padding: '6px 10px' }}>
                  <option value="">{t('admin.postEditor.uncategorized', '未分类')}</option>
                  {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                </select>
              </div>

              {/* Tags */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-sub)', fontWeight: 500 }}>{t('admin.postEditor.tagsComma', '标签 (逗号分隔)')}</label>
                  {aiFlags.keywords && (
                  <button
                    disabled={tagsLoading}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '3px', opacity: tagsLoading ? 0.5 : 1 }}
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
                    {tagsLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '10px' }} /> : <i className="fa-regular fa-sparkles" style={{ fontSize: '10px' }} />} {t('admin.postEditor.aiExtract', 'AI 提取')}
                  </button>
                  )}
                </div>
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder={t('admin.postEditor.tagsPlaceholder', 'Tag1, Tag2（默认提取 3 个关键词）')} className="input" style={{ fontSize: '12px', padding: '6px 10px' }} />
              </div>

              {/* Publish time */}
              <div>
                <label style={labelStyle}>{t('admin.postEditor.publishTime', '发布时间')}</label>
                <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="input" style={{ fontSize: '12px', padding: '6px 10px' }} />
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
          <div style={sectionStyle}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--color-text-main)' }}>{t('admin.postEditor.advanced', '高级')}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Excerpt */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-sub)', fontWeight: 500 }}>{t('admin.postEditor.excerpt', '摘要')}</label>
                  {aiFlags.summary && (
                  <button
                    disabled={excerptLoading}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '3px', opacity: excerptLoading ? 0.5 : 1 }}
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
                    {excerptLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '10px' }} /> : <i className="fa-regular fa-sparkles" style={{ fontSize: '10px' }} />} {t('admin.postEditor.aiGenerate', 'AI 生成')}
                  </button>
                  )}
                </div>
                <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder={t('admin.postEditor.excerptPlaceholder', '留空自动截取')} rows={3} className="input" style={{ fontSize: '12px', padding: '6px 10px', resize: 'vertical' }} />
              </div>

              {/* Checkboxes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} /> {t('admin.postEditor.allowComments', '允许评论')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={allowRss} onChange={(e) => setAllowRss(e.target.checked)} /> {t('admin.postEditor.allowRss', '允许本文出现在 RSS 聚合')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {t('admin.postEditor.pinned', '置顶文章')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={status === 'private'} onChange={(e) => setStatus(e.target.checked ? 'private' : 'publish')} /> {t('admin.postEditor.privatePost', '私密文章')}
                </label>
                {status === 'private' && (
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('admin.postEditor.passwordPlaceholder', '输入访问密码')} className="input" style={{ fontSize: '12px', padding: '6px 10px', marginLeft: '24px', width: 'calc(100% - 24px)', boxSizing: 'border-box' }} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Insert Modal */}
      {insertType && (
        <>
          <div onClick={() => setInsertType(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: '500px', maxWidth: '90vw', maxHeight: '70vh',
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600 }}>
                {t('admin.postEditor.insertType', '插入{type}', { type: insertType })}
              </h3>
              <button onClick={() => setInsertType(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-dim)' }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
              {insertLoading && <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', padding: '20px 0', fontSize: '13px' }}>{t('admin.common.loading', '加载中…')}</p>}
              {!insertLoading && insertItems.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', padding: '20px 0', fontSize: '13px' }}>
                  {t('admin.postEditor.noInsertData', '暂无{type}数据，请先在对应页面添加', { type: insertType })}
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
                    toast.success(t('admin.postEditor.toast.insertedType', '已插入{type}', { type: insertType }));
                  }}
                  style={{
                    padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
                    borderBottom: '1px solid var(--color-border)', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {(item.cover_url || item.image) && (
                    <img src={item.cover_url || item.image} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title || item.content?.slice(0, 50)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
                      {item.artist || item.author || item.platform || ''}
                      {item.rating ? ` · ${t('admin.postEditor.ratingValue', '{rating}分', { rating: item.rating })}` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-primary)', flexShrink: 0 }}>{t('admin.postEditor.insert', '插入')}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* AI Processing Modal */}
      {showAiModal && (
        <>
          <div onClick={() => { if (!aiProcessing) setShowAiModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: '560px', maxWidth: '90vw', maxHeight: '80vh',
            background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-regular fa-sparkles" style={{ fontSize: '16px' }} /> {t('admin.postEditor.aiProcessArticle', 'AI 处理文章')}
              </h3>
              <button onClick={() => setShowAiModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'var(--color-text-dim)' }}>×</button>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-dim)', marginBottom: '12px' }}>{t('admin.postEditor.aiProcessHint', '选择 AI 处理方式，处理完成后可预览并插入到编辑器')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { key: 'polish', label: t('admin.postEditor.aiAction.polish', '润色优化'), icon: 'fa-light fa-wand-magic-sparkles', prompt: 'Polish and improve the writing quality, fix grammar, make it more engaging. Keep the same language. Output in Markdown:' },
                  { key: 'formal', label: t('admin.postEditor.aiAction.formal', '正式风格'), icon: 'fa-light fa-user-tie', prompt: 'Rewrite in a formal, professional tone. Keep the same language. Output in Markdown:' },
                  { key: 'casual', label: t('admin.postEditor.aiAction.casual', '轻松风格'), icon: 'fa-light fa-face-smile', prompt: 'Rewrite in a casual, friendly, conversational tone. Keep the same language. Output in Markdown:' },
                  { key: 'concise', label: t('admin.postEditor.aiAction.concise', '精简压缩'), icon: 'fa-light fa-compress', prompt: 'Condense and shorten the text while keeping key information. Keep the same language. Output in Markdown:' },
                  { key: 'expand', label: t('admin.postEditor.aiAction.expand', '扩展丰富'), icon: 'fa-light fa-expand', prompt: 'Expand and elaborate on the content with more details and examples. Keep the same language. Output in Markdown:' },
                  { key: 'format', label: t('admin.postEditor.aiAction.format', '智能排版'), icon: 'fa-light fa-align-left', prompt: `Intelligently reformat this article for optimal readability in Markdown. Rules:
1. Add proper H2/H3 headings to organize sections
2. Convert parallel content into bullet/numbered lists
3. For images: if 1 image use full-width, if 2 side-by-side, if 3+ use grid layout with captions
4. Extract comparison content into tables
5. Add blockquotes for important quotes or key takeaways
6. Identify code snippets and wrap with correct language syntax highlighting
7. Add emphasis (bold) for key terms on first mention
8. Ensure proper paragraph spacing (not too long, not too short)
9. Add horizontal rules between major topic shifts
10. Keep the same language, preserve all original content. Output in Markdown:` },
                  { key: 'seo', label: t('admin.postEditor.aiAction.seo', 'SEO 优化'), icon: 'fa-light fa-magnifying-glass', prompt: 'Optimize for SEO: improve headings hierarchy (H1>H2>H3), add keywords naturally in first paragraph and headings, improve meta structure, ensure proper image alt text, add internal linking suggestions as comments. Keep the same language. Output in Markdown:' },
                  { key: 'html2md', label: 'HTML→MD', icon: 'fa-light fa-code', prompt: 'Convert this HTML content to clean Markdown format. Preserve all content, structure, images, and links:' },
                  { key: 'toc', label: t('admin.postEditor.aiAction.toc', '生成目录'), icon: 'fa-light fa-list-tree', prompt: 'Analyze this article and generate a table of contents (TOC) in Markdown format based on the headings. Then reorganize the article with proper heading hierarchy if needed. Output the TOC at the top followed by the full article in Markdown:' },
                ].map(item => (
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
                    style={{
                      padding: '10px 8px', fontSize: '12px', fontWeight: 500,
                      background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)',
                      cursor: aiProcessing ? 'wait' : 'pointer', color: 'var(--color-text-main)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                      transition: 'all 0.15s', opacity: aiProcessing ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!aiProcessing) e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                  >
                    <i className={item.icon} style={{ fontSize: '18px' }} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Result */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', minHeight: '150px' }}>
              {aiProcessing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '40px 0', color: 'var(--color-text-dim)', fontSize: '13px' }}>
                  <i className="fa-solid fa-spinner fa-spin" /> {t('admin.postEditor.aiProcessing', 'AI 处理中…')}
                </div>
              )}
              {aiResult && !aiProcessing && (
                <pre style={{
                  fontSize: '12px', lineHeight: 1.7, fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: 'var(--color-text-main)', margin: 0,
                  maxHeight: '300px', overflow: 'auto',
                  padding: '12px', background: 'var(--color-bg-soft)',
                }}>
                  {aiResult}
                </pre>
              )}
              {!aiResult && !aiProcessing && (
                <p style={{ textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '13px', padding: '40px 0' }}>
                  {t('admin.postEditor.aiEmptyHint', '选择上方处理方式，AI 将处理你的文章内容')}
                </p>
              )}
            </div>

            {/* Actions */}
            {aiResult && !aiProcessing && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => {
                  navigator.clipboard.writeText(aiResult);
                  toast.success(t('admin.postEditor.toast.copied', '已复制到剪贴板'));
                }}>
                  {t('admin.common.copy', '复制')}
                </Button>
                <Button variant="secondary" onClick={() => {
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
          </div>
        </>
      )}
    </>
  );
}
