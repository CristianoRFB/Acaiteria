'use client';

import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  Save,
  X,
  XCircle,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { IntegrationOrderPanel } from '@/components/integration-order-panel';
import type { IntegrationState } from '@/shared/integration';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';
import { isFunctionsUnavailable, updateOrderStatusDirect } from '@/lib/direct-orders';
import {
  formatBRL,
  ORDER_TRANSITIONS,
  type OrderStatus,
  type PricedItem,
} from '@/shared/domain';

interface FullOrder {
  integration?: IntegrationState;
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    whatsapp: string;
    address?: Record<string, string>;
  };
  items: PricedItem[];
  fulfillment: { mode: string; deliveryFeePending?: boolean };
  payment: { method: string; changeForCents?: number };
  pricing: {
    subtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
  };
  status: OrderStatus;
  publicCode?: string;
  estimatedMinutes?: number;
  notes?: string;
  statusHistory: Array<{ status: OrderStatus; at: Timestamp; reason?: string }>;
}
const labels: Record<OrderStatus, string> = {
  NEW: 'Novo',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};
export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [estimateMinutes, setEstimateMinutes] = useState('15');
  const [editFields, setEditFields] = useState({ name: '', whatsapp: '', street: '', number: '', complement: '', neighborhood: '', reference: '', notes: '' });
  useEffect(
    () =>
      onSnapshot(
        doc(getFirebaseClient().db, 'orders', id),
        (snapshot) =>
          setOrder(
            snapshot.exists()
              ? ({ id: snapshot.id, ...snapshot.data() } as FullOrder)
              : null,
          ),
        (cause) => setError(cause.message),
      ),
    [id],
  );
  useEffect(() => {
    if (!order) return;
    setEditFields({ name: order.customer.name, whatsapp: order.customer.whatsapp, street: order.customer.address?.street ?? '', number: order.customer.address?.number ?? '', complement: order.customer.address?.complement ?? '', neighborhood: order.customer.address?.neighborhood ?? '', reference: order.customer.address?.reference ?? '', notes: order.notes ?? '' });
  }, [order]);
  useEffect(() => { if (order?.estimatedMinutes) setEstimateMinutes(String(order.estimatedMinutes)); }, [order?.estimatedMinutes]);
  async function update(status: OrderStatus, reason?: string) {
    if (!order) return;
    if (status === 'CANCELLED' && !reason) {
      setCancelOpen(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const callable = httpsCallable(
        getFirebaseClient().functions,
        'updateOrderStatus',
      );
      try {
        await callable({ orderId: order.id, status, reason });
      } catch (cause) {
        if (!isFunctionsUnavailable(cause)) throw cause;
        await updateOrderStatusDirect(getFirebaseClient().db, order.id, status, reason);
      }
      setCancelOpen(false);
      setCancelReason('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível atualizar.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirmCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (!reason) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    await update('CANCELLED', reason);
  }
  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    setBusy(true);
    setError('');
    try {
      const customer: FullOrder['customer'] = {
        name: editFields.name.trim(),
        whatsapp: editFields.whatsapp.trim(),
      };
      if (order.fulfillment.mode === 'DELIVERY') {
        customer.address = {
          street: editFields.street.trim(),
          number: editFields.number.trim(),
          neighborhood: editFields.neighborhood.trim(),
          ...(editFields.complement.trim()
            ? { complement: editFields.complement.trim() }
            : {}),
          ...(editFields.reference.trim()
            ? { reference: editFields.reference.trim() }
            : {}),
        };
      }
      await updateDoc(doc(getFirebaseClient().db, 'orders', order.id), {
        customer,
        notes: editFields.notes.trim(),
        updatedAt: serverTimestamp(),
        lastEditedAt: serverTimestamp(),
        lastEditedBy: getFirebaseClient().auth.currentUser?.uid ?? '',
      });
      setEditOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível editar o pedido.');
    } finally {
      setBusy(false);
    }
  }
  async function saveEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    const minutes = Number(estimateMinutes);
    if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 240) { setError('Informe uma previsão entre 5 e 240 minutos.'); return; }
    setBusy(true); setError('');
    try {
      const db = getFirebaseClient().db;
      await updateDoc(doc(db, 'orders', order.id), { estimatedMinutes: minutes, estimatedUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      if (order.publicCode) await setDoc(doc(db, 'publicOrders', order.publicCode), { estimatedMinutes: minutes, estimatedUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a previsão.'); }
    finally { setBusy(false); }
  }
  return (
    <AdminShell>
      {!order ? (
        <div className="py-20 text-center">{error || 'Carregando pedido…'}</div>
      ) : (
        <>
          <a
            href="/admin/pedidos"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#82204f]"
          >
            <ArrowLeft className="size-4" /> Voltar
          </a>
          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#a62c63]">
                Pedido
              </p>
              <h1 className="mt-1 text-4xl font-black tracking-[-.05em]">
                {order.orderNumber}
              </h1>
              <p className="mt-2 text-sm text-[#826a75]">
                {order.customer.name} • {order.customer.whatsapp}
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#351924] px-4 py-2 text-sm font-black text-white">
              {labels[order.status]}
            </span>
          </div>
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <IntegrationOrderPanel orderId={order.id} state={order.integration} />
          <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_360px]">
            <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-black">Itens</h2>
              <div className="mt-5 divide-y divide-[#82204f]/8">
                {order.items.map((item, index) => (
                  <div key={index} className="py-5 first:pt-0">
                    <div className="flex justify-between gap-3">
                      <strong>
                        {item.quantity}x {item.productName}
                      </strong>
                      <strong>{formatBRL(item.totalPriceCents)}</strong>
                    </div>
                    <p className="mt-1 text-sm text-[#82204f]">
                      {item.sizeLabel}
                    </p>
                    {item.modifierSelections
                      .filter((group) => group.items.length)
                      .map((group) => (
                        <p
                          key={group.groupId}
                          className="mt-1 text-xs text-[#826a75]"
                        >
                          <b>{group.groupName}:</b>{' '}
                          {group.items
                            .map((item) => `${item.quantity}x ${item.name}`)
                            .join(', ')}
                        </p>
                      ))}
                    {item.notes && (
                      <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                        {item.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {order.notes && (
                <div className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <strong>Observação:</strong> {order.notes}
                </div>
              )}
            </section>
            <aside className="space-y-5">
              <section className="rounded-[26px] bg-[#351924] p-5 text-white">
                <h2 className="text-lg font-black">Atualizar status</h2>
                <div className="mt-4 grid gap-2">
                  {(['NEW', 'CONFIRMED'] as OrderStatus[]).includes(order.status) && <Button disabled={busy} onClick={() => setEditOpen(true)} className="h-11 justify-start rounded-xl bg-white/10 px-4 font-black text-white hover:bg-white/20"><Pencil /> Editar dados do pedido</Button>}
                  {ORDER_TRANSITIONS[order.status]
                    .filter((status) => status !== 'CANCELLED')
                    .map((status) => (
                      <Button
                        key={status}
                        disabled={
                          busy || order.integration?.provider === 'saipos'
                        }
                        onClick={() => update(status)}
                        className="h-11 justify-start rounded-xl bg-[#d7f04a] px-4 font-black text-[#351924] hover:bg-[#c4dd36]"
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <CheckCircle2 />
                        )}{' '}
                        Marcar: {labels[status]}
                      </Button>
                    ))}
                  {ORDER_TRANSITIONS[order.status].includes('CANCELLED') && (
                    <Button
                      disabled={
                        busy || order.integration?.provider === 'saipos'
                      }
                      onClick={() => update('CANCELLED')}
                      className="h-11 justify-start rounded-xl bg-red-500/15 px-4 text-red-100 hover:bg-red-500/25"
                    >
                      <XCircle /> Cancelar pedido
                    </Button>
                  )}
                  {!ORDER_TRANSITIONS[order.status].length && (
                    <p className="text-sm text-white/55">Fluxo encerrado.</p>
                  )}
                </div>
              </section>
              <section className="rounded-[26px] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Previsão para o cliente</h2>
                <p className="mt-1 text-xs leading-relaxed text-[#826a75]">Ajuste o tempo estimado sem usar contagem regressiva falsa.</p>
                <form onSubmit={saveEstimate} className="mt-4 flex gap-2">
                  <label className="flex-1 text-xs font-bold">Minutos<input type="number" min="5" max="240" value={estimateMinutes} onChange={(event) => setEstimateMinutes(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 text-sm font-normal" /></label>
                  <Button type="submit" disabled={busy} className="mt-5 h-11 rounded-xl bg-[#82204f] px-4 font-black text-white">Salvar</Button>
                </form>
              </section>
              <section className="rounded-[26px] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-black">Entrega e pagamento</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-[#826a75]">Recebimento</dt>
                    <dd className="font-bold">
                      {order.fulfillment.mode === 'PICKUP'
                        ? 'Retirada'
                        : 'Delivery'}
                    </dd>
                  </div>
                  {order.customer.address && (
                    <div>
                      <dt className="text-xs text-[#826a75]">Endereço</dt>
                      <dd className="font-bold">
                        {order.customer.address.street},{' '}
                        {order.customer.address.number}
                        <br />
                        {order.customer.address.neighborhood}
                        {order.customer.address.reference
                          ? ` • ${order.customer.address.reference}`
                          : ''}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-[#826a75]">
                      Pagamento informado
                    </dt>
                    <dd className="font-bold">
                      {order.payment.method}
                      {order.payment.changeForCents
                        ? ` • troco para ${formatBRL(order.payment.changeForCents)}`
                        : ''}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5 border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span>Total</span>
                    <strong className="text-xl text-[#82204f]">
                      {formatBRL(order.pricing.totalCents)}
                    </strong>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
      {editOpen && order && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#2b1722]/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveDetails} className="my-6 w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Editar dados do pedido</h2><p className="mt-1 text-sm text-[#826a75]">Corrija os dados antes de iniciar o preparo.</p></div><button type="button" onClick={() => setEditOpen(false)} aria-label="Fechar edição" className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]"><X className="size-4" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><EditField label="Nome" value={editFields.name} onChange={(value) => setEditFields((old) => ({ ...old, name: value }))} required /><EditField label="WhatsApp" value={editFields.whatsapp} onChange={(value) => setEditFields((old) => ({ ...old, whatsapp: value }))} required /></div>
            {order.fulfillment.mode === 'DELIVERY' && <><div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]"><EditField label="Rua/Avenida" value={editFields.street} onChange={(value) => setEditFields((old) => ({ ...old, street: value }))} required /><EditField label="Número" value={editFields.number} onChange={(value) => setEditFields((old) => ({ ...old, number: value }))} required /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><EditField label="Complemento" value={editFields.complement} onChange={(value) => setEditFields((old) => ({ ...old, complement: value }))} /><EditField label="Bairro" value={editFields.neighborhood} onChange={(value) => setEditFields((old) => ({ ...old, neighborhood: value }))} required /></div><div className="mt-4"><EditField label="Referência" value={editFields.reference} onChange={(value) => setEditFields((old) => ({ ...old, reference: value }))} /></div></>}
            <label className="mt-4 block text-sm font-bold">Observação<textarea value={editFields.notes} onChange={(event) => setEditFields((old) => ({ ...old, notes: event.target.value }))} maxLength={500} rows={4} className="mt-2 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] p-3 font-normal" /></label>
            <div className="mt-5 flex gap-2"><Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="h-11 flex-1 rounded-full">Cancelar</Button><Button type="submit" disabled={busy} className="h-11 flex-1 rounded-full bg-[#82204f] font-black text-white">{busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações</Button></div>
          </form>
        </div>
      )}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1722]/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={confirmCancel}
            className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Cancelar pedido</h2>
                <p className="mt-1 text-sm text-[#826a75]">
                  Informe um motivo para registrar no histórico.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold">
              Motivo
              <input
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Ex.: cliente desistiu"
                className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelOpen(false)}
                className="h-11 flex-1 rounded-full"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="h-11 flex-1 rounded-full bg-red-600 font-black text-white"
              >
                <Save /> Confirmar cancelamento
              </Button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}

function EditField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block text-sm font-bold">{label}<input value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={120} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal outline-none focus:border-[#82204f]" /></label>;
}
