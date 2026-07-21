'use client';

import { useState, useEffect, useRef, use, useCallback } from 'react';
import { getConversation, sendMessage, Profile, Message, Shop, getShopById, callGoApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Notification, NotificationType } from '@/components/Notification';
import { subscribeToConversation } from '@/lib/realtime/messages-realtime';
import { formatJapanTime } from '@/lib/datetime';
import { getMediaAssetUrl, getPrimaryMediaAsset } from '@/lib/media-assets';
import { User } from 'lucide-react';

export const runtime = 'edge';

export default function ChatPage({ params }: { params: Promise<{ shopId: string; userId: string }> }) {
  const { shopId, userId } = use(params);
  const { user, profileId } = useAuth();
  const router = useRouter();
  const t = useTranslations('Chat');
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [notification, setNotification] = useState<{ type: NotificationType; message: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const normalizedProfileId = profileId?.toLowerCase() ?? null;
  const debugViewport = searchParams.get('debugViewport') === '1';
  const [viewportDebug, setViewportDebug] = useState({
    innerHeight: 0,
    clientHeight: 0,
    visualHeight: 0,
    visualOffsetTop: 0,
    visualPageTop: 0,
    visualScale: 1,
    formBottom: 0,
    bottomGap: 0,
    activeElement: '',
  });

  const loadData = useCallback(async (showLoading = false) => {
    if (!user || !normalizedProfileId) return;
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const msgs = await getConversation(shopId, userId);
      setMessages(msgs);

      const firstMsg = msgs[0];
      if (firstMsg?.shop) setShop(firstMsg.shop);

      const mUser = msgs.find(m => m.sender_id === userId)?.sender ||
                   msgs.find(m => m.receiver_id === userId)?.receiver;
      if (mUser) setOtherUser(mUser);

      if (!firstMsg?.shop || !mUser) {
        const [shopData, userData] = await Promise.all([
          !firstMsg?.shop ? getShopById(shopId) : Promise.resolve(null),
          !mUser ? callGoApi<Profile>(`/api/v1/auth/profiles/${userId}`).catch(() => null) : Promise.resolve(null)
        ]);
        if (shopData) setShop(shopData);
        if (userData) setOtherUser(userData);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [shopId, userId, user, normalizedProfileId]);

  useEffect(() => {
    if (!user || !normalizedProfileId) {
        return;
    }

    loadData(true);

    const unsubscribe = subscribeToConversation({
      shopId,
      currentUserId: normalizedProfileId,
      otherUserId: userId,
      onMessage: (message) => {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) {
            return current;
          }
          return [...current, message];
        });
      },
      onError: (error) => {
        console.warn('Supabase Realtime subscription issue:', error);
      },
    });

    const interval = setInterval(() => loadData(false), 60000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [user, normalizedProfileId, loadData, shopId, userId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!debugViewport || typeof window === 'undefined') return;

    const updateViewportDebug = () => {
      const visualViewport = window.visualViewport;
      const visualHeight = visualViewport?.height ?? window.innerHeight;
      const visualOffsetTop = visualViewport?.offsetTop ?? 0;
      const formBottom = formRef.current?.getBoundingClientRect().bottom ?? 0;
      setViewportDebug({
        innerHeight: window.innerHeight,
        clientHeight: document.documentElement.clientHeight,
        visualHeight,
        visualOffsetTop,
        visualPageTop: visualViewport?.pageTop ?? window.scrollY,
        visualScale: visualViewport?.scale ?? 1,
        formBottom,
        bottomGap: visualHeight + visualOffsetTop - formBottom,
        activeElement: document.activeElement?.tagName?.toLowerCase() || '',
      });
    };

    updateViewportDebug();
    const visualViewport = window.visualViewport;
    window.addEventListener('resize', updateViewportDebug);
    window.addEventListener('scroll', updateViewportDebug, { passive: true });
    window.addEventListener('focusin', updateViewportDebug);
    window.addEventListener('focusout', updateViewportDebug);
    visualViewport?.addEventListener('resize', updateViewportDebug);
    visualViewport?.addEventListener('scroll', updateViewportDebug);
    const timer = window.setInterval(updateViewportDebug, 500);

    return () => {
      window.removeEventListener('resize', updateViewportDebug);
      window.removeEventListener('scroll', updateViewportDebug);
      window.removeEventListener('focusin', updateViewportDebug);
      window.removeEventListener('focusout', updateViewportDebug);
      visualViewport?.removeEventListener('resize', updateViewportDebug);
      visualViewport?.removeEventListener('scroll', updateViewportDebug);
      window.clearInterval(timer);
    };
  }, [debugViewport]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    if (isSending || !trimmedContent) return;

    setIsSending(true);
    try {
      const newMsg = await sendMessage({
        receiver_id: userId,
        shop_id: shopId,
        content: trimmedContent
      });
      setMessages((current) => {
        if (current.some((item) => item.id === newMsg.id)) {
          return current;
        }
        return [...current, newMsg];
      });
      setContent('');
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: 'メッセージの送信に失敗しました。' });
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) return <div className="flex min-h-dvh items-center justify-center bg-white p-8 text-center">{t('loading')}</div>;

  const otherUserAvatarUrl = getMediaAssetUrl(
    getPrimaryMediaAsset(otherUser?.media_assets, 'profile_image'),
    'f_auto,q_auto,c_fill,w_96,h_96'
  );

  return (
    <div className="fixed inset-0 mx-auto flex h-dvh max-h-dvh w-full max-w-4xl touch-manipulation flex-col overflow-x-hidden overflow-y-hidden overscroll-contain bg-white md:relative md:inset-auto md:my-6 md:h-[calc(100vh-3rem)] md:max-h-none md:rounded-3xl md:border md:shadow-sm">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
        />
      )}
      {debugViewport && (
        <div className="fixed left-2 top-2 z-[9999] max-w-[calc(100vw-1rem)] rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-4 text-white shadow-lg">
          <div>innerH: {Math.round(viewportDebug.innerHeight)}</div>
          <div>clientH: {Math.round(viewportDebug.clientHeight)}</div>
          <div>vvH: {Math.round(viewportDebug.visualHeight)}</div>
          <div>vvTop: {Math.round(viewportDebug.visualOffsetTop)}</div>
          <div>pageTop: {Math.round(viewportDebug.visualPageTop)}</div>
          <div>scale: {viewportDebug.visualScale.toFixed(2)}</div>
          <div>formBottom: {Math.round(viewportDebug.formBottom)}</div>
          <div>gap: {Math.round(viewportDebug.bottomGap)}</div>
          <div>active: {viewportDebug.activeElement || '-'}</div>
        </div>
      )}
      <div className="flex min-w-0 items-center justify-between border-b bg-white/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400">
            {otherUserAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={otherUserAvatarUrl}
                alt={otherUser?.display_name || 'User'}
                className="h-full w-full object-cover"
              />
            ) : (
              <User size={20} />
            )}
          </div>
          <div className="min-w-0">
          <h1 className="truncate text-base font-black text-gray-900 md:text-lg">
            {t('chatWith', { target: otherUser?.display_name || 'User' })}
          </h1>
          {shop && (
            <p className="truncate text-xs font-medium text-gray-500">
                {t('atShop', { shop: shop.name })}
            </p>
          )}
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
          aria-label="チャットを閉じる"
        >
          ✕
        </button>
      </div>

      <div
        ref={scrollRef}
        className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden bg-gray-50/70 px-3 py-5 sm:px-4 md:px-6"
      >
        {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
                {t('noMessages')}
            </div>
        ) : (
            messages.map((msg) => {
              const isMine = (msg.sender_id?.toLowerCase?.() ?? msg.sender_id) === normalizedProfileId;
              return (
                <div
                  key={msg.id}
                  className={`flex w-full min-w-0 max-w-full items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  {!isMine && (
                    <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-400">
                      {otherUserAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={otherUserAvatarUrl}
                          alt={otherUser?.display_name || 'User'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User size={16} />
                      )}
                    </div>
                  )}
                  <div className={`inline-block min-w-0 max-w-[82vw] rounded-2xl px-4 py-2 text-sm shadow-sm sm:max-w-[76vw] md:max-w-[35rem] ${
                    isMine
                      ? 'bg-gray-900 text-white rounded-tr-none'
                      : 'bg-white text-gray-800 border rounded-tl-none'
                  } overflow-x-hidden`}>
                    <p className="max-w-full whitespace-pre-wrap break-all leading-relaxed [overflow-wrap:anywhere]">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-gray-400' : 'text-gray-400'}`}>
                      {formatJapanTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
        )}
      </div>

      <form ref={formRef} onSubmit={handleSend} className="min-w-0 border-t bg-white p-3 pb-2 md:p-4">
        <div className="flex min-w-0 items-end space-x-2 overflow-x-hidden">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('placeholder')}
            className="min-h-11 min-w-0 flex-1 resize-none overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border p-2.5 text-base leading-6 outline-none [overflow-wrap:anywhere] focus:border-transparent focus:ring-2 focus:ring-gray-900"
            rows={1}
            wrap="soft"
            style={{ fontSize: '16px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />
          <button
            type="submit"
            disabled={isSending || !content.trim()}
            aria-busy={isSending}
            className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 font-bold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 sm:px-6"
          >
            {isSending ? t('sending') : t('send')}
          </button>
        </div>
      </form>
    </div>
  );
}
