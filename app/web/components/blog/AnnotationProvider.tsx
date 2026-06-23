'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';

const API_BASE = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || '/api/v1')
  : '';

export interface Annotation {
  id: number;
  post_id: number;
  block_id: string;
  user_name: string;
  user_avatar: string;
  user_site: string;
  utterlog_id: string;
  content: string;
  created_at: number;
}

interface AnnotationContextValue {
  annotations: Record<string, Annotation[]>;
  activeBlock: string | null;
  setActiveBlock: (id: string | null) => void;
  addAnnotation: (blockId: string, content: string) => Promise<boolean>;
  loading: boolean;
}

const AnnotationContext = createContext<AnnotationContextValue>({
  annotations: {},
  activeBlock: null,
  setActiveBlock: () => {},
  addAnnotation: async () => false,
  loading: false,
});

export function useAnnotations() {
  return useContext(AnnotationContext);
}

export function AnnotationProvider({ postId, children }: { postId: number; children: React.ReactNode }) {
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [activeBlock, setActiveBlock] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const accessToken = useAuthStore(s => s.accessToken);

  useEffect(() => {
    fetch(`${API_BASE}/annotations?post_id=${postId}`)
      .then(r => r.json())
      .then(data => {
        setAnnotations(data.data?.annotations || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [postId]);

  const addAnnotation = useCallback(async (blockId: string, content: string): Promise<boolean> => {
    try {
      // Also try reading a federation token issued by Utterlog Network (if user
      // connected their site via federation). Falls back to the local admin's
      // access token for the site-owner's own annotations.
      const federationToken = typeof window !== 'undefined'
        ? (localStorage.getItem('federation_token') || '')
        : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const resp = await fetch(`${API_BASE}/annotations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          post_id: postId,
          block_id: blockId,
          content,
          federation_token: federationToken || undefined,
        }),
      });
      const data = await resp.json();
      if (!data.success) {
        // Surface backend error message to caller via returning false;
        // BlockAnnotation.tsx can show a toast.
        if (typeof window !== 'undefined') {
          const msg = data?.error?.message || '发布失败';
          // dynamic import to avoid SSR issues
          import('react-hot-toast').then(m => m.toast.error(msg)).catch(() => {});
        }
        return false;
      }

      // Refresh annotations
      const refreshResp = await fetch(`${API_BASE}/annotations?post_id=${postId}`);
      const refreshData = await refreshResp.json();
      setAnnotations(refreshData.data?.annotations || {});
      return true;
    } catch {
      return false;
    }
  }, [postId, accessToken]);

  return (
    <AnnotationContext.Provider value={{ annotations, activeBlock, setActiveBlock, addAnnotation, loading }}>
      {children}
    </AnnotationContext.Provider>
  );
}
