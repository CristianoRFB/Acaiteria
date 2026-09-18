'use client';

import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { ArrowRight, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { formatBRL, type OrderStatus } from '@/shared/domain';

interface OrderRow {
  id: string;
  orderNumber: string;
  createdAt?: Timestamp;
  customer: { name: string; whatsapp?: string };
  fulfillment: { mode: string };
  pricing: { totalCents: number };
  status: OrderStatus;
}

const statusLabel: Record<OrderStatus, string> = { NEW: 'Novo', CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto', OUT_FOR_DELIVERY: 'Saiu para entrega', COMPLETED: 'Concluído', CANCELLED: 'Cancelado' };
const activeStatuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
const filters: Array<OrderStatus | 'ACTIVE'> = ['ACTIVE', 'NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'];

export default function OrdersPage() {
  const { role } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'ACTIVE'>('ACTIVE');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!hasFirebaseConfig || !role) return;
    return onSnapshot(query(collection(getFirebaseClient().db, 'orders'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => setOrders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as OrderRow)), (cause) => setError(cause.message));
  }, [role]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase().replace(/^#/, '');
    return orders.filter((order) => {
      const matchesStatus = filter === 'ACTIVE' ? activeStatuses.includes(order.status) : order.status === filter;
      if (!matchesStatus || !term) return matchesStatus;
      return [order.orderNumber, order.id, order.customer?.name, order.customer?.whatsapp].filter(Boolean).some((value) => String(value).toLowerCase().replace(/^#/, '').includes(term));
    });
  }, [orders, filter, search]);
  const grouped = useMemo(() => Object.fromEntries(activeStatuses.map((status) => [status, visible.filter((order) => order.status === status)])) as Record<OrderStatus, OrderRow[]>, [visible]);

  return <AdminShell><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="eyebrow">Operação</p><h1 className="section-title">Pedidos</h1><p className="mt-2 text-sm text-text-muted">Veja a fila por estágio e saiba qual é a próxima ação.</p></div><a href="/admin/ajuda" className="inline-flex min-h-10 w-fit items-center gap-2 rounded-full border border-border-soft bg-white px-4 text-sm font-black text-brand hover:bg-surface-warm">Como operar <ArrowRight className="size-4" /></a></div>
    <div className="action-bar mt-6">
      <label className="relative block min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-brand" />
        <span className="sr-only">Procurar pedido</span>
        <input aria-label="Procurar pedido" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número, código, cliente ou WhatsApp" className="h-12 w-full rounded-full border border-border-soft bg-surface-warm pl-11 pr-4 text-sm font-bold outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
      </label>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Filtrar pedidos">
        {filters.map((status) => <button key={status} type="button" role="tab" aria-selected={filter === status} onClick={() => setFilter(status)} className={`min-h-10 min-w-0 rounded-full px-3 text-xs font-black transition sm:px-4 ${filter === status ? 'bg-brand-deep text-white' : 'bg-surface-warm text-text-muted hover:text-brand'}`}>{status === 'ACTIVE' ? 'Em andamento' : statusLabel[status]}</button>)}
      </div>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {filter === 'ACTIVE' ? <div className="mt-5 grid gap-4 xl:grid-cols-5">{activeStatuses.map((status) => <section key={status} aria-labelledby={`col-${status}`} className="min-w-0 rounded-3xl bg-surface-warm p-3"><div className="flex items-center justify-between gap-2 px-2 pb-3"><h2 id={`col-${status}`} className="text-sm font-black text-brand-deep">{statusLabel[status]}</h2><span className="grid size-7 place-items-center rounded-full bg-white text-xs font-black text-brand">{grouped[status].length}</span></div><div className="space-y-3">{grouped[status].map((order) => <OrderCard key={order.id} order={order} />)}{!grouped[status].length && <p className="rounded-2xl border border-dashed border-border-soft bg-white/60 p-4 text-xs text-text-muted">Nada por aqui</p>}</div></section>)}</div> : <section className="surface mt-5 overflow-hidden rounded-3xl"><div className="hidden grid-cols-[140px_1fr_140px_140px_120px] gap-4 border-b px-5 py-3 text-xs font-bold uppercase tracking-wider text-text-muted md:grid"><span>Pedido</span><span>Cliente</span><span>Recebimento</span><span>Status</span><span className="text-right">Total</span></div>{visible.map((order) => <a key={order.id} href={`/admin/pedidos/${order.id}`} className="grid gap-2 border-b border-border-soft p-5 transition last:border-0 hover:bg-surface-warm md:grid-cols-[140px_1fr_140px_140px_120px] md:items-center md:gap-4"><div><strong className="block text-lg md:text-sm">{order.orderNumber}</strong><span className="text-[11px] text-text-muted">{order.createdAt?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div><span className="text-sm font-bold">{order.customer?.name || 'Cliente'}</span><span className="text-xs text-text-muted">{order.fulfillment?.mode === 'PICKUP' ? 'Retirada' : 'Delivery'}</span><StatusBadge status={order.status} /><strong className="md:text-right">{formatBRL(order.pricing?.totalCents ?? 0)}</strong></a>)}{!visible.length && <div className="p-10 text-center text-sm text-text-muted">Nenhum pedido encontrado para este filtro.</div>}</section>}
  </AdminShell>;
}

function OrderCard({ order }: { order: OrderRow }) {
  const created = order.createdAt?.toDate();
  const elapsed = created ? Math.max(0, Math.round((Date.now() - created.getTime()) / 60000)) : 0;
  return <a href={`/admin/pedidos/${order.id}`} className="block rounded-2xl border border-border-soft bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-brand-deep">{order.orderNumber}</strong><StatusBadge status={order.status} /></div><p className="mt-3 truncate text-sm font-bold">{order.customer?.name || 'Cliente'}</p><p className="mt-1 text-xs text-text-muted">{order.fulfillment?.mode === 'PICKUP' ? 'Retirada' : 'Delivery'} · {elapsed ? `${elapsed} min atrás` : 'agora'}</p><div className="mt-4 flex items-center justify-between gap-2"><strong className="text-sm text-brand">{formatBRL(order.pricing?.totalCents ?? 0)}</strong><ArrowRight className="size-4 text-brand" /></div></a>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = status === 'NEW' ? 'bg-amber-100 text-amber-900' : status === 'CANCELLED' ? 'bg-red-100 text-red-800' : status === 'READY' ? 'bg-lime-100 text-lime-900' : 'bg-[#fff0f5] text-brand';
  return <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>{statusLabel[status]}</span>;
}
