import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Globe, Trash2 } from 'lucide-react';
import { Button, Input, Card, LoadingState, EmptyState, ConfirmDialog } from '@/components/ui/shadcn';
import { cn } from '@/lib/utils';

export default function FollowsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'following' | 'followers' | 'mutual'>('following');
  const [showAdd, setShowAdd] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [unfollowTarget, setUnfollowTarget] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/social/management');
      setData(r.data || r);
    } catch { toast.error('获取关注数据失败'); }
    setLoading(false);
  };

  const handleFollow = async () => {
    if (!addUrl.trim()) return;
    setAdding(true);
    try {
      const r: any = await api.post('/social/follow', { site_url: addUrl.trim() });
      if (r.data?.mutual) toast.success('互关成功！友链已自动添加');
      else toast.success('关注成功');
      setAddUrl(''); setShowAdd(false); fetchData();
    } catch { toast.error('关注失败，请检查站点地址'); }
    setAdding(false);
  };

  const handleUnfollow = async (siteUrl: string) => {
    try {
      await api.post('/social/unfollow', { site_url: siteUrl });
      toast.success('已取消关注');
      setUnfollowTarget('');
      fetchData();
    } catch { toast.error('操作失败'); }
  };

  const tabs = [
    { key: 'following' as const, label: '我关注的', count: data?.counts?.following || 0 },
    { key: 'followers' as const, label: '关注我的', count: data?.counts?.followers || 0 },
    { key: 'mutual' as const, label: '互相关注', count: data?.counts?.mutual || 0 },
  ];

  const list = data?.[activeTab] || [];

  if (loading) return <LoadingState />;

  return (
    <div>
      {/* Tabs + Add button */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 border-b border-border">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'border-b-2 px-5 py-2.5 text-sm transition-colors',
                activeTab === tab.key
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}><Plus /> 关注站点</Button>
      </div>

      {/* Add follow */}
      {showAdd && (
        <Card className="mb-4 flex items-center gap-2 p-4">
          <Input
            placeholder="输入 Utterlog 站点地址，如 https://blog.example.com"
            value={addUrl}
            onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFollow()}
          />
          <Button onClick={handleFollow} disabled={adding}>关注</Button>
          <Button variant="secondary" onClick={() => setShowAdd(false)}>取消</Button>
        </Card>
      )}

      {/* List */}
      {list.length === 0 ? (
        <EmptyState
          title={activeTab === 'following' ? '还没有关注任何站点' : activeTab === 'followers' ? '还没有人关注你' : '还没有互相关注'}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((item: any, i: number) => {
            const info = item.site_info || {};
            const siteUrl = typeof item.source_site === 'string' ? item.source_site : '';
            const siteName = info.name || item.site_name || siteUrl;
            const siteDesc = info.description || '';
            const logo = info.logo || info.favicon || '';
            const admin = info.admin || {};
            const isMutual = item.mutual === true;

            return (
              <Card key={i} className="flex items-center gap-3.5 p-4">
                {/* Logo */}
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                  {logo ? (
                    <img src={logo} alt="" className="size-full object-cover" />
                  ) : (
                    <Globe className="size-5 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{siteName}</span>
                    {isMutual && <span className="rounded-sm bg-primary px-1.5 py-px text-[10px] text-primary-foreground">互关</span>}
                  </div>
                  {siteDesc && <p className="mt-0.5 truncate text-xs text-muted-foreground">{siteDesc}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <a href={siteUrl} target="_blank" className="text-xs text-muted-foreground hover:text-foreground">{siteUrl}</a>
                    {admin.nickname && <span className="text-[11px] text-muted-foreground">· {admin.nickname}</span>}
                  </div>
                </div>

                {/* Actions */}
                {activeTab === 'following' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    title="取消关注"
                    onClick={() => setUnfollowTarget(siteUrl)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!unfollowTarget}
        onOpenChange={(o) => !o && setUnfollowTarget('')}
        onConfirm={() => handleUnfollow(unfollowTarget)}
        title="取消关注"
        message="确定取消关注？"
        confirmText="取消关注"
      />
    </div>
  );
}
