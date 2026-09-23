'use client';

import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Bike, CheckCircle2, Clock3, History, LogOut, MapPin, UserRound } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { deliveryStatusLabels, driverStatusLabels, type DeliveryDriverStatus, type DeliveryRecord } from '@/shared/delivery';

interface DriverProfile { name?: string; phone?: string; email?: string; status?: DeliveryDriverStatus; enabled?: boolean }
interface DeliveryRow extends DeliveryRecord { id: string }
interface DriverHistoryRow { id: string; orderNumber?: string; customerName?: string; status?: string; note?: string; updatedAt?: { toDate?: () => Date } }

export default function DriverHomePage() {
  const { user, role, loading } = useAuth();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [historyRows, setHistoryRows] = useState<DriverHistoryRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hasFirebaseConfig || !user || role !== 'driver') return undefined;
    const { db } = getFirebaseClient();
    const stopProfile = onSnapshot(doc(db, 'deliveryDrivers', user.uid), (snapshot) => setProfile(snapshot.exists() ? snapshot.data() as DriverProfile : null), () => setError('Não foi possível carregar seu perfil.'));
    const stopDeliveries = onSnapshot(query(collection(db, 'deliveries'), where('driverId', '==', user.uid), limit(100)), (snapshot) => setDeliveries(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DeliveryRow)), () => setError('Não foi possível carregar suas entregas.'));
    const stopHistory = onSnapshot(query(collection(db, 'deliveryDrivers', user.uid, 'deliveryHistory'), limit(100)), (snapshot) => setHistoryRows(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DriverHistoryRow)), () => setError('Não foi possível carregar seu histórico.'));
    return () => { stopProfile(); stopDeliveries(); stopHistory(); };
  }, [role, user]);
  useEffect(() => { if (!loading && (!user || role !== 'driver')) window.location.href = '/entregador/login'; }, [loading, role, user]);
  const current = useMemo(() => deliveries.find((item) => ['ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED'].includes(item.status)), [deliveries]);
  const next = useMemo(() => deliveries.filter((item) => item.status === 'ASSIGNED' && item.id !== current?.id), [current?.id, deliveries]);
  const history = useMemo(() => historyRows.filter((item) => item.status !== 'ASSIGNED' && item.status !== 'ACCEPTED' && item.status !== 'PICKED_UP' && item.status !== 'ON_THE_WAY' && item.status !== 'ARRIVED').sort((a, b) => (b.updatedAt?.toDate?.().getTime() ?? 0) - (a.updatedAt?.toDate?.().getTime() ?? 0)), [historyRows]);
  async function toggleAvailability() {
    const status = profile?.status === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
    setBusy(true); setError('');
    try { await httpsCallable(getFirebaseClient().functions, 'setDriverAvailability')({ status }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar sua disponibilidade.'); } finally { setBusy(false); }
  }
  if (loading || !user || role !== 'driver') return <main className="grid min-h-screen place-items-center bg-[#f8f7ff] p-6 text-center"><p className="text-sm font-bold text-[#6f6878]">Carregando área do entregador…</p></main>;
  const name = profile?.name ?? user.displayName ?? 'Entregador';
  const available = profile?.status === 'AVAILABLE';
  return <main className="min-h-screen bg-[#f8f7ff] pb-24 text-[#171521]"><header className="border-b border-[#e5e1ed] bg-white px-5 py-5 sm:px-8"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#6f2bc5] text-white"><Bike className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-widest text-[#6f2bc5]">Açaí Mais Sabor</p><h1 className="text-xl font-black">Olá, {name.split(' ')[0]}!</h1></div></div><button aria-label="Sair" onClick={() => void signOut(getFirebaseClient().auth)} className="grid size-10 place-items-center rounded-full text-[#6f6878] hover:bg-[#f4f0f8]"><LogOut className="size-5" /></button></div></header><div className="mx-auto max-w-3xl px-5 py-6 sm:px-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-sm font-bold text-[#6f6878]">Seu status</p><span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-black ${available ? 'bg-[#e4f7ed] text-[#1d9560]' : 'bg-[#ece9f1] text-[#6f6878]'}`}>{driverStatusLabels[profile?.status ?? 'OFFLINE']}</span></div><Button disabled={busy || profile?.status === 'BUSY'} onClick={() => void toggleAvailability()} className={`min-h-11 rounded-full px-5 ${available ? 'bg-[#df5656] text-white' : 'bg-[#6f2bc5] text-white'}`}>{busy ? 'Salvando…' : available ? 'Ficar offline' : 'Ficar disponível'}</Button></div>{error && <p role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-800">{error}</p>}{current ? <section className="mt-7"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">Entrega atual</h2><span className="rounded-full bg-[#eee3fb] px-3 py-1 text-xs font-black text-[#6f2bc5]">{deliveryStatusLabels[current.status]}</span></div><a href={`/entregador/entrega/${current.id}`} className="mt-3 block rounded-3xl bg-[#2f153d] p-5 text-white shadow-sm"><p className="text-xs font-black uppercase tracking-widest text-[#d8c2e9]">{current.orderNumber}</p><h3 className="mt-3 text-2xl font-black">{current.customerName}</h3><p className="mt-1 text-sm text-white/75">{current.address?.street}, {current.address?.number} · {current.address?.neighborhood}</p><span className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#6f2bc5] text-sm font-black">Ver entrega <MapPin className="ml-2 size-4" /></span></a></section> : <section className="mt-7 rounded-3xl border border-dashed border-[#d9d1e4] bg-white p-7 text-center"><Clock3 className="mx-auto size-7 text-[#6f2bc5]" /><h2 className="mt-3 text-xl font-black">Nenhuma entrega agora</h2><p className="mt-1 text-sm text-[#6f6878]">Fique disponível para receber novas corridas.</p></section>}{next.length > 0 && <section className="mt-7"><h2 className="text-xl font-black">Próximas entregas</h2><div className="mt-3 space-y-3">{next.map((delivery) => <a key={delivery.id} href={`/entregador/entrega/${delivery.id}`} className="flex items-center justify-between gap-3 rounded-3xl border border-[#e5e1ed] bg-white p-4"><div><strong className="block">{delivery.orderNumber}</strong><span className="text-sm text-[#6f6878]">{delivery.address?.neighborhood ?? 'Endereço'}</span></div><span className="rounded-full bg-[#eee3fb] px-3 py-1 text-xs font-black text-[#6f2bc5]">Aguardando aceite</span></a>)}</div></section>}<section className="mt-7"><div className="flex items-center gap-2"><History className="size-5 text-[#6f2bc5]" /><h2 className="text-xl font-black">Histórico recente</h2></div><div className="mt-3 space-y-3">{history.slice(0, 6).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-3xl border border-[#e5e1ed] bg-white p-4"><div><strong className="block">{entry.orderNumber ?? 'Pedido'}</strong><span className="text-sm text-[#6f6878]">{entry.customerName ?? entry.note ?? 'Entrega atualizada'}</span></div><span className={`rounded-full px-3 py-1 text-xs font-black ${entry.status === 'DELIVERED' ? 'bg-[#e4f7ed] text-[#1d9560]' : 'bg-amber-50 text-amber-800'}`}>{historyStatusLabel(entry.status)}</span></div>)}{!history.length && <p className="rounded-2xl bg-white p-5 text-sm text-[#6f6878]">As entregas concluídas aparecerão aqui.</p>}</div></section></div><nav className="fixed inset-x-0 bottom-0 border-t border-[#e5e1ed] bg-white/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-3xl items-center justify-around text-xs font-bold text-[#6f6878]"><a className="flex flex-col items-center gap-1 text-[#6f2bc5]" href="/entregador"><Bike className="size-5" />Início</a><a className="flex flex-col items-center gap-1" href="/entregador"><CheckCircle2 className="size-5" />Pedidos</a><span className="flex flex-col items-center gap-1"><UserRound className="size-5" />Perfil</span></div></nav></main>;
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
