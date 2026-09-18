import { addDoc, collection, doc, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import type { CashPaymentMethod } from '@/shared/cash-register';

export async function openCashRegister(db: Firestore, input: { initialBalanceCents: number; note?: string; openingDate: string }) {
  const entry = await addDoc(collection(db, 'cashRegisters'), { ...input, status: 'OPEN', expectedCashCents: input.initialBalanceCents, operatorUid: 'admin', openedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return entry.id;
}
export async function recordCashMovement(db: Firestore, input: { registerId: string; type: 'WITHDRAWAL' | 'SUPPLY'; amountCents: number; note: string }) {
  return runTransaction(db, async (transaction) => { const registerRef = doc(db, 'cashRegisters', input.registerId); const register = await transaction.get(registerRef); if (!register.exists()) throw new Error('Caixa não encontrado.'); const entry = doc(collection(db, 'cashMovements')); const impact = input.type === 'WITHDRAWAL' ? -input.amountCents : input.amountCents; transaction.set(entry, { ...input, direction: input.type === 'WITHDRAWAL' ? 'OUT' : 'IN', cashAmountCents: input.amountCents, operatorUid: 'admin', createdAt: serverTimestamp() }); transaction.update(registerRef, { expectedCashCents: Number(register.data().expectedCashCents ?? 0) + impact, lastMovementAt: serverTimestamp(), updatedAt: serverTimestamp() }); return entry.id; });
}
export async function recordLocalSale(db: Firestore, input: { registerId: string; amountCents: number; paymentMethod: CashPaymentMethod; description: string; orderNumber?: string; note?: string }) {
  return runTransaction(db, async (transaction) => {
    const registerRef = doc(db, 'cashRegisters', input.registerId); const register = await transaction.get(registerRef); if (!register.exists()) throw new Error('Caixa não encontrado.'); const movementRef = doc(collection(db, 'cashMovements')); const financeRef = doc(collection(db, 'financeEntries'));
    transaction.set(movementRef, { ...input, type: 'SALE', direction: 'IN', cashAmountCents: input.paymentMethod === 'CASH' ? input.amountCents : 0, operatorUid: 'admin', createdAt: serverTimestamp() });
    transaction.set(financeRef, { kind: 'INCOME', category: 'Vendas de açaí', description: input.description, amountCents: input.amountCents, date: new Date().toISOString().slice(0, 10), status: 'PAID', paymentMethod: input.paymentMethod, orderNumber: input.orderNumber ?? null, notes: input.note ?? null, sourceLocalSaleId: movementRef.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    transaction.update(registerRef, { expectedCashCents: Number(register.data().expectedCashCents ?? 0) + (input.paymentMethod === 'CASH' ? input.amountCents : 0), lastMovementAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return movementRef.id;
  });
}
export async function closeCashRegister(db: Firestore, input: { registerId: string; countedCashCents: number; note?: string }) {
  await runTransaction(db, async (transaction) => { const ref = doc(db, 'cashRegisters', input.registerId); const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error('Caixa não encontrado.'); const expected = Number(snapshot.data().expectedCashCents ?? 0); transaction.update(ref, { status: 'CLOSED', countedCashCents: input.countedCashCents, differenceCents: input.countedCashCents - expected, closingNote: input.note ?? '', closedAt: serverTimestamp(), updatedAt: serverTimestamp() }); });
}
export async function refundCompletedOrder(db: Firestore, input: { orderId: string; reason: string }) { await runTransaction(db, async (transaction) => { const ref = doc(db, 'orders', input.orderId); const snapshot = await transaction.get(ref); if (!snapshot.exists()) throw new Error('Pedido não encontrado.'); const code = snapshot.data().publicCode as string | undefined; transaction.update(ref, { status: 'CANCELLED', statusMessage: `Pedido cancelado: ${input.reason}`, updatedAt: serverTimestamp() }); if (code) transaction.update(doc(db, 'publicOrders', code), { status: 'CANCELLED', statusMessage: `Pedido cancelado: ${input.reason}`, updatedAt: serverTimestamp() }); }); }
