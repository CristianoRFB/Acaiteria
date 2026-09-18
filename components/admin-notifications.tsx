'use client';

import { collection, limit, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { Bell, Check, ExternalLink, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { OrderStatus } from '@/shared/domain';
import { formatBRL } from '@/shared/domain';
import { updateOrderStatusDirect } from '@/lib/direct-orders';

interface NewOrder {
  id: string;
  orderNumber: string;
  createdAt?: Timestamp;
  customer?: { name?: string };
  pricing?: { totalCents?: number };
  fulfillment?: { mode?: string };
}

/** Central de pedidos novos persistente no painel, com ações rápidas e acessíveis. */
export function AdminNotifications() {
  const { role } = useAuth();
  const [orders, setOrders] = useState<NewOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!role) return;
    return onSnapshot(
      query(collection(getFirebaseClient().db, 'orders'), where('status', '==', 'NEW'), limit(25)),
      (snapshot) => {
        const next = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as NewOrder)
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setOrders(next);
      },
      () => setMessage('Notificações indisponíveis no momento.'),
    );
  }, [role]);

  async function quickAction(orderId: string, status: Extract<OrderStatus, 'CONFIRMED' | 'CANCELLED'>) {
    setBusy(orderId);
    setMessage('');
    try {
      const reason = status === 'CANCELLED' ? 'Recusado pela loja' : undefined;
      await updateOrderStatusDirect(getFirebaseClient().db, orderId, status, reason);
      setMessage(status === 'CONFIRMED' ? 'Pedido aceito.' : 'Pedido recusado.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível atualizar o pedido.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {open && (
        <section className="w-[min(100%,380px)] overflow-hidden rounded-3xl border border-[#82204f]/10 bg-white shadow-2xl" aria-label="Pedidos novos">
          <div className="flex items-center justify-between bg-[#351924] px-5 py-4 text-white">
            <div><p className="text-xs font-bold uppercase tracking-widest text-[#ffcf3d]">Atenção</p><h2 className="text-lg font-black">Pedidos novos</h2></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar notificações" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="size-4" /></button>
          </div>
          {message && <p role="status" className="border-b bg-amber-50 px-5 py-3 text-xs font-bold text-amber-900">{message}</p>}
          <div className="max-h-[min(60vh,480px)] overflow-y-auto">
            {!orders.length ? <p className="p-6 text-center text-sm text-[#826a75]">Nenhum pedido aguardando aceite.</p> : orders.map((order) => (
              <article key={order.id} className="border-b border-[#82204f]/8 p-4 last:border-0">
                <div className="flex items-start justify-between gap-3"><div><strong className="block text-base">{order.orderNumber}</strong><span className="text-xs text-[#826a75]">{order.customer?.name || 'Cliente'} · {order.fulfillment?.mode === 'DELIVERY' ? 'Entrega' : 'Retirada'}</span></div><strong className="text-[#82204f]">{formatBRL(order.pricing?.totalCents ?? 0)}</strong></div>
                <div className="mt-3 flex gap-2"><Button type="button" disabled={busy === order.id} onClick={() => quickAction(order.id, 'CONFIRMED')} className="h-9 flex-1 rounded-full bg-[#d7f04a] text-xs font-black text-[#351924]">{busy === order.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Aceitar</Button><Button type="button" disabled={busy === order.id} onClick={() => quickAction(order.id, 'CANCELLED')} className="h-9 rounded-full bg-red-50 px-3 text-xs font-black text-red-700 hover:bg-red-100"><X className="size-4" /> Recusar</Button><Button type="button" variant="outline" className="h-9 rounded-full px-3" render={<a href={`/admin/pedidos/${order.id}`} aria-label={`Abrir ${order.orderNumber}`} />}><ExternalLink className="size-4" /></Button></div>
              </article>
            ))}
          </div>
          <a href="/admin/pedidos" className="block border-t bg-[#fffaf5] px-5 py-3 text-center text-xs font-black text-[#82204f]">Ver todos os pedidos</a>
        </section>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label={orders.length ? `${orders.length} pedidos novos` : 'Abrir notificações'} aria-expanded={open} className="relative grid size-14 place-items-center rounded-full bg-[#82204f] text-white shadow-xl transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#82204f]/25"><Bell className="size-6" />{orders.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full border-2 border-white bg-[#ffcf3d] px-1.5 py-0.5 text-xs font-black text-[#351924]">{orders.length > 99 ? '99+' : orders.length}</span>}</button>
    </div>
  );
}
