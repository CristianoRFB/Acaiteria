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
}

export async function createDirectOrder(db: Firestore, input: DirectOrderPayload) {
  const orderRef = doc(db, 'orders', input.publicCode);
  const publicRef = doc(db, 'publicOrders', input.publicCode);
  const createdAt = Timestamp.now();
  const integration = { provider: 'disabled', status: 'DISABLED', attemptCount: 0 } as const;
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(orderRef);
    if (existing.exists()) return;
    const order = {
      orderNumber: input.orderNumber,
      publicCode: input.publicCode,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      customer: input.customer,
      items: input.items,
      fulfillment: input.fulfillment,
      payment: input.payment,
      pricing: { subtotalCents: input.subtotalCents, deliveryFeeCents: input.deliveryFeeCents, totalCents: input.totalCents, currency: 'BRL' },
      status: 'NEW' as const,
      source: 'WEB' as const,
      integration,
      notes: input.notes ?? '',
      statusHistory: [{ status: 'NEW' as const, at: createdAt, actor: 'customer' }],
      clientRequestId: input.clientRequestId,
    };
    transaction.set(orderRef, order);
    transaction.set(publicRef, { orderNumber: input.orderNumber, publicCode: input.publicCode, createdAt, updatedAt: createdAt, items: input.items, fulfillment: { mode: input.fulfillment.mode }, pricing: { totalCents: input.totalCents }, status: 'NEW', statusMessage: getCustomerOrderStatusMessage('NEW'), integrationMessage: 'Pedido recebido pela loja. Não envie outro pedido.' });
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
    transaction.set(doc(db, 'publicOrders', publicCode), { status, statusMessage: getCustomerOrderStatusMessage(status, reason), updatedAt: serverTimestamp() }, { merge: true });
  });
}

export function isFunctionsUnavailable(cause: unknown): boolean {
  const code = typeof cause === 'object' && cause && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
  return /functions\/(not-found|unavailable|deadline-exceeded)/i.test(code);
}
