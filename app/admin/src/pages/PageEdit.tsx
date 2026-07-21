import { Sparkles, Loader2 } from 'lucide-react';

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import { postsApi, categoriesApi, tagsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Textarea, Label } from '@/components/ui/shadcn';
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
      <div className="flex h-[calc(100vh-100px)] items-center justify-center">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[calc(100vh-80px)]">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden border border-r-0 border-border">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="在此输入标题…"
            className="border-0 border-b border-border bg-transparent px-5 py-3.5 text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="flex-1 overflow-hidden">
            <MarkdownEditor value={content} onChange={setContent} className="h-full rounded-none border-0" minHeight="100%" />
          </div>
        </div>

        <div className="w-[280px] shrink-0 overflow-y-auto overflow-x-hidden border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex gap-1.5">
              <Button onClick={handleSave} disabled={submitting} className="min-w-0 flex-1 px-2">保存</Button>
              <Button variant="secondary" onClick={() => navigate('/pages')} className="min-w-0 flex-1 px-2">返回</Button>
            </div>
          </div>

          <div className="border-b border-border p-4">
            <h3 className="mb-3.5 text-[13px] font-semibold text-foreground">设置</h3>
            <div className="flex flex-col gap-3.5">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">别名 (Slug)</Label>
                <div className="flex items-stretch gap-1.5">
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="留空自动分配" className="h-9 flex-1 text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0"
                    title="AI 生成 Slug"
                    onClick={async () => {
                      if (!title) return;
                      try { const r: any = await api.post('/ai/slug', { title, content }); if (r.success && r.data?.slug) { setSlug(r.data.slug); toast.success('Slug 已生成'); } } catch { toast.error('AI 服务不可用'); }
                    }}
                  >
                    <Sparkles className="size-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">封面图 URL</Label>
                <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="留空自动回退为正文首图" className="h-9 text-xs" />
              </div>
            </div>
          </div>

          <div className="p-4">
            <h3 className="mb-3.5 text-[13px] font-semibold text-foreground">高级</h3>
            <div className="flex flex-col gap-3.5">
              <div>
                <Label className="mb-1.5 block text-xs text-muted-foreground">摘要</Label>
                <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="留空自动截取" rows={3} className="resize-y text-xs" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} className="size-4 accent-primary" /> 允许评论
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
