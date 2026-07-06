import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/contexts/AuthContext'

export function AlertChecker() {
  const { sendLocalNotification, requestPermission, registerServiceWorker } = useNotifications()
  const { user } = useAuth()

  useEffect(() => {
    const setup = async () => {
      await requestPermission()
      await registerServiceWorker()
    }
    setup()
  }, [])

  useEffect(() => {
    if (!user) return

    // Verificar a cada 30 minutos
    const checkAlerts = async () => {
      const today = new Date().toISOString().split('T')[0]
      const threeDaysFromNow = new Date()
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
      const alertDate = threeDaysFromNow.toISOString().split('T')[0]

      // Boletos a vencer em até 3 dias
      const { data: bills } = await supabase
        .from('bills')
        .select('*')
        .eq('status', 'pendente')
        .gte('due_date', today)
        .lte('due_date', alertDate)

      if (bills && bills.length > 0) {
        const total = bills.reduce((s, b) => s + b.amount, 0)
        sendLocalNotification(
          '📄 Boletos a Vencer',
          `${bills.length} boleto(s) vencendo em até 3 dias. Total: R$ ${total.toFixed(2)}`,
          'boleto'
        )
      }

      // Parcelas a vencer em até 3 dias
      const { data: installments } = await supabase
        .from('installments')
        .select('*')
        .eq('status', 'pendente')
        .gte('due_date', today)
        .lte('due_date', alertDate)

      if (installments && installments.length > 0) {
        const total = installments.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0)
        sendLocalNotification(
          '💳 Parcelas a Receber',
          `${installments.length} parcela(s) a vencer em até 3 dias. Total: R$ ${total.toFixed(2)}`,
          'parcela'
        )
      }
    }

    checkAlerts()
    const interval = setInterval(checkAlerts, 30 * 60 * 1000) // A cada 30 min

    return () => clearInterval(interval)
  }, [user])

  return null
}