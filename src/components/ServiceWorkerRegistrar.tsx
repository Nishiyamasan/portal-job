'use client';

import {useEffect} from 'react';
import {registerServiceWorker} from '@/lib/push-notifications';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    registerServiceWorker().catch((error) => {
      console.warn('Service Worker registration skipped:', error);
    });
  }, []);

  return null;
}
