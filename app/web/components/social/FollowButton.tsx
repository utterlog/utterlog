'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface FollowButtonProps {
  siteUrl: string;
  siteName?: string;
}

export default function FollowButton({ siteUrl, siteName }: FollowButtonProps) {
  const [following, setFollowing] = useState(false);
  const [mutual, setMutual] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !siteUrl) return;
    api.get(`/social/follow-status?site_url=${encodeURIComponent(siteUrl)}`).then((r: any) => {
      const data = r.data || r;
      if (data) {
        setFollowing(Boolean(data.following));
        setMutual(Boolean(data.mutual));
      }
    }).catch(() => {});
  }, [siteUrl, isAuthenticated]);

  if (!isAuthenticated) return null;

  const handleFollow = async () => {
    setLoading(true);
    try {
      if (following) {
        await api.post('/social/unfollow', { site_url: siteUrl });
        setFollowing(false);
        setMutual(false);
      } else {
        const r: any = await api.post('/social/follow', { site_url: siteUrl });
        const data = r.data || r;
        setFollowing(true);
        setMutual(Boolean(data?.mutual));
      }
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={handleFollow}
      disabled={loading}
      style={{
        padding: '6px 16px', fontSize: '13px', borderRadius: '1px',
        border: following ? '1px solid var(--color-border)' : 'none',
        background: following ? 'var(--color-bg-card)' : 'var(--color-primary)',
        color: following ? 'var(--color-text-sub)' : '#fff',
        cursor: 'pointer', transition: 'all 0.15s',
        display: 'inline-flex', alignItems: 'center', gap: '4px',
      }}
    >
      {loading ? '...' : mutual ? '互关 ✓' : following ? '已关注' : '+ 关注'}
    </button>
  );
}
