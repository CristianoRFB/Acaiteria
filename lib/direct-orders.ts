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
  fulfillment?: { mode: 'PICKUP' | 'DELIVERY'; zoneId?: string };
  payment?: { method: 'PIX' | 'CARD' | 'CASH'; needsChange: boolean; changeForCents?: number | null };
}

export type CustomerEditDecision = 'ACCEPTED' | 'REJECTED';

export interface PublicOrderEditProposal {
  status: 'PENDING' | CustomerEditDecision;
  summary: string;
  requestedAt?: unknown;
  requestedBy?: string;
  respondedAt?: unknown;
  before: {
    items: PricedItem[];
    pricing: { totalCents: number };
    fulfillment: { mode: 'PICKUP' | 'DELIVERY' };
  };
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
    if (snapshot.data().customerEditApproval?.status === 'PENDING') throw new Error('Aguardando a aprovação do cliente para continuar este pedido.');
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
    const current = snapshot.data();
    const before = {
      customer: current.customer,
      notes: current.notes ?? '',
      items: current.items ?? [],
      pricing: current.pricing,
      fulfillment: current.fulfillment,
      payment: current.payment,
    };
    const proposedItems = input.items ?? before.items;
    const proposedPricing = input.pricing ? { ...input.pricing, currency: 'BRL' } : before.pricing;
    const proposedFulfillment = input.fulfillment ?? before.fulfillment;
    const changes = [
      input.items || input.pricing ? 'itens e total' : '',
      input.customer ? 'dados do cliente' : '',
      input.fulfillment ? 'forma de recebimento' : '',
      input.payment ? 'pagamento' : '',
      input.notes !== before.notes ? 'observações' : '',
    ].filter(Boolean);
    const proposal: PublicOrderEditProposal = {
      status: 'PENDING',
      summary: `A loja ajustou ${changes.length ? changes.join(', ') : 'os dados do pedido'}. Confira e escolha se concorda.`,
      requestedAt: Timestamp.now(),
      requestedBy: actorUid,
      before: { items: before.items, pricing: { totalCents: before.pricing.totalCents }, fulfillment: { mode: before.fulfillment.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP' } },
    } as PublicOrderEditProposal;
    const update = { customer: input.customer, notes: input.notes.slice(0, 500), updatedAt: serverTimestamp(), lastEditedAt: serverTimestamp(), lastEditedBy: actorUid, customerEditApproval: { status: 'PENDING' as const, requestedAt: Timestamp.now(), requestedBy: actorUid, previous: before }, ...(input.items ? { items: input.items } : {}), ...(input.pricing ? { pricing: proposedPricing } : {}), ...(input.fulfillment ? { fulfillment: input.fulfillment } : {}), ...(input.payment ? { payment: input.payment } : {}) };
    transaction.update(orderRef, update);
    transaction.set(doc(db, 'publicOrders', publicCode), { items: proposedItems, pricing: { totalCents: proposedPricing.totalCents }, fulfillment: { mode: proposedFulfillment.mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP' }, editProposal: proposal, updatedAt: serverTimestamp() }, { merge: true });
  });
}

/** Resposta anônima do cliente. Só altera a proposta no espelho público; a aplicação final/reversão é feita pelo painel autenticado. */
export async function respondToOrderEditDirect(db: Firestore, publicCode: string, decision: CustomerEditDecision) {
  const publicRef = doc(db, 'publicOrders', publicCode);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(publicRef);
    if (!snapshot.exists()) throw new Error('Pedido não encontrado.');
    const proposal = snapshot.data().editProposal as PublicOrderEditProposal | undefined;
    if (!proposal || proposal.status !== 'PENDING') throw new Error('Esta alteração já foi respondida.');
    transaction.update(publicRef, { editProposal: { ...proposal, status: decision, respondedAt: serverTimestamp() }, updatedAt: serverTimestamp() });
  });
}

/** Registra a decisão no pedido privado e, em caso de recusa, restaura a versão anterior. */
export async function finalizeOrderEditDirect(db: Firestore, orderId: string, decision: CustomerEditDecision) {
  await runTransaction(db, async (transaction) => {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnapshot = await transaction.get(orderRef);
    if (!orderSnapshot.exists()) throw new Error('Pedido não encontrado.');
    const current = orderSnapshot.data();
    const approval = current.customerEditApproval;
    if (!approval || approval.status !== 'PENDING') throw new Error('Não há alteração aguardando decisão.');
    const publicCode = String(current.publicCode || orderId);
    const publicRef = doc(db, 'publicOrders', publicCode);
    const publicSnapshot = await transaction.get(publicRef);
    const proposal = publicSnapshot.exists() ? publicSnapshot.data().editProposal as PublicOrderEditProposal | undefined : undefined;
    const common = { customerEditApproval: { ...approval, status: decision, decidedAt: serverTimestamp() }, updatedAt: serverTimestamp() };
    if (decision === 'REJECTED') {
      transaction.update(orderRef, { ...common, customer: approval.previous.customer, notes: approval.previous.notes, items: approval.previous.items, pricing: approval.previous.pricing, fulfillment: approval.previous.fulfillment, payment: approval.previous.payment });
      if (proposal) transaction.set(publicRef, { items: proposal.before.items, pricing: proposal.before.pricing, fulfillment: proposal.before.fulfillment, editProposal: { ...proposal, status: 'REJECTED', respondedAt: serverTimestamp() }, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      transaction.update(orderRef, common);
      if (proposal) transaction.set(publicRef, { editProposal: { ...proposal, status: 'ACCEPTED', respondedAt: serverTimestamp() }, updatedAt: serverTimestamp() }, { merge: true });
    }
  });
}

export function isFunctionsUnavailable(cause: unknown): boolean {
  const code = typeof cause === 'object' && cause && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
  if (/functions\/(not-found|unavailable|deadline-exceeded|internal|unknown)/i.test(code)) return true;
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return /failed to fetch|network|load failed|service unavailable|status code 5\d\d/i.test(message);
}
