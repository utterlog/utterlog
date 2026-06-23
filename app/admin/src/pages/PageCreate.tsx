
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { postsApi, categoriesApi, tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui';
import api from '@/lib/api';

import MarkdownEditor from '@/components/editor/MarkdownEditor';

export default function CreatePostPage() {
  const navigate = useNavigate();
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
    categoriesApi.list().then((r: any) => setCategories(r.data || [])).catch(() => {});
    tagsApi.list().then(() => {}).catch(() => {});
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    setPublishAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }, []);

  const handleSave = async (saveStatus?: string) => {
    if (!title.trim()) { toast.error('标题不能为空'); return; }
    setSubmitting(true);
    try {
      const tagNames = tagInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      await postsApi.create({
        title, content,
        slug: slug || undefined,
        cover_url: coverUrl || undefined,
        type: 'page',
        status: saveStatus || status,
        excerpt: excerpt || undefined,
        password: password || undefined,
        allow_comment: allowComment,
      } as any);
      toast.success('页面创建成功');
      navigate('/pages');
    } catch {
      toast.error('创建失败');
    } finally {
      setSubmitting(false);
    }
  };

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
              <Button onClick={() => handleSave('publish')} loading={submitting} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>发布</Button>
              <Button variant="secondary" onClick={() => handleSave('draft')} loading={submitting} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>保存</Button>
              <Button variant="secondary" onClick={() => navigate(-1)} style={{ flex: 1, minWidth: 0, padding: '0 8px' }}>返回</Button>
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
