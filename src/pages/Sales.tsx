import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, ShoppingCart, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function Sales() {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [editingSale, setEditingSale] = useState<any>(null)
  const [showDebtModal, setShowDebtModal] = useState(false)
  const [existingDebt, setExistingDebt] = useState<any>(null)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [showClientList, setShowClientList] = useState(false)
  const [showProductList, setShowProductList] = useState<number | null>(null)
  const [items, setItems] = useState<any[]>([{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }])
  const [paymentMethod, setPaymentMethod] = useState('dinheiro')
  const [installments, setInstallments] = useState(1)
  const [installmentDates, setInstallmentDates] = useState<string[]>([])
  const [paymentStatus, setPaymentStatus] = useState('pago')
  const [notes, setNotes] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const formatMoney = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => { const { data } = await supabase.from('clients').select('*').order('name'); return data || [] },
    enabled: !!user,
  })

  const { data: products = [] } = useQuery({
    queryKey: ['products-stock'],
    queryFn: async () => { const { data } = await supabase.from('products').select('*').gt('quantity', 0).order('name'); return data || [] },
    enabled: !!user,
  })

  const { data: sales = [], refetch: refetchSales } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data: s } = await supabase.from('sales').select('*').eq('status', 'ativa').order('created_at', { ascending: false })
      if (!s?.length) return []
      const detailed = await Promise.all(s.map(async (sale) => {
        const { data: client } = await supabase.from('clients').select('name').eq('id', sale.client_id).single()
        const { data: itemsData } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id)
        let itemsWithNames = []
        if (itemsData) {
          itemsWithNames = await Promise.all(itemsData.map(async (item) => {
            const { data: prod } = await supabase.from('products').select('name, sku').eq('id', item.product_id).single()
            return { ...item, product_name: prod?.name || 'Produto', product_sku: prod?.sku || '-' }
          }))
        }
        const { data: insts } = await supabase.from('installments').select('*').eq('sale_id', sale.id).order('installment_number')
        const hasPending = insts?.some((i: any) => i.status === 'pendente')
        return { ...sale, client_name: client?.name || 'Cliente', items: itemsWithNames, installments: insts || [], statusGeral: insts?.length ? (hasPending ? 'pendente' : 'pago') : 'pago' }
      }))
      return detailed
    },
    enabled: !!user,
  })

  const addItem = () => setItems([...items, { product_id: '', product_name: '', quantity: 1, unit_price: 0 }])
  const removeItem = (i: number) => { if (items.length > 1) setItems(items.filter((_, idx) => idx !== i)) }
  const selectProduct = (i: number, p: any) => {
    const newItems = [...items]; newItems[i] = { product_id: p.id, product_name: p.name, quantity: 1, unit_price: p.sale_price }
    setItems(newItems); setShowProductList(null)
  }
  const calcTotal = () => items.reduce((s, i) => i.product_id ? s + (i.unit_price * i.quantity) : s, 0)
  const generateDates = (n: number) => {
    const dates: string[] = []
    for (let i = 0; i < n; i++) { const d = new Date(); d.setMonth(d.getMonth() + i + 1); dates.push(d.toISOString().split('T')[0]) }
    setInstallmentDates(dates); setInstallments(n)
  }

  const openEdit = (sale: any) => {
    const client = clients.find((c: any) => c.id === sale.client_id)
    setEditingSale(sale); setSelectedClient(client || { id: sale.client_id, name: sale.client_name })
    setPaymentMethod(sale.payment_method); setNotes(sale.notes || '')
    if (sale.items?.length) setItems(sale.items.map((it: any) => ({ product_id: it.product_id, product_name: it.product_name, quantity: it.quantity, unit_price: it.unit_price })))
    if (sale.installments?.length) { setInstallments(sale.installments.length); setInstallmentDates(sale.installments.map((inst: any) => inst.due_date)); setPaymentStatus(sale.installments[0].status === 'pago' ? 'pago' : 'pendente') }
    setShowForm(true)
  }

  const checkDebt = async () => {
    if (!selectedClient) return false
    const { data } = await supabase.from('sales').select('id').eq('client_id', selectedClient.id).eq('status', 'ativa').eq('payment_method', 'a_prazo')
    if (data?.length) {
      const insts = []
      for (const s of data) { const { data: pi } = await supabase.from('installments').select('*').eq('sale_id', s.id).eq('status', 'pendente'); if (pi) insts.push(...pi) }
      if (insts.length) { setExistingDebt({ total: insts.reduce((s, i) => s + (i.amount - (i.paid_amount || 0)), 0), sales: data, installments: insts }); setShowDebtModal(true); return true }
    }
    return false
  }

  const handleSave = async (debtAction?: string) => {
    if (!selectedClient) return alert('Selecione cliente!')
    const valid = items.filter(i => i.product_id)
    if (!valid.length) return alert('Adicione produtos!')
    const total = calcTotal()

    if (!editingSale && paymentMethod === 'a_prazo' && paymentStatus === 'pendente' && !debtAction) { if (await checkDebt()) return }

    if (editingSale) {
      await supabase.from('sales').update({ client_id: selectedClient.id, total_amount: total, payment_method: paymentMethod, notes }).eq('id', editingSale.id)
      await supabase.from('sale_items').delete().eq('sale_id', editingSale.id)
      await supabase.from('installments').delete().eq('sale_id', editingSale.id)
      await supabase.from('sale_items').insert(valid.map(i => ({ sale_id: editingSale.id, product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, total_price: i.unit_price * i.quantity })))
      if (paymentMethod === 'a_prazo') { const amt = Math.ceil((total / installments) * 100) / 100; await supabase.from('installments').insert(installmentDates.map((d, idx) => ({ sale_id: editingSale.id, installment_number: idx + 1, due_date: d, amount: amt, status: paymentStatus, paid_amount: paymentStatus === 'pago' ? amt : 0, payment_date: paymentStatus === 'pago' ? new Date().toISOString() : null }))) }
    } else {
      const { data: sale, error } = await supabase.from('sales').insert({ user_id: user?.id, client_id: selectedClient.id, total_amount: total, payment_method: paymentMethod, notes, status: 'ativa' }).select().single()
      if (error) return alert(error.message)
      await supabase.from('sale_items').insert(valid.map(i => ({ sale_id: sale.id, product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, total_price: i.unit_price * i.quantity })))
      if (paymentMethod === 'a_prazo') {
        if (debtAction === 'merge' && existingDebt) {
          const newTotal = existingDebt.total + total
          const amt = Math.ceil((newTotal / installments) * 100) / 100
          const allItems = [...valid]
          for (const os of existingDebt.sales) {
            const { data: oldItems } = await supabase.from('sale_items').select('*').eq('sale_id', os.id)
            if (oldItems) {
              for (const oi of oldItems) {
                const existing = allItems.find(i => i.product_id === oi.product_id)
                if (existing) { existing.quantity += oi.quantity } else {
                  const { data: prod } = await supabase.from('products').select('name, sale_price').eq('id', oi.product_id).single()
                  allItems.push({ product_id: oi.product_id, product_name: prod?.name || 'Produto', quantity: oi.quantity, unit_price: oi.unit_price })
                }
              }
            }
            await supabase.from('sales').update({ status: 'cancelada' }).eq('id', os.id)
          }
          await supabase.from('sale_items').insert(allItems.map(i => ({ sale_id: sale.id, product_id: i.product_id, quantity: i.quantity, unit_price: i.unit_price, total_price: i.unit_price * i.quantity })))
          await supabase.from('installments').insert(installmentDates.map((d, idx) => ({ sale_id: sale.id, installment_number: idx + 1, due_date: d, amount: amt, status: paymentStatus, paid_amount: paymentStatus === 'pago' ? amt : 0, payment_date: paymentStatus === 'pago' ? new Date().toISOString() : null })))
          alert(`Vendas unificadas! Total: R$ ${formatMoney(newTotal)} em ${installments}x`)
        } else {
          const amt = Math.ceil((total / installments) * 100) / 100
          await supabase.from('installments').insert(installmentDates.map((d, idx) => ({ sale_id: sale.id, installment_number: idx + 1, due_date: d, amount: amt, status: paymentStatus, paid_amount: paymentStatus === 'pago' ? amt : 0, payment_date: paymentStatus === 'pago' ? new Date().toISOString() : null })))
        }
      }
    }
    setShowForm(false); setEditingSale(null); resetForm()
    refetchSales(); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['products-stock'] })
  }

  const resetForm = () => {
    setSelectedClient(null); setItems([{ product_id: '', product_name: '', quantity: 1, unit_price: 0 }])
    setPaymentMethod('dinheiro'); setInstallments(1); setInstallmentDates([]); setPaymentStatus('pago'); setNotes('')
    setExistingDebt(null)
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar esta venda? O estoque será devolvido.')) return
    const { error } = await supabase.from('sales').update({ status: 'cancelada' }).eq('id', id)
    if (!error) { alert('Venda cancelada!'); refetchSales(); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); queryClient.invalidateQueries({ queryKey: ['products-stock'] }) }
  }

  const filtered = sales.filter((s: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (s.client_name || '').toLowerCase().includes(q) || s.items?.some((i: any) => (i.product_name || '').toLowerCase().includes(q))
  })

  const totalSales = sales.reduce((s: number, sale: any) => s + sale.total_amount, 0)

  if (!user) return null

  return (
    <div className="p-3 sm:p-4 mb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">🛒 Vendas</h1>
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 rounded-2xl mb-4"><p className="text-sm opacity-90">Total de Vendas</p><p className="text-3xl font-bold">R$ {formatMoney(totalSales)}</p><p className="text-xs opacity-75">{sales.length} vendas ativas</p></div>
      <div className="relative mb-4"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><Input placeholder="Buscar cliente ou produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white/60" /></div>
      {filtered.length === 0 ? <div className="text-center py-12"><ShoppingCart size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-400">Nenhuma venda</p></div> : (
        <div className="space-y-2">
          {filtered.map((sale: any) => (
            <div key={sale.id} onClick={() => { setSelectedSale(sale); setShowDetail(true) }} className="ios-list-item cursor-pointer">
              <div className="flex justify-between items-start"><div><h3 className="font-semibold text-sm">{sale.client_name}</h3><p className="text-xs text-gray-400">{new Date(sale.sale_date).toLocaleDateString('pt-BR')}</p><div className="flex flex-wrap gap-1 mt-1">{sale.items?.slice(0, 3).map((it: any) => <span key={it.id} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{it.product_name}</span>)}</div></div><div className="text-right"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${sale.statusGeral === 'pago' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{sale.statusGeral === 'pago' ? 'PAGO' : 'PENDENTE'}</span><p className="font-bold mt-1">R$ {formatMoney(sale.total_amount || 0)}</p></div></div>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => { setEditingSale(null); resetForm(); setShowForm(true) }} className="fab"><Plus size={24} /></button>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="ios-sheet max-w-md max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>{selectedSale?.client_name}</DialogTitle></DialogHeader>
          {selectedSale && <div className="space-y-3 mt-2"><div className="flex justify-between"><span>{new Date(selectedSale.sale_date).toLocaleDateString('pt-BR')}</span><b>R$ {formatMoney(selectedSale.total_amount || 0)}</b></div><div className="space-y-1">{selectedSale.items?.map((it: any) => <div key={it.id} className="flex justify-between text-sm"><span>{it.product_name} x{it.quantity}</span><span>R$ {formatMoney(it.total_price || 0)}</span></div>)}</div>{selectedSale.installments?.length > 0 && <div className="space-y-1"><p className="text-xs font-semibold">Parcelas:</p>{selectedSale.installments.map((inst: any) => <div key={inst.id} className={`flex justify-between p-2 rounded-lg ${inst.status === 'pago' ? 'bg-green-50' : 'bg-yellow-50'}`}><span className="text-xs">{inst.installment_number}x R$ {formatMoney(inst.amount || 0)} - {new Date(inst.due_date).toLocaleDateString('pt-BR')}</span><span className={`text-[10px] font-bold ${inst.status === 'pago' ? 'text-green-600' : 'text-yellow-600'}`}>{inst.status === 'pago' ? 'PAGO' : 'PENDENTE'}</span></div>)}</div>}<div className="flex gap-2"><Button onClick={() => { setShowDetail(false); openEdit(selectedSale) }} className="flex-1 bg-blue-500 text-xs">✏️ Editar</Button><Button onClick={() => { handleCancel(selectedSale.id); setShowDetail(false) }} className="flex-1 bg-red-500 text-xs">Cancelar</Button></div></div>}
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="ios-sheet max-w-lg max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingSale ? 'Editar' : 'Nova'} Venda</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><label className="text-xs font-semibold">CLIENTE *</label><button onClick={() => setShowClientList(!showClientList)} className="w-full px-3 py-2 border rounded-lg text-left bg-white mt-1">{selectedClient?.name || 'Selecionar...'}</button>{showClientList && <div className="border rounded-lg max-h-32 overflow-y-auto mt-1 bg-white">{clients.map((c: any) => <div key={c.id} onClick={() => { setSelectedClient(c); setShowClientList(false) }} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm">{c.name}{c.total_pending > 0 ? <span className="text-red-500 text-xs ml-1">(R$ {formatMoney(c.total_pending || 0)})</span> : null}</div>)}</div>}</div>
            {items.map((item, idx) => (
              <div key={idx} className="bg-gray-50 p-2 rounded-lg">
                <div className="flex gap-2"><button onClick={() => setShowProductList(showProductList === idx ? null : idx)} className="flex-1 px-3 py-2 border rounded-lg text-left bg-white text-sm">{item.product_name || 'Selecionar produto...'}</button><input type="number" min="1" value={item.quantity} onChange={e => { const ni = [...items]; ni[idx].quantity = parseInt(e.target.value) || 1; setItems(ni) }} className="w-16 px-2 border rounded-lg text-center" />{items.length > 1 && <button onClick={() => removeItem(idx)} className="text-red-500"><X size={16} /></button>}</div>
                {showProductList === idx && <div className="border rounded-lg max-h-32 overflow-y-auto mt-1 bg-white">{products.map((p: any) => <div key={p.id} onClick={() => selectProduct(idx, p)} className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex justify-between text-sm"><span>{p.name} <span className="text-gray-400 text-xs">({p.quantity})</span></span><b>R$ {formatMoney(p.sale_price || 0)}</b></div>)}</div>}
                {item.product_id && <div className="flex justify-between text-xs mt-1 text-gray-500"><span>{item.quantity}x R$ {formatMoney(item.unit_price || 0)}</span><b>R$ {formatMoney((item.unit_price || 0) * (item.quantity || 0))}</b></div>}
              </div>
            ))}
            <button onClick={addItem} className="w-full py-2 border-2 border-dashed border-blue-300 rounded-lg text-blue-500 text-sm">+ Adicionar produto</button>
            <div><label className="text-xs font-semibold">PAGAMENTO</label><select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border rounded-lg mt-1 bg-white"><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Débito</option><option value="credito">Crédito</option><option value="boleto">Boleto</option><option value="a_prazo">A Prazo</option></select></div>
            {paymentMethod === 'a_prazo' && (<><div><label className="text-xs font-semibold">PARCELAS</label><input type="number" min="1" max="12" value={installments} onChange={e => generateDates(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-lg mt-1" />{installmentDates.map((d, idx) => (<div key={idx} className="flex items-center gap-2 mt-1"><span className="text-xs">{idx + 1}x</span><input type="date" value={d} onChange={e => { const nd = [...installmentDates]; nd[idx] = e.target.value; setInstallmentDates(nd) }} className="flex-1 px-2 py-1 border rounded text-xs" /><span className="text-xs">R$ {formatMoney(calcTotal() / installments)}</span></div>))}</div><div><label className="text-xs font-semibold">STATUS</label><select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="w-full px-3 py-2 border rounded-lg mt-1 bg-white"><option value="pago">Pago</option><option value="pendente">Pendente</option></select></div></>)}
            <div><label className="text-xs font-semibold">OBSERVAÇÕES</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded-lg mt-1" rows={2} /></div>
            <div className="bg-blue-50 p-3 rounded-xl flex justify-between font-bold"><span>Total</span><span>R$ {formatMoney(calcTotal())}</span></div>
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button><Button className="flex-1 bg-blue-500" onClick={() => handleSave()}>{editingSale ? 'Atualizar' : 'Registrar'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDebtModal} onOpenChange={setShowDebtModal}>
        <DialogContent className="ios-sheet max-w-sm"><DialogHeader><DialogTitle>Cliente com Débitos</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2"><p>Pendente: <b className="text-red-500">R$ {formatMoney(existingDebt?.total || 0)}</b></p>
            <Button onClick={() => handleSave('separate')} className="w-full bg-blue-500">📋 Venda Separada</Button>
            <Button onClick={() => handleSave('merge')} className="w-full bg-orange-500">🔄 Somar (R$ {formatMoney((existingDebt?.total || 0) + calcTotal())})</Button>
            <Button variant="outline" onClick={() => setShowDebtModal(false)} className="w-full">Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}