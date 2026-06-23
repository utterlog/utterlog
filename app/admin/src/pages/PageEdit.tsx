
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { postsApi, categoriesApi, tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import api from '@/lib/api';

import MarkdownEditor from '@/components/editor/MarkdownEditor';
import { adminDateYMDHM } from '@/lib/timezone';

export default function EditPostPage() {
  const navigate = useNavigate();
  const params = useParams();
  const postId = Number(params.id);

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

  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    fetchPost();
    categoriesApi.list().then((r: any) => setCategories(r.data || [])).catch(() => {});
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
      if (post.categories?.length) setCategoryId(post.categories[0].id);
      if (post.tags?.length) setTagInput(post.tags.map((t: any) => t.name).join(', '));
      if (post.published_at) {
        // datetime-local input 期待"naive 本地时间"格式 YYYY-MM-DDTHH:MM。
        // 用 site_timezone 渲染保证站长看到的是站点时区时间，提交回后端时
        // 后端 parsePostPublishedAt 也按 site_timezone 解析（往返一致）。
        setPublishAt(adminDateYMDHM(new Date(post.published_at)));
      }
    } catch {
      toast.error('获取文章失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      const tagNames = tagInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      await postsApi.update(postId, {
        title, content,
        slug: slug || undefined,
        cover_url: coverUrl || undefined,
        type: 'page',
        status,
        excerpt: excerpt || undefined,
        password: password || undefined,
        allow_comment: allowComment,
      } as any);
      toast.success('页面更新成功');
    } catch {
      toast.error('更新失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 100px)' }}>
        <i className="fa-light fa-spinner-third fa-spin" style={{ fontSize: '24px', color: 'var(--color-text-dim)' }} />
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '0', height: 'calc(100vh - 80px)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, border: '1px solid var(--color-border)', borderRight: 'none', overflow: 'hidden' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="在此输入标题…"
            style={{ padding: '14px 20px', fontSize: '18px', fontWeight: 600, border: 'none', borderBottom: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-main)', outline: 'none' }}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MarkdownEditor value={content} onChange={setContent} className="h-full rounded-none border-0" minHeight="100%" />
          </div>
        </div>

        <div style={{ width: '280px', flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', border: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <Button onClick={handleSave} loading={submitting} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>保存</Button>
              <Button variant="secondary" onClick={() => navigate('/pages')} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>返回</Button>
            </div>
          </div>

          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--color-text-main)' }}>设置</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-sub)', marginBottom: '6px', fontWeight: 500 }}>别名 (Slug)</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
                  <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="留空自动分配" className="input" style={{ flex: 1, fontSize: '12px' }} />
                  <button
                    className="btn btn-secondary btn-toolbar-square"
                    title="AI 生成 Slug"
                    onClick={async () => {
                      if (!title) return;
                      try { const r: any = await api.post('/ai/slug', { title, content }); if (r.success && r.data?.slug) { setSlug(r.data.slug); toast.success('Slug 已生成'); } } catch { toast.error('AI 服务不可用'); }
                    }}
                  >
                    <i className="fa-regular fa-sparkles" style={{ fontSize: 14 }} />
                  </button>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-sub)', marginBottom: '6px', fontWeight: 500 }}>封面图 URL</label>
                <input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="留空自动回退为正文首图" className="input" style={{ fontSize: '12px', padding: '6px 10px' }} />
              </div>
            </div>
          </div>

          <div style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px', color: 'var(--color-text-main)' }}>高级</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-sub)', marginBottom: '6px', fontWeight: 500 }}>摘要</label>
                <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="留空自动截取" rows={3} className="input" style={{ fontSize: '12px', padding: '6px 10px', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer', color: 'var(--color-text-main)' }}>
                  <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} /> 允许评论
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
