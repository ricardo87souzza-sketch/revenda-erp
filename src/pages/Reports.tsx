import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

type Periodo = 'hoje' | 'semana' | 'mes' | 'total'

export default function Reports() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [data, setData] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!user) navigate('/auth'); else loadData() }, [periodo])

  const getRange = () => {
    const today = new Date(); const hoje = today.toISOString().split('T')[0]
    switch (periodo) {
      case 'hoje': return { inicio: hoje, fim: hoje }
      case 'semana': const s = new Date(today); s.setDate(s.getDate() - 7); return { inicio: s.toISOString().split('T')[0], fim: hoje }
      case 'mes': const m = new Date(today.getFullYear(), today.getMonth(), 1); return { inicio: m.toISOString().split('T')[0], fim: hoje }
      case 'total': return { inicio: '2000-01-01', fim: hoje }
    }
  }

  const loadData = async () => {
    setLoading(true)
    const { inicio, fim } = getRange()
    const { data: sales } = await supabase.from('sales').select('*').eq('status', 'ativa').gte('sale_date', inicio).lte('sale_date', fim)
    const { data: products } = await supabase.from('products').select('*')
    const { data: installments } = await supabase.from('installments').select('*').eq('status', 'pendente').gte('due_date', inicio).lte('due_date', fim)

    const totalVendas = sales?.reduce((s, v) => s + v.total_amount, 0) || 0
    let totalLucro = 0
    const prodVendidos: any = {}

    if (sales) {
      for (const sale of sales) {
        const { data: items } = await supabase.from('sale_items').select('*, product:product_id(name, cost_price)').eq('sale_id', sale.id)
        if (items) {
          for (const item of items) {
            const custo = (item.product?.cost_price || 0) * item.quantity
            totalLucro += item.total_price - custo
            const nome = item.product?.name || 'Produto'
            if (!prodVendidos[nome]) prodVendidos[nome] = { name: nome, quantity: 0, total: 0 }
            prodVendidos[nome].quantity += item.quantity
            prodVendidos[nome].total += item.total_price
          }
        }
      }
    }

    const totalReceber = installments?.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0) || 0
    const stockProducts = products?.filter(p => p.quantity > 0) || []
    const valorEstoqueVenda = stockProducts.reduce((s, p) => s + (p.sale_price * p.quantity), 0)
    const valorEstoqueCusto = stockProducts.reduce((s, p) => s + (p.cost_price * p.quantity), 0)
    const ranking = Object.values(prodVendidos).sort((a: any, b: any) => b.total - a.total).slice(0, 10)

    setData({ totalVendas, totalLucro, totalReceber, valorEstoqueVenda, valorEstoqueCusto, ranking, qtdVendas: sales?.length || 0 })
    setLoading(false)
  }

  const periodos: { key: Periodo; label: string }[] = [
    { key: 'hoje', label: 'Hoje' }, { key: 'semana', label: 'Semana' }, { key: 'mes', label: 'Mês' }, { key: 'total', label: 'Total' }
  ]

  if (!user) return null

  return (
    <div className="p-3 sm:p-4 mb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-2">📊 Relatórios</h1>
      <p className="text-xs text-[hsl(220,10%,50%)] mb-4">Análise do Negócio</p>

      <div className="flex gap-2 mb-4">
        {periodos.map(p => (
          <button key={p.key} onClick={() => setPeriodo(p.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              periodo === p.key ? 'bg-[hsl(211,100%,50%)] text-white' : 'glass-card-subtle text-[hsl(220,10%,50%)]'
            }`}>{p.label}</button>
        ))}
      </div>

      {loading ? <p className="text-center py-8 animate-pulse">Carregando...</p> : (
        <div className="space-y-3">
          <div className="metric-card"><p className="text-xs text-[hsl(220,10%,50%)]">💰 Total de Vendas</p><p className="text-2xl font-bold text-[hsl(211,100%,50%)]">R$ {data.totalVendas?.toFixed(2)}</p><p className="text-[10px]">{data.qtdVendas} vendas</p></div>
          <div className="metric-card"><p className="text-xs text-[hsl(220,10%,50%)]">📈 Lucro Total</p><p className="text-2xl font-bold text-[hsl(142,76%,36%)]">R$ {data.totalLucro?.toFixed(2)}</p></div>
          <div className="metric-card"><p className="text-xs text-[hsl(220,10%,50%)]">💳 Total a Receber</p><p className="text-2xl font-bold text-[hsl(38,92%,50%)]">R$ {data.totalReceber?.toFixed(2)}</p></div>
          <div className="metric-card">
            <p className="text-xs text-[hsl(220,10%,50%)]">📦 Estoque</p>
            <div className="grid grid-cols-2 gap-2 mt-1"><div><p className="text-[10px]">Venda</p><p className="font-bold text-[hsl(211,100%,50%)]">R$ {data.valorEstoqueVenda?.toFixed(2)}</p></div><div><p className="text-[10px]">Custo</p><p className="font-bold text-[hsl(0,72%,51%)]">R$ {data.valorEstoqueCusto?.toFixed(2)}</p></div></div>
          </div>

          <div className="glass-card p-4">
            <p className="text-sm font-semibold mb-3">🏆 Mais Vendidos</p>
            {data.ranking?.length > 0 ? (
              <div className="space-y-2">
                {data.ranking.map((item: any, i: number) => {
                  const max = data.ranking[0]?.total || 1
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5"><span className="truncate mr-2">{item.name}</span><span>R$ {item.total?.toFixed(2)}</span></div>
                      <div className="w-full bg-[hsl(220,15%,90%)] rounded-full h-2">
                        <div className="h-2 rounded-full bg-gradient-to-r from-[hsl(211,100%,50%)] to-[hsl(211,100%,40%)]" style={{ width: `${Math.max((item.total / max) * 100, 2)}%` }} />
                      </div>
                      <p className="text-[10px] text-[hsl(220,10%,50%)]">{item.quantity} un.</p>
                    </div>
                  )
                })}
              </div>
            ) : <p className="text-sm text-center py-4 text-[hsl(220,10%,50%)]">Nenhuma venda</p>}
          </div>
        </div>
      )}
    </div>
  )
}