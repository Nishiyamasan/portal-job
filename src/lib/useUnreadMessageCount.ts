'use client';

import {useCallback, useEffect, useState} from 'react';
import {getConversations} from '@/lib/api';
import {useAuth} from '@/lib/auth';

const POLL_INTERVAL_MS = 30000;

export function formatUnreadCount(count: number): string {
  if (count > 99) return '99+';
  return String(count);
}

export function useUnreadMessageCount() {
  const {user} = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {
      const conversations = await getConversations();
      const totalUnread = conversations.reduce((sum, conversation) => {
        return sum + (conversation.unread_count || 0);
      }, 0);
      setUnreadCount(totalUnread);
    } catch {
      // Keep the current count if temporary API error occurs.
    }
  }, [user]);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!user) return;

    const intervalId = window.setInterval(loadUnreadCount, POLL_INTERVAL_MS);
    const handleFocus = () => {
      loadUnreadCount();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUnreadCount();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadUnreadCount, user]);

  return {
    unreadCount,
    hasUnread: unreadCount > 0,
    displayUnreadCount: formatUnreadCount(unreadCount),
  };
}
