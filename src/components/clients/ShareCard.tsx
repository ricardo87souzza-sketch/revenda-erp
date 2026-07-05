import { forwardRef } from 'react'

interface ShareCardProps {
  clientName: string
  sale: any
  totalPending: number
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ clientName, sale, totalPending }, ref) => {
    return (
      <div
        ref={ref}
        style={{
          width: '400px',
          padding: '24px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '20px',
          color: 'white',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          position: 'absolute',
          left: '-9999px',
          top: 0,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', margin: '0 0 4px 0' }}>📋 Revenda ERP</h2>
          <p style={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>{clientName}</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', opacity: 0.9 }}>📅 Data</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
              {new Date(sale?.sale_date).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', opacity: 0.9 }}>💰 Total</span>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
              R$ {sale?.total_amount?.toFixed(2)}
            </span>
          </div>
        </div>

        {sale?.items?.length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', opacity: 0.9 }}>🛍️ PRODUTOS</p>
            {sale.items.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span>{item.product_name} x{item.quantity}</span>
                <span style={{ fontWeight: 'bold' }}>R$ {item.total_price?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        {(sale?.installments || []).filter((i: any) => i.status === 'pendente').length > 0 && (
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '14px', padding: '16px', marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', opacity: 0.9 }}>⚠️ PARCELAS PENDENTES</p>
            {(sale?.installments || []).filter((i: any) => i.status === 'pendente').map((inst: any) => (
              <div key={inst.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                <span>{inst.installment_number}x - Venc: {new Date(inst.due_date).toLocaleDateString('pt-BR')}</span>
                <span style={{ fontWeight: 'bold' }}>R$ {(inst.amount - (inst.paid_amount || 0)).toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '16px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '12px' }}>
          <p style={{ fontSize: '12px', margin: 0, opacity: 0.9 }}>Total Pendente</p>
          <p style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0 0 0' }}>
            R$ {totalPending?.toFixed(2)}
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: '10px', opacity: 0.6, marginTop: '16px' }}>
          Revenda ERP • Gestão Natura & Boticário
        </p>
      </div>
    )
  }
)