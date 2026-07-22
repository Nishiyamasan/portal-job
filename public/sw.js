self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {body: event.data.text()};
    }
  }

  const title = payload.title || 'portal-job';
  const options = {
    body: payload.body || '新しいお知らせがあります。',
    icon: '/portal-job-icon.svg',
    badge: '/portal-job-icon.svg',
    tag: payload.tag || 'portal-job-notification',
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windowClients) {
      if (client.url === targetUrl && 'focus' in client) {
        return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
