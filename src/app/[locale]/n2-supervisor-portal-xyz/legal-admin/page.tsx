'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAuth} from '@/lib/auth';
import {useRouter} from 'next/navigation';
import {Link} from '@/i18n/routing';
import {
  getSystemSettingForAdmin,
  getSystemSettingHistoryForAdmin,
  SystemSetting,
  SystemSettingHistory,
  updateSystemSettingForAdmin,
} from '@/lib/api';

export const runtime = 'edge';

const SETTING_KEYS = [
  {key: 'terms_ja', label: '利用規約（日本語）'},
  {key: 'privacy_ja', label: 'プライバシーポリシー（日本語）'},
  {key: 'terms_en', label: 'Terms of Service (English)'},
  {key: 'privacy_en', label: 'Privacy Policy (English)'},
] as const;

type SettingKey = (typeof SETTING_KEYS)[number]['key'];

export default function LegalAdminPage() {
  const {user, role, isLoading} = useAuth();
  const router = useRouter();
  const [settings, setSettings] = useState<Record<SettingKey, string>>({
    terms_ja: '',
    privacy_ja: '',
    terms_en: '',
    privacy_en: '',
  });
  const [histories, setHistories] = useState<Record<SettingKey, SystemSettingHistory[]>>({
    terms_ja: [],
    privacy_ja: [],
    terms_en: [],
    privacy_en: [],
  });
  const [loadingData, setLoadingData] = useState(true);
  const [savingKey, setSavingKey] = useState<SettingKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/signin?from=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    const load = async () => {
      if (!user || isLoading) return;
      if (role !== 'supervisor' && role !== 'admin') {
        setLoadingData(false);
        return;
      }

      try {
        const [settingsResults, historyResults] = await Promise.all([
          Promise.all(SETTING_KEYS.map(({key}) => getSystemSettingForAdmin(key))),
          Promise.all(SETTING_KEYS.map(({key}) => getSystemSettingHistoryForAdmin(key))),
        ]);

        const nextSettings = {...settings};
        settingsResults.forEach((item: SystemSetting) => {
          nextSettings[item.key as SettingKey] = item.value ?? '';
        });
        setSettings(nextSettings);

        const nextHistories = {...histories};
        historyResults.forEach((items, index) => {
          const key = SETTING_KEYS[index].key;
          nextHistories[key] = items;
        });
        setHistories(nextHistories);
      } catch (error) {
        console.error(error);
        setNotice('規約設定の読み込みに失敗しました。');
      } finally {
        setLoadingData(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, role, user]);

  const sortedSettings = useMemo(() => SETTING_KEYS, []);

  const saveSetting = async (key: SettingKey) => {
    setSavingKey(key);
    setNotice(null);
    try {
      await updateSystemSettingForAdmin(key, settings[key]);
      const history = await getSystemSettingHistoryForAdmin(key);
      setHistories((current) => ({...current, [key]: history}));
      setNotice('保存しました。');
    } catch (error) {
      console.error(error);
      setNotice('保存に失敗しました。');
    } finally {
      setSavingKey(null);
    }
  };

  if (isLoading || loadingData) {
    return <div className="flex min-h-screen items-center justify-center text-gray-500">読み込み中...</div>;
  }

  if (role !== 'supervisor' && role !== 'admin') {
    return <div className="mx-auto max-w-4xl px-4 py-16 text-center text-gray-700">アクセス権限がありません。</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="mb-8">
        <Link href="/n2-supervisor-portal-xyz" className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          ← スーパーバイザーポータルに戻る
        </Link>
        <h1 className="mt-4 text-4xl font-bold text-gray-900">規約アドミン</h1>
        <p className="mt-2 text-sm text-gray-600">サインイン画面モーダルと公開ページ（/terms, /privacy）の本文を管理します。</p>
      </div>

      {notice ? <div className="mb-6 rounded-xl border bg-white p-4 text-sm text-gray-700">{notice}</div> : null}

      <div className="grid grid-cols-1 gap-6">
        {sortedSettings.map(({key, label}) => (
          <section key={key} className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-gray-900">{label}</h2>
              <button
                onClick={() => saveSetting(key)}
                disabled={savingKey === key}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {savingKey === key ? '保存中...' : '保存'}
              </button>
            </div>
            <textarea
              value={settings[key]}
              onChange={(e) => setSettings((current) => ({...current, [key]: e.target.value}))}
              rows={14}
              className="w-full rounded-xl border border-gray-300 p-3 text-sm text-gray-900 outline-none focus:border-gray-500"
            />
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-bold text-gray-500">更新履歴（最新5件）</p>
              {histories[key].slice(0, 5).length === 0 ? (
                <p className="mt-2 text-xs text-gray-400">履歴はまだありません。</p>
              ) : (
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  {histories[key].slice(0, 5).map((item) => (
                    <li key={item.id}>
                      {new Date(item.changed_at).toLocaleString()} / {item.changed_by || 'unknown'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
