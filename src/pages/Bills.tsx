import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, FileText, Trash2, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function Bills() {
  const [bills, setBills] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingBill, setEditingBill] = useState<any>(null)
  const [form, setForm] = useState({ supplier: '', amount: '', due_date: '', installments: '1', notes: '' })
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (!user) navigate('/auth'); else loadBills() }, [])

  const loadBills = async () => {
    const { data } = await supabase.from('bills').select('*').order('due_date', { ascending: true })
    if (data) setBills(data)
    setLoading(false)
  }

  const openNew = () => {
    setEditingBill(null)
    setForm({ supplier: '', amount: '', due_date: new Date().toISOString().split('T')[0], installments: '1', notes: '' })
    setShowForm(true)
  }

  const openEdit = (bill: any) => {
    setEditingBill(bill)
    setForm({ supplier: bill.supplier, amount: bill.amount?.toString() || '', due_date: bill.due_date, installments: '1', notes: bill.notes || '' })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.supplier || !form.amount || !form.due_date) return alert('Preencha todos os campos!')
    const amount = parseFloat(form.amount)
    const num = parseInt(form.installments) || 1

    if (editingBill) {
      await supabase.from('bills').update({ supplier: form.supplier, amount, due_date: form.due_date, notes: form.notes }).eq('id', editingBill.id)
    } else {
      for (let i = 0; i < num; i++) {
        const d = new Date(form.due_date); d.setDate(d.getDate() + (i * 30))
        await supabase.from('bills').insert({ user_id: user?.id, supplier: form.supplier, amount, due_date: d.toISOString().split('T')[0], notes: num > 1 ? `${form.notes} (${i + 1}/${num})` : form.notes, status: 'pendente' })
      }
    }
    setShowForm(false); setEditingBill(null); loadBills()
  }

  const handlePay = async (bill: any) => {
    await supabase.from('bills').update({ status: 'pago', paid_amount: bill.amount, payment_date: new Date().toISOString() }).eq('id', bill.id)
    loadBills()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir?')) return
    await supabase.from('bills').delete().eq('id', id)
    loadBills()
  }

  const pending = bills.filter(b => b.status === 'pendente')
  const paid = bills.filter(b => b.status === 'pago')
  const filtered = bills.filter(b => {
    if (!search) return true
    const s = search.toLowerCase()
    return (b.supplier || '').toLowerCase().includes(s) || b.amount?.toString().includes(s)
  })

  if (!user) return null

  return (
    <div className="p-3 sm:p-4 mb-24 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">📄 Boletos</h1>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="metric-card text-center"><p className="text-lg font-bold text-[hsl(0,72%,51%)]">R$ {pending.reduce((s, b) => s + b.amount, 0).toFixed(0)}</p><p className="text-[10px] text-[hsl(220,10%,50%)]">A Pagar ({pending.length})</p></div>
        <div className="metric-card text-center"><p className="text-lg font-bold text-[hsl(142,76%,36%)]">R$ {paid.reduce((s, b) => s + (b.paid_amount || b.amount), 0).toFixed(0)}</p><p className="text-[10px] text-[hsl(220,10%,50%)]">Pagos ({paid.length})</p></div>
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(220,10%,50%)]" />
        <Input placeholder="Buscar fornecedor ou valor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white/60 backdrop-blur" />
      </div>

      {loading ? <p className="text-center py-8">Carregando...</p> : filtered.length === 0 ? (
        <div className="text-center py-12"><FileText size={40} className="mx-auto text-[hsl(220,10%,60%)] mb-3" /><p className="text-[hsl(220,10%,50%)]">Nenhum boleto</p></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(bill => (
            <div key={bill.id} className={`ios-list-item border-l-4 ${bill.status === 'pago' ? 'border-l-[hsl(142,76%,36%)]' : 'border-l-[hsl(0,72%,51%)]'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-sm">{bill.supplier}</h3>
                  <p className="text-xs text-[hsl(220,10%,50%)]">Venc: {new Date(bill.due_date).toLocaleDateString('pt-BR')}</p>
                  {bill.notes && <p className="text-[10px] text-[hsl(220,10%,50%)]">{bill.notes}</p>}
                </div>
                <div className="text-right"><p className="font-bold">R$ {bill.amount?.toFixed(2)}</p></div>
              </div>
              <div className="flex gap-2 mt-2">
                {bill.status === 'pendente' && <Button onClick={() => handlePay(bill)} className="flex-1 bg-[hsl(142,76%,36%)] text-xs">💰 Pagar</Button>}
                <Button onClick={() => openEdit(bill)} className="flex-1 bg-[hsl(211,100%,50%)] text-xs"><Pencil size={12} className="mr-1" /> Editar</Button>
                <Button onClick={() => handleDelete(bill.id)} className="flex-1 bg-[hsl(0,72%,51%)] text-xs"><Trash2 size={12} className="mr-1" /> Apagar</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={openNew} className="fab"><Plus size={24} /></button>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="ios-sheet max-w-md">
          <DialogHeader><DialogTitle>{editingBill ? 'Editar' : 'Novo'} Boleto</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <Input required placeholder="Fornecedor *" value={form.supplier} onChange={e => setForm({...form, supplier: e.target.value})} />
            <Input required type="number" step="0.01" placeholder="Valor *" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
            <Input required type="date" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
            {!editingBill && <Input type="number" min="1" max="24" placeholder="Parcelas (1 = sem recorrência)" value={form.installments} onChange={e => setForm({...form, installments: e.target.value})} />}
            <Input placeholder="Observações" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button className="flex-1 bg-[hsl(211,100%,50%)]" onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}