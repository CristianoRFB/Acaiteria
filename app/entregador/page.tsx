'use client';

import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  Bike,
  CheckCircle2,
  Clock3,
  History,
  Home,
  LogOut,
  MapPin,
  PackageCheck,
  UserRound,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { deliveryStatusLabels, driverStatusLabels, type DeliveryDriverStatus, type DeliveryRecord } from '@/shared/delivery';

interface DriverProfile { name?: string; phone?: string; email?: string; status?: DeliveryDriverStatus; enabled?: boolean; currentDeliveryId?: string | null }
interface DeliveryRow extends DeliveryRecord { id: string }
interface DriverHistoryRow { id: string; orderNumber?: string; customerName?: string; status?: string; note?: string; updatedAt?: { toDate?: () => Date } }
type DriverTab = 'HOME' | 'ORDERS' | 'HISTORY' | 'PROFILE';
type OrderFilter = 'CURRENT' | 'PENDING' | 'DONE';

const activeDeliveryStatuses = ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'];
const inProgressStatuses = ['ACCEPTED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'];

export default function DriverHomePage() {
  const { user, role, loading } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [historyRows, setHistoryRows] = useState<DriverHistoryRow[]>([]);
  const [tab, setTab] = useState<DriverTab>('HOME');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('CURRENT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasFirebaseConfig || !user || role !== 'driver') return undefined;
    const { db } = getFirebaseClient();
    const stopProfile = onSnapshot(
      doc(db, 'deliveryDrivers', user.uid),
      (snapshot) => setProfile(snapshot.exists() ? snapshot.data() as DriverProfile : null),
      () => setError('Não foi possível carregar seu perfil.'),
    );
    const stopDeliveries = onSnapshot(
      query(
        collection(db, 'deliveries'),
        where('driverId', '==', user.uid),
        where('status', 'in', activeDeliveryStatuses),
        orderBy('updatedAt', 'desc'),
        limit(100),
      ),
      (snapshot) => setDeliveries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DeliveryRow)),
      () => setError('Não foi possível carregar suas entregas.'),
    );
    const stopHistory = onSnapshot(
      query(collection(db, 'deliveryDrivers', user.uid, 'deliveryHistory'), orderBy('updatedAt', 'desc'), limit(100)),
      (snapshot) => setHistoryRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DriverHistoryRow)),
      () => setError('Não foi possível carregar seu histórico.'),
    );
    return () => { stopProfile(); stopDeliveries(); stopHistory(); };
  }, [role, user]);

  useEffect(() => {
    if (!loading && (!user || role !== 'driver')) window.location.href = '/entregador/login';
  }, [loading, role, user]);

  const current = useMemo(
    () => deliveries.find((item) => item.id === profile?.currentDeliveryId && inProgressStatuses.includes(item.status)),
    [deliveries, profile?.currentDeliveryId],
  );
  const pending = useMemo(
    () => deliveries.filter((item) => item.status === 'ASSIGNED'),
    [deliveries],
  );
  const history = useMemo(
    () => historyRows
      .filter((item) => !activeDeliveryStatuses.includes(item.status ?? ''))
      .sort((a, b) => (b.updatedAt?.toDate?.().getTime() ?? 0) - (a.updatedAt?.toDate?.().getTime() ?? 0)),
    [historyRows],
  );
  const doneToday = useMemo(() => {
    const today = new Date().toDateString();
    return history.filter((item) => item.status === 'DELIVERED' && item.updatedAt?.toDate?.().toDateString() === today).length;
  }, [history]);

  async function toggleAvailability() {
    const status = profile?.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    setBusy(true);
    setError('');
    try {
      await httpsCallable(getFirebaseClient().functions, 'setDriverAvailability')({ status });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar sua disponibilidade.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !user || role !== 'driver') {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7ff] p-6 text-center"><p className="text-sm font-bold text-[#6f6878]">Carregando área do entregador…</p></main>;
  }

  const name = profile?.name ?? user.displayName ?? 'Entregador';
  const available = profile?.status === 'AVAILABLE' && !profile.currentDeliveryId;
  const orderDeliveries = orderFilter === 'CURRENT'
    ? deliveries.filter((item) => inProgressStatuses.includes(item.status))
    : deliveries.filter((item) => item.status === 'ASSIGNED');
  const completedOrders = history.filter((item) => item.status === 'DELIVERED');
  const ordersEmpty = orderFilter === 'DONE' ? completedOrders.length === 0 : orderDeliveries.length === 0;
  const pageTitle: Record<DriverTab, string> = { HOME: 'Início', ORDERS: 'Pedidos', HISTORY: 'Histórico', PROFILE: 'Perfil' };

  return (
    <main className="min-h-screen bg-[#f8f7ff] pb-[calc(6rem+env(safe-area-inset-bottom))] text-[#171521]">
      <header className="border-b border-[#e5e1ed] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#6f2bc5] text-white"><Bike className="size-5" /></span>
            <div><p className="text-xs font-black uppercase tracking-widest text-[#6f2bc5]">Açaí Mais Sabor</p><p className="text-lg font-black">{pageTitle[tab]}</p></div>
          </div>
          <button aria-label="Sair" onClick={() => void signOut(getFirebaseClient().auth)} className="grid size-10 place-items-center rounded-full text-[#6f6878] hover:bg-[#f4f0f8]"><LogOut className="size-5" /></button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
        {error && <p role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-800">{error}</p>}

        {tab === 'HOME' && (
          <>
            <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><h1 className="text-2xl font-black">Olá, {name.split(' ')[0]}!</h1><span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${available ? 'bg-[#e4f7ed] text-[#1d9560]' : 'bg-[#ece9f1] text-[#6f6878]'}`}>{driverStatusLabels[profile?.status ?? 'OFFLINE']}</span></div>
              <Button disabled={busy || profile?.status === 'BUSY' || Boolean(profile?.currentDeliveryId)} onClick={() => void toggleAvailability()} className={`min-h-11 w-full rounded-full px-5 sm:w-fit ${available ? 'bg-[#df5656] text-white' : 'bg-[#6f2bc5] text-white'}`}>{busy ? 'Salvando…' : available ? 'Ficar offline' : 'Ficar disponível'}</Button>
            </section>

            {current ? (
              <section className="mt-6 rounded-3xl border border-[#e5e1ed] bg-white p-5 shadow-sm">
                <p className="text-xs font-black uppercase tracking-wider text-[#6f6878]">Entrega atual</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-2xl font-black">Pedido {current.orderNumber}</h2><span className="rounded-full bg-[#eee3fb] px-3 py-1 text-xs font-black text-[#6f2bc5]">{deliveryStatusLabels[current.status]}</span></div>
                <p className="mt-2 text-lg font-bold">{current.customerName}</p>
                <p className="mt-1 text-sm text-[#6f6878]">{current.address?.neighborhood ?? 'Endereço'}{current.estimatedMinutes ? ` · ${current.estimatedMinutes} min` : ''}</p>
                <a href={`/entregador/entrega/${current.id}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#6f2bc5] px-4 text-sm font-black text-white">Ver entrega <MapPin className="size-4" /></a>
              </section>
            ) : (
              <section className="mt-6 rounded-3xl border border-dashed border-[#d9d1e4] bg-white p-7 text-center"><Clock3 className="mx-auto size-7 text-[#6f2bc5]" /><h2 className="mt-3 text-xl font-black">Nenhuma entrega agora</h2><p className="mt-1 text-sm text-[#6f6878]">Fique disponível para receber novas corridas.</p></section>
            )}

            {pending.length > 0 && <section className="mt-7"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Próximas entregas</h2><button className="text-sm font-black text-[#6f2bc5]" onClick={() => { setOrderFilter('PENDING'); setTab('ORDERS'); }}>Ver todas</button></div><div className="mt-3 space-y-3">{pending.slice(0, 3).map((delivery) => <DeliveryLink key={delivery.id} delivery={delivery} />)}</div></section>}

            <section className="mt-7 rounded-3xl border border-[#e5e1ed] bg-white p-5"><p className="text-sm font-bold text-[#6f6878]">Hoje</p><p className="mt-1 text-xl font-black">{doneToday} {doneToday === 1 ? 'entrega concluída' : 'entregas concluídas'}</p></section>
          </>
        )}

        {tab === 'ORDERS' && (
          <section>
            <h1 className="text-2xl font-black">Pedidos</h1>
            <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Filtrar pedidos">
              {([['CURRENT', 'Atual'], ['PENDING', 'Pendentes'], ['DONE', 'Concluídos']] as const).map(([value, label]) => <button key={value} aria-pressed={orderFilter === value} onClick={() => setOrderFilter(value)} className={`min-h-11 rounded-xl border px-2 text-sm font-bold ${orderFilter === value ? 'border-[#6f2bc5] bg-[#6f2bc5] text-white' : 'border-[#e5e1ed] bg-white text-[#6f6878]'}`}>{label}</button>)}
            </div>
            <div className="mt-5 space-y-3">
              {orderFilter !== 'DONE' && orderDeliveries.map((delivery) => <DeliveryLink key={delivery.id} delivery={delivery} />)}
              {orderFilter === 'DONE' && completedOrders.map((entry) => <HistoryCard key={entry.id} entry={entry} />)}
              {ordersEmpty && <div className="rounded-3xl border border-dashed border-[#d9d1e4] bg-white p-7 text-center text-sm text-[#6f6878]">{orderFilter === 'DONE' ? 'Nenhum pedido concluído ainda.' : 'Nenhum pedido nesta lista.'}</div>}
            </div>
          </section>
        )}

        {tab === 'HISTORY' && (
          <section>
            <h1 className="text-2xl font-black">Histórico de entregas</h1><p className="mt-1 text-sm text-[#6f6878]">Suas corridas concluídas e atualizações</p>
            <div className="mt-5 space-y-3">{history.map((entry) => <HistoryCard key={entry.id} entry={entry} />)}{!history.length && <div className="rounded-3xl border border-dashed border-[#d9d1e4] bg-white p-7 text-center text-sm text-[#6f6878]">As entregas concluídas aparecerão aqui.</div>}</div>
          </section>
        )}

        {tab === 'PROFILE' && (
          <section>
            <h1 className="text-2xl font-black">Perfil</h1>
            <div className="mt-5 rounded-3xl border border-[#e5e1ed] bg-white p-6 text-center">
              <span className="mx-auto grid size-24 place-items-center rounded-full bg-[#e9def5] text-3xl font-black text-[#6f2bc5]">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
              <h2 className="mt-4 text-xl font-black">{name}</h2>
              {profile?.phone && <p className="mt-1 text-sm text-[#6f6878]">{profile.phone}</p>}
              {profile?.email && <p className="mt-1 break-all text-sm text-[#6f6878]">{profile.email}</p>}
              <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-black ${available ? 'bg-[#e4f7ed] text-[#1d9560]' : 'bg-[#ece9f1] text-[#6f6878]'}`}>{driverStatusLabels[profile?.status ?? 'OFFLINE']}</span>
            </div>
            <div className="mt-4 rounded-3xl border border-[#e5e1ed] bg-white p-5"><p className="text-sm font-bold text-[#6f6878]">Status atual</p><p className="mt-2 font-black">{available ? 'Disponível para novas entregas' : profile?.status === 'BUSY' ? 'Você está em uma entrega' : 'Você não está recebendo entregas'}</p></div>
            <Button disabled={busy || profile?.status === 'BUSY' || Boolean(profile?.currentDeliveryId)} onClick={() => void toggleAvailability()} className={`mt-4 min-h-12 w-full rounded-full ${available ? 'bg-[#df5656] text-white' : 'bg-[#6f2bc5] text-white'}`}>{busy ? 'Salvando…' : available ? 'Ficar offline' : 'Ficar disponível'}</Button>
            <button onClick={() => void signOut(getFirebaseClient().auth)} className="mt-3 min-h-12 w-full rounded-2xl border border-[#e5e1ed] bg-white px-4 text-left font-black text-red-700">Sair da conta</button>
          </section>
        )}
      </div>

      <nav aria-label="Navegação do entregador" className="fixed inset-x-0 bottom-0 border-t border-[#e5e1ed] bg-white/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-around">
          <DriverNavButton active={tab === 'HOME'} label="Início" onClick={() => setTab('HOME')}><Home className="size-5" /></DriverNavButton>
          <DriverNavButton active={tab === 'ORDERS'} label="Pedidos" onClick={() => setTab('ORDERS')}><PackageCheck className="size-5" /></DriverNavButton>
          <DriverNavButton active={tab === 'HISTORY'} label="Histórico" onClick={() => setTab('HISTORY')}><History className="size-5" /></DriverNavButton>
          <DriverNavButton active={tab === 'PROFILE'} label="Perfil" onClick={() => setTab('PROFILE')}><UserRound className="size-5" /></DriverNavButton>
        </div>
      </nav>
    </main>
  );
}

function DeliveryLink({ delivery }: { delivery: DeliveryRow }) {
  return <a href={`/entregador/entrega/${delivery.id}`} className="flex min-h-24 items-center justify-between gap-3 rounded-3xl border border-[#e5e1ed] bg-white p-4 shadow-sm"><div className="min-w-0"><strong className="block truncate">Pedido {delivery.orderNumber}</strong><span className="mt-1 block text-sm">{delivery.customerName}</span><span className="mt-1 block text-sm text-[#6f6878]">{delivery.address?.neighborhood ?? 'Endereço'}</span><span className="mt-2 inline-flex rounded-full bg-[#eee3fb] px-2.5 py-1 text-xs font-black text-[#6f2bc5]">{deliveryStatusLabels[delivery.status]}</span></div><span className="shrink-0 text-xl font-black text-[#6f2bc5]">›</span></a>;
}

function HistoryCard({ entry }: { entry: DriverHistoryRow }) {
  return <article className="flex min-h-20 items-center justify-between gap-3 rounded-3xl border border-[#e5e1ed] bg-white p-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e4f7ed] text-[#1d9560]"><CheckCircle2 className="size-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate">{entry.orderNumber ?? 'Pedido'}</strong><span className="block truncate text-sm text-[#6f6878]">{entry.customerName ?? entry.note ?? 'Entrega atualizada'}</span></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${entry.status === 'DELIVERED' ? 'bg-[#e4f7ed] text-[#1d9560]' : 'bg-amber-50 text-amber-800'}`}>{historyStatusLabel(entry.status)}</span></article>;
}

function DriverNavButton({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-current={active ? 'page' : undefined} onClick={onClick} className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${active ? 'text-[#6f2bc5]' : 'text-[#6f6878]'}`}>{children}{label}</button>;
}

function historyStatusLabel(status?: string) {
  if (status === 'DELIVERED') return 'Entregue';
  if (status === 'DELIVERY_FAILED') return 'Falha';
  if (status === 'DRIVER_REJECTED') return 'Recusada';
  if (status === 'REASSIGNED') return 'Reatribuída';
  if (status === 'RETURNED_TO_QUEUE') return 'Devolvida à fila';
  if (status === 'CANCELLED') return 'Cancelada';
  return status ?? 'Atualizada';
}
