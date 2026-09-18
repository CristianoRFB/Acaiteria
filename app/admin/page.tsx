'use client';

import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { ArrowRight, CircleDollarSign, Clock3, PackageCheck, ShoppingBag, WalletCards } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/admin-shell';
import { useAuth, useCatalog } from '@/components/providers';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { formatBRL, getStoreAvailability, type OrderStatus } from '@/shared/domain';

interface DashboardOrder {
  id: string;
  orderNumber: string;
  createdAt?: Timestamp;
  customer?: { name?: string };
  pricing?: { totalCents?: number };
  status: OrderStatus;
}

const activeStatuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];
const statusLabels: Record<OrderStatus, string> = {
  NEW: 'Novos', CONFIRMED: 'Confirmados', PREPARING: 'Em preparo', READY: 'Prontos',
  OUT_FOR_DELIVERY: 'Em entrega', COMPLETED: 'Concluídos', CANCELLED: 'Cancelados',
};

export default function AdminDashboard() {
  const { role } = useAuth();
  const { config } = useCatalog();
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!hasFirebaseConfig || !role) return;
    return onSnapshot(
      query(collection(getFirebaseClient().db, 'orders'), orderBy('createdAt', 'desc'), limit(100)),
      (snapshot) => setOrders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DashboardOrder)),
      (cause) => setError(`Não foi possível atualizar os pedidos: ${cause.message}`),
    );
  }, [role]);

  const todayKey = now.toLocaleDateString('en-CA', { timeZone: config.timezone || 'America/Sao_Paulo' });
  const todayOrders = useMemo(() => orders.filter((order) => order.createdAt?.toDate().toLocaleDateString('en-CA', { timeZone: config.timezone || 'America/Sao_Paulo' }) === todayKey), [orders, todayKey, config.timezone]);
  const activeOrders = orders.filter((order) => activeStatuses.includes(order.status));
  const salesCents = todayOrders.filter((order) => order.status !== 'CANCELLED').reduce((sum, order) => sum + (order.pricing?.totalCents ?? 0), 0);
  const averageCents = todayOrders.length ? Math.round(salesCents / todayOrders.length) : 0;
  const availability = getStoreAvailability(now, config);

  return <AdminShell>
    <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div><p className="eyebrow">Central de operação</p><h1 className="section-title">Bom trabalho, equipe.</h1><p className="mt-2 max-w-xl text-sm text-text-muted">Acompanhe o que precisa de atenção agora e abra uma área apenas quando necessário.</p></div>
      <div className={`status-badge w-fit ${availability.acceptingOrders ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}><span className={`size-2 rounded-full ${availability.acceptingOrders ? 'bg-emerald-500' : 'bg-amber-500'}`} />{availability.acceptingOrders ? 'Loja aceitando pedidos' : 'Loja fechada ou pausada'}</div>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section aria-label="Resumo do dia" className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={ShoppingBag} label="Pedidos hoje" value={String(todayOrders.length)} detail={`${activeOrders.length} em andamento`} />
      <Metric icon={CircleDollarSign} label="Vendas hoje" value={formatBRL(salesCents)} detail="Pedidos não cancelados" />
      <Metric icon={WalletCards} label="Ticket médio" value={formatBRL(averageCents)} detail={todayOrders.length ? 'Com base nos pedidos de hoje' : 'Ainda sem vendas hoje'} />
      <Metric icon={PackageCheck} label="Próxima ação" value={String(orders.filter((order) => order.status === 'NEW').length)} detail="pedido(s) aguardando confirmação" emphasis />
    </section>
    <section className="mt-7 grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
      <div className="surface rounded-3xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Fila agora</p><h2 className="mt-1 text-xl font-black text-brand-deep">Acompanhe os estágios</h2></div><a href="/admin/pedidos" className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-black text-brand hover:bg-surface-warm">Abrir pedidos <ArrowRight className="size-4" /></a></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{activeStatuses.map((status) => <div key={status} className="rounded-2xl bg-surface-warm p-4"><span className="text-xs font-bold text-text-muted">{statusLabels[status]}</span><strong className="mt-2 block text-2xl font-black text-brand-deep">{orders.filter((order) => order.status === status).length}</strong><span className="mt-1 block text-xs text-text-muted">pedido(s)</span></div>)}</div>
      </div>
      <div className="surface rounded-3xl p-5 sm:p-6"><p className="eyebrow">Atalhos do turno</p><h2 className="mt-1 text-xl font-black text-brand-deep">Ações rápidas</h2><div className="mt-4 space-y-2"><QuickLink href="/admin/pedidos" icon={ShoppingBag} title="Operar pedidos" text="Confirmar e avançar o preparo" /><QuickLink href="/admin/caixa" icon={CircleDollarSign} title="Conferir caixa" text="Abrir turno ou registrar movimento" /><QuickLink href="/admin/catalogo" icon={PackageCheck} title="Atualizar cardápio" text="Disponibilidade, fotos e preços" /></div></div>
    </section>
    <section className="surface mt-5 rounded-3xl p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Últimos pedidos</p><h2 className="mt-1 text-xl font-black text-brand-deep">O que entrou por último</h2></div><Clock3 className="size-5 text-brand" /></div>{orders.slice(0, 5).map((order) => <a key={order.id} href={`/admin/pedidos/${order.id}`} className="mt-3 flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-border-soft px-4 py-3 transition hover:border-brand/30 hover:bg-surface-warm"><span className="min-w-0"><strong className="block truncate text-sm">{order.orderNumber}</strong><span className="text-xs text-text-muted">{order.customer?.name || 'Cliente'} · {order.createdAt?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || 'agora'}</span></span><span className="shrink-0 text-right"><strong className="block text-sm text-brand">{formatBRL(order.pricing?.totalCents ?? 0)}</strong><span className="text-[11px] font-bold text-text-muted">{statusLabels[order.status]}</span></span></a>)}{!orders.length && <p className="mt-5 rounded-2xl bg-surface-warm p-5 text-sm text-text-muted">Nenhum pedido carregado ainda. Quando chegar um novo pedido, ele aparecerá aqui.</p>}</section>
  </AdminShell>;
}

function Metric({ icon: Icon, label, value, detail, emphasis = false }: { icon: typeof ShoppingBag; label: string; value: string; detail: string; emphasis?: boolean }) {
  return <div className={`surface rounded-2xl p-4 ${emphasis ? 'border-brand/25' : ''}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-text-muted">{label}</span><span className={`grid size-9 place-items-center rounded-xl ${emphasis ? 'bg-accent' : 'bg-surface-warm'}`}><Icon className="size-4 text-brand" /></span></div><strong className="mt-4 block truncate text-2xl font-black text-brand-deep">{value}</strong><span className="mt-1 block text-xs text-text-muted">{detail}</span></div>;
}

function QuickLink({ href, icon: Icon, title, text }: { href: string; icon: typeof ShoppingBag; title: string; text: string }) {
  return <a href={href} className="flex min-h-14 items-center gap-3 rounded-2xl border border-border-soft px-3 transition hover:border-brand/30 hover:bg-surface-warm"><span className="grid size-9 place-items-center rounded-xl bg-brand text-white"><Icon className="size-4" /></span><span className="min-w-0"><strong className="block text-sm">{title}</strong><span className="block truncate text-xs text-text-muted">{text}</span></span><ArrowRight className="ml-auto size-4 shrink-0 text-brand" /></a>;
}
