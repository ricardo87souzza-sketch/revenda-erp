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
  const [modal, setModal] = useState<{ title: string; type: string } | null>(null)
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
      const stockProductsWithProfit = stockProducts.map(p => ({ ...p, profit: (p.sale_price - p.cost_price) * p.quantity, profitUnit: p.sale_price - p.cost_price }))
      const stockValue = stockProducts.reduce((s, p) => s + (p.sale_price * p.quantity), 0)
      const stockCost = stockProducts.reduce((s, p) => s + (p.cost_price * p.quantity), 0)
      const stockProfit = stockValue - stockCost

      const monthSales = sales?.filter(s => s.sale_date >= startDate && s.sale_date <= endDate) || []
      const totalMonthSales = monthSales.reduce((s, sale) => s + sale.total_amount, 0)
      const todaySales = sales?.filter(s => s.sale_date === today) || []
      const totalTodaySales = todaySales.reduce((s, sale) => s + sale.total_amount, 0)

      const todaySalesDetailed = await Promise.all(todaySales.map(async (s) => {
        const { data: client } = await supabase.from('clients').select('name').eq('id', s.client_id).single()
        const { data: items } = await supabase.from('sale_items').select('*, product:product_id(name)').eq('sale_id', s.id)
        return { ...s, client_name: client?.name || 'Cliente', items: items || [] }
      }))

      const monthSalesDetailed = await Promise.all(monthSales.map(async (s) => {
        const { data: client } = await supabase.from('clients').select('name').eq('id', s.client_id).single()
        return { ...s, client_name: client?.name || 'Cliente' }
      }))

      const boletosMes = bills?.filter(b => b.status === 'pendente' && b.due_date >= startDate && b.due_date <= endDate) || []
      const totalBoletosMes = boletosMes.reduce((s, b) => s + b.amount, 0)

      const parcelasMes = installments?.filter(i => i.status === 'pendente' && i.due_date >= startDate && i.due_date <= endDate) || []
      const totalParcelasMes = parcelasMes.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0)
      const parcelasComClientes = await Promise.all(parcelasMes.map(async (inst) => {
        const { data: sale } = await supabase.from('sales').select('client_id').eq('id', inst.sale_id).single()
        const { data: client } = sale ? await supabase.from('clients').select('name').eq('id', sale.client_id).single() : { data: null }
        return { ...inst, client_name: client?.name || 'Cliente' }
      }))

      const allPending = installments?.filter(i => i.status === 'pendente') || []
      const totalPending = allPending.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0)
      const pendingWithClients = await Promise.all(allPending.map(async (inst) => {
        const { data: sale } = await supabase.from('sales').select('client_id').eq('id', inst.sale_id).single()
        const { data: client } = sale ? await supabase.from('clients').select('name').eq('id', sale.client_id).single() : { data: null }
        return { ...inst, client_name: client?.name || 'Cliente' }
      }))

      const paidBills = bills?.filter(b => b.status === 'pago' && b.payment_date && b.payment_date >= startDate && b.payment_date <= endDate) || []
      const totalPaidBills = paidBills.reduce((s, b) => s + (b.paid_amount || b.amount), 0)

      const receivedInstallments = installments?.filter(i => i.status === 'pago' && i.payment_date && i.payment_date >= startDate && i.payment_date <= endDate) || []
      const totalReceived = receivedInstallments.reduce((s, i) => s + (i.paid_amount || i.amount), 0)
      const receivedWithClients = await Promise.all(receivedInstallments.map(async (inst) => {
        const { data: sale } = await supabase.from('sales').select('client_id').eq('id', inst.sale_id).single()
        const { data: client } = sale ? await supabase.from('clients').select('name').eq('id', sale.client_id).single() : { data: null }
        return { ...inst, client_name: client?.name || 'Cliente' }
      }))

      const { data: extraPayments } = await supabase.from('extra_payments').select('*, clients:client_id(name)').gte('created_at', startDate).lte('created_at', endDate + 'T23:59:59')

      let totalLucroObtido = 0
      const lucrosPorProduto: any = {}
      for (const sale of monthSales) {
        const { data: items } = await supabase.from('sale_items').select('*, product:product_id(name, cost_price)').eq('sale_id', sale.id)
        if (items) {
          for (const item of items) {
            const custo = (item.product?.cost_price || 0) * item.quantity
            const lucro = item.total_price - custo
            totalLucroObtido += lucro
            const nome = item.product?.name || 'Produto'
            if (!lucrosPorProduto[nome]) lucrosPorProduto[nome] = { name: nome, quantity: 0, lucro: 0, total: 0 }
            lucrosPorProduto[nome].quantity += item.quantity
            lucrosPorProduto[nome].lucro += lucro
            lucrosPorProduto[nome].total += item.total_price
          }
        }
      }

      const maxFlow = Math.max(totalReceived, totalPaidBills, 1000)

      return {
        lowStock, stockProducts: stockProductsWithProfit, stockValue, stockCost, stockProfit,
        monthSales: monthSalesDetailed, totalMonthSales,
        todaySales: todaySalesDetailed, totalTodaySales,
        boletosMes, totalBoletosMes,
        parcelasMes: parcelasComClientes, totalParcelasMes,
        allPending: pendingWithClients, totalPending,
        paidBills, totalPaidBills,
        receivedInstallments: receivedWithClients, extraPayments: extraPayments || [], totalReceived,
        cashBalance: cashFlow?.current_balance || 0,
        totalLucroObtido, lucrosPorProduto: Object.values(lucrosPorProduto),
        maxFlow, totalProducts: products?.length || 0,
      }
    },
    refetchOnWindowFocus: true, staleTime: 0,
  })

  const updateBalance = async () => {
    const balance = parseFloat(newBalance)
    if (isNaN(balance)) return
    const { data: existing } = await supabase.from('cash_flow').select('*').single()
    if (existing) await supabase.from('cash_flow').update({ current_balance: balance }).eq('id', existing.id)
    else await supabase.from('cash_flow').insert({ user_id: user?.id, current_balance: balance })
    setEditingBalance(false); refetch()
  }

  const openModal = (title: string, type: string) => setModal({ title, type })
  const closeModal = () => setModal(null)

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
              <div className="flex flex-col gap-1"><input type="number" value={newBalance} onChange={e => setNewBalance(e.target.value)} className="w-24 text-center px-2 py-1 border rounded-lg text-sm" autoFocus /><div className="flex gap-1 justify-center"><button onClick={updateBalance} className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">✓</button><button onClick={() => setEditingBalance(false)} className="bg-gray-300 px-2 py-0.5 rounded text-xs">✕</button></div></div>
            ) : (
              <><p className="text-2xl font-bold text-green-600">R$ {data.cashBalance?.toFixed(0)}</p><button onClick={() => { setEditingBalance(true); setNewBalance(data.cashBalance?.toString() || '0') }} className="text-[10px] text-blue-500 underline mt-0.5">Ajustar</button></>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div onClick={() => openModal('📥 Entradas do Mês', 'recebimentos')} className="bg-green-50 p-2 rounded-xl cursor-pointer active:scale-95"><p className="text-[10px] text-gray-500">Entradas (mês)</p><p className="text-sm font-bold text-green-600">R$ {data.totalReceived?.toFixed(0)}</p></div>
          <div onClick={() => openModal('✅ Boletos Pagos', 'boletosPagos')} className="bg-blue-50 p-2 rounded-xl cursor-pointer active:scale-95"><p className="text-[10px] text-gray-500">Boletos Pagos</p><p className="text-sm font-bold text-blue-600">R$ {data.totalPaidBills?.toFixed(0)}</p></div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div onClick={() => openModal('🔴 Estoque Baixo', 'lowStock')} className="metric-card cursor-pointer active:scale-95"><AlertTriangle size={18} color="hsl(38, 92%, 50%)" /><p className="text-xl font-bold text-orange-500 mt-1">{data.lowStock?.length || 0}</p><p className="text-[10px] text-gray-400">Estoque Baixo</p></div>

        {/* Boletos do Mês - Retangular */}
        <div onClick={() => openModal('📄 Boletos do Mês', 'boletosMes')} className="metric-card cursor-pointer active:scale-95 col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={20} color="hsl(0, 72%, 51%)" />
            <div><p className="text-sm font-bold text-red-500">{data.boletosMes?.length || 0} boleto(s)</p><p className="text-[10px] text-gray-400">Boletos do Mês</p></div>
          </div>
          <p className="text-base font-bold text-red-500">R$ {data.totalBoletosMes?.toFixed(0)}</p>
        </div>

        {/* Parcelas do Mês - Retangular */}
        <div onClick={() => openModal('💳 Parcelas do Mês', 'parcelasMes')} className="metric-card cursor-pointer active:scale-95 col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={20} color="hsl(211, 100%, 50%)" />
            <div><p className="text-sm font-bold text-blue-500">{data.parcelasMes?.length || 0} parcela(s)</p><p className="text-[10px] text-gray-400">Parcelas do Mês</p></div>
          </div>
          <p className="text-base font-bold text-blue-500">R$ {data.totalParcelasMes?.toFixed(0)}</p>
        </div>

        <div onClick={() => openModal('📅 Vendas do Dia', 'vendasDia')} className="metric-card cursor-pointer active:scale-95"><ShoppingCart size={18} color="hsl(211, 100%, 50%)" /><p className="text-xl font-bold text-blue-500 mt-1">R$ {data.totalTodaySales?.toFixed(0)}</p><p className="text-[10px] text-gray-400">Vendas Hoje</p></div>
        <div onClick={() => openModal('💰 Vendas do Mês', 'vendasMes')} className="metric-card cursor-pointer active:scale-95"><TrendingUp size={18} color="hsl(142, 76%, 36%)" /><p className="text-xl font-bold text-green-600 mt-1">R$ {data.totalMonthSales?.toFixed(0)}</p><p className="text-[10px] text-gray-400">{data.monthSales?.length || 0} vendas</p></div>
        <div onClick={() => openModal('🎯 Total a Receber', 'totalReceber')} className="metric-card cursor-pointer active:scale-95"><Users size={18} color="hsl(38, 92%, 50%)" /><p className="text-xl font-bold text-orange-500 mt-1">R$ {data.totalPending?.toFixed(0)}</p><p className="text-[10px] text-gray-400">A Receber</p></div>
        <div onClick={() => openModal('📦 Valor em Estoque', 'estoque')} className="metric-card cursor-pointer active:scale-95"><Package size={18} color="hsl(211, 100%, 50%)" /><p className="text-xl font-bold text-blue-500 mt-1">R$ {data.stockValue?.toFixed(0)}</p><p className="text-[10px] text-gray-400">{data.stockProducts?.length || 0} itens</p></div>
        <div onClick={() => openModal('📈 Lucro Estimado', 'lucroEstimado')} className="metric-card cursor-pointer active:scale-95"><DollarSign size={18} color="hsl(142, 76%, 36%)" /><p className="text-xl font-bold text-green-600 mt-1">R$ {data.stockProfit?.toFixed(0)}</p><p className="text-[10px] text-gray-400">Lucro Est.</p></div>
        <div onClick={() => openModal('💎 Lucro Obtido', 'lucroObtido')} className="metric-card cursor-pointer active:scale-95"><DollarSign size={18} color="hsl(142, 76%, 36%)" /><p className="text-xl font-bold text-green-600 mt-1">R$ {data.totalLucroObtido?.toFixed(0)}</p><p className="text-[10px] text-gray-400">Lucro Obtido</p></div>
        <div onClick={() => openModal('📦 Produtos Cadastrados', 'produtos')} className="metric-card cursor-pointer active:scale-95"><Package size={18} color="hsl(211, 100%, 50%)" /><p className="text-xl font-bold text-blue-500 mt-1">{data.totalProducts}</p><p className="text-[10px] text-gray-400">Produtos</p></div>
      </div>

      {/* MODAL GENÉRICO */}
      <Dialog open={!!modal} onOpenChange={() => closeModal()}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modal?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            {modal?.type === 'recebimentos' && (<><p className="text-sm font-bold text-green-600 mb-2">Total: R$ {data.totalReceived?.toFixed(2)}</p>{data.receivedInstallments?.map((inst: any) => (<div key={inst.id} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{inst.client_name}</p><p className="text-xs text-gray-500">Parcela {inst.installment_number}x - {new Date(inst.payment_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-green-700">R$ {(inst.paid_amount || inst.amount)?.toFixed(2)}</p></div></div>))}{data.extraPayments?.map((ep: any) => (<div key={ep.id} className="bg-green-50 p-3 rounded-xl border border-green-200"><div className="flex justify-between"><div><p className="text-sm font-medium">{ep.clients?.name}</p><p className="text-xs text-gray-500">Avulso - {new Date(ep.created_at).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-green-700">R$ {ep.amount?.toFixed(2)}</p></div></div>))}{!data.receivedInstallments?.length && !data.extraPayments?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum recebimento</p>}</>)}
            {modal?.type === 'boletosPagos' && (<><p className="text-sm font-bold text-blue-600 mb-2">Total: R$ {data.totalPaidBills?.toFixed(2)}</p>{data.paidBills?.map((bill: any) => (<div key={bill.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{bill.supplier}</p><p className="text-xs text-gray-500">Pago: {new Date(bill.payment_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-blue-700">R$ {(bill.paid_amount || bill.amount)?.toFixed(2)}</p></div></div>))}{!data.paidBills?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum boleto pago</p>}</>)}
            {modal?.type === 'boletosMes' && (<><p className="text-sm font-bold text-red-600 mb-2">{data.boletosMes?.length} boleto(s) - Total: R$ {data.totalBoletosMes?.toFixed(2)}</p>{data.boletosMes?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((bill: any) => (<div key={bill.id} className="bg-red-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{bill.supplier}</p><p className="text-xs text-gray-500">Venc: {new Date(bill.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p></div><p className="font-bold text-red-700">R$ {bill.amount?.toFixed(2)}</p></div></div>))}{!data.boletosMes?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum boleto 🎉</p>}</>)}
            {modal?.type === 'parcelasMes' && (<><p className="text-sm font-bold text-blue-600 mb-2">{data.parcelasMes?.length} parcela(s) - Total: R$ {data.totalParcelasMes?.toFixed(2)}</p>{data.parcelasMes?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((inst: any) => (<div key={inst.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{inst.client_name}</p><p className="text-xs text-gray-500">{inst.installment_number}x - Venc: {new Date(inst.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p></div><p className="font-bold text-blue-700">R$ {(inst.amount - (inst.paid_amount || 0))?.toFixed(2)}</p></div></div>))}{!data.parcelasMes?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma parcela 🎉</p>}</>)}
            {modal?.type === 'lowStock' && (<>{data.lowStock?.map((p: any) => (<div key={p.id} className="bg-orange-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">SKU: {p.sku} | Mín: {p.min_stock || 5}</p></div><p className="font-bold text-orange-600">{p.quantity} un.</p></div></div>))}{!data.lowStock?.length && <p className="text-sm text-gray-400 text-center py-4">Todos com estoque ok!</p>}</>)}
            {modal?.type === 'vendasDia' && (<><p className="text-sm font-bold text-blue-600 mb-2">Total: R$ {data.totalTodaySales?.toFixed(2)}</p>{data.todaySales?.map((s: any) => (<div key={s.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{s.client_name}</p><p className="text-xs text-gray-500">{new Date(s.sale_date).toLocaleDateString('pt-BR')}</p>{s.items?.map((i: any) => <span key={i.id} className="text-[10px] text-gray-400 block">{i.product?.name} x{i.quantity}</span>)}</div><p className="font-bold text-blue-700">R$ {s.total_amount?.toFixed(2)}</p></div></div>))}{!data.todaySales?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma venda hoje</p>}</>)}
            {modal?.type === 'vendasMes' && (<><p className="text-sm font-bold text-green-600 mb-2">Total: R$ {data.totalMonthSales?.toFixed(2)}</p>{data.monthSales?.map((s: any) => (<div key={s.id} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{s.client_name}</p><p className="text-xs text-gray-500">{new Date(s.sale_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-green-700">R$ {s.total_amount?.toFixed(2)}</p></div></div>))}{!data.monthSales?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma venda no mês</p>}</>)}
            {modal?.type === 'totalReceber' && (<><p className="text-sm font-bold text-orange-600 mb-2">Total: R$ {data.totalPending?.toFixed(2)}</p>{data.allPending?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((inst: any) => (<div key={inst.id} className="bg-orange-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{inst.client_name}</p><p className="text-xs text-gray-500">{inst.installment_number}x - Venc: {new Date(inst.due_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-orange-700">R$ {(inst.amount - (inst.paid_amount || 0))?.toFixed(2)}</p></div></div>))}{!data.allPending?.length && <p className="text-sm text-gray-400 text-center py-4">Nada a receber 🎉</p>}</>)}
            {modal?.type === 'estoque' && (<><p className="text-sm font-bold text-blue-600 mb-2">Total Venda: R$ {data.stockValue?.toFixed(2)} | Custo: R$ {data.stockCost?.toFixed(2)}</p>{data.stockProducts?.map((p: any) => (<div key={p.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">Qtd: {p.quantity} | Un: R$ {p.sale_price?.toFixed(2)}</p></div><p className="font-bold text-blue-700">R$ {(p.sale_price * p.quantity)?.toFixed(2)}</p></div></div>))}</>)}
            {modal?.type === 'lucroEstimado' && (<><p className="text-sm font-bold text-green-600 mb-2">Lucro Total: R$ {data.stockProfit?.toFixed(2)}</p>{data.stockProducts?.map((p: any) => (<div key={p.id} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">Qtd: {p.quantity} | Lucro un: R$ {p.profitUnit?.toFixed(2)}</p></div><p className="font-bold text-green-700">R$ {p.profit?.toFixed(2)}</p></div></div>))}</>)}
            {modal?.type === 'lucroObtido' && (<><p className="text-sm font-bold text-green-600 mb-2">Total: R$ {data.totalLucroObtido?.toFixed(2)}</p>{(data.lucrosPorProduto as any[])?.map((item: any, i: number) => (<div key={i} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-gray-500">{item.quantity} un. vendidas</p></div><p className="font-bold text-green-700">R$ {item.lucro?.toFixed(2)}</p></div></div>))}{!data.lucrosPorProduto?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum lucro registrado</p>}</>)}
            {modal?.type === 'produtos' && (<><p className="text-sm font-bold text-blue-600 mb-2">{data.totalProducts} produtos cadastrados</p>{data.stockProducts?.map((p: any) => (<div key={p.id} className="bg-gray-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">SKU: {p.sku} | Estoque: {p.quantity}</p></div><p className="text-sm">R$ {p.sale_price?.toFixed(2)}</p></div></div>))}</>)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}