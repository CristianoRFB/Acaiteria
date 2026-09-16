import { describe, expect, it } from 'vitest';

import {
  movementLabel,
  paymentMethodLabel,
  summarizeCashMovements,
  type CashMovement,
} from '@/shared/cash-register';

const movement = (input: Partial<CashMovement>): CashMovement => ({
  id: input.id ?? crypto.randomUUID(),
  registerId: 'cash-1',
  type: input.type ?? 'SALE',
  direction: input.direction ?? 'IN',
  amountCents: input.amountCents ?? 0,
  cashAmountCents: input.cashAmountCents ?? 0,
  operatorUid: 'user-1',
  ...input,
});

describe('cash register helpers', () => {
  it('calculates the expected cash balance using integer cents', () => {
    const summary = summarizeCashMovements(10000, [
      movement({
        type: 'SALE',
        amountCents: 3990,
        cashAmountCents: 3990,
        paymentMethod: 'CASH',
      }),
      movement({ type: 'SALE', amountCents: 2500, paymentMethod: 'PIX' }),
      movement({ type: 'SUPPLY', amountCents: 5000, cashAmountCents: 5000 }),
      movement({
        type: 'WITHDRAWAL',
        direction: 'OUT',
        amountCents: 3000,
        cashAmountCents: 3000,
      }),
    ]);
    expect(summary.totalSalesCents).toBe(6490);
    expect(summary.cashSalesCents).toBe(3990);
    expect(summary.pixSalesCents).toBe(2500);
    expect(summary.expectedCashCents).toBe(15990);
  });

  it('keeps refunds auditable and calculates net sales separately', () => {
    const summary = summarizeCashMovements(0, [
      movement({
        type: 'SALE',
        amountCents: 3000,
        cashAmountCents: 3000,
        paymentMethod: 'CASH',
      }),
      movement({
        type: 'REFUND',
        direction: 'OUT',
        amountCents: 3000,
        cashAmountCents: 3000,
        paymentMethod: 'CASH',
      }),
    ]);
    expect(summary.totalSalesCents).toBe(3000);
    expect(summary.totalRefundsCents).toBe(3000);
    expect(summary.netSalesCents).toBe(0);
    expect(summary.expectedCashCents).toBe(0);
  });

  it('uses clear labels for operators', () => {
    expect(movementLabel('WITHDRAWAL')).toBe('Sangria');
    expect(paymentMethodLabel('PIX')).toBe('Pix');
  });
});
