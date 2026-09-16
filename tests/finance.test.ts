import { describe, expect, it } from 'vitest';
import { buildFinanceInsights } from '@/components/finance-insights';
import { createCompletedOrderIncome, formatDateKey, parseBRLToCents, type FinanceEntry } from '@/shared/finance';

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

  it('ranks products and finds the best sales day from paid sales', () => {
    const entries: FinanceEntry[] = [
      { id: 'sale-1', kind: 'INCOME', category: 'Vendas de açaí', description: 'Pedido #1', amountCents: 5000, date: '2026-09-10', status: 'PAID', sourceOrderId: 'order-1', paymentMethod: 'PIX' },
      { id: 'sale-2', kind: 'INCOME', category: 'Vendas locais', description: 'Balcão', amountCents: 4000, date: '2026-09-10', status: 'PAID', sourceLocalSaleId: 'local-1', paymentMethod: 'CASH' },
      { id: 'expense-1', kind: 'EXPENSE', category: 'Insumos', description: 'Frutas', amountCents: 1000, date: '2026-09-10', status: 'PAID' },
    ];
    const insights = buildFinanceInsights(entries, [{
      id: 'order-1',
      fulfillment: { mode: 'DELIVERY' },
      items: [{ productId: 'acai', productName: 'Açaí', sizeId: '500', sizeLabel: '500 ml', quantity: 2, unitPriceCents: 2500, totalPriceCents: 5000, modifierSelections: [] }],
    }]);
    expect(insights.products[0]).toMatchObject({ name: 'Açaí', quantity: 2, revenue: 5000 });
    expect(insights.bestDay).toEqual({ label: '10/09', revenue: 9000 });
    expect(insights.channels).toEqual(expect.arrayContaining([{ name: 'Balcão', orders: 1, revenue: 4000 }, { name: 'Entrega', orders: 1, revenue: 5000 }]));
  });
});
