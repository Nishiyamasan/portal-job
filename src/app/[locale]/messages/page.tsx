'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { getConversations, ConversationSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Link } from '@/i18n/routing';
import { BellRing, Store, User } from 'lucide-react';
import { formatJapanDate } from '@/lib/datetime';
import { getMediaAssetUrl, getPrimaryMediaAsset } from '@/lib/media-assets';

export const runtime = 'edge';

export default function MessagesPage() {
  const t = useTranslations('Chat');
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function loadConversations() {
      try {
        const data = await getConversations();
        setConversations(data);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    }
    loadConversations();
  }, [user]);

  if (isLoading) return <div className="p-8 text-center text-gray-500">{t('loading')}</div>;

  return (
    <div className="mx-auto max-w-4xl overflow-x-hidden px-4 py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-cyan-600">Messages</p>
          <h1 className="mt-2 text-3xl font-black text-gray-900">{t('title')}</h1>
        </div>
        <Link
          href="/pwa-notifications"
          className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800 transition hover:-translate-y-0.5 hover:bg-cyan-100"
        >
          <BellRing size={16} />
          チャット通知を設定
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center text-gray-500">
          <p>{t('noMessages')}</p>
          <Link
            href="/pwa-notifications"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-gray-800"
          >
            <BellRing size={16} />
            通知の設定方法を見る
          </Link>
        </div>
      ) : (
        <div className="max-w-full overflow-hidden rounded-xl border bg-white shadow-sm divide-y">
          {conversations.map((conv) => {
            const avatarUrl = getMediaAssetUrl(
              getPrimaryMediaAsset(conv.other_user?.media_assets, 'profile_image'),
              'f_auto,q_auto,c_fill,w_96,h_96'
            );
            return (
            <Link
              key={`${conv.shop_id}-${conv.other_user_id}`}
              href={`/chat/${conv.shop_id}/${conv.other_user_id}`}
              className="group flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden p-4 transition-colors hover:bg-gray-50 sm:gap-4"
            >
              <div className="relative shrink-0">
                  <div className="w-12 h-12 overflow-hidden rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt={conv.other_user?.display_name || 'User'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                    <User size={24} />
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border shadow-sm flex items-center justify-center text-gray-600">
                    <Store size={14} />
                  </div>
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-bold text-gray-900">
                      {conv.other_user?.display_name || 'User'}
                    </p>
                    {conv.last_message && (
                        <span className="shrink-0 text-[10px] text-gray-400">
                            {formatJapanDate(conv.last_message.created_at)}
                        </span>
                    )}
                </div>
                <p className="truncate text-xs font-medium text-indigo-600">
                    {conv.shop?.name || 'Shop'}
                </p>
                <p className="mt-0.5 line-clamp-2 max-w-full whitespace-pre-line break-all text-xs text-gray-500 [overflow-wrap:anywhere]">
                    {conv.last_message?.content || '...'}
                </p>
              </div>
              {conv.unread_count > 0 && (
                  <div className="shrink-0 rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-bold text-white">
                      {conv.unread_count}
                  </div>
              )}
              <span className="hidden shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 sm:inline">→</span>
            </Link>
          );
          })}
        </div>
      )}
    </div>
  );
}
