import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Package, ShoppingCart, Users, FileText, BarChart3, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const navItems = [
  { path: '/dashboard', icon: Home, label: 'Início' },
  { path: '/products', icon: Package, label: 'Produtos' },
  { path: '/sales', icon: ShoppingCart, label: 'Vendas' },
  { path: '/clients', icon: Users, label: 'Clientes' },
  { path: '/bills', icon: FileText, label: 'Boletos' },
  { path: '/reports', icon: BarChart3, label: 'Relatórios' },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuth()

  return (
    <nav className="ios-tab-bar fixed bottom-0 left-0 right-0 z-50">
      <div className="flex justify-around items-center py-2 px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-0.5 py-1 px-2 min-w-[52px]"
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute -top-1 w-8 h-1 bg-[hsl(211,100%,50%)] rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <item.icon
                size={22}
                strokeWidth={isActive ? 2.5 : 2}
                color={isActive ? 'hsl(211, 100%, 50%)' : 'hsl(220, 10%, 60%)'}
              />
              <span
                className={`text-[10px] font-medium ${
                  isActive ? 'text-[hsl(211,100%,50%)]' : 'text-[hsl(220,10%,55%)]'
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
        <button
          onClick={signOut}
          className="flex flex-col items-center gap-0.5 py-1 px-2 min-w-[52px]"
        >
          <LogOut size={22} strokeWidth={2} color="hsl(220, 10%, 60%)" />
          <span className="text-[10px] font-medium text-[hsl(220,10%,55%)]">Sair</span>
        </button>
      </div>
    </nav>
  )
}