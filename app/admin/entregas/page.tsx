'use client';

import { collection, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  CheckCircle2,
  Clock3,
  History,
  MapPin,
  RefreshCw,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { formatBRL } from '@/shared/domain';
import {
  deliveryStatusLabels,
  type DeliveryRecord,
  type DeliveryDriverStatus,
  type DeliveryStatus,
} from '@/shared/delivery';

interface DeliveryRow extends DeliveryRecord {
  id: string;
  createdAt?: { toDate?: () => Date };
  updatedAt?: { toDate?: () => Date };
  failureReason?: string;
  failedAt?: { toDate?: () => Date };
}
interface DriverRow {
  id: string;
  name?: string;
  phone?: string;
  status?: DeliveryDriverStatus;
  enabled?: boolean;
}
interface DeliveryEventRow { id: string; type?: string; actorRole?: string; note?: string; createdAt?: { toDate?: () => Date } }

const activeStatuses: DeliveryStatus[] = [
  'READY_FOR_DELIVERY',
  'ASSIGNED',
  'ACCEPTED',
  'PICKED_UP',
  'ON_THE_WAY',
  'ARRIVED',
];
const statusTone: Record<DeliveryStatus, string> = {
  READY_FOR_DELIVERY: 'bg-amber-100 text-amber-900',
  ASSIGNED: 'bg-blue-100 text-blue-900',
  ACCEPTED: 'bg-indigo-100 text-indigo-900',
  PICKED_UP: 'bg-cyan-100 text-cyan-900',
  ON_THE_WAY: 'bg-purple-100 text-purple-900',
  ARRIVED: 'bg-emerald-100 text-emerald-900',
  DELIVERED: 'bg-green-100 text-green-900',
  DELIVERY_FAILED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-slate-100 text-slate-700',
};

export default function DeliveriesPage() {
  const { role } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Record<string, string>>(
    {},
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [eventDeliveryId, setEventDeliveryId] = useState<string | null>(null);
  const [events, setEvents] = useState<DeliveryEventRow[]>([]);

  useEffect(() => {
    if (!hasFirebaseConfig || !role || !['admin', 'staff'].includes(role))
      return undefined;
    const db = getFirebaseClient().db;
    const stopDeliveries = onSnapshot(
      query(collection(db, 'deliveries'), limit(200)),
      (snapshot) => {
        setDeliveries(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as DeliveryRow,
          ),
        );
      },
      () =>
        setError(
          'Não foi possível carregar as entregas. Tente atualizar a página.',
        ),
    );
    const stopDrivers = onSnapshot(
      query(collection(db, 'deliveryDrivers'), limit(200)),
      (snapshot) => {
        setDrivers(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as DriverRow,
          ),
        );
      },
      () => setError('Não foi possível carregar os motoboys cadastrados.'),
    );
    return () => {
      stopDeliveries();
      stopDrivers();
    };
  }, [role]);

  useEffect(() => {
    if (role !== 'admin' || !hasFirebaseConfig) return;
    let cancelled = false;
    void (async () => {
      let totalSanitized = 0;
      try {
        for (let page = 0; page < 10; page += 1) {
          const result = await httpsCallable<undefined, { sanitized: number; hasMore: boolean }>(getFirebaseClient().functions, 'sanitizeLegacyDeliveryLinks')();
          totalSanitized += result.data.sanitized;
          if (!result.data.hasMore) break;
        }
        if (!cancelled && totalSanitized > 0) setNotice(`${totalSanitized} registro(s) antigo(s) de entrega protegidos.`);
      } catch {
        // O acesso à operação continua disponível se a rotina já tiver sido executada ou ainda não estiver publicada.
      }
    })();
    return () => { cancelled = true; };
  }, [role]);

  const visible = useMemo(
    () =>
      deliveries
        .filter((delivery) => activeStatuses.includes(delivery.status))
        .sort((a, b) => {
          const aTime = a.updatedAt?.toDate?.()?.getTime() ?? 0;
          const bTime = b.updatedAt?.toDate?.()?.getTime() ?? 0;
          return bTime - aTime;
        }),
    [deliveries],
  );
  const failed = useMemo(
    () =>
      deliveries
        .filter((delivery) => delivery.status === 'DELIVERY_FAILED')
        .sort((a, b) => {
          const aTime = a.updatedAt?.toDate?.()?.getTime() ?? 0;
          const bTime = b.updatedAt?.toDate?.()?.getTime() ?? 0;
          return bTime - aTime;
        }),
    [deliveries],
  );
  const counts = useMemo(
    () => ({
      ready: deliveries.filter((item) => item.status === 'READY_FOR_DELIVERY')
        .length,
      assigned: deliveries.filter((item) =>
        ['ASSIGNED', 'ACCEPTED'].includes(item.status),
      ).length,
      route: deliveries.filter((item) =>
        ['ON_THE_WAY', 'ARRIVED'].includes(item.status),
      ).length,
      delivered: deliveries.filter((item) => item.status === 'DELIVERED')
        .length,
    }),
    [deliveries],
  );
  const availableDrivers = drivers.filter(
    (driver) => driver.enabled !== false && driver.status === 'AVAILABLE',
  );

  async function assign(deliveryId: string) {
    const driverId = selectedDriver[deliveryId];
    if (!driverId) {
      setError('Escolha um motoboy disponível antes de atribuir.');
      return;
    }
    setBusyId(deliveryId);
    setError('');
    setNotice('');
    try {
      await httpsCallable(
        getFirebaseClient().functions,
        'assignDelivery',
      )({ deliveryId, driverId });
      setNotice('Entrega atribuída. O motoboy verá a nova corrida no painel.');
      setSelectedDriver((current) => ({ ...current, [deliveryId]: '' }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atribuir a entrega.',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function requeue(deliveryId: string) {
    setBusyId(deliveryId);
    setError('');
    setNotice('');
    try {
      await httpsCallable(
        getFirebaseClient().functions,
        'requeueDelivery',
      )({ deliveryId });
      setNotice(
        'Entrega devolvida para a fila. Escolha um motoboy para tentar novamente.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível devolver a entrega para a fila.',
      );
    } finally {
      setBusyId(null);
    }
  }
  async function reassign(deliveryId: string) {
    const driverId = selectedDriver[deliveryId];
    if (!driverId) { setError('Escolha o novo motoboy disponível.'); return; }
    setBusyId(deliveryId); setError(''); setNotice('');
    try {
      await httpsCallable(getFirebaseClient().functions, 'reassignDelivery')({ deliveryId, driverId });
      setNotice('Motoboy trocado. A entrega foi devolvida à etapa de aceite.');
      setSelectedDriver((current) => ({ ...current, [deliveryId]: '' }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível trocar o motoboy.'); }
    finally { setBusyId(null); }
  }
  async function showEvents(deliveryId: string) {
    setEventDeliveryId(deliveryId); setError('');
    try {
      const snapshot = await getDocs(query(collection(getFirebaseClient().db, 'deliveryEvents'), where('deliveryId', '==', deliveryId), limit(100)));
      setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as DeliveryEventRow).sort((a, b) => (b.createdAt?.toDate?.().getTime() ?? 0) - (a.createdAt?.toDate?.().getTime() ?? 0)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico da entrega.'); }
  }

  return (
    <AdminShell>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Operação</p>
          <h1 className="section-title">Central de entregas</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Acompanhe pedidos prontos, atribua motoboys e veja cada etapa sem
            expor o código de recebimento.
          </p>
        </div>
        <a
          href="/admin/entregadores"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-brand px-4 text-sm font-black text-white"
        >
          <UserRound className="size-4" /> Gerenciar motoboys
        </a>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Prontos" value={counts.ready} icon={<Clock3 />} />
        <Metric
          label="Atribuídos"
          value={counts.assigned}
          icon={<UserRound />}
        />
        <Metric label="Em rota" value={counts.route} icon={<MapPin />} />
        <Metric
          label="Entregues"
          value={counts.delivered}
          icon={<CheckCircle2 />}
        />
      </div>
      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`mt-4 rounded-2xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
        >
          {error || notice}
        </p>
      )}
      <section className="mt-6 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black text-brand-deep">
            Fila de entregas
          </h2>
          <Button
            variant="outline"
            className="min-h-10 rounded-full"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>
        {!visible.length && (
          <div className="surface rounded-3xl p-8 text-center text-sm text-text-muted">
            Nenhum pedido delivery aguardando operação.
          </div>
        )}
        {visible.map((delivery) => (
          <DeliveryCard
            key={delivery.id}
            delivery={delivery}
            drivers={availableDrivers}
            selectedDriver={selectedDriver[delivery.id] ?? ''}
            onDriverChange={(driverId) =>
              setSelectedDriver((current) => ({
                ...current,
                [delivery.id]: driverId,
              }))
            }
            onAssign={() => void assign(delivery.id)}
            onReassign={() => void reassign(delivery.id)}
            onShowEvents={() => void showEvents(delivery.id)}
            showEvents={eventDeliveryId === delivery.id ? events : null}
            busy={busyId === delivery.id}
          />
        ))}
      </section>
      {failed.length > 0 && (
        <section className="mt-8 space-y-3">
          <div>
            <h2 className="text-xl font-black text-brand-deep">
              Falhas para revisar
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Revise o motivo antes de devolver a entrega para a operação.
            </p>
          </div>
          {failed.map((delivery) => (
            <article
              key={delivery.id}
              className="surface rounded-3xl border border-red-200 p-5"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-lg font-black text-brand-deep">
                      {delivery.orderNumber ?? `Pedido ${delivery.orderId}`}
                    </strong>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone[delivery.status]}`}
                    >
                      {deliveryStatusLabels[delivery.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold">
                    {delivery.customerName ?? 'Cliente'}
                  </p>
                  <p className="mt-1 text-sm text-red-800">
                    {delivery.failureReason || 'Motivo não informado'}
                  </p>
                </div>
                <Button
                  disabled={busyId === delivery.id}
                  onClick={() => void requeue(delivery.id)}
                  className="min-h-11 rounded-full bg-brand text-white"
                >
                  {busyId === delivery.id
                    ? 'Recolocando…'
                    : 'Recolocar na fila'}
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </AdminShell>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="surface flex items-center justify-between rounded-3xl p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-wider text-text-muted">
          {label}
        </p>
        <strong className="mt-2 block text-3xl font-black text-brand-deep">
          {value}
        </strong>
      </div>
      <span className="grid size-11 place-items-center rounded-2xl bg-[#fff0f5] text-brand">
        {icon}
      </span>
    </div>
  );
}

function DeliveryCard({
  delivery,
  drivers,
  selectedDriver,
  onDriverChange,
  onAssign,
  onReassign,
  onShowEvents,
  showEvents,
  busy,
}: {
  delivery: DeliveryRow;
  drivers: DriverRow[];
  selectedDriver: string;
  onDriverChange: (id: string) => void;
  onAssign: () => void;
  onReassign: () => void;
  onShowEvents: () => void;
  showEvents: DeliveryEventRow[] | null;
  busy: boolean;
}) {
  const isReady = delivery.status === 'READY_FOR_DELIVERY';
  const canReassign = ['ASSIGNED', 'ACCEPTED'].includes(delivery.status);
  return (
    <article className="surface rounded-3xl p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-lg font-black text-brand-deep">
              {delivery.orderNumber ?? `Pedido ${delivery.orderId}`}
            </strong>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone[delivery.status]}`}
            >
              {deliveryStatusLabels[delivery.status]}
            </span>
          </div>
          <p className="mt-2 text-sm font-bold">
            {delivery.customerName ?? 'Cliente'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {delivery.address
              ? `${delivery.address.street}, ${delivery.address.number} · ${delivery.address.neighborhood}`
              : 'Endereço não informado'}
          </p>
        </div>
        <strong className="text-lg text-brand">
          {formatBRL(delivery.totalCents ?? 0)}
        </strong>
      </div>
      {isReady && (
        <div className="mt-5 flex flex-col gap-2 border-t border-border-soft pt-4 sm:flex-row">
          <select
            aria-label={`Motoboy para ${delivery.orderNumber ?? delivery.orderId}`}
            value={selectedDriver}
            onChange={(event) => onDriverChange(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-border-soft bg-surface-warm px-4 text-sm font-bold"
          >
            <option value="">Selecionar motoboy disponível</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name ?? driver.id}
                {driver.phone ? ` · ${driver.phone}` : ''}
              </option>
            ))}
          </select>
          <Button
            disabled={busy || !selectedDriver}
            onClick={onAssign}
            className="min-h-11 rounded-full bg-brand text-white"
          >
            {busy ? 'Atribuindo…' : 'Atribuir entrega'}
          </Button>
        </div>
      )}
      {!isReady && (
        <div className="mt-4 rounded-2xl bg-surface-warm p-3 text-sm text-text-muted">
          <p>{delivery.driverName ? `Responsável: ${delivery.driverName}` : 'Aguardando atualização do entregador.'}</p>
          {canReassign && <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select aria-label={`Novo motoboy para ${delivery.orderNumber ?? delivery.orderId}`} value={selectedDriver} onChange={(event) => onDriverChange(event.target.value)} className="min-h-10 min-w-0 flex-1 rounded-full border border-border-soft bg-white px-4 text-sm font-bold">
              <option value="">Trocar motoboy antes da retirada</option>
              {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name ?? driver.id}</option>)}
            </select>
            <Button disabled={busy || !selectedDriver} onClick={onReassign} variant="outline" className="min-h-10 rounded-full">{busy ? 'Trocando…' : 'Trocar motoboy'}</Button>
          </div>}
        </div>
      )}
      <div className="mt-4 border-t border-border-soft pt-3"><Button type="button" variant="outline" onClick={onShowEvents} className="min-h-9 rounded-full text-xs"><History className="size-4" /> Ver histórico</Button>
        {showEvents && <ol className="mt-3 space-y-2">{showEvents.map((event) => <li key={event.id} className="rounded-xl bg-surface-warm px-3 py-2 text-xs"><strong>{eventLabel(event.type)}</strong>{event.note ? ` · ${event.note}` : ''}<span className="ml-2 text-text-muted">{event.createdAt?.toDate?.().toLocaleString('pt-BR') ?? 'Agora'}</span></li>)}</ol>}
      </div>
    </article>
  );
}

function eventLabel(type?: string) {
  const labels: Record<string, string> = { CREATED: 'Pedido preparado', ASSIGNED: 'Atribuída', ACCEPTED: 'Aceita', DRIVER_REJECTED: 'Recusada pelo motoboy', PICKED_UP: 'Retirada confirmada', ON_THE_WAY: 'Saiu para entrega', ARRIVED: 'Chegou ao endereço', DELIVERY_FAILED: 'Falha reportada', READY_FOR_DELIVERY: 'Devolvida à fila', REASSIGNED: 'Motoboy trocado', DELIVERED: 'Entrega confirmada', CANCELLED: 'Cancelada' };
  return labels[type ?? ''] ?? type ?? 'Atualização';
}
