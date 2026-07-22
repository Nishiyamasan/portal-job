'use client';

import {useState} from 'react';
import {BellRing, CheckCircle2, ExternalLink, Smartphone, TabletSmartphone, X} from 'lucide-react';
import {subscribeToPushNotifications, isPushSupported} from '../../../lib/push-notifications';
import {Link} from '@/i18n/routing';

export const runtime = 'edge';

export default function PwaNotificationsPage() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setStatus('loading');
    setMessage(null);
    try {
      await subscribeToPushNotifications();
      setStatus('success');
      setMessage('通知設定が完了しました。新着メッセージを受け取れます。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '通知設定に失敗しました。');
    }
  };

  const supported = typeof window === 'undefined' ? true : isPushSupported();

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 z-40 bg-gray-950/55 backdrop-blur-sm" />

      <div className="relative z-50 px-4 py-6 md:py-10">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl ring-1 ring-black/10">
          <div className="relative bg-slate-950 text-white">
            <Link
              href="/messages"
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="メッセージに戻る"
            >
              <X size={18} />
            </Link>

            <div className="grid gap-8 p-8 md:grid-cols-[1.1fr_0.9fr] md:p-12">
              <div>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-cyan-300/15 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-cyan-100">
                  <BellRing size={16} />
                  portal-job PWA
                </div>
                <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
                  チャット通知をONにして、
                  <span className="block text-cyan-200">メッセージに気づきやすく。</span>
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
                  portal-jobをホーム画面に追加すると、スマホアプリのように開けます。
                  通知を許可すると、新しいチャットメッセージが届いたときにお知らせします。
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleSubscribe}
                    disabled={!supported || status === 'loading'}
                    className="rounded-2xl bg-cyan-300 px-6 py-4 text-sm font-black text-slate-950 shadow-lg shadow-cyan-300/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
                  >
                    {status === 'loading' ? '設定中...' : 'この端末で通知をONにする'}
                  </button>
                  <a
                    href="#steps"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-6 py-4 text-sm font-black text-white transition hover:bg-white/10"
                  >
                    手順を見る
                    <ExternalLink size={16} />
                  </a>
                </div>
                {message && (
                  <div className={`mt-5 rounded-2xl px-4 py-3 text-sm font-bold ${
                    status === 'success' ? 'bg-emerald-400/15 text-emerald-100' : 'bg-rose-400/15 text-rose-100'
                  }`}>
                    {message}
                  </div>
                )}
                {!supported && (
                  <div className="mt-5 rounded-2xl bg-amber-400/15 px-4 py-3 text-sm font-bold text-amber-100">
                    このブラウザはWeb Push通知に対応していません。Chrome、Edge、Safariなどの対応ブラウザでお試しください。
                  </div>
                )}
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
                <div className="rounded-[1.5rem] bg-white p-5 text-slate-950 shadow-xl">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-cyan-200">
                      <BellRing />
                    </div>
                    <div>
                      <p className="text-sm font-black">portal-job メッセージ</p>
                      <p className="mt-1 text-sm text-slate-600">新しいメッセージが届きました。</p>
                      <p className="mt-3 text-xs font-bold text-slate-400">今すぐ確認する</p>
                    </div>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-7 text-slate-300">
                  通知本文には最低限の内容だけを表示します。端末やブラウザの設定から、いつでも通知をOFFにできます。
                </p>
              </div>
            </div>
          </div>

          <section id="steps" className="grid gap-6 bg-white px-8 py-8 md:grid-cols-2 md:px-12">
            <div className="rounded-[2rem] border bg-white p-7 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <Smartphone className="text-cyan-600" />
                <h2 className="text-2xl font-black text-slate-950">iPhoneの場合</h2>
              </div>
              <ol className="space-y-4 text-sm leading-7 text-slate-600">
                <li><span className="font-black text-slate-950">1.</span> Safariでportal-jobを開きます。</li>
                <li><span className="font-black text-slate-950">2.</span> 共有ボタンから「ホーム画面に追加」を選びます。</li>
                <li><span className="font-black text-slate-950">3.</span> ホーム画面のportal-jobアイコンから開きます。</li>
                <li><span className="font-black text-slate-950">4.</span> このページの「通知をONにする」を押して許可します。</li>
              </ol>
            </div>

            <div className="rounded-[2rem] border bg-white p-7 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <TabletSmartphone className="text-cyan-600" />
                <h2 className="text-2xl font-black text-slate-950">Androidの場合</h2>
              </div>
              <ol className="space-y-4 text-sm leading-7 text-slate-600">
                <li><span className="font-black text-slate-950">1.</span> Chromeでportal-jobを開きます。</li>
                <li><span className="font-black text-slate-950">2.</span> メニューから「ホーム画面に追加」または「アプリをインストール」を選びます。</li>
                <li><span className="font-black text-slate-950">3.</span> portal-jobアイコンから開くとアプリのように使えます。</li>
                <li><span className="font-black text-slate-950">4.</span> 通知許可の確認が出たら「許可」を選びます。</li>
              </ol>
            </div>
          </section>

          <div className="border-t border-emerald-100 bg-emerald-50 px-8 py-6 md:px-12">
            <div className="flex items-start gap-3 text-emerald-950">
              <CheckCircle2 className="mt-0.5 h-5 w-5" />
              <p className="text-sm leading-7">
                現在の通知対象はチャットの新着メッセージのみです。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
