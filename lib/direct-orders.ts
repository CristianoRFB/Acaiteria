import { arrayUnion, doc, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';

import { getCustomerOrderStatusMessage, ORDER_TRANSITIONS, type OrderStatus, type PricedItem } from '@/shared/domain';

interface DirectOrderPayload {
  clientRequestId: string;
  publicCode: string;
  orderNumber: string;
  customer: { name: string; whatsapp: string; address?: Record<string, string> };
  items: PricedItem[];
  fulfillment: { mode: 'PICKUP' | 'DELIVERY'; zoneId?: string };
  payment: { method: 'PIX' | 'CARD' | 'CASH'; needsChange: boolean; changeForCents?: number | null };
  notes?: string;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  estimatedMinutes?: number;
}

export interface DirectOrderDetailsUpdate {
  customer: { name: string; whatsapp: string; address?: Record<string, string> };
  notes: string;
  items?: PricedItem[];
  pricing?: { subtotalCents: number; deliveryFeeCents: number; totalCents: number; currency?: string };
}

export async function createDirectOrder(db: Firestore, input: DirectOrderPayload) {
  const orderRef = doc(db, 'orders', input.publicCode);
  const publicRef = doc(db, 'publicOrders', input.publicCode);
  const createdAt = Timestamp.now();
  const integration = { provider: 'disabled', status: 'DISABLED', attemptCount: 0 } as const;
  const estimatedMinutes = Number.isSafeInteger(input.estimatedMinutes) ? Math.min(240, Math.max(5, input.estimatedMinutes as number)) : 15;
  const items = input.items.map((item) => ({ ...item, ...(item.notes ? { notes: item.notes } : {}) }));
  await runTransaction(db, async (transaction) => {
    // A leitura preventiva usa o espelho público: o cliente ainda não tem
    // permissão para ler um documento privado de pedido que não existe.
    // O código público é aleatório e também é a chave de idempotência do fluxo.
    const existing = await transaction.get(publicRef);
    if (existing.exists()) return;
    const order = {
      orderNumber: input.orderNumber,
      publicCode: input.publicCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      customer: input.customer,
      items,
      fulfillment: input.fulfillment,
      payment: input.payment,
      pricing: { subtotalCents: input.subtotalCents, deliveryFeeCents: input.deliveryFeeCents, totalCents: input.totalCents, currency: 'BRL' },
      status: 'NEW' as const,
      source: 'WEB' as const,
      integration,
      notes: input.notes ?? '',
      statusHistory: [{ status: 'NEW' as const, at: createdAt, actor: 'customer' }],
      clientRequestId: input.clientRequestId,
      estimatedMinutes,
    };
    transaction.set(orderRef, order);
    transaction.set(publicRef, { orderNumber: input.orderNumber, publicCode: input.publicCode, createdAt, updatedAt: createdAt, items, fulfillment: { mode: input.fulfillment.mode }, pricing: { totalCents: input.totalCents }, status: 'NEW', statusMessage: getCustomerOrderStatusMessage('NEW'), estimatedMinutes, integrationMessage: 'Pedido recebido pela loja. Não envie outro pedido.' });
  });
}

export async function updateOrderStatusDirect(db: Firestore, orderId: string, status: OrderStatus, reason?: string) {
  const orderRef = doc(db, 'orders', orderId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Pedido não encontrado.');
    const current = snapshot.data().status as OrderStatus;
    if (!ORDER_TRANSITIONS[current]?.includes(status)) throw new Error(`Transição ${current} → ${status} não permitida.`);
    const publicCode = String(snapshot.data().publicCode || orderId);
    transaction.update(orderRef, { status, updatedAt: serverTimestamp(), statusHistory: arrayUnion({ status, at: Timestamp.now(), actor: 'admin', ...(reason ? { reason } : {}) }), ...(status === 'CANCELLED' ? { cancelledAt: serverTimestamp(), cancellationReason: reason || '' } : {}) });
    transaction.set(doc(db, 'publicOrders', publicCode), { status, statusMessage: getCustomerOrderStatusMessage(status, reason), estimatedMinutes: snapshot.data().estimatedMinutes ?? 15, updatedAt: serverTimestamp() }, { merge: true });
  });
}

export async function updateOrderDetailsDirect(db: Firestore, orderId: string, input: DirectOrderDetailsUpdate, actorUid: string) {
  await runTransaction(db, async (transaction) => {
    const orderRef = doc(db, 'orders', orderId);
    const snapshot = await transaction.get(orderRef);
    if (!snapshot.exists()) throw new Error('Pedido não encontrado.');
    if (!['NEW', 'CONFIRMED'].includes(String(snapshot.data().status))) throw new Error('Este pedido não pode mais ser editado porque já entrou em preparo.');
    const publicCode = String(snapshot.data().publicCode || orderId);
    const update = { customer: input.customer, notes: input.notes.slice(0, 500), updatedAt: serverTimestamp(), lastEditedAt: serverTimestamp(), lastEditedBy: actorUid, ...(input.items ? { items: input.items } : {}), ...(input.pricing ? { pricing: { ...input.pricing, currency: 'BRL' } } : {}) };
    transaction.update(orderRef, update);
    transaction.set(doc(db, 'publicOrders', publicCode), { ...(input.items ? { items: input.items } : {}), ...(input.pricing ? { pricing: { totalCents: input.pricing.totalCents } } : {}), updatedAt: serverTimestamp() }, { merge: true });
  });
}

export function isFunctionsUnavailable(cause: unknown): boolean {
  const code = typeof cause === 'object' && cause && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
  if (/functions\/(not-found|unavailable|deadline-exceeded|internal|unknown)/i.test(code)) return true;
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return /failed to fetch|network|load failed|service unavailable|status code 5\d\d/i.test(message);
}
