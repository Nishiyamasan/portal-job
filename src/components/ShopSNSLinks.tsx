'use client';

import { Shop } from '@/lib/content';

interface ShopSNSLinksProps {
  shop: Shop;
  contactHeading: string;
}

export function ShopSNSLinks({ shop, contactHeading }: ShopSNSLinksProps) {
  if (!shop.x_account_id && !shop.instagram_account_id) return null;

  const openUniversalLink = (url: string) => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|iphone|ipad|ipod/.test(userAgent);

    if (isMobile) {
      window.location.assign(url);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="mt-12 bg-white rounded-2xl p-8 border shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 mb-6">{contactHeading}</h2>
      <div className="flex flex-wrap gap-4">
        {shop.x_account_id && (
          <button
            type="button"
            className="flex items-center space-x-2 bg-black text-white px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            onClick={() => openUniversalLink(`https://x.com/${shop.x_account_id}`)}
          >
            <span className="font-bold">X (Twitter)</span>
          </button>
        )}
        {shop.instagram_account_id && (
          <button
            type="button"
            className="flex items-center space-x-2 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white px-6 py-3 rounded-xl hover:opacity-90 transition-opacity"
            onClick={() => openUniversalLink(`https://instagram.com/${shop.instagram_account_id}`)}
          >
            <span className="font-bold">Instagram</span>
          </button>
        )}
      </div>
    </section>
  );
}
