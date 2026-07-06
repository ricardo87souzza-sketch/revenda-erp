self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  const title = data.title || 'Revenda ERP'
  const options = {
    body: data.body || '',
    icon: 'https://i.imgur.com/0Q6tNuR.jpeg',
    badge: 'https://i.imgur.com/0Q6tNuR.jpeg',
    vibrate: data.type === 'boleto' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    silent: false,
    tag: data.type || 'default',
    renotify: true,
    requireInteraction: true,
    data: data
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow('/dashboard')
  )
})