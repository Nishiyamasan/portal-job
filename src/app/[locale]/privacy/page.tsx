'use client';

import {useEffect, useState} from 'react';
import {Link} from '@/i18n/routing';
import {useLocale} from 'next-intl';
import {getPublicSystemSetting} from '@/lib/api';
import {MarkdownContent} from '@/components/MarkdownContent';

export const runtime = 'edge';

export default function PrivacyPage() {
  const locale = useLocale();
  const isJa = locale === 'ja';
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const setting = await getPublicSystemSetting('privacy_ja');
        setContent(setting.value || '');
      } catch {
        setError(isJa ? 'プライバシーポリシーの取得に失敗しました。' : 'Failed to load privacy policy.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isJa, locale]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <article className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-gray-900">
          {isJa ? 'プライバシーポリシー' : 'Privacy Policy'}
        </h1>
        <div className="mt-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">{isJa ? '読み込み中...' : 'Loading...'}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <MarkdownContent content={content} />
          )}
        </div>

        <div className="mt-8 border-t pt-6">
          <Link href="/contact" className="text-sm font-semibold text-gray-900 underline underline-offset-4">
            {isJa ? 'お問い合わせフォームへ' : 'Go to contact form'}
          </Link>
        </div>
      </article>
    </div>
  );
}
