import { httpsCallable, type Functions } from 'firebase/functions';
import type { CashPaymentMethod } from '@/shared/cash-register';

type CashOperationResult = {
  registerId?: string;
  movementId?: string;
  differenceCents?: number;
  idempotent?: boolean;
};

function requestId() {
  return crypto.randomUUID();
}

async function operateCashRegister(
  functions: Functions,
  payload: Record<string, unknown>,
): Promise<CashOperationResult> {
  const callable = httpsCallable<Record<string, unknown>, CashOperationResult>(
    functions,
    'operateCashRegister',
  );
  const result = await callable(payload);
  return result.data;
}

export async function openCashRegister(
  functions: Functions,
  input: { initialBalanceCents: number; note?: string; openingDate: string },
) {
  const result = await operateCashRegister(functions, {
    operation: 'OPEN',
    clientRequestId: requestId(),
    ...input,
  });
  if (!result.registerId) throw new Error('Abertura de caixa sem identificador.');
  return result.registerId;
}

export async function recordCashMovement(
  functions: Functions,
  input: {
    registerId: string;
    type: 'WITHDRAWAL' | 'SUPPLY';
    amountCents: number;
    note: string;
  },
) {
  const result = await operateCashRegister(functions, {
    operation: 'MOVEMENT',
    clientRequestId: requestId(),
    ...input,
  });
  if (!result.movementId) throw new Error('Movimentação sem identificador.');
  return result.movementId;
}

export async function recordLocalSale(
  functions: Functions,
  input: {
    registerId: string;
    amountCents: number;
    paymentMethod: CashPaymentMethod;
    description: string;
    orderNumber?: string;
    note?: string;
  },
) {
  const result = await operateCashRegister(functions, {
    operation: 'LOCAL_SALE',
    clientRequestId: requestId(),
    ...input,
  });
  if (!result.movementId) throw new Error('Venda sem identificador.');
  return result.movementId;
}

export async function closeCashRegister(
  functions: Functions,
  input: { registerId: string; countedCashCents: number; note?: string },
) {
  return operateCashRegister(functions, {
    operation: 'CLOSE',
    ...input,
  });
}

export async function refundCompletedOrder(
  functions: Functions,
  input: { orderId: string; reason: string },
) {
  const callable = httpsCallable(functions, 'refundCompletedOrder');
  await callable(input);
}
