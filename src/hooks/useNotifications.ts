import { useEffect, useState } from 'react'

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default')

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result === 'granted'
    }
    return false
  }

  const registerServiceWorker = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        return registration
      } catch (err) {
        console.error('SW registration failed:', err)
        return null
      }
    }
    return null
  }

  const sendLocalNotification = (title: string, body: string, type: 'boleto' | 'parcela' = 'boleto') => {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://i.imgur.com/0Q6tNuR.jpeg',
        vibrate: type === 'boleto' ? [300, 100, 300, 100, 300] : [200, 100, 200],
        requireInteraction: true,
        tag: type,
      })
    }
  }

  return {
    permission,
    requestPermission,
    registerServiceWorker,
    sendLocalNotification,
  }
}