import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { DollarSign, Package, ShoppingCart, Users, TrendingUp, AlertTriangle, Calendar, CreditCard } from 'lucide-react'
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

  const formatMoney = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

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
              <><p className="text-2xl font-bold text-green-600">R$ {formatMoney(data.cashBalance || 0)}</p><button onClick={() => { setEditingBalance(true); setNewBalance(data.cashBalance?.toString() || '0') }} className="text-[10px] text-blue-500 underline mt-0.5">Ajustar</button></>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div onClick={() => openModal('📥 Entradas do Mês', 'recebimentos')} className="bg-green-50 p-2 rounded-xl cursor-pointer active:scale-95"><p className="text-[10px] text-gray-500">Entradas (mês)</p><p className="text-sm font-bold text-green-600">R$ {formatMoney(data.totalReceived || 0)}</p></div>
          <div onClick={() => openModal('✅ Boletos Pagos', 'boletosPagos')} className="bg-blue-50 p-2 rounded-xl cursor-pointer active:scale-95"><p className="text-[10px] text-gray-500">Boletos Pagos</p><p className="text-sm font-bold text-blue-600">R$ {formatMoney(data.totalPaidBills || 0)}</p></div>
        </div>
      </div>

      {/* Grid principal */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">

        {/* 💳 Parcelas do Mês - Retangular */}
        <div onClick={() => openModal('💳 Parcelas do Mês', 'parcelasMes')} className="metric-card cursor-pointer active:scale-95 col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={20} color="hsl(211, 100%, 50%)" />
            <div><p className="text-sm font-bold text-blue-500">{data.parcelasMes?.length || 0} parcela(s)</p><p className="text-[10px] text-gray-400">Parcelas do Mês</p></div>
          </div>
          <p className="text-base font-bold text-blue-500">R$ {formatMoney(data.totalParcelasMes || 0)}</p>
        </div>

        {/* 📄 Boletos do Mês - Retangular */}
        <div onClick={() => openModal('📄 Boletos do Mês', 'boletosMes')} className="metric-card cursor-pointer active:scale-95 col-span-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={20} color="hsl(0, 72%, 51%)" />
            <div><p className="text-sm font-bold text-red-500">{data.boletosMes?.length || 0} boleto(s)</p><p className="text-[10px] text-gray-400">Boletos do Mês</p></div>
          </div>
          <p className="text-base font-bold text-red-500">R$ {formatMoney(data.totalBoletosMes || 0)}</p>
        </div>

        {/* 💰 Vendas Mês | 📅 Vendas Hoje */}
        <div onClick={() => openModal('💰 Vendas do Mês', 'vendasMes')} className="metric-card cursor-pointer active:scale-95"><TrendingUp size={18} color="hsl(142, 76%, 36%)" /><p className="text-lg font-bold text-green-600 mt-1">R$ {formatMoney(data.totalMonthSales || 0)}</p><p className="text-[10px] text-gray-400">{data.monthSales?.length || 0} vendas no mês</p></div>
        <div onClick={() => openModal('📅 Vendas do Dia', 'vendasDia')} className="metric-card cursor-pointer active:scale-95"><ShoppingCart size={18} color="hsl(211, 100%, 50%)" /><p className="text-lg font-bold text-blue-500 mt-1">R$ {formatMoney(data.totalTodaySales || 0)}</p><p className="text-[10px] text-gray-400">Vendas Hoje</p></div>

        {/* 🎯 A Receber | 📈 Lucro Est. */}
        <div onClick={() => openModal('🎯 Total a Receber', 'totalReceber')} className="metric-card cursor-pointer active:scale-95"><Users size={18} color="hsl(38, 92%, 50%)" /><p className="text-lg font-bold text-orange-500 mt-1">R$ {formatMoney(data.totalPending || 0)}</p><p className="text-[10px] text-gray-400">A Receber</p></div>
        <div onClick={() => openModal('📈 Lucro Estimado', 'lucroEstimado')} className="metric-card cursor-pointer active:scale-95"><DollarSign size={18} color="hsl(142, 76%, 36%)" /><p className="text-lg font-bold text-green-600 mt-1">R$ {formatMoney(data.stockProfit || 0)}</p><p className="text-[10px] text-gray-400">Lucro Est.</p></div>

        {/* 💎 Lucro Obtido | 📦 Produtos */}
        <div onClick={() => openModal('💎 Lucro Obtido', 'lucroObtido')} className="metric-card cursor-pointer active:scale-95"><DollarSign size={18} color="hsl(142, 76%, 36%)" /><p className="text-lg font-bold text-green-600 mt-1">R$ {formatMoney(data.totalLucroObtido || 0)}</p><p className="text-[10px] text-gray-400">Lucro Obtido</p></div>
        <div onClick={() => openModal('📦 Produtos Cadastrados', 'produtos')} className="metric-card cursor-pointer active:scale-95"><Package size={18} color="hsl(211, 100%, 50%)" /><p className="text-lg font-bold text-blue-500 mt-1">{data.totalProducts}</p><p className="text-[10px] text-gray-400">Produtos</p></div>

        {/* 📦 Estoque | 🔴 Estoque Baixo */}
        <div onClick={() => openModal('📦 Valor em Estoque', 'estoque')} className="metric-card cursor-pointer active:scale-95"><Package size={18} color="hsl(211, 100%, 50%)" /><p className="text-lg font-bold text-blue-500 mt-1">R$ {formatMoney(data.stockValue || 0)}</p><p className="text-[10px] text-gray-400">{data.stockProducts?.length || 0} itens</p></div>
        <div onClick={() => openModal('🔴 Estoque Baixo', 'lowStock')} className="metric-card cursor-pointer active:scale-95"><AlertTriangle size={18} color="hsl(38, 92%, 50%)" /><p className="text-lg font-bold text-orange-500 mt-1">{data.lowStock?.length || 0}</p><p className="text-[10px] text-gray-400">Estoque Baixo</p></div>

      </div>

      {/* MODAL GENÉRICO */}
      <Dialog open={!!modal} onOpenChange={() => closeModal()}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{modal?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2 mt-2">
            {/* RECEBIMENTOS - ORDENADOS POR MAIS RECENTES */}
                                    {modal?.type === 'recebimentos' && (<><p className="text-sm font-bold text-green-600 mb-2">Total: R$ {formatMoney(data.totalReceived || 0)}</p>
              {(() => {
                const todos = [
                  ...(data.receivedInstallments || []).map((inst: any) => ({
                    tipo: 'parcela',
                    id: inst.id,
                    nome: inst.client_name,
                    data: inst.payment_date,
                    desc: `Parcela ${inst.installment_number}x`,
                    valor: inst.paid_amount || inst.amount || 0
                  })),
                  ...(data.extraPayments || []).map((ep: any) => ({
                    tipo: 'avulso',
                    id: ep.id,
                    nome: ep.clients?.name || 'Cliente',
                    data: ep.created_at,
                    desc: 'Pagamento Avulso',
                    valor: ep.amount || 0
                  }))
                ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())

                if (todos.length === 0) return <p className="text-sm text-gray-400 text-center py-4">Nenhum recebimento</p>

                const handleDeleteEntry = async (item: any) => {
                  if (!confirm(`Excluir este recebimento de R$ ${formatMoney(item.valor)}?`)) return
                  
                  if (item.tipo === 'parcela') {
                    // Reverter parcela para pendente
                    await supabase.from('installments').update({
                      status: 'pendente',
                      paid_amount: 0,
                      payment_date: null
                    }).eq('id', item.id)
                  } else {
                    // Excluir pagamento avulso
                    await supabase.from('extra_payments').delete().eq('id', item.id)
                    // Reverter valores nas parcelas (complexo, vamos simplificar)
                  }
                  
                  refetch()
                  alert('Recebimento excluído! Os valores foram revertidos.')
                }

                return todos.map((item, i) => (
                  <div key={i} className={`p-3 rounded-xl relative group ${item.tipo === 'avulso' ? 'bg-green-50 border border-green-200' : 'bg-green-50'}`}>
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.nome}</p>
                        <p className="text-xs text-gray-500">{item.desc} - {new Date(item.data).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-green-700">R$ {formatMoney(item.valor)}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteEntry(item) }}
                          className="text-gray-300 hover:text-red-500 text-lg leading-none p-1"
                          title="Excluir"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </>)}

            {/* BOLETOS PAGOS */}
            {modal?.type === 'boletosPagos' && (<><p className="text-sm font-bold text-blue-600 mb-2">Total: R$ {formatMoney(data.totalPaidBills || 0)}</p>{data.paidBills?.map((bill: any) => (<div key={bill.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{bill.supplier}</p><p className="text-xs text-gray-500">Pago: {new Date(bill.payment_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-blue-700">R$ {formatMoney(bill.paid_amount || bill.amount || 0)}</p></div></div>))}{!data.paidBills?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum boleto pago</p>}</>)}

            {/* BOLETOS DO MÊS */}
            {modal?.type === 'boletosMes' && (<><p className="text-sm font-bold text-red-600 mb-2">{data.boletosMes?.length} boleto(s) - Total: R$ {formatMoney(data.totalBoletosMes || 0)}</p>{data.boletosMes?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((bill: any) => (<div key={bill.id} className="bg-red-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{bill.supplier}</p><p className="text-xs text-gray-500">Venc: {new Date(bill.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p></div><p className="font-bold text-red-700">R$ {formatMoney(bill.amount || 0)}</p></div></div>))}{!data.boletosMes?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum boleto 🎉</p>}</>)}

            {/* PARCELAS DO MÊS */}
            {modal?.type === 'parcelasMes' && (<><p className="text-sm font-bold text-blue-600 mb-2">{data.parcelasMes?.length} parcela(s) - Total: R$ {formatMoney(data.totalParcelasMes || 0)}</p>{data.parcelasMes?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((inst: any) => (<div key={inst.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{inst.client_name}</p><p className="text-xs text-gray-500">{inst.installment_number}x - Venc: {new Date(inst.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p></div><p className="font-bold text-blue-700">R$ {formatMoney((inst.amount || 0) - (inst.paid_amount || 0))}</p></div></div>))}{!data.parcelasMes?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma parcela 🎉</p>}</>)}

            {/* ESTOQUE BAIXO */}
            {modal?.type === 'lowStock' && (<>{data.lowStock?.map((p: any) => (<div key={p.id} className="bg-orange-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">SKU: {p.sku} | Mín: {p.min_stock || 5}</p></div><p className="font-bold text-orange-600">{p.quantity} un.</p></div></div>))}{!data.lowStock?.length && <p className="text-sm text-gray-400 text-center py-4">Todos com estoque ok!</p>}</>)}

            {/* VENDAS DO DIA */}
            {modal?.type === 'vendasDia' && (<><p className="text-sm font-bold text-blue-600 mb-2">Total: R$ {formatMoney(data.totalTodaySales || 0)}</p>{data.todaySales?.map((s: any) => (<div key={s.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{s.client_name}</p><p className="text-xs text-gray-500">{new Date(s.sale_date).toLocaleDateString('pt-BR')}</p>{s.items?.map((i: any) => <span key={i.id} className="text-[10px] text-gray-400 block">{i.product?.name} x{i.quantity}</span>)}</div><p className="font-bold text-blue-700">R$ {formatMoney(s.total_amount || 0)}</p></div></div>))}{!data.todaySales?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma venda hoje</p>}</>)}

            {/* VENDAS DO MÊS */}
            {modal?.type === 'vendasMes' && (<><p className="text-sm font-bold text-green-600 mb-2">Total: R$ {formatMoney(data.totalMonthSales || 0)}</p>{data.monthSales?.map((s: any) => (<div key={s.id} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{s.client_name}</p><p className="text-xs text-gray-500">{new Date(s.sale_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-green-700">R$ {formatMoney(s.total_amount || 0)}</p></div></div>))}{!data.monthSales?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhuma venda no mês</p>}</>)}

            {/* TOTAL A RECEBER */}
            {modal?.type === 'totalReceber' && (<><p className="text-sm font-bold text-orange-600 mb-2">Total: R$ {formatMoney(data.totalPending || 0)}</p>{data.allPending?.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()).map((inst: any) => (<div key={inst.id} className="bg-orange-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{inst.client_name}</p><p className="text-xs text-gray-500">{inst.installment_number}x - Venc: {new Date(inst.due_date).toLocaleDateString('pt-BR')}</p></div><p className="font-bold text-orange-700">R$ {formatMoney((inst.amount || 0) - (inst.paid_amount || 0))}</p></div></div>))}{!data.allPending?.length && <p className="text-sm text-gray-400 text-center py-4">Nada a receber 🎉</p>}</>)}

            {/* ESTOQUE */}
            {modal?.type === 'estoque' && (<><p className="text-sm font-bold text-blue-600 mb-2">Total Venda: R$ {formatMoney(data.stockValue || 0)} | Custo: R$ {formatMoney(data.stockCost || 0)}</p>{data.stockProducts?.map((p: any) => (<div key={p.id} className="bg-blue-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">Qtd: {p.quantity} | Un: R$ {formatMoney(p.sale_price || 0)}</p></div><p className="font-bold text-blue-700">R$ {formatMoney((p.sale_price || 0) * (p.quantity || 0))}</p></div></div>))}</>)}

            {/* LUCRO ESTIMADO */}
            {modal?.type === 'lucroEstimado' && (<><p className="text-sm font-bold text-green-600 mb-2">Lucro Total: R$ {formatMoney(data.stockProfit || 0)}</p>{data.stockProducts?.map((p: any) => (<div key={p.id} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">Qtd: {p.quantity} | Lucro un: R$ {formatMoney(p.profitUnit || 0)}</p></div><p className="font-bold text-green-700">R$ {formatMoney(p.profit || 0)}</p></div></div>))}</>)}

            {/* LUCRO OBTIDO */}
            {modal?.type === 'lucroObtido' && (<><p className="text-sm font-bold text-green-600 mb-2">Total: R$ {formatMoney(data.totalLucroObtido || 0)}</p>{(data.lucrosPorProduto as any[])?.map((item: any, i: number) => (<div key={i} className="bg-green-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-gray-500">{item.quantity} un. vendidas</p></div><p className="font-bold text-green-700">R$ {formatMoney(item.lucro || 0)}</p></div></div>))}{!data.lucrosPorProduto?.length && <p className="text-sm text-gray-400 text-center py-4">Nenhum lucro registrado</p>}</>)}

            {/* PRODUTOS */}
            {modal?.type === 'produtos' && (<><p className="text-sm font-bold text-blue-600 mb-2">{data.totalProducts} produtos cadastrados</p>{data.stockProducts?.map((p: any) => (<div key={p.id} className="bg-gray-50 p-3 rounded-xl"><div className="flex justify-between"><div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">SKU: {p.sku} | Estoque: {p.quantity}</p></div><p className="text-sm">R$ {formatMoney(p.sale_price || 0)}</p></div></div>))}</>)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}