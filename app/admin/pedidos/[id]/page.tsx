'use client';

import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  Printer,
  Save,
  X,
  XCircle,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { IntegrationOrderPanel } from '@/components/integration-order-panel';
import { KitchenTicket } from '@/components/kitchen-ticket';
import type { IntegrationState } from '@/shared/integration';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import type { CustomerEditDecision, PublicOrderEditProposal } from '@/lib/direct-orders';
import { useCatalog } from '@/components/providers';
import {
  calculateCartPreview,
  formatBRL,
  ORDER_TRANSITIONS,
  type CartItemDraft,
  type CatalogSnapshot,
  type ModifierGroup,
  type OrderStatus,
  type PricedItem,
} from '@/shared/domain';
import { refundCompletedOrder } from '@/lib/cash-register';

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
  fulfillment: { mode: string; zoneId?: string; deliveryFeePending?: boolean };
  payment: { method: string; changeForCents?: number };
  pricing: {
    subtotalCents: number;
    deliveryFeeCents: number;
    totalCents: number;
  };
  pricingVerification?: { status?: string; source?: string };
  status: OrderStatus;
  publicCode?: string;
  estimatedMinutes?: number;
  notes?: string;
  customerEditApproval?: { status: 'PENDING' | CustomerEditDecision; requestedAt?: Timestamp; requestedBy?: string; decidedAt?: Timestamp; previous: { customer: FullOrder['customer']; notes: string; items: PricedItem[]; pricing: FullOrder['pricing']; fulfillment: { mode: string; deliveryFeePending?: boolean }; payment: FullOrder['payment'] } };
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
  const { catalog } = useCatalog();
  const [order, setOrder] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [itemDrafts, setItemDrafts] = useState<CartItemDraft[]>([]);
  const [itemsError, setItemsError] = useState('');
  const [estimateMinutes, setEstimateMinutes] = useState('15');
  const [editFulfillmentMode, setEditFulfillmentMode] = useState<'PICKUP' | 'DELIVERY'>('PICKUP');
  const [editPaymentMethod, setEditPaymentMethod] = useState<'PIX' | 'CARD' | 'CASH'>('PIX');
  const [editChangeFor, setEditChangeFor] = useState('');
  const [publicEditProposal, setPublicEditProposal] = useState<PublicOrderEditProposal | null>(null);
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const [editFields, setEditFields] = useState({ name: '', whatsapp: '', street: '', number: '', complement: '', neighborhood: '', reference: '', notes: '' });
  useEffect(() => {
    if (!hasFirebaseConfig) { setError('Firebase não configurado.'); return undefined; }
    try {
      return onSnapshot(
        doc(getFirebaseClient().db, 'orders', id),
        (snapshot) => setOrder(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as FullOrder) : null),
        (cause) => setError(cause.message),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o pedido.');
      return undefined;
    }
  }, [id]);
  useEffect(() => {
    if (!order) return;
    setEditFields({ name: order.customer.name, whatsapp: order.customer.whatsapp, street: order.customer.address?.street ?? '', number: order.customer.address?.number ?? '', complement: order.customer.address?.complement ?? '', neighborhood: order.customer.address?.neighborhood ?? '', reference: order.customer.address?.reference ?? '', notes: order.notes ?? '' });
    setEditFulfillmentMode(order.fulfillment.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP');
    setEditPaymentMethod(order.payment.method === 'CARD' || order.payment.method === 'CASH' ? order.payment.method : 'PIX');
    setEditChangeFor(order.payment.changeForCents ? String(order.payment.changeForCents / 100).replace('.', ',') : '');
  }, [order]);
  useEffect(() => { if (order?.estimatedMinutes) setEstimateMinutes(String(order.estimatedMinutes)); }, [order?.estimatedMinutes]);
  useEffect(() => {
    if (!hasFirebaseConfig || !order?.publicCode) { setPublicEditProposal(null); return undefined; }
    try {
      return onSnapshot(doc(getFirebaseClient().db, 'publicOrders', order.publicCode), (snapshot) => setPublicEditProposal((snapshot.data()?.editProposal as PublicOrderEditProposal | undefined) ?? null), () => setPublicEditProposal(null));
    } catch {
      setPublicEditProposal(null);
      return undefined;
    }
  }, [order?.publicCode]);
  async function update(status: OrderStatus, reason?: string): Promise<boolean> {
    if (!order) return false;
    const needsFinalize = status === 'CONFIRMED' && order.customerEditApproval?.status === 'PENDING';
    if (needsFinalize) {
      if (publicEditProposal?.status !== 'ACCEPTED') {
        setError('O cliente precisa aceitar as alterações antes de confirmar o pedido.');
        return false;
      }
    }
    if (status === 'CANCELLED' && !reason) {
      setCancelOpen(true);
      return false;
    }
    const completedCancellation = status === 'CANCELLED' && order.status === 'COMPLETED';
    if (!completedCancellation && !ORDER_TRANSITIONS[order.status].includes(status)) {
      setError(`Transição ${order.status} → ${status} não permitida.`);
      return false;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (completedCancellation) {
        await refundCompletedOrder({ orderId: order.id, reason: reason! });
        setNotice('Pedido estornado e cancelado. O financeiro e o Caixa foram atualizados juntos.');
      } else {
        if (needsFinalize) {
          // The customer's public response is finalized privately before the status transition.
          await httpsCallable(getFirebaseClient().functions, 'finalizeOrderEdit')({ orderId: order.id, decision: 'ACCEPTED' });
        }
        await httpsCallable(getFirebaseClient().functions, 'updateOrderStatus')({ orderId: order.id, status, ...(reason ? { reason } : {}) });
        setNotice(status === 'COMPLETED' ? 'Pedido concluído e registrado em Finanças e no Caixa.' : status === 'CANCELLED' ? 'Pedido cancelado.' : status === 'PREPARING' ? 'Pedido enviado para a cozinha.' : `Pedido marcado como ${labels[status].toLowerCase()}.`);
      }
      setCancelOpen(false);
      setCancelReason('');
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível atualizar.',
      );
      return false;
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
  async function dispatchToKitchen(printTicket: boolean) {
    const updated = await update('PREPARING');
    if (!updated) return;
    setKitchenOpen(false);
    if (printTicket) window.setTimeout(() => window.print(), 150);
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
      if (editFulfillmentMode === 'DELIVERY') {
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
      if (editFulfillmentMode === 'DELIVERY' && (!customer.address?.street || !customer.address.number || !customer.address.neighborhood)) throw new Error('Preencha o endereço para delivery.');
      const changeForCents = editPaymentMethod === 'CASH' && editChangeFor.trim() ? parseCurrencyToCents(editChangeFor) : null;
      await httpsCallable(getFirebaseClient().functions, 'updateOrderDetails')({ orderId: order.id, customer, notes: editFields.notes.trim(), fulfillment: { mode: editFulfillmentMode, ...(order.fulfillment.zoneId ? { zoneId: order.fulfillment.zoneId } : {}) }, payment: { method: editPaymentMethod, needsChange: editPaymentMethod === 'CASH' && changeForCents !== null, ...(changeForCents !== null ? { changeForCents } : {}) } });
      setEditOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível editar o pedido.');
    } finally {
      setBusy(false);
    }
  }
  function openItemsEditor() {
    if (!order) return;
    setItemsError('');
    setItemDrafts(order.items.map((item, index) => ({ cartItemId: `edit-${index}`, productId: item.productId, sizeId: item.sizeId, quantity: item.quantity, notes: item.notes, selections: item.modifierSelections.map((group) => ({ groupId: group.groupId, items: group.items.map((selected) => ({ modifierId: selected.modifierId, quantity: selected.quantity })) })) })));
    setItemsOpen(true);
  }
  function updateDraft(index: number, update: Partial<CartItemDraft>) {
    setItemDrafts((old) => old.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...update } : draft));
    setItemsError('');
  }
  function changeProduct(index: number, productId: string) {
    const product = catalog.products.find((candidate) => candidate.id === productId);
    updateDraft(index, { productId, sizeId: product?.sizes.find((size) => size.active)?.id ?? '', selections: [] });
  }
  function toggleModifier(index: number, groupId: string, modifierId: string, maximum: number) {
    const draft = itemDrafts[index];
    if (!draft) return;
    const groups = draft.selections.map((group) => ({ groupId: group.groupId, items: group.items.map((item) => ({ ...item })) }));
    const group = groups.find((candidate) => candidate.groupId === groupId) ?? { groupId, items: [] };
    if (!groups.includes(group)) groups.push(group);
    const selected = group.items.find((item) => item.modifierId === modifierId);
    if (!selected) group.items.push({ modifierId, quantity: 1 });
    else if (selected.quantity < maximum) selected.quantity += 1;
    else group.items = group.items.filter((item) => item.modifierId !== modifierId);
    updateDraft(index, { selections: groups });
  }
  async function saveItems(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    setBusy(true); setItemsError(''); setError('');
    try {
      calculateCartPreview(itemDrafts, catalog);
      await httpsCallable(getFirebaseClient().functions, 'updateOrderDetails')({ orderId: order.id, customer: order.customer, notes: order.notes ?? '', items: itemDrafts, fulfillment: { mode: order.fulfillment.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP', ...(order.fulfillment.zoneId ? { zoneId: order.fulfillment.zoneId } : {}) } });
      setItemsOpen(false);
    } catch (cause) {
      setItemsError(cause instanceof Error ? cause.message : 'Confira os itens e tente novamente.');
    } finally { setBusy(false); }
  }
  async function finalizeEdit(decision: CustomerEditDecision) {
    if (!order) return;
    setBusy(true); setError('');
    try { await httpsCallable(getFirebaseClient().functions, 'finalizeOrderEdit')({ orderId: order.id, decision }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a decisão.'); }
    finally { setBusy(false); }
  }
  async function saveEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order) return;
    const minutes = Number(estimateMinutes);
    if (!Number.isSafeInteger(minutes) || minutes < 5 || minutes > 240) { setError('Informe uma previsão entre 5 e 240 minutos.'); return; }
    setBusy(true); setError('');
    try {
      await httpsCallable(getFirebaseClient().functions, 'updateOrderEstimate')({ orderId: order.id, estimatedMinutes: minutes });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a previsão.'); }
    finally { setBusy(false); }
  }
  async function verifyPricing() {
    if (!order) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await httpsCallable<{ orderId: string }, { verified: boolean; alreadyVerified?: boolean; totalCents?: number }>(getFirebaseClient().functions, 'verifyOrderPricing')({ orderId: order.id });
      setNotice(result.data.alreadyVerified ? 'Os preços já estavam validados pelo servidor.' : 'Itens e total conferidos com o cardápio atual. O pedido pode continuar.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível validar os preços.');
    } finally { setBusy(false); }
  }
  const pricingVerified = Boolean(order && order.pricingVerification?.status === 'VERIFIED' && order.pricingVerification.source === 'SERVER');
  const canReviewItems = Boolean(order && ((['NEW', 'CONFIRMED'] as OrderStatus[]).includes(order.status) || (order.status === 'PREPARING' && !pricingVerified)));
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
          {notice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{notice}</p>}
          {!pricingVerified && <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-amber-950">Preço ainda não validado pelo servidor</p><p className="mt-1 text-sm text-amber-900">Este pedido antigo não pode avançar nem gerar venda no financeiro até conferirmos o total com o cardápio atual.</p></div>{!['COMPLETED', 'CANCELLED'].includes(order.status) && <Button disabled={busy} onClick={() => void verifyPricing()} className="shrink-0 rounded-xl bg-amber-700 font-black text-white hover:bg-amber-800"><CheckCircle2 /> Validar preços</Button>}</section>}
          <IntegrationOrderPanel orderId={order.id} state={order.integration} />
          {order.customerEditApproval?.status === 'PENDING' && <section className="mt-5 rounded-[26px] border-2 border-[#d7f04a] bg-[#fffde8] p-5 shadow-sm sm:p-6"><p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">Aprovação do cliente</p><h2 className="mt-1 text-xl font-black">Alteração enviada para confirmação</h2><p className="mt-2 text-sm leading-relaxed text-[#6f5360]">O pedido foi editado e não pode avançar para preparo até o cliente responder no link de acompanhamento.</p>{publicEditProposal?.status === 'ACCEPTED' && <><p className="mt-3 rounded-xl bg-[#d7f04a]/50 p-3 text-sm font-black text-[#351924]">O cliente concordou com as alterações.</p><Button disabled={busy} onClick={() => void finalizeEdit('ACCEPTED')} className="mt-3 rounded-full bg-[#82204f] text-white">Registrar aceite e liberar pedido</Button></>}{publicEditProposal?.status === 'REJECTED' && <><p className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-black text-red-800">O cliente recusou as alterações.</p><Button disabled={busy} onClick={() => void finalizeEdit('REJECTED')} className="mt-3 rounded-full bg-[#82204f] text-white">Reverter para a versão anterior</Button></>}{(!publicEditProposal || publicEditProposal.status === 'PENDING') && <p className="mt-3 text-sm font-bold text-[#826a75]">Aguardando a resposta do cliente no acompanhamento público.</p>}</section>}
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
                  {(['NEW', 'CONFIRMED'] as OrderStatus[]).includes(order.status) && <Button disabled={busy} onClick={() => setEditOpen(true)} className="h-11 justify-start rounded-xl bg-white/10 px-4 font-black text-white hover:bg-white/20"><Pencil /> Editar dados do cliente</Button>}
                  {canReviewItems && <Button disabled={busy} onClick={openItemsEditor} className="h-11 justify-start rounded-xl bg-white/10 px-4 font-black text-white hover:bg-white/20"><Pencil /> Editar itens e total</Button>}
                  {ORDER_TRANSITIONS[order.status]
                    .filter((status) => status !== 'CANCELLED')
                    .map((status) => (
                      status === 'PREPARING' ? (
                        <Button
                          key={status}
                          disabled={busy || !pricingVerified || order.customerEditApproval?.status === 'PENDING' || order.integration?.provider === 'saipos'}
                          onClick={() => setKitchenOpen(true)}
                          className="h-11 justify-start rounded-xl bg-[#d7f04a] px-4 font-black text-[#351924] hover:bg-[#c4dd36]"
                        >
                          <Printer /> Mandar para cozinha
                        </Button>
                      ) : (
                      <Button
                        key={status}
                        disabled={
                          busy || order.integration?.provider === 'saipos' || !pricingVerified || (status === 'CONFIRMED' && order.customerEditApproval?.status === 'PENDING' && publicEditProposal?.status !== 'ACCEPTED')
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
                      )
                    ))}
                  {order.customerEditApproval?.status === 'PENDING' && order.status === 'NEW' && <p className="rounded-xl bg-[#fffde8] p-3 text-xs font-bold leading-relaxed text-[#856b12]">{publicEditProposal?.status === 'ACCEPTED' ? 'O cliente aceitou. Marcar como confirmado vai aplicar o aceite e liberar o pedido.' : 'Confirmação bloqueada até o cliente responder à proposta de alteração.'}</p>}
                  {(ORDER_TRANSITIONS[order.status].includes('CANCELLED') || order.status === 'COMPLETED') && (
                    <Button
                      disabled={
                        busy || order.integration?.provider === 'saipos'
                      }
                      onClick={() => update('CANCELLED')}
                      className="h-11 justify-start rounded-xl bg-red-500/15 px-4 text-red-100 hover:bg-red-500/25"
                    >
                      <XCircle /> {order.status === 'COMPLETED' ? 'Estornar e cancelar pedido' : 'Cancelar pedido'}
                    </Button>
                  )}
                  {!ORDER_TRANSITIONS[order.status].length && (
                    <p className="text-sm text-white/55">Fluxo encerrado.</p>
                  )}
                  {(['PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED'] as OrderStatus[]).includes(order.status) && <Button disabled={busy} onClick={() => window.print()} className="h-11 justify-start rounded-xl bg-white/10 px-4 font-black text-white hover:bg-white/20"><Printer /> Reimprimir ficha de cozinha</Button>}
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
          <form onSubmit={saveDetails} className="my-3 w-full max-w-2xl rounded-[28px] bg-white p-4 shadow-2xl sm:my-6 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Editar pedido</h2><p className="mt-1 text-sm text-[#826a75]">Corrija cliente, recebimento, pagamento e endereço antes de iniciar o preparo.</p></div><button type="button" onClick={() => setEditOpen(false)} aria-label="Fechar edição" className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]"><X className="size-4" /></button></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><EditField label="Nome" value={editFields.name} onChange={(value) => setEditFields((old) => ({ ...old, name: value }))} required /><EditField label="WhatsApp" value={editFields.whatsapp} onChange={(value) => setEditFields((old) => ({ ...old, whatsapp: value }))} required /></div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Recebimento<select value={editFulfillmentMode} onChange={(event) => setEditFulfillmentMode(event.target.value as 'PICKUP' | 'DELIVERY')} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"><option value="PICKUP">Retirada na loja</option><option value="DELIVERY">Entrega</option></select></label><label className="block text-sm font-bold">Pagamento<select value={editPaymentMethod} onChange={(event) => setEditPaymentMethod(event.target.value as 'PIX' | 'CARD' | 'CASH')} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"><option value="PIX">Pix</option><option value="CARD">Cartão na entrega</option><option value="CASH">Dinheiro</option></select></label></div>
            {editPaymentMethod === 'CASH' && <div className="mt-4 max-w-xs"><EditField label="Troco para quanto? (opcional)" value={editChangeFor} onChange={setEditChangeFor} /></div>}
            {editFulfillmentMode === 'DELIVERY' && <><div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]"><EditField label="Rua/Avenida" value={editFields.street} onChange={(value) => setEditFields((old) => ({ ...old, street: value }))} required /><EditField label="Número" value={editFields.number} onChange={(value) => setEditFields((old) => ({ ...old, number: value }))} required /></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><EditField label="Complemento" value={editFields.complement} onChange={(value) => setEditFields((old) => ({ ...old, complement: value }))} /><EditField label="Bairro" value={editFields.neighborhood} onChange={(value) => setEditFields((old) => ({ ...old, neighborhood: value }))} required /></div><div className="mt-4"><EditField label="Referência" value={editFields.reference} onChange={(value) => setEditFields((old) => ({ ...old, reference: value }))} /></div></>}
            <label className="mt-4 block text-sm font-bold">Observação<textarea value={editFields.notes} onChange={(event) => setEditFields((old) => ({ ...old, notes: event.target.value }))} maxLength={500} rows={4} className="mt-2 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] p-3 font-normal" /></label>
            <div className="mt-5 flex gap-2"><Button type="button" variant="outline" onClick={() => setEditOpen(false)} className="h-11 flex-1 rounded-full">Cancelar</Button><Button type="submit" disabled={busy} className="h-11 flex-1 rounded-full bg-[#82204f] font-black text-white">{busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações</Button></div>
          </form>
        </div>
      )}
      {itemsOpen && order && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#2b1722]/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveItems} className="my-3 w-full max-w-3xl rounded-[28px] bg-white p-4 shadow-2xl sm:my-6 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-2xl font-black">Editar itens do pedido</h2><p className="mt-1 text-sm text-[#826a75]">Altere produto, tamanho, adicionais, quantidade e observações. O total será recalculado.</p></div><button type="button" onClick={() => setItemsOpen(false)} aria-label="Fechar edição dos itens" className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]"><X className="size-4" /></button></div>
            <div className="mt-5 space-y-4">
              {itemDrafts.map((draft, index) => <EditableOrderItem key={draft.cartItemId} draft={draft} index={index} catalog={catalog} onProductChange={changeProduct} onChange={(update) => updateDraft(index, update)} onToggleModifier={toggleModifier} onRemove={() => setItemDrafts((old) => old.filter((_, itemIndex) => itemIndex !== index))} />)}
              {!itemDrafts.length && <p className="rounded-2xl border border-dashed border-[#82204f]/20 p-5 text-center text-sm text-[#826a75]">Adicione pelo menos um item.</p>}
              <button type="button" onClick={() => { const product = catalog.products[0]; const size = product?.sizes.find((candidate) => candidate.active); if (product && size) setItemDrafts((old) => [...old, { cartItemId: `edit-${Date.now()}`, productId: product.id, sizeId: size.id, quantity: 1, selections: [] }]); }} className="inline-flex h-11 items-center rounded-full border border-[#82204f]/20 px-4 text-sm font-black text-[#82204f]">+ Adicionar item</button>
            </div>
            {itemsError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{itemsError}</p>}
            {itemDrafts.length > 0 && (() => { try { const preview = calculateCartPreview(itemDrafts, catalog); return <p className="mt-4 flex justify-between rounded-2xl bg-[#fff0f5] p-4 text-sm font-black"><span>Novo total</span><span className="text-[#82204f]">{formatBRL(preview.subtotalCents + order.pricing.deliveryFeeCents)}</span></p>; } catch { return null; } })()}
            <div className="mt-5 flex gap-2"><Button type="button" variant="outline" onClick={() => setItemsOpen(false)} className="h-11 flex-1 rounded-full">Cancelar</Button><Button type="submit" disabled={busy || !itemDrafts.length} className="h-11 flex-1 rounded-full bg-[#82204f] font-black text-white">{busy ? <Loader2 className="animate-spin" /> : <Save />} Salvar pedido completo</Button></div>
          </form>
        </div>
      )}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#2b1722]/50 p-3 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={confirmCancel}
            className="my-3 w-full max-w-md rounded-[28px] bg-white p-4 shadow-2xl sm:my-6 sm:p-6"
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
      {kitchenOpen && order && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#2b1722]/50 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="kitchen-title" className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#d7f04a] text-[#351924]"><Printer className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">Próxima etapa</p><h2 id="kitchen-title" className="mt-1 text-2xl font-black">Mandar para cozinha</h2><p className="mt-2 text-sm leading-relaxed text-[#826a75]">O pedido será marcado como <b>em preparo</b>. Você pode imprimir uma ficha com itens, adicionais e observações para a equipe.</p></div></div>
            <div className="mt-5 rounded-2xl bg-[#fffaf5] p-4 text-sm"><strong>{order.orderNumber}</strong><p className="mt-1 text-[#826a75]">{order.items.reduce((total, item) => total + item.quantity, 0)} item(ns) • {order.fulfillment.mode === 'DELIVERY' ? 'Entrega' : 'Retirada'}</p></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" disabled={busy} onClick={() => void dispatchToKitchen(false)} className="h-11 rounded-full">Mandar sem imprimir</Button><Button type="button" disabled={busy} onClick={() => void dispatchToKitchen(true)} className="h-11 rounded-full bg-[#82204f] font-black text-white">{busy ? <Loader2 className="animate-spin" /> : <Printer />} Mandar e imprimir</Button></div>
            <button type="button" disabled={busy} onClick={() => setKitchenOpen(false)} className="mt-4 w-full text-sm font-bold text-[#826a75] hover:text-[#82204f]">Cancelar</button>
          </section>
        </div>
      )}
      {order && <KitchenTicket orderNumber={order.orderNumber} customerName={order.customer.name} fulfillmentMode={order.fulfillment.mode} items={order.items} notes={order.notes} paymentMethod={order.payment.method} totalCents={order.pricing.totalCents} />}
    </AdminShell>
  );
}

function EditField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block text-sm font-bold">{label}<input value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={120} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal outline-none focus:border-[#82204f]" /></label>;
}

function EditableOrderItem({ draft, index, catalog, onProductChange, onChange, onToggleModifier, onRemove }: { draft: CartItemDraft; index: number; catalog: CatalogSnapshot; onProductChange: (index: number, productId: string) => void; onChange: (update: Partial<CartItemDraft>) => void; onToggleModifier: (index: number, groupId: string, modifierId: string, maximum: number) => void; onRemove: () => void }) {
  const product = catalog.products.find((candidate) => candidate.id === draft.productId);
  const size = product?.sizes.find((candidate) => candidate.id === draft.sizeId);
  const groups = (product?.modifierGroupIds ?? []).map((groupId) => catalog.groups.find((group) => group.id === groupId)).filter((group): group is ModifierGroup => Boolean(group && group.active));
  const selected = (groupId: string, modifierId: string) => draft.selections.find((group) => group.groupId === groupId)?.items.find((item) => item.modifierId === modifierId)?.quantity ?? 0;
  let itemTotal = '';
  try { itemTotal = formatBRL(calculateCartPreview([draft], catalog).items[0]?.totalPriceCents ?? 0); } catch { itemTotal = 'Confira os adicionais'; }
  return <article className="rounded-2xl border border-[#82204f]/12 bg-[#fffaf5] p-4">
    <div className="flex items-start justify-between gap-3"><strong className="text-sm">Item {index + 1}</strong><button type="button" onClick={onRemove} className="text-xs font-black text-red-600">Remover</button></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_90px]"><label className="text-xs font-bold">Produto<select value={draft.productId} onChange={(event) => onProductChange(index, event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-[#82204f]/15 bg-white px-2 text-sm font-normal">{catalog.products.filter((candidate) => candidate.active).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><label className="text-xs font-bold">Tamanho<select value={draft.sizeId} onChange={(event) => onChange({ sizeId: event.target.value, selections: [] })} className="mt-1 h-10 w-full rounded-xl border border-[#82204f]/15 bg-white px-2 text-sm font-normal">{(product?.sizes ?? []).filter((candidate) => candidate.active).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label><label className="text-xs font-bold">Quantidade<input type="number" min="1" max="20" value={draft.quantity} onChange={(event) => onChange({ quantity: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} className="mt-1 h-10 w-full rounded-xl border border-[#82204f]/15 bg-white px-2 text-sm font-normal" /></label></div>
    {groups.map((group) => <div key={group.id} className="mt-3 rounded-xl bg-white p-3"><p className="text-xs font-black text-[#351924]">{group.name} <span className="font-normal text-[#826a75]">(toque para aumentar; ao atingir o limite, remove)</span></p><div className="mt-2 flex flex-wrap gap-2">{group.modifierIds.map((modifierId) => { const modifier = catalog.modifiers.find((candidate) => candidate.id === modifierId && candidate.active); if (!modifier) return null; const quantity = selected(group.id, modifier.id); const maximum = Math.min(group.maxPerModifier ?? 20, modifier.maxQuantity ?? 20); return <button key={modifier.id} type="button" onClick={() => onToggleModifier(index, group.id, modifier.id, maximum)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${quantity ? 'border-[#82204f] bg-[#fff0f5] text-[#82204f]' : 'border-[#e7dce1] text-[#6f5360]'}`}>{quantity ? `${quantity}x ` : ''}{modifier.name}</button>; })}</div></div>)}
    <label className="mt-3 block text-xs font-bold">Observação do item<textarea value={draft.notes ?? ''} onChange={(event) => onChange({ notes: event.target.value.slice(0, 300) })} rows={2} maxLength={300} className="mt-1 w-full rounded-xl border border-[#82204f]/15 bg-white p-3 text-sm font-normal" /></label>
    <p className="mt-2 text-right text-sm font-black text-[#82204f]">{size?.label ?? 'Tamanho'} · {itemTotal}</p>
  </article>;
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.trim().replace(/[^\d,.]/g, '');
  if (!normalized) return null;
  const amount = Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
