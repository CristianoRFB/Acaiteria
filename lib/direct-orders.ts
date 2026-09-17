import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { httpsCallable, type Functions } from 'firebase/functions';

import { type CartItemDraft, type OrderStatus, type PricedItem } from '@/shared/domain';

export interface DirectOrderDetailsUpdate {
  customer: { name: string; whatsapp: string; address?: Record<string, string> };
  notes: string;
  items?: CartItemDraft[];
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
  before: { items: PricedItem[]; pricing: { totalCents: number }; fulfillment: { mode: 'PICKUP' | 'DELIVERY' } };
}

export async function updateOrderStatusDirect(functions: Functions, orderId: string, status: OrderStatus, reason?: string) {
  await httpsCallable(functions, 'updateOrderStatus')({ orderId, status, ...(reason ? { reason } : {}) });
}

export async function updateOrderDetailsDirect(functions: Functions, orderId: string, input: DirectOrderDetailsUpdate) {
  await httpsCallable(functions, 'updateOrderDetails')({ orderId, ...input });
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

/** Registra a decisão no pedido privado pelo backend autenticado. */
export async function finalizeOrderEditDirect(functions: Functions, orderId: string, decision: CustomerEditDecision) {
  await httpsCallable(functions, 'finalizeOrderEdit')({ orderId, decision });
}

export async function updateOrderEstimateDirect(functions: Functions, orderId: string, estimatedMinutes: number) {
  await httpsCallable(functions, 'updateOrderEstimate')({ orderId, estimatedMinutes });
}
