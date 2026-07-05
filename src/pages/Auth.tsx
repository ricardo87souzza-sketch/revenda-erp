import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  if (user) {
    navigate('/dashboard')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (isRegister) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        alert('Conta criada! Verifique seu email e faça login.')
        setIsRegister(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        navigate('/dashboard')
      }
    } catch (error: any) {
      alert(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220,20%,97%)] p-4">
      <div className="glass-card w-full max-w-sm p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <img 
            src="https://i.imgur.com/0Q6tNuR.jpeg" 
            alt="Revenda ERP" 
            className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg object-cover"
          />
          <h1 className="text-2xl font-bold text-[hsl(220,20%,10%)]">Revenda ERP</h1>
          <p className="text-sm text-[hsl(220,10%,50%)] mt-1">Gestão Natura & Boticário</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="bg-white/60 backdrop-blur"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-white/60 backdrop-blur"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[hsl(211,100%,50%)] hover:bg-[hsl(211,100%,45%)] text-white font-semibold py-6 rounded-xl"
          >
            {loading ? 'Carregando...' : isRegister ? 'Criar Conta' : 'Entrar'}
          </Button>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-[hsl(211,100%,50%)] text-sm font-medium hover:underline"
          >
            {isRegister ? 'Já tem conta? Faça login' : 'Não tem conta? Criar conta'}
          </button>
        </div>
      </div>
    </div>
  )
}