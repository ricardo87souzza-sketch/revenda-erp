import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { DollarSign, Package, ShoppingCart, Users, FileText, TrendingUp, AlertTriangle } from 'lucide-react'

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function Dashboard() {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [editingBalance, setEditingBalance] = useState(false)
  const [newBalance, setNewBalance] = useState('')
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
      const pendingInstallments = installments?.filter(i => i.status === 'pendente') || []
      const totalPending = pendingInstallments.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0)

      const paidBills = bills?.filter(b => b.status === 'pago' && b.payment_date && b.payment_date >= startDate && b.payment_date <= endDate) || []
      const totalPaidBills = paidBills.reduce((s, b) => s + (b.paid_amount || b.amount), 0)

      const receivedInstallments = installments?.filter(i => i.status === 'pago' && i.payment_date && i.payment_date >= startDate && i.payment_date <= endDate) || []
      const totalReceived = receivedInstallments.reduce((s, i) => s + (i.paid_amount || i.amount), 0)

      // Calcular máximo para o círculo (meta ou maior valor entre entradas/saídas)
      const maxFlow = Math.max(totalReceived, totalPaidBills, 1000)

      return {
        lowStock, stockProducts, stockValue, stockCost, stockProfit,
        monthSales, totalMonthSales, todaySales, totalTodaySales,
        pendingBills, pendingInstallments, totalPending,
        paidBills, totalPaidBills, receivedInstallments, totalReceived,
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

  if (isLoading || !data) {
    return (
      <div className="p-4 mb-24 max-w-2xl mx-auto">
        <div className="text-center py-8 text-[hsl(220,10%,50%)] animate-pulse">Carregando...</div>
      </div>
    )
  }

  // Cálculo do círculo animado
  const circleRadius = 75
  const circleCircumference = 2 * Math.PI * circleRadius
  const fillPercent = data.maxFlow > 0 ? Math.min(data.cashBalance / data.maxFlow, 1) : 0
  const strokeOffset = circleCircumference * (1 - fillPercent)

  return (
    <div className="p-3 sm:p-4 mb-24 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold text-[hsl(220,20%,10%)]">Dashboard</h1>
          <p className="text-xs text-[hsl(220,10%,50%)]">{months[selectedMonth]} {selectedYear}</p>
        </div>
      </div>

      {/* Abas dos meses */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        {Array.from({ length: 6 }, (_, i) => {
          const d = new Date()
          d.setMonth(d.getMonth() - (5 - i))
          return (
            <button
              key={i}
              onClick={() => { setSelectedMonth(d.getMonth()); setSelectedYear(d.getFullYear()) }}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedMonth === d.getMonth() && selectedYear === d.getFullYear()
                  ? 'bg-[hsl(211,100%,50%)] text-white shadow-md'
                  : 'glass-card-subtle text-[hsl(220,10%,50%)]'
              }`}
            >
              {months[d.getMonth()]}
            </button>
          )
        })}
      </div>

      {/* CÍRCULO ANIMADO DO FLUXO DE CAIXA */}
      <div className="glass-card p-4 mb-4 text-center">
        <p className="text-sm font-semibold text-[hsl(220,20%,10%)] mb-3">💰 Fluxo de Caixa</p>
        
        <div className="relative w-44 h-44 mx-auto mb-2">
          {/* Círculo de fundo */}
          <svg width="100%" height="100%" viewBox="0 0 170 170">
            <circle
              cx="85" cy="85" r={circleRadius}
              fill="none"
              stroke="hsl(220, 15%, 88%)"
              strokeWidth="10"
            />
            {/* Círculo animado que preenche */}
            <motion.circle
              cx="85" cy="85" r={circleRadius}
              fill="none"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circleCircumference}
              initial={{ strokeDashoffset: circleCircumference }}
              animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 1, ease: "easeInOut" }}
              transform="rotate(-90 85 85)"
            />
          </svg>
          
          {/* Valor no centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {editingBalance ? (
              <div className="flex flex-col gap-1">
                <input
                  type="number"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  className="w-24 text-center px-2 py-1 border rounded-lg text-sm"
                  autoFocus
                />
                <div className="flex gap-1 justify-center">
                  <button onClick={updateBalance} className="bg-[hsl(142,76%,36%)] text-white px-2 py-0.5 rounded text-xs">✓</button>
                  <button onClick={() => setEditingBalance(false)} className="bg-gray-300 px-2 py-0.5 rounded text-xs">✕</button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">
                  R$ {data.cashBalance?.toFixed(0)}
                </p>
                <button
                  onClick={() => { setEditingBalance(true); setNewBalance(data.cashBalance?.toString() || '0') }}
                  className="text-[10px] text-[hsl(211,100%,50%)] underline mt-0.5"
                >
                  Ajustar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mini cards de entrada/saída */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-[hsl(142,76%,36%)]/10 p-2 rounded-xl">
            <p className="text-[10px] text-[hsl(220,10%,50%)]">Entradas (mês)</p>
            <p className="text-sm font-bold text-[hsl(142,76%,36%)]">R$ {data.totalReceived?.toFixed(0)}</p>
          </div>
          <div className="bg-[hsl(0,72%,51%)]/10 p-2 rounded-xl">
            <p className="text-[10px] text-[hsl(220,10%,50%)]">Boletos Pagos</p>
            <p className="text-sm font-bold text-[hsl(0,72%,51%)]">R$ {data.totalPaidBills?.toFixed(0)}</p>
          </div>
        </div>
      </div>

      {/* Grid de cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {/* Alertas */}
        <div onClick={() => navigate('/products')} className="metric-card cursor-pointer active:scale-95 transition-all">
          <AlertTriangle size={18} color="hsl(38, 92%, 50%)" />
          <p className="text-xl font-bold text-[hsl(38,92%,40%)] mt-1">{data.lowStock?.length || 0}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">Estoque Baixo</p>
        </div>

        {/* Vendas do dia */}
        <div className="metric-card">
          <ShoppingCart size={18} color="hsl(211, 100%, 50%)" />
          <p className="text-xl font-bold text-[hsl(211,100%,50%)] mt-1">R$ {data.totalTodaySales?.toFixed(0)}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">Vendas Hoje</p>
        </div>

        {/* Vendas do mês */}
        <div className="metric-card">
          <TrendingUp size={18} color="hsl(142, 76%, 36%)" />
          <p className="text-xl font-bold text-[hsl(142,76%,36%)] mt-1">R$ {data.totalMonthSales?.toFixed(0)}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">{data.monthSales?.length || 0} vendas</p>
        </div>

        {/* A Receber */}
        <div className="metric-card">
          <Users size={18} color="hsl(38, 92%, 50%)" />
          <p className="text-xl font-bold text-[hsl(38,92%,40%)] mt-1">R$ {data.totalPending?.toFixed(0)}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">A Receber</p>
        </div>

        {/* Estoque */}
        <div className="metric-card">
          <Package size={18} color="hsl(211, 100%, 50%)" />
          <p className="text-xl font-bold text-[hsl(211,100%,50%)] mt-1">R$ {data.stockValue?.toFixed(0)}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">{data.stockProducts?.length || 0} itens</p>
        </div>

        {/* Boletos a pagar */}
        <div className="metric-card">
          <FileText size={18} color="hsl(0, 72%, 51%)" />
          <p className="text-xl font-bold text-[hsl(0,72%,51%)] mt-1">{data.pendingBills?.length || 0}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">Boletos</p>
        </div>

        {/* Lucro Estoque */}
        <div className="metric-card">
          <DollarSign size={18} color="hsl(142, 76%, 36%)" />
          <p className="text-xl font-bold text-[hsl(142,76%,36%)] mt-1">R$ {data.stockProfit?.toFixed(0)}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">Lucro Est.</p>
        </div>

        {/* Total Produtos */}
        <div className="metric-card">
          <Package size={18} color="hsl(211, 100%, 50%)" />
          <p className="text-xl font-bold text-[hsl(211,100%,50%)] mt-1">{data.totalProducts}</p>
          <p className="text-[10px] text-[hsl(220,10%,50%)]">Produtos</p>
        </div>
      </div>
    </div>
  )
}