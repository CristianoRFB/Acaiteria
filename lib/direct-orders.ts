import { doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';

import type { PricedItem } from '@/shared/domain';

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

/** O cliente só pode responder sua proposta pública; todo o restante roda pelas Functions. */
export async function respondToOrderEditDirect(db: Firestore, publicCodeValue: string, decision: CustomerEditDecision) {
  const publicRef = doc(db, 'publicOrders', publicCodeValue);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(publicRef);
    if (!snapshot.exists()) throw new Error('Pedido não encontrado.');
    const proposal = snapshot.data().editProposal as PublicOrderEditProposal | undefined;
    if (!proposal || proposal.status !== 'PENDING') throw new Error('Esta alteração já foi respondida.');
    transaction.update(publicRef, { editProposal: { ...proposal, status: decision, respondedAt: serverTimestamp() }, updatedAt: serverTimestamp() });
  });
}
