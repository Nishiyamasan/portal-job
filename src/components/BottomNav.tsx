'use client';

import {Link} from '@/i18n/routing';
import {usePathname} from '@/i18n/routing';
import {useTranslations} from 'next-intl';
import {Briefcase, Store, LogIn, UserRound, MessageSquare} from 'lucide-react';
import {type ComponentType} from 'react';
import {useUnreadMessageCount} from '@/lib/useUnreadMessageCount';
import {useOwnerAccess} from '@/lib/useOwnerAccess';
import {getSignInHref} from '@/lib/auth-redirects';

type BottomNavProps = {
  isLoggedIn: boolean;
};

type BottomNavItem = {
  id: 'shops' | 'jobs' | 'messages' | 'profile';
  href: string;
  label: string;
  icon: ComponentType<{size?: number; strokeWidth?: number}>;
  exact?: boolean;
  activePath?: string;
};

export default function BottomNav({isLoggedIn}: BottomNavProps) {
  const t = useTranslations('Navbar');
  const pathname = usePathname();
  const {hasUnread, displayUnreadCount} = useUnreadMessageCount();
  const {hasOwnerAccess} = useOwnerAccess();
  const signInHref = getSignInHref(pathname);
  const settingsHref = isLoggedIn ? (hasOwnerAccess ? '/owner' : '/profile') : signInHref;
  const settingsActivePath = isLoggedIn ? (hasOwnerAccess ? '/owner' : '/profile') : '/signin';

  const items: BottomNavItem[] = [
    {id: 'shops', href: '/shop', label: t('shops'), icon: Store},
    {id: 'jobs', href: '/jobs', label: t('jobs'), icon: Briefcase},
    {id: 'messages', href: isLoggedIn ? '/messages' : signInHref, label: t('messages'), icon: MessageSquare, activePath: '/messages'},
    {
      id: 'profile',
      href: settingsHref,
      label: isLoggedIn ? t('settings') : t('signin'),
      icon: isLoggedIn ? UserRound : LogIn,
      activePath: settingsActivePath
    }
  ];

  const isActive = (href: string, exact?: boolean, activePath?: string) => {
    if (activePath) {
      return pathname === activePath || pathname.startsWith(`${activePath}/`);
    }
    if (exact) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/80 backdrop-blur-xl md:hidden pb-safe">
      <div className="mx-auto grid max-w-md grid-cols-4 px-4 py-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact, item.activePath);
          const content = (
            <>
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300 ${
                  active ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-gray-50'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {item.id === 'messages' && isLoggedIn && hasUnread && (
                  <span className="absolute -right-2 -top-2 inline-flex min-w-[1.2rem] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
                    {displayUnreadCount}
                  </span>
                )}
              </div>
              <span className={`text-xs font-bold tracking-tight transition-colors ${active ? 'text-brand-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </>
          );

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 ${
                active
                  ? 'text-brand-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
