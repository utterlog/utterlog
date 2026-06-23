
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, ConfirmDialog, EmptyPanel, Input, LoadingState } from '@/components/ui';

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

  if (loading) return <LoadingState padding="24px" />;

  return (
    <div>

      {/* Tabs + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)', flex: 1 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 20px', fontSize: '14px',
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-sub)',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: activeTab === tab.key ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'none', cursor: 'pointer',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}><i className="fa-regular fa-plus" style={{ fontSize: '14px' }} /> 关注站点</Button>
      </div>

      {/* Add follow */}
      {showAdd && (
        <div className="card" style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Input placeholder="输入 Utterlog 站点地址，如 https://blog.example.com" value={addUrl} onChange={e => setAddUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleFollow()} />
          <Button onClick={handleFollow} loading={adding}>关注</Button>
          <Button variant="secondary" onClick={() => setShowAdd(false)}>取消</Button>
        </div>
      )}

      {/* List */}
      {list.length === 0 ? (
        <div className="card text-dim" style={{ padding: '48px', textAlign: 'center', fontSize: '14px' }}>
          <EmptyPanel
            title={activeTab === 'following' ? '还没有关注任何站点' : activeTab === 'followers' ? '还没有人关注你' : '还没有互相关注'}
            padding={0}
            fontSize="14px"
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {list.map((item: any, i: number) => {
            const info = item.site_info || {};
            const siteUrl = typeof item.source_site === 'string' ? item.source_site : '';
            const siteName = info.name || item.site_name || siteUrl;
            const siteDesc = info.description || '';
            const logo = info.logo || info.favicon || '';
            const admin = info.admin || {};
            const isMutual = item.mutual === true;

            return (
              <div key={i} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                {/* Logo */}
                <div style={{
                  width: '48px', height: '48px', borderRadius: '1px', overflow: 'hidden',
                  background: 'var(--color-bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {logo ? (
                    <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <i className="fa-regular fa-globe text-dim" style={{ fontSize: '20px' }} />
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{siteName}</span>
                    {isMutual && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '2px', background: 'var(--color-primary)', color: '#fff' }}>互关</span>}
                  </div>
                  {siteDesc && <p className="text-dim" style={{ fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{siteDesc}</p>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <a href={siteUrl} target="_blank" className="text-sub" style={{ fontSize: '12px' }}>{siteUrl}</a>
                    {admin.nickname && <span className="text-dim" style={{ fontSize: '11px' }}>· {admin.nickname}</span>}
                  </div>
                </div>

                {/* Actions */}
                {activeTab === 'following' && (
                  <button onClick={() => setUnfollowTarget(siteUrl)} className="action-btn danger" title="取消关注">
                    <i className="fa-regular fa-trash" style={{ fontSize: '14px' }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!unfollowTarget}
        onClose={() => setUnfollowTarget('')}
        onConfirm={() => handleUnfollow(unfollowTarget)}
        title="取消关注"
        message="确定取消关注？"
        confirmText="取消关注"
      />
    </div>
  );
}
