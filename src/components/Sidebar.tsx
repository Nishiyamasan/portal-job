'use client';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { useAuth } from '@/lib/auth';
import {
  Store,
  Activity,
  MessageSquare
} from 'lucide-react';

export default function Sidebar() {
  const t = useTranslations('Sidebar');
  const pathname = usePathname();
  const { role } = useAuth();

  const menuItems = [
    { name: t('ownerDashboard'), href: '/owner', icon: Store },
    { name: t('messages'), href: '/messages', icon: MessageSquare },
  ];

  // Add Supervisor Portal if role matches
  if (role === 'supervisor') {
    menuItems.push(
      { name: t('supervisorPortal'), href: '/n2-supervisor-portal-xyz', icon: Activity }
    );
  }

  const isActive = (item: typeof menuItems[0] & { exact?: boolean }) => {
    // pathname includes the locale, e.g., /ja/profile
    const pathWithoutLocale = pathname;
    if (item.exact) {
      return pathWithoutLocale === item.href;
    }
    return pathWithoutLocale.startsWith(item.href);
  };

  return (
    <aside className="fixed left-0 top-[64px] z-30 hidden h-[calc(100vh-89px)] w-64 flex-shrink-0 overflow-y-auto border-r bg-white md:block">
      <nav className="space-y-2 p-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${active
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <Icon size={18} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
