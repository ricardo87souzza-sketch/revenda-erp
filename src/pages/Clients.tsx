import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Users, Trash2, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import html2canvas from 'html2canvas'

export default function Clients() {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showExtraPayment, setShowExtraPayment] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [clientHistory, setClientHistory] = useState<any>(null)
  const [extraAmount, setExtraAmount] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const shareRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const formatMoney = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('*')
      if (data) {
        const comCompras = data.filter(c => c.total_purchases > 0).sort((a, b) => b.total_purchases - a.total_purchases)
        const semCompras = data.filter(c => c.total_purchases === 0).sort((a, b) => a.name.localeCompare(b.name))
        return [...comCompras, ...semCompras]
      }
      return []
    },
    enabled: !!user,
  })

  const openHistory = async (client: any) => {
    setSelectedClient(client)
    setShowHistory(true)
    setClientHistory(null)

    const { data: sales } = await supabase
      .from('sales')
      .select('*')
      .eq('client_id', client.id)
      .eq('status', 'ativa')
      .order('created_at', { ascending: false })

    if (sales && sales.length > 0) {
      const salesWithDetails = await Promise.all(
        sales.map(async (sale) => {
          const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', sale.id)
          let itemsWithNames = []
          if (items) {
            itemsWithNames = await Promise.all(
              items.map(async (item) => {
                const { data: product } = await supabase.from('products').select('name').eq('id', item.product_id).single()
                return { ...item, product_name: product?.name || 'Produto' }
              })
            )
          }
          const { data: installments } = await supabase
            .from('installments')
            .select('*')
            .eq('sale_id', sale.id)
            .order('installment_number', { ascending: true })

          return { ...sale, items: itemsWithNames, installments: installments || [] }
        })
      )

      let totalPaid = 0
      let totalPending = 0

            salesWithDetails.forEach(sale => {
        const insts = sale.installments || []
        if (insts.length > 0) {
          insts.forEach((inst: any) => {
            // Total pago = tudo que já foi pago (mesmo que parcial)
            totalPaid += (inst.paid_amount || 0)
            // Se não está totalmente pago, o restante é pendente
            if (inst.status !== 'pago') {
              totalPending += (inst.amount - (inst.paid_amount || 0))
            }
          })
        } else {
          if (sale.payment_method !== 'a_prazo') totalPaid += sale.total_amount
        }
      })

      setClientHistory({ sales: salesWithDetails, totalPaid, totalPending })
    } else {
      setClientHistory({ sales: [], totalPaid: 0, totalPending: 0 })
    }
  }

  const handlePayInstallment = async (inst: any) => {
    await supabase
      .from('installments')
      .update({ status: 'pago', paid_amount: inst.amount, payment_date: new Date().toISOString() })
      .eq('id', inst.id)

    setTimeout(() => {
      if (selectedClient) openHistory(selectedClient)
      refetchClients()
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }, 300)
  }

  const handleExtraPayment = async () => {
    const amount = parseFloat(extraAmount)
    if (isNaN(amount) || amount <= 0) return alert('Valor inválido!')

    const { data: sales } = await supabase.from('sales').select('id').eq('client_id', selectedClient.id).eq('status', 'ativa')
    if (sales && sales.length > 0) {
      const saleIds = sales.map(s => s.id)
      const { data: pending } = await supabase
        .from('installments')
        .select('*')
        .in('sale_id', saleIds)
        .eq('status', 'pendente')
        .order('due_date', { ascending: true })

      if (pending && pending.length > 0) {
        let remaining = amount
        for (const inst of pending) {
          if (remaining <= 0) break
          const debt = inst.amount - (inst.paid_amount || 0)
          const pay = Math.min(remaining, debt)
          const newPaid = (inst.paid_amount || 0) + pay
          await supabase.from('installments').update({
            paid_amount: newPaid,
            status: newPaid >= inst.amount ? 'pago' : 'pendente',
            payment_date: new Date().toISOString()
          }).eq('id', inst.id)
          remaining -= pay
        }

        await supabase.from('extra_payments').insert({
          user_id: user?.id, client_id: selectedClient.id, amount: amount,
          payment_method: 'dinheiro', notes: 'Pagamento avulso'
        })

        alert(`Pagamento de R$ ${formatMoney(amount)} registrado!`)
        setShowExtraPayment(false); setExtraAmount('')
        setTimeout(() => {
          openHistory(selectedClient)
          refetchClients()
          queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        }, 500)
      } else {
        alert('Cliente não possui parcelas pendentes!')
      }
    } else {
      alert('Cliente não possui vendas!')
    }
  }

  const handleShare = async () => {
    if (!clientHistory?.sales?.length) return alert('Nenhuma venda!')
    
    setTimeout(async () => {
      if (shareRef.current) {
        try {
          const canvas = await html2canvas(shareRef.current, { scale: 3, backgroundColor: '#ffffff' })
          canvas.toBlob(async (blob) => {
            if (blob) {
              const file = new File([blob], 'venda.png', { type: 'image/png' })
              if (navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: `Venda - ${selectedClient.name}` })
              } else {
                const sale = clientHistory.sales[0]
                const text = `📋 *${selectedClient.name}*\n💰 Total: R$ ${formatMoney(sale.total_amount || 0)}\n📅 ${new Date(sale.sale_date).toLocaleDateString('pt-BR')}`
                window.open(`https://wa.me/55${selectedClient.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank')
              }
            }
          }, 'image/png')
        } catch (err) {
          console.error('Erro ao gerar imagem:', err)
        }
      }
    }, 300)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingClient) {
      await supabase.from('clients').update(form).eq('id', editingClient.id)
    } else {
      await supabase.from('clients').insert({ ...form, user_id: user?.id })
    }
    setShowForm(false); setEditingClient(null)
    refetchClients()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir cliente?')) return
    await supabase.from('clients').delete().eq('id', id)
    setShowHistory(false); refetchClients()
  }

  const filtered = clients.filter((c: any) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (c.name || '').toLowerCase().includes(s) || (c.phone || '').includes(s)
  })

  if (!user) return null

  return (
    <div className="p-3 sm:p-4 mb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">👥 Clientes</h1>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="metric-card text-center"><p className="text-lg font-bold text-blue-500">{clients.length}</p><p className="text-[10px] text-gray-400">Total</p></div>
        <div className="metric-card text-center"><p className="text-lg font-bold text-orange-500">{clients.filter((c: any) => c.total_pending > 0).length}</p><p className="text-[10px] text-gray-400">Pendentes</p></div>
        <div className="metric-card text-center"><p className="text-lg font-bold text-green-600">R$ {formatMoney(clients.reduce((s: number, c: any) => s + (c.total_paid || 0), 0))}</p><p className="text-[10px] text-gray-400">Pago</p></div>
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Buscar por nome ou telefone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white/60" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12"><Users size={40} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-400">Nenhum cliente</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((client: any) => (
            <div key={client.id} onClick={() => openHistory(client)} className="ios-list-item cursor-pointer border-l-4 border-l-blue-400">
              <div className="flex justify-between items-start">
                <div><h3 className="font-semibold text-sm">{client.name}</h3>{client.phone && <p className="text-xs text-gray-400">📱 {client.phone}</p>}<p className="text-[10px] text-gray-400 mt-0.5">Compras: R$ {formatMoney(client.total_purchases || 0)}</p></div>
                {client.total_pending > 0 && <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-bold">R$ {formatMoney(client.total_pending || 0)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => { setEditingClient(null); setForm({ name: '', phone: '', email: '', address: '', notes: '' }); setShowForm(true) }} className="fab"><Plus size={24} /></button>

      {/* Modal Histórico */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="ios-sheet max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedClient?.name}</DialogTitle></DialogHeader>
          {clientHistory ? (
            <div className="space-y-3 mt-2">
              {/* Conteúdo para compartilhar */}
              <div ref={shareRef} style={{ backgroundColor: '#ffffff', padding: '16px', borderRadius: '16px' }}>
                {/* Cabeçalho */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '2px solid #e5e7eb', paddingBottom: '8px' }}>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>{selectedClient?.name}</h2>
                    {selectedClient?.phone && <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>📱 {selectedClient?.phone}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '10px', color: '#9ca3af', margin: 0 }}>Revenda ERP</p>
                  </div>
                </div>

                {/* Cards totais */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #bbf7d0' }}>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 4px 0' }}>Total Pago</p>
                    <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#15803d', margin: 0 }}>R$ {formatMoney(clientHistory.totalPaid || 0)}</p>
                  </div>
                  <div style={{ background: '#fef2f2', padding: '10px', borderRadius: '10px', textAlign: 'center', border: '1px solid #fecaca' }}>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '0 0 4px 0' }}>Total Pendente</p>
                    <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#dc2626', margin: 0 }}>R$ {formatMoney(clientHistory.totalPending || 0)}</p>
                  </div>
                </div>

                {/* Histórico */}
                {clientHistory.sales.map((sale: any) => (
                  <div key={sale.id} style={{ background: '#f9fafb', padding: '10px', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(sale.sale_date).toLocaleDateString('pt-BR')}</span>
                      <b style={{ fontSize: '14px', color: '#1f2937' }}>R$ {formatMoney(sale.total_amount || 0)}</b>
                    </div>
                    {sale.items?.map((item: any) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280', marginLeft: '8px', marginBottom: '2px' }}>
                        <span>{item.product_name} x{item.quantity}</span>
                        <span>R$ {formatMoney(item.total_price || 0)}</span>
                      </div>
                    ))}
                    {(sale.installments || []).length > 0 && (
                      <div style={{ marginTop: '6px' }}>
                        {sale.installments.map((inst: any) => (
                          <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', padding: '6px 8px', borderRadius: '8px', marginBottom: '3px', border: '1px solid #e5e7eb' }}>
                            <span style={{ fontSize: '11px', color: '#374151' }}>
                              {inst.installment_number}x R$ {formatMoney((inst.amount || 0) - (inst.paid_amount || 0))} - {new Date(inst.due_date).toLocaleDateString('pt-BR')}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '20px', backgroundColor: inst.status === 'pago' ? '#22c55e' : '#ef4444', color: 'white' }}>
                              {inst.status === 'pago' ? 'PAGO ✓' : 'PENDENTE'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Botões de ação (fora da imagem) */}
              <div className="grid grid-cols-4 gap-1.5 pt-2">
                <Button onClick={() => setShowExtraPayment(true)} className="bg-green-600 hover:bg-green-700 text-white text-[10px] h-9 px-0.5">💵 Avulso</Button>
                <Button onClick={handleShare} className="bg-blue-500 hover:bg-blue-600 text-white text-[10px] h-9 px-0.5">📤 Zap</Button>
                <Button onClick={() => { setEditingClient(selectedClient); setForm({ name: selectedClient.name, phone: selectedClient.phone || '', email: selectedClient.email || '', address: selectedClient.address || '', notes: selectedClient.notes || '' }); setShowHistory(false); setShowForm(true) }} className="bg-yellow-500 hover:bg-yellow-600 text-white text-[10px] h-9 px-0.5">✏️ Editar</Button>
                <Button onClick={() => handleDelete(selectedClient.id)} className="bg-red-500 hover:bg-red-600 text-white text-[10px] h-9 px-0.5">🗑️ Excluir</Button>
              </div>
            </div>
          ) : <p className="text-center py-4 text-gray-400">Carregando...</p>}
        </DialogContent>
      </Dialog>

      {/* Modal Pagamento Avulso */}
      <Dialog open={showExtraPayment} onOpenChange={setShowExtraPayment}>
        <DialogContent className="ios-sheet max-w-sm">
          <DialogHeader><DialogTitle>Pagamento Avulso</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm">Pendente: R$ {formatMoney(clientHistory?.totalPending || 0)}</p>
            <p className="text-xs text-gray-400">Abate nas parcelas mais antigas primeiro.</p>
            <Input type="number" step="0.01" value={extraAmount} onChange={e => setExtraAmount(e.target.value)} placeholder="Valor" autoFocus />
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setShowExtraPayment(false)}>Cancelar</Button><Button className="flex-1 bg-green-600" onClick={handleExtraPayment}>Pagar</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Cadastro/Edição */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="ios-sheet max-w-md">
          <DialogHeader><DialogTitle>{editingClient ? 'Editar' : 'Novo'} Cliente</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3 mt-3">
            <Input required placeholder="Nome *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            <Input placeholder="Telefone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <Input placeholder="Endereço" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
            <Input placeholder="Observações" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <div className="flex gap-2 pt-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button><Button type="submit" className="flex-1 bg-blue-500">Salvar</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}