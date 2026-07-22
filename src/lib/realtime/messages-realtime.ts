import {supabase} from '@/lib/supabase';
import type {Message} from '@/lib/api';

type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  shop_id: string | null;
  content: string;
  is_read: boolean | null;
  created_at: string;
};

type SubscribeToConversationParams = {
  shopId: string;
  currentUserId: string;
  otherUserId: string;
  onMessage: (message: Message) => void;
  onError?: (error: unknown) => void;
};

function isConversationMessage(row: MessageRow, shopId: string, currentUserId: string, otherUserId: string) {
  const isSameShop = row.shop_id === shopId;
  const isFromCurrentToOther = row.sender_id === currentUserId && row.receiver_id === otherUserId;
  const isFromOtherToCurrent = row.sender_id === otherUserId && row.receiver_id === currentUserId;
  return isSameShop && (isFromCurrentToOther || isFromOtherToCurrent);
}

function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    shop_id: row.shop_id || undefined,
    content: row.content,
    is_read: Boolean(row.is_read),
    created_at: row.created_at,
  };
}

export function subscribeToConversation({
  shopId,
  currentUserId,
  otherUserId,
  onMessage,
  onError,
}: SubscribeToConversationParams) {
  const schema = 'public';
  const channel = supabase
    .channel(`conversation:${schema}:${shopId}:${currentUserId}:${otherUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema,
        table: 'messages',
        filter: `shop_id=eq.${shopId}`,
      },
      (payload) => {
        const row = payload.new as MessageRow;
        if (isConversationMessage(row, shopId, currentUserId, otherUserId)) {
          onMessage(rowToMessage(row));
        }
      }
    )
    .subscribe((status, error) => {
      if (error) {
        onError?.(error);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(status);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
