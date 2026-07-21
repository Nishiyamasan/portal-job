'use client';

import {ReactNode, useState} from 'react';
import {useRouter} from '@/i18n/routing';
import {BellRing, MessageSquare, ShieldCheck} from 'lucide-react';

const SNOOZE_KEY = 'portal-job_push_notice_snoozed_until';
const SESSION_KEY = 'portal-job_push_notice_seen_session';
const SNOOZE_DAYS = 30;

type MessageNotificationPromptLinkProps = {
  children: ReactNode;
  className?: string;
};

function shouldShowPrompt() {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(SESSION_KEY) === '1') return false;
  if (!('Notification' in window)) return true;
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return false;

  const snoozedUntil = localStorage.getItem(SNOOZE_KEY);
  return !snoozedUntil || Date.now() > Number(snoozedUntil);
}

function snoozePrompt() {
  const until = Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(SNOOZE_KEY, String(until));
}

export default function MessageNotificationPromptLink({
  children,
  className,
}: MessageNotificationPromptLinkProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowFor30Days, setDontShowFor30Days] = useState(false);

  const goMessages = () => {
    router.push('/messages');
  };

  const handleClick = () => {
    if (shouldShowPrompt()) {
      sessionStorage.setItem(SESSION_KEY, '1');
      setIsOpen(true);
      return;
    }
    goMessages();
  };

  const handleLater = () => {
    if (dontShowFor30Days) {
      snoozePrompt();
    }
    setIsOpen(false);
    goMessages();
  };

  const handleGuide = () => {
    if (dontShowFor30Days) {
      snoozePrompt();
    }
    setIsOpen(false);
    router.push('/pwa-notifications');
  };

  return (
    <>
      <button type="button" onClick={handleClick} className={className}>
        {children}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl ring-1 ring-gray-900/10 animate-slide-in-bottom">
            <div className="relative bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-6 py-7 text-white">
              <div className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-100">
                PWA
              </div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-300/30">
                <BellRing size={28} />
              </div>
              <h2 className="text-2xl font-black tracking-tight">チャット通知を受け取りませんか？</h2>
              <p className="mt-3 text-sm leading-6 text-cyan-50/85">
                portal-jobをホーム画面に追加して通知をONにすると、新しいメッセージに気づきやすくなります。
              </p>
            </div>

            <div className="space-y-5 px-6 py-6">
              <div className="grid gap-3 text-sm text-gray-600">
                <div className="flex gap-3">
                  <MessageSquare className="mt-0.5 h-5 w-5 text-cyan-600" />
                  <p>今すぐ設定しなくても、メッセージ機能はそのまま使えます。</p>
                </div>
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-600" />
                  <p>通知はいつでもブラウザやスマホの設定からOFFにできます。</p>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
                <input
                  type="checkbox"
                  checked={dontShowFor30Days}
                  onChange={(event) => setDontShowFor30Days(event.target.checked)}
                  className="h-4 w-4 accent-cyan-600"
                />
                30日間表示しない
              </label>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={handleGuide}
                  className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-gray-950/20 transition hover:-translate-y-0.5 hover:bg-gray-800"
                >
                  設定方法を見る
                </button>
                <button
                  type="button"
                  onClick={handleLater}
                  className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-600 transition hover:bg-gray-50"
                >
                  いいえ、メッセージへ進む
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
