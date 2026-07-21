'use client';

import {useState} from 'react';
import {Check, Copy} from 'lucide-react';

export const runtime = 'edge';

const templates = [
  {
    id: 'basic',
    title: '基本テンプレ',
    content: `## 募集職種
- フロアスタッフ
- バーカウンタースタッフ

## 仕事内容
- 接客、ドリンク提供
- 開店・閉店準備

## 応募条件
- 未経験可
- 週2日以上勤務できる方歓迎
`
  },
  {
    id: 'shift',
    title: 'シフト重視テンプレ',
    content: `## 勤務時間
- 20:00〜24:00
- 週2〜4日

## 雇用形態
- アルバイト

## 待遇
- 交通費支給（上限あり）
- 深夜手当あり
`
  },
  {
    id: 'appeal',
    title: 'PR強化テンプレ',
    content: `## お店の特徴
〇〇らしい温かい雰囲気のお店です。

## こんな方におすすめ
- 人と話すことが好き
- チームで働くのが好き

## 応募方法
まずはお気軽にメッセージでお問い合わせください。`
  }
];

const shopTemplates = [
  {
    id: 'shop-basic',
    title: '店舗紹介テンプレ（基本）',
    content: `## お店のコンセプト
誰でも気軽に立ち寄れる、あたたかい雰囲気のお店です。

## おすすめポイント
- 初めての方でも入りやすい
- 会話を楽しめるカウンター中心
- お一人様歓迎

## こんなシーンに
- 仕事終わりの一杯
- 友人とのゆったりした時間
`
  },
  {
    id: 'shop-service',
    title: '店舗紹介テンプレ（サービス重視）',
    content: `## サービス内容
- ドリンク各種
- カラオケ利用可
- 貸切相談可

## 店内の雰囲気
落ち着いた照明で、ゆっくり会話を楽しめる空間です。

## ご来店前のご案内
混雑状況はSNSでお知らせしています。`
  },
  {
    id: 'shop-access',
    title: '店舗紹介テンプレ（アクセス重視）',
    content: `## アクセス
〇〇市駅から徒歩圏内。〇〇町エリア中心部にあります。

## 営業時間
- 平日: 19:00-翌2:00
- 週末: 18:00-翌4:00

## ご利用について
初来店の方も歓迎です。お気軽にお越しください。`
  }
];

export default function MarkdownGuidePage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyTemplate = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(140deg,_#f8fafc,_#ffffff_35%,_#f5f3ff)] px-4 py-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-10 rounded-3xl border bg-white p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">portal-job Markdown Guide</p>
          <h1 className="mt-3 text-3xl font-black text-gray-900">店舗・求人のMarkdown書き方ガイド</h1>
          <p className="mt-3 text-sm leading-7 text-gray-600">
            見出し、箇条書き、リンクを使って店舗紹介や求人情報を読みやすく作れます。下のテンプレをコピーして、そのまま編集して使えます。
          </p>
        </header>

        <section className="mb-8 rounded-3xl border bg-white p-8 shadow-sm">
          <h2 className="text-xl font-black text-gray-900">基本記法</h2>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
{`## 見出し
- 箇条書き
[リンクテキスト](https://example.com)`}
          </pre>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-black text-gray-900">求人テンプレ</h2>
          <div className="space-y-6">
            {templates.map((template) => (
              <article key={template.id} className="rounded-3xl border bg-white p-6 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-black text-gray-900">{template.title}</h3>
                  <button
                    type="button"
                    onClick={() => copyTemplate(template.id, template.content)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                  >
                    {copiedId === template.id ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    {copiedId === template.id ? 'コピーしました' : 'テンプレをコピー'}
                  </button>
                </div>
                <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {template.content}
                </pre>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-black text-gray-900">店舗テンプレ</h2>
          {shopTemplates.map((template) => (
            <article key={template.id} className="rounded-3xl border bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-black text-gray-900">{template.title}</h3>
                <button
                  type="button"
                  onClick={() => copyTemplate(template.id, template.content)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  {copiedId === template.id ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  {copiedId === template.id ? 'コピーしました' : 'テンプレをコピー'}
                </button>
              </div>
              <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {template.content}
              </pre>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
