import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export default function Products() {
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState<any>(null)
  const [form, setForm] = useState({ sku: '', name: '', cost_price: '', sale_price: '', quantity: '', description: '' })
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      let query = supabase.from('products').select('*')
      if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      const { data } = await query.order('quantity', { ascending: false })
      if (data) {
        const withStock = data.filter(p => p.quantity > 0)
        const zeroStock = data.filter(p => p.quantity === 0)
        return [...withStock, ...zeroStock]
      }
      return []
    },
    enabled: !!user,
  })

  const totalStock = products.reduce((s, p) => s + p.quantity, 0)
  const zeroStock = products.filter(p => p.quantity === 0).length

  const openNewForm = () => {
    setEditingProduct(null)
    setForm({ sku: '', name: '', cost_price: '', sale_price: '', quantity: '', description: '' })
    setShowForm(true)
  }

  const openEditForm = (product: any) => {
    setEditingProduct(product)
    setForm({
      sku: product.sku, name: product.name,
      cost_price: product.cost_price?.toString() || '',
      sale_price: product.sale_price?.toString() || '',
      quantity: product.quantity?.toString() || '',
      description: product.description || ''
    })
    setShowForm(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const productData = {
      sku: form.sku, name: form.name,
      cost_price: parseFloat(form.cost_price), sale_price: parseFloat(form.sale_price),
      quantity: parseInt(form.quantity) || 0, description: form.description
    }
    if (editingProduct) {
      await supabase.from('products').update(productData).eq('id', editingProduct.id)
    } else {
      await supabase.from('products').insert({ ...productData, user_id: user?.id })
    }
    setShowForm(false); setEditingProduct(null)
    queryClient.invalidateQueries({ queryKey: ['products'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir?')) return
    await supabase.from('products').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  if (!user) return null

  return (
    <div className="px-3 py-4 mb-24 max-w-lg mx-auto">
      <h1 className="text-lg font-bold mb-3">📦 Produtos</h1>

      {/* Cards resumo - mais compactos */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="metric-card text-center !p-2">
          <p className="text-base font-bold text-[hsl(211,100%,50%)]">{totalStock}</p>
          <p className="text-[10px] text-gray-400">Estoque</p>
        </div>
        <div className="metric-card text-center !p-2">
          <p className="text-base font-bold text-red-500">{zeroStock}</p>
          <p className="text-[10px] text-gray-400">Zerados</p>
        </div>
        <div className="metric-card text-center !p-2">
          <p className="text-base font-bold text-green-600">{products.length}</p>
          <p className="text-[10px] text-gray-400">Total</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Buscar por nome ou SKU..." value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 h-10 text-sm bg-white/60" />
      </div>

      {/* Lista compacta */}
      {isLoading ? <p className="text-center py-8 text-gray-400">Carregando...</p> :
       products.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm">Nenhum produto</p>
          <Button onClick={openNewForm} className="mt-3 bg-[hsl(211,100%,50%)] h-9 text-sm">Cadastrar</Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {products.map(product => {
            const profit = product.sale_price - product.cost_price
            const margin = product.sale_price > 0 ? (profit / product.sale_price) * 100 : 0
            const inStock = product.quantity > 0

            return (
              <div key={product.id} onClick={() => openEditForm(product)}
                className={`ios-list-item !p-3 cursor-pointer border-l-[3px] ${
                  inStock ? 'border-l-green-500' : 'border-l-red-500 bg-red-50/50'
                }`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg flex-shrink-0">{inStock ? '📦' : '📭'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm truncate">{product.name}</h3>
                      <button onClick={e => { e.stopPropagation(); handleDelete(product.id) }}
                        className="text-red-400 hover:text-red-600 flex-shrink-0 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">SKU: {product.sku}</span>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                      <span><span className="text-gray-400">Est:</span> <b className={inStock ? 'text-green-600' : 'text-red-500'}>{product.quantity}</b></span>
                      <span><span className="text-gray-400">C:</span> <b>R$ {product.cost_price?.toFixed(2)}</b></span>
                      <span><span className="text-gray-400">V:</span> <b>R$ {product.sale_price?.toFixed(2)}</b></span>
                      <span className="text-green-600 font-medium text-[10px] ml-auto">{margin.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button onClick={openNewForm} className="fab"><Plus size={22} /></button>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="ios-sheet max-w-md">
          <DialogHeader><DialogTitle>{editingProduct ? 'Editar' : 'Novo'} Produto</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-2.5 mt-2">
            <Input required placeholder="SKU *" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} className="h-10" />
            <Input required placeholder="Nome *" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-10" />
            <div className="grid grid-cols-2 gap-2">
              <Input required type="number" step="0.01" placeholder="Custo *" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})} className="h-10" />
              <Input required type="number" step="0.01" placeholder="Venda *" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})} className="h-10" />
            </div>
            <Input type="number" placeholder="Quantidade" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="h-10" />
            <Input placeholder="Descrição" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="h-10" />
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 h-10" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" className="flex-1 h-10 bg-[hsl(211,100%,50%)]">{editingProduct ? 'Atualizar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}