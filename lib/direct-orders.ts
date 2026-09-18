import { collection, doc, getDoc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';

import { calculateCartPreview, getCustomerOrderStatusMessage, ORDER_TRANSITIONS, type CartItemDraft, type CatalogSnapshot, type FulfillmentMode, type OrderStatus, type PricedItem } from '@/shared/domain';

export interface DirectOrderDetailsUpdate {
  customer: { name: string; whatsapp: string; address?: Record<string, string> };
  notes: string;
  items?: CartItemDraft[];
  fulfillment?: { mode: 'PICKUP' | 'DELIVERY'; zoneId?: string };
  payment?: { method: 'PIX' | 'CARD' | 'CASH'; needsChange: boolean; changeForCents?: number | null };
}
export type CustomerEditDecision = 'ACCEPTED' | 'REJECTED';
export interface PublicOrderEditProposal {
  status: 'PENDING' | CustomerEditDecision; summary: string; requestedAt?: unknown; requestedBy?: string; respondedAt?: unknown;
  before: { items: PricedItem[]; pricing: { totalCents: number }; fulfillment: { mode: 'PICKUP' | 'DELIVERY' } };
}
export interface DirectCreateOrderInput {
  clientRequestId: string; customer: DirectOrderDetailsUpdate['customer']; items: CartItemDraft[];
  fulfillment: { mode: FulfillmentMode; zoneId?: string }; payment: NonNullable<DirectOrderDetailsUpdate['payment']>;
  notes?: string; deliveryFeeCents: number;
}
function publicCode(requestId: string) { const clean = requestId.replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase(); return `A${clean || Math.random().toString(36).slice(2, 10).toUpperCase()}`; }

/** Plano Spark: pedido e espelho público são gravados juntos; a equipe confere antes de confirmar. */
export async function createOrderDirect(db: Firestore, input: DirectCreateOrderInput, catalog: CatalogSnapshot) {
  const preview = calculateCartPreview(input.items, catalog); const code = publicCode(input.clientRequestId);
  const orderRef = doc(db, 'orders', input.clientRequestId); const publicRef = doc(db, 'publicOrders', code);
  const pricing = { subtotalCents: preview.subtotalCents, deliveryFeeCents: input.deliveryFeeCents, totalCents: preview.subtotalCents + input.deliveryFeeCents };
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(orderRef)).exists()) return;
    const orderNumber = `#${code}`; const statusMessage = getCustomerOrderStatusMessage('NEW');
    transaction.set(orderRef, { publicCode: code, orderNumber, customer: input.customer, items: preview.items, fulfillment: input.fulfillment, payment: input.payment, pricing, notes: input.notes ?? '', status: 'NEW', statusMessage, estimatedMinutes: 20, statusHistory: [{ status: 'NEW', at: new Date(), reason: 'Pedido recebido pelo site' }], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), clientRequestId: input.clientRequestId });
    transaction.set(publicRef, { publicCode: code, orderNumber, items: preview.items, fulfillment: input.fulfillment, pricing: { totalCents: pricing.totalCents }, status: 'NEW', statusMessage, estimatedMinutes: 20, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  return { publicCode: code, orderNumber: `#${code}`, totalCents: pricing.totalCents };
}

export async function updateOrderStatusDirect(db: Firestore, orderId: string, status: OrderStatus, reason?: string) {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(orderRef); if (!snap.exists()) throw new Error('Pedido não encontrado.');
    const current = snap.data() as { status: OrderStatus; publicCode?: string; statusHistory?: unknown[] };
    if (!ORDER_TRANSITIONS[current.status]?.includes(status)) throw new Error('Essa mudança de status não é permitida.');
    const statusMessage = getCustomerOrderStatusMessage(status, reason);
    transaction.update(orderRef, { status, statusMessage, updatedAt: serverTimestamp(), statusHistory: [...(current.statusHistory ?? []), { status, at: new Date(), ...(reason ? { reason } : {}) }] });
    if (status === 'COMPLETED') {
      const order = snap.data() as { orderNumber?: string; pricing?: { totalCents?: number }; payment?: { method?: string } };
      const financeRef = doc(collection(db, 'financeEntries'));
      transaction.set(financeRef, { kind: 'INCOME', category: 'Vendas de açaí', description: `Pedido ${order.orderNumber ?? orderId}`, amountCents: Number(order.pricing?.totalCents ?? 0), date: new Date().toISOString().slice(0, 10), status: 'PAID', paymentMethod: order.payment?.method ?? 'OTHER', orderNumber: order.orderNumber ?? null, sourceOrderId: orderId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
    if (current.publicCode) transaction.update(doc(db, 'publicOrders', current.publicCode), { status, statusMessage, updatedAt: serverTimestamp() });
  });
}

export async function updateOrderDetailsDirect(db: Firestore, orderId: string, input: DirectOrderDetailsUpdate, catalog?: CatalogSnapshot) {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(orderRef); if (!snap.exists()) throw new Error('Pedido não encontrado.');
    const current = snap.data() as { publicCode?: string; items: PricedItem[]; pricing: { totalCents: number }; fulfillment: { mode: 'PICKUP' | 'DELIVERY' } };
    const nextItems = input.items && catalog ? calculateCartPreview(input.items, catalog) : null;
    const nextPricing = nextItems ? { ...current.pricing, subtotalCents: nextItems.subtotalCents, totalCents: nextItems.subtotalCents + Number((current.pricing as { deliveryFeeCents?: number }).deliveryFeeCents ?? 0) } : current.pricing;
    const proposal: PublicOrderEditProposal = { status: 'PENDING', summary: 'A loja fez uma alteração. Confira e aceite para que ela possa confirmar o pedido.', requestedAt: new Date(), before: { items: current.items, pricing: { totalCents: current.pricing.totalCents }, fulfillment: current.fulfillment } };
    transaction.update(orderRef, { customer: input.customer, notes: input.notes, ...(nextItems ? { items: nextItems.items, pricing: nextPricing } : {}), ...(input.fulfillment ? { fulfillment: input.fulfillment } : {}), ...(input.payment ? { payment: input.payment } : {}), customerEditApproval: { status: 'PENDING' }, updatedAt: serverTimestamp() });
    if (current.publicCode) transaction.update(doc(db, 'publicOrders', current.publicCode), { ...(nextItems ? { items: nextItems.items, pricing: { totalCents: nextPricing.totalCents } } : {}), ...(input.fulfillment ? { fulfillment: input.fulfillment } : {}), editProposal: proposal, updatedAt: serverTimestamp() });
  });
}

export async function respondToOrderEditDirect(db: Firestore, publicCodeValue: string, decision: CustomerEditDecision) {
  const publicRef = doc(db, 'publicOrders', publicCodeValue);
  await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(publicRef); if (!snapshot.exists()) throw new Error('Pedido não encontrado.'); const proposal = snapshot.data().editProposal as PublicOrderEditProposal | undefined; if (!proposal || proposal.status !== 'PENDING') throw new Error('Esta alteração já foi respondida.'); transaction.update(publicRef, { editProposal: { ...proposal, status: decision, respondedAt: serverTimestamp() }, updatedAt: serverTimestamp() }); });
}
export async function finalizeOrderEditDirect(db: Firestore, orderId: string, decision: CustomerEditDecision) {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => { const snap = await transaction.get(orderRef); if (!snap.exists()) throw new Error('Pedido não encontrado.'); const current = snap.data() as { publicCode?: string; status?: OrderStatus; customerEditApproval?: Record<string, unknown> }; const confirmed = decision === 'ACCEPTED' && current.status === 'NEW'; const statusMessage = confirmed ? getCustomerOrderStatusMessage('CONFIRMED') : undefined; transaction.update(orderRef, { customerEditApproval: { ...(current.customerEditApproval ?? {}), status: decision, decidedAt: serverTimestamp() }, ...(confirmed ? { status: 'CONFIRMED', statusMessage, statusHistory: [{ status: 'CONFIRMED', at: new Date(), reason: 'Alteração aceita pelo cliente' }] } : {}), updatedAt: serverTimestamp() }); if (current.publicCode) transaction.update(doc(db, 'publicOrders', current.publicCode), { ...(confirmed ? { status: 'CONFIRMED', statusMessage } : {}), updatedAt: serverTimestamp() }); });
}
export async function updateOrderEstimateDirect(db: Firestore, orderId: string, estimatedMinutes: number) {
  const orderRef = doc(db, 'orders', orderId); const snap = await getDoc(orderRef); if (!snap.exists()) throw new Error('Pedido não encontrado.'); const code = snap.data().publicCode as string | undefined;
  await runTransaction(db, async (transaction) => { transaction.update(orderRef, { estimatedMinutes, updatedAt: serverTimestamp() }); if (code) transaction.update(doc(db, 'publicOrders', code), { estimatedMinutes, updatedAt: serverTimestamp() }); });
}
