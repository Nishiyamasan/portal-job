'use client';

import {NextIntlClientProvider, AbstractIntlMessages} from 'next-intl';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import {AuthProvider, useAuth} from '@/lib/auth';
import {ReactNode} from 'react';
import {usePathname} from '@/i18n/routing';

function LayoutContent({
  children,
  locale,
  messages
}: {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
}) {
  const {user} = useAuth();
  const pathname = usePathname();
  const isChatPage = pathname.startsWith('/chat/');

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tokyo">
      <div className={`flex min-h-screen min-w-0 flex-col ${isChatPage ? 'bg-white' : ''}`}>
        <ServiceWorkerRegistrar />
        {!isChatPage && <Navbar />}
        <div className="flex min-w-0 flex-1 overflow-x-hidden">
          {user && !isChatPage && <Sidebar />}
          {isChatPage ? (
            <main className="min-w-0 flex-1 overflow-x-hidden bg-white">{children}</main>
          ) : (
            <div className={`flex min-w-0 flex-1 flex-col overflow-x-hidden ${user ? 'md:pl-64' : ''}`}>
              <main className="min-w-0 flex-1 overflow-x-hidden bg-gray-50 pb-20 md:pb-0 pt-0">
                {children}
              </main>
              <Footer />
            </div>
          )}
        </div>
        {!isChatPage && <BottomNav isLoggedIn={Boolean(user)} />}
      </div>
    </NextIntlClientProvider>
  );
}

export default function ClientLayout({
  children,
  locale,
  messages
}: {
  children: ReactNode;
  locale: string;
  messages: AbstractIntlMessages;
}) {
  return (
    <AuthProvider>
      <LayoutContent locale={locale} messages={messages}>
        {children}
      </LayoutContent>
    </AuthProvider>
  );
}
