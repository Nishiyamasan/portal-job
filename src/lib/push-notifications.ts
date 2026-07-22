import {
  getPushNotificationConfig,
  savePushSubscription,
  type PushSubscriptionPayload,
} from '@/lib/api';

const SW_PATH = '/sw.js';

function urlBase64ToUint8Array(base64String: string) {
  const normalized = base64String.trim().replace(/^["']|["']$/g, '');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const base64 = (normalized + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function serializeSubscription(subscription: PushSubscription): PushSubscriptionPayload {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint || subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
    },
    user_agent: navigator.userAgent,
  };
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function registerServiceWorker() {
  if (!isPushSupported()) {
    return null;
  }
  return await navigator.serviceWorker.register(SW_PATH);
}

export async function subscribeToPushNotifications() {
  if (!isPushSupported()) {
    throw new Error('このブラウザは通知に対応していません。');
  }

  const config = await getPushNotificationConfig();
  if (!config.enabled || !config.public_key) {
    throw new Error('通知機能は現在準備中です。VAPIDキーを設定してください。');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('通知が許可されませんでした。ブラウザ設定から許可できます。');
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    throw new Error('Service Workerを登録できませんでした。');
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.public_key),
  });

  await savePushSubscription(serializeSubscription(subscription));
  return subscription;
}
