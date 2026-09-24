import { httpsCallable } from 'firebase/functions';

import { getFirebaseClient } from '@/lib/firebase/client';
import type { CashPaymentMethod } from '@/shared/cash-register';

function requestId(value?: string) {
  return value ?? crypto.randomUUID();
}

async function operateCashRegister<T extends Record<string, unknown>>(input: T) {
  const operation = httpsCallable<T, Record<string, unknown>>(
    getFirebaseClient().functions,
    'operateCashRegister',
  );
  return (await operation(input)).data;
}

export async function openCashRegister(input: {
  initialBalanceCents: number;
  note?: string;
  openingDate: string;
  clientRequestId?: string;
}) {
  const result = await operateCashRegister({
    ...input,
    clientRequestId: requestId(input.clientRequestId),
    operation: 'OPEN',
  });
  return String(result.registerId);
}

export async function recordCashMovement(input: {
  registerId: string;
  type: 'WITHDRAWAL' | 'SUPPLY';
  amountCents: number;
  note: string;
  clientRequestId?: string;
}) {
  return operateCashRegister({
    ...input,
    clientRequestId: requestId(input.clientRequestId),
    operation: 'MOVEMENT',
  });
}

export async function recordLocalSale(input: {
  registerId: string;
  amountCents: number;
  paymentMethod: CashPaymentMethod;
  description: string;
  orderNumber?: string;
  note?: string;
  clientRequestId?: string;
}) {
  return operateCashRegister({
    ...input,
    clientRequestId: requestId(input.clientRequestId),
    operation: 'LOCAL_SALE',
  });
}

export async function closeCashRegister(input: {
  registerId: string;
  countedCashCents: number;
  note?: string;
}) {
  return operateCashRegister({ ...input, operation: 'CLOSE' });
}

export async function refundCompletedOrder(input: {
  orderId: string;
  reason: string;
}) {
  const refund = httpsCallable<typeof input, { ok: boolean }>(
    getFirebaseClient().functions,
    'refundCompletedOrder',
  );
  return (await refund(input)).data;
}
