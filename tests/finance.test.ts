import { describe, expect, it } from 'vitest';
import { createCompletedOrderIncome, formatDateKey, parseBRLToCents } from '@/shared/finance';

describe('finance helpers', () => {
  it('converts Brazilian real inputs to cents safely', () => {
    expect(parseBRLToCents('39,90')).toBe(3990);
    expect(parseBRLToCents('R$ 1.234,56')).toBe(123456);
    expect(parseBRLToCents('0')).toBe(0);
    expect(parseBRLToCents('texto')).toBe(0);
  });

  it('creates one deterministic paid income entry for a completed order', () => {
    expect(createCompletedOrderIncome({ orderId: 'order-1', orderNumber: '#A123', totalCents: 4890, date: '2026-09-15' })).toEqual({
      kind: 'INCOME', category: 'Vendas de açaí', description: 'Pedido #A123', amountCents: 4890, date: '2026-09-15', status: 'PAID', orderNumber: '#A123', sourceOrderId: 'order-1', notes: 'Lançamento criado automaticamente ao concluir o pedido.',
    });
  });

  it('formats stored ISO date keys for the panel', () => {
    expect(formatDateKey('2026-09-15')).toBe('15/09/2026');
  });
});
