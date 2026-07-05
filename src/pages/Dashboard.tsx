import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { DollarSign, Package, ShoppingCart, Users, FileText, TrendingUp, AlertTriangle, Calendar, CreditCard } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [editingBalance, setEditingBalance] = useState(false)
  const [newBalance, setNewBalance] = useState('')
  const [showRecebimentos, setShowRecebimentos] = useState(false)
  const [showBoletosPagos, setShowBoletosPagos] = useState(false)
  const [showBoletosMes, setShowBoletosMes] = useState(false)
  const [showParcelasMes, setShowParcelasMes] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard', selectedMonth, selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`
      const endDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split('T')[0]
      const today = new Date().toISOString().split('T')[0]

      const { data: products } = await supabase.from('products').select('*')
      const { data: sales } = await supabase.from('sales').select('*').eq('status', 'ativa')
      const { data: bills } = await supabase.from('bills').select('*')
      const { data: installments } = await supabase.from('installments').select('*')
      const { data: cashFlow } = await supabase.from('cash_flow').select('*').single()

      const lowStock = products?.filter(p => p.quantity > 0 && p.quantity <= (p.min_stock || 5)) || []
      const stockProducts = products?.filter(p => p.quantity > 0) || []
      const stockValue = stockProducts.reduce((s, p) => s + (p.sale_price * p.quantity), 0)
      const stockCost = stockProducts.reduce((s, p) => s + (p.cost_price * p.quantity), 0)
      const stockProfit = stockValue - stockCost

      const monthSales = sales?.filter(s => s.sale_date >= startDate && s.sale_date <= endDate) || []
      const totalMonthSales = monthSales.reduce((s, sale) => s + sale.total_amount, 0)
      const todaySales = sales?.filter(s => s.sale_date === today) || []
      const totalTodaySales = todaySales.reduce((s, sale) => s + sale.total_amount, 0)

      const pendingBills = bills?.filter(b => b.status === 'pendente') || []
      
      // Boletos do mês vigente (pendentes com vencimento no mês)
      const boletosMes = bills?.filter(b => b.status === 'pendente' && b.due_date >= startDate && b.due_date <= endDate) || []
      const totalBoletosMes = boletosMes.reduce((s, b) => s + b.amount, 0)

      // Parcelas a receber no mês vigente
      const parcelasMes = installments?.filter(i => i.status === 'pendente' && i.due_date >= startDate && i.due_date <= endDate) || []
      const totalParcelasMes = parcelasMes.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0)

      // Buscar clientes para as parcelas do mês
      const parcelasComClientes = await Promise.all(
        parcelasMes.map(async (inst) => {
          const { data: sale } = await supabase.from('sales').select('client_id').eq('id', inst.sale_id).single()
          const { data: client } = sale ? await supabase.from('clients').select('name').eq('id', sale.client_id).single() : { data: null }
          return { ...inst, client_name: client?.name || 'Cliente' }
        })
      )

      const totalPending = installments?.filter(i => i.status === 'pendente').reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0) || 0

      const paidBills = bills?.filter(b => b.status === 'pago' && b.payment_date && b.payment_date >= startDate && b.payment_date <= endDate) || []
      const totalPaidBills = paidBills.reduce((s, b) => s + (b.paid_amount || b.amount), 0)

      const receivedInstallments = installments?.filter(i => i.status === 'pago' && i.payment_date && i.payment_date >= startDate && i.payment_date <= endDate) || []
      const totalReceived = receivedInstallments.reduce((s, i) => s + (i.paid_amount || i.amount), 0)

      const receivedWithClients = await Promise.all(
        receivedInstallments.map(async (inst) => {
          const { data: sale } = await supabase.from('sales').select('client_id').eq('id', inst.sale_id).single()
          const { data: client } = sale ? await supabase.from('clients').select('name').eq('id', sale.client_id).single() : { data: null }
          return { ...inst, client_name: client?.name || 'Cliente' }
        })
      )

      const { data: extraPayments } = await supabase
        .from('extra_payments')
        .select('*, clients:client_id(name)')
        .gte('created_at', startDate)
        .lte('created_at', endDate)

      const maxFlow = Math.max(totalReceived, totalPaidBills, 1000)

      return {
        lowStock, stockProducts, stockValue, stockCost, stockProfit,
        monthSales, totalMonthSales, todaySales, totalTodaySales,
        pendingBills, totalPending,
        boletosMes, totalBoletosMes,
        parcelasMes: parcelasComClientes, totalParcelasMes,
        paidBills, totalPaidBills,
        receivedInstallments: receivedWithClients,
        extraPayments: extraPayments || [],
        totalReceived,
        cashBalance: cashFlow?.current_balance || 0,
        maxFlow,
        totalProducts: products?.length || 0,
      }
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const updateBalance = async () => {
    const balance = parseFloat(newBalance)
    if (isNaN(balance)) return
    const { data: existing } = await supabase.from('cash_flow').select('*').single()
    if (existing) {
      await supabase.from('cash_flow').update({ current_balance: balance }).eq('id', existing.id)
    } else {
      await supabase.from('cash_flow').insert({ user_id: user?.id, current_balance: balance })
    }
    setEditingBalance(false)
    refetch()
  }

  if (!user) return null
  if (isLoading || !data) return <div className="p-4 mb-24 max-w-2xl mx-auto"><div className="text-center py-8 text-gray-400 animate-pulse">Carregando...</div></div>

  const circleRadius = 75
  const circleCircumference = 2 * Math.PI * circleRadius
  const fillPercent = data.maxFlow > 0 ? Math.min(data.cashBalance / data.maxFlow, 1) : 0
  const strokeOffset = circleCircumference * (1 - fillPercent)

  return (
    <div className="p-3 sm:p-4 mb-24 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div><h1 className="text-xl font-bold">Dashboard</h1><p className="text-xs text-gray-400">{months[selectedMonth]} {selectedYear}</p></div>
      </div>

      {/* Abas meses */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        {Array.from({ length: 6 }, (_, i) => {
          const d = new Date(); d.setMonth(d.getMonth() - (5 - i))
          return <button key={i} onClick={() => { setSelectedMonth(d.getMonth()); setSelectedYear(d.getFullYear()) }}
            className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${selectedMonth === d.getMonth() && selectedYear === d.getFullYear() ? 'bg-blue-500 text-white' : 'glass-card-subtle text-gray-500'}`}>{months[d.getMonth()]}</button>
        })}
      </div>

      {/* Círculo Fluxo de Caixa */}
      <div className="glass-card p-4 mb-4 text-center">
        <p className="text-sm font-semibold mb-3">💰 Fluxo de Caixa</p>
        <div className="relative w-44 h-44 mx-auto mb-2">
          <svg width="100%" height="100%" viewBox="0 0 170 170">
            <circle cx="85" cy="85" r={circleRadius} fill="none" stroke="hsl(220, 15%, 88%)" strokeWidth="10" />
            <motion.circle cx="85" cy="85" r={circleRadius} fill="none" stroke="hsl(142, 76%, 36%)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circleCircumference} initial={{ strokeDashoffset: circleCircumference }} animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 1, ease: "easeInOut" }} transform="rotate(-90 85 85)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {editingBalance ? (
              <div className="flex flex-col gap-1">
                <input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)} className="w-24 text-center px-2 py-1 border rounded-lg text-sm" autoFocus />
                <div className="flex gap-1 justify-center"><button onClick={updateBalance} className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">✓</button><button onClick={() => setEditingBalance(false)} className="bg-gray-300 px-2 py-0.5 rounded text-xs">✕</button></div>
              </div>
            ) : (
              <><p className="text-2xl font-bold text-green-600">R$ {data.cashBalance?.toFixed(0)}</p>
              <button onClick={() => { setEditingBalance(true); setNewBalance(data.cashBalance?.toString() || '0') }} className="text-[10px] text-blue-500 underline mt-0.5">Ajustar</button></>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div onClick={() => setShowRecebimentos(true)} className="bg-green-50 p-2 rounded-xl cursor-pointer active:scale-95">
            <p className="text-[10px] text-gray-500">Entradas (mês)</p>
            <p className="text-sm font-bold text-green-600">R$ {data.totalReceived?.toFixed(0)}</p>
          </div>
          <div onClick={() => setShowBoletosPagos(true)} className="bg-blue-50 p-2 rounded-xl cursor-pointer active:scale-95">
            <p className="text-[10px] text-gray-500">Boletos Pagos</p>
            <p className="text-sm font-bold text-blue-600">R$ {data.totalPaidBills?.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div onClick={() => navigate('/products')} className="metric-card cursor-pointer active:scale-95"><AlertTriangle size={18} color="hsl(38, 92%, 50%)" /><p className="text-xl font-bold text-orange-500 mt-1">{data.lowStock?.length || 0}</p><p className="text-[10px] text-gray-400">Estoque Baixo</p></div>
        
        {/* NOVO: Boletos do Mês */}
        <div onClick={() => setShowBoletosMes(true)} className="metric-card cursor-pointer active:scale-95">
          <Calendar size={18} color="hsl(0, 72%, 51%)" />
          <p className="text-lg font-bold text-red-500 mt-1">{data.boletosMes?.length || 0}</p>
          <p className="text-[10px] text-gray-400">Boletos do Mês</p>
          <p className="text-xs font-bold text-red-500">R$ {data.totalBoletosMes?.toFixed(0)}</p>
        </div>

        {/* NOVO: Parcelas do Mês */}
        <div onClick={() => setShowParcelasMes(true)} className="metric-card cursor-pointer active:scale-95">
          <CreditCard size={18} color="hsl(211, 100%, 50%)" />
          <p className="text-lg font-bold text-blue-500 mt-1">{data.parcelasMes?.length || 0}</p>
          <p className="text-[10px] text-gray-400">Parcelas do Mês</p>
          <p className="text-xs font-bold text-blue-500">R$ {data.totalParcelasMes?.toFixed(0)}</p>
        </div>

        <div className="metric-card"><ShoppingCart size={18} color="hsl(211, 100%, 50%)" /><p className="text-xl font-bold text-blue-500 mt-1">R$ {data.totalTodaySales?.toFixed(0)}</p><p className="text-[10px] text-gray-400">Vendas Hoje</p></div>
        <div className="metric-card"><TrendingUp size={18} color="hsl(142, 76%, 36%)" /><p className="text-xl font-bold text-green-600 mt-1">R$ {data.totalMonthSales?.toFixed(0)}</p><p className="text-[10px] text-gray-400">{data.monthSales?.length || 0} vendas</p></div>
        <div className="metric-card"><Users size={18} color="hsl(38, 92%, 50%)" /><p className="text-xl font-bold text-orange-500 mt-1">R$ {data.totalPending?.toFixed(0)}</p><p className="text-[10px] text-gray-400">A Receber</p></div>
        <div className="metric-card"><Package size={18} color="hsl(211, 100%, 50%)" /><p className="text-xl font-bold text-blue-500 mt-1">R$ {data.stockValue?.toFixed(0)}</p><p className="text-[10px] text-gray-400">{data.stockProducts?.length || 0} itens</p></div>
        <div className="metric-card"><DollarSign size={18} color="hsl(142, 76%, 36%)" /><p className="text-xl font-bold text-green-600 mt-1">R$ {data.stockProfit?.toFixed(0)}</p><p className="text-[10px] text-gray-400">Lucro Est.</p></div>
        <div className="metric-card"><Package size={18} color="hsl(211, 100%, 50%)" /><p className="text-xl font-bold text-blue-500 mt-1">{data.totalProducts}</p><p className="text-[10px] text-gray-400">Produtos</p></div>
      </div>

      {/* POP-UP: Recebimentos */}
      <Dialog open={showRecebimentos} onOpenChange={setShowRecebimentos}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📥 Entradas do Mês</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            <p className="text-sm font-bold text-green-600 mb-2">Total: R$ {data.totalReceived?.toFixed(2)}</p>
            {data.receivedInstallments?.length === 0 && data.extraPayments?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum recebimento no período</p>
            ) : (
              <>
                {data.receivedInstallments?.map((inst: any) => (
                  <div key={inst.id} className="bg-green-50 p-3 rounded-xl">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{inst.client_name}</p>
                        <p className="text-xs text-gray-500">Parcela {inst.installment_number}x - {new Date(inst.payment_date).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <p className="font-bold text-green-700">R$ {(inst.paid_amount || inst.amount)?.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {data.extraPayments?.map((ep: any) => (
                  <div key={ep.id} className="bg-green-50 p-3 rounded-xl border border-green-200">
                    <div className="flex justify-between items-center">
                      <div><p className="text-sm font-medium">{ep.clients?.name || 'Cliente'}</p><p className="text-xs text-gray-500">Pagamento Avulso - {new Date(ep.created_at).toLocaleDateString('pt-BR')}</p></div>
                      <p className="font-bold text-green-700">R$ {ep.amount?.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* POP-UP: Boletos Pagos */}
      <Dialog open={showBoletosPagos} onOpenChange={setShowBoletosPagos}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>✅ Boletos Pagos</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            <p className="text-sm font-bold text-blue-600 mb-2">Total: R$ {data.totalPaidBills?.toFixed(2)}</p>
            {data.paidBills?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum boleto pago no período</p>
            ) : (
              data.paidBills.map((bill: any) => (
                <div key={bill.id} className="bg-blue-50 p-3 rounded-xl">
                  <div className="flex justify-between items-center">
                    <div><p className="text-sm font-medium">{bill.supplier}</p><p className="text-xs text-gray-500">Pago em: {new Date(bill.payment_date).toLocaleDateString('pt-BR')}</p><p className="text-xs text-gray-400">Venc: {new Date(bill.due_date).toLocaleDateString('pt-BR')}</p></div>
                    <p className="font-bold text-blue-700">R$ {(bill.paid_amount || bill.amount)?.toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* POP-UP: Boletos do Mês */}
      <Dialog open={showBoletosMes} onOpenChange={setShowBoletosMes}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📄 Boletos do Mês</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">{data.boletosMes?.length || 0} boleto(s)</p>
              <p className="text-sm font-bold text-red-600">Total: R$ {data.totalBoletosMes?.toFixed(2)}</p>
            </div>
            {data.boletosMes?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum boleto este mês 🎉</p>
            ) : (
              data.boletosMes
                .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                .map((bill: any) => (
                <div key={bill.id} className="bg-red-50 p-3 rounded-xl border border-red-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{bill.supplier}</p>
                      <p className="text-xs text-gray-500">Venc: {new Date(bill.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
                      {bill.notes && <p className="text-[10px] text-gray-400">{bill.notes}</p>}
                    </div>
                    <p className="font-bold text-red-700">R$ {bill.amount?.toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* POP-UP: Parcelas do Mês */}
      <Dialog open={showParcelasMes} onOpenChange={setShowParcelasMes}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>💳 Parcelas a Receber</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm text-gray-500">{data.parcelasMes?.length || 0} parcela(s)</p>
              <p className="text-sm font-bold text-blue-600">Total: R$ {data.totalParcelasMes?.toFixed(2)}</p>
            </div>
            {data.parcelasMes?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma parcela este mês 🎉</p>
            ) : (
              data.parcelasMes
                .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                .map((inst: any) => (
                <div key={inst.id} className="bg-blue-50 p-3 rounded-xl border border-blue-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium">{inst.client_name}</p>
                      <p className="text-xs text-gray-500">{inst.installment_number}x - Venc: {new Date(inst.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p>
                    </div>
                    <p className="font-bold text-blue-700">R$ {(inst.amount - (inst.paid_amount || 0))?.toFixed(2)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}