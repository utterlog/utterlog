'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface Notification {
  id: number;
  type: string;
  title: string;
  content?: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const { accessToken } = useAuthStore();
  const eventSourceRef = useRef<EventSource | null>(null);

  // 获取通知列表
  const fetchNotifications = useCallback(async (unreadOnly = false) => {
    setLoading(true);
    try {
      const response: any = await api.get('/notifications', {
        params: { unread: unreadOnly },
      });
      setNotifications(response.data?.notifications || []);
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取未读数量
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response: any = await api.get('/notifications/unread-count');
      setUnreadCount(response.data?.count || 0);
    } catch {
      // 忽略错误
    }
  }, []);

  // 标记已读
  const markAsRead = useCallback(async (id: number) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // 忽略错误
    }
  }, []);

  // 标记全部已读
  const markAllAsRead = useCallback(async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // 忽略错误
    }
  }, []);

  // 连接 SSE
  const connectSSE = useCallback(() => {
    if (!accessToken) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
    const es = new EventSource(`${apiUrl}/notifications/stream?token=${accessToken}`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setNotifications((prev) => [data, ...prev]);
        setUnreadCount((prev) => prev + 1);
      } catch {
        // 忽略解析错误
      }
    };

    es.onerror = () => {
      // 自动重连
      es.close();
      setTimeout(connectSSE, 5000);
    };

    eventSourceRef.current = es;
  }, [accessToken]);

  // 断开 SSE
  const disconnectSSE = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    connectSSE();

    return () => {
      disconnectSSE();
    };
  }, [fetchUnreadCount, connectSSE, disconnectSSE]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
  };
}
