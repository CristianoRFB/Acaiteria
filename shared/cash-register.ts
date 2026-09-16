export type CashRegisterStatus = 'OPEN' | 'CLOSED';
export type CashMovementType =
  | 'OPENING'
  | 'SALE'
  | 'WITHDRAWAL'
  | 'SUPPLY'
  | 'REFUND'
  | 'CLOSING';
export type CashPaymentMethod = 'PIX' | 'CARD' | 'CASH' | 'OTHER';

export interface CashRegister {
  id: string;
  status: CashRegisterStatus;
  operatorUid: string;
  operatorEmail?: string;
  openedAt?: unknown;
  closedAt?: unknown;
  openingDate?: string;
  initialBalanceCents: number;
  expectedCashCents?: number;
  countedCashCents?: number;
  differenceCents?: number;
  closingNote?: string;
  lastMovementAt?: unknown;
  updatedAt?: unknown;
}

export interface CashMovement {
  id: string;
  registerId: string;
  type: CashMovementType;
  direction: 'IN' | 'OUT';
  amountCents: number;
  cashAmountCents: number;
  paymentMethod?: CashPaymentMethod;
  orderNumber?: string;
  sourceOrderId?: string;
  sourceLocalSaleId?: string;
  operatorUid: string;
  operatorEmail?: string;
  note?: string;
  createdAt?: unknown;
}

export interface CashSummary {
  totalSalesCents: number;
  totalRefundsCents: number;
  netSalesCents: number;
  cashSalesCents: number;
  pixSalesCents: number;
  cardSalesCents: number;
  otherSalesCents: number;
  withdrawalsCents: number;
  suppliesCents: number;
  expectedCashCents: number;
}

const sum = (values: number[]) =>
  values.reduce(
    (total, value) => total + (Number.isSafeInteger(value) ? value : 0),
    0,
  );

export function summarizeCashMovements(
  initialBalanceCents: number,
  movements: CashMovement[],
): CashSummary {
  const sales = movements.filter((movement) => movement.type === 'SALE');
  const refunds = movements.filter((movement) => movement.type === 'REFUND');
  const cashImpact = movements.reduce(
    (total, movement) =>
      total +
      (movement.direction === 'OUT'
        ? -movement.cashAmountCents
        : movement.cashAmountCents),
    initialBalanceCents,
  );
  const byMethod = (method: CashPaymentMethod) =>
    sum(
      sales
        .filter((movement) => movement.paymentMethod === method)
        .map((movement) => movement.amountCents),
    );
  const totalSalesCents = sum(sales.map((movement) => movement.amountCents));
  const totalRefundsCents = sum(
    refunds.map((movement) => movement.amountCents),
  );
  return {
    totalSalesCents,
    totalRefundsCents,
    netSalesCents: totalSalesCents - totalRefundsCents,
    cashSalesCents: byMethod('CASH'),
    pixSalesCents: byMethod('PIX'),
    cardSalesCents: byMethod('CARD'),
    otherSalesCents: byMethod('OTHER'),
    withdrawalsCents: sum(
      movements
        .filter((movement) => movement.type === 'WITHDRAWAL')
        .map((movement) => movement.amountCents),
    ),
    suppliesCents: sum(
      movements
        .filter((movement) => movement.type === 'SUPPLY')
        .map((movement) => movement.amountCents),
    ),
    expectedCashCents: cashImpact,
  };
}

export function movementLabel(type: CashMovementType): string {
  return {
    OPENING: 'Abertura',
    SALE: 'Venda',
    WITHDRAWAL: 'Sangria',
    SUPPLY: 'Suprimento',
    REFUND: 'Estorno',
    CLOSING: 'Fechamento',
  }[type];
}

export function paymentMethodLabel(method?: CashPaymentMethod): string {
  return { PIX: 'Pix', CARD: 'Cartão', CASH: 'Dinheiro', OTHER: 'Outra forma' }[
    method ?? 'OTHER'
  ];
}
