export type FinanceEntryKind = 'INCOME' | 'EXPENSE';
export type FinanceEntryStatus = 'PAID' | 'PENDING';

export interface FinanceEntry {
  id: string;
  kind: FinanceEntryKind;
  category: string;
  description: string;
  amountCents: number;
  date: string;
  status: FinanceEntryStatus;
  orderNumber?: string;
  notes?: string;
  sourceOrderId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CompletedOrderIncomeInput {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  date: string;
}

export function createCompletedOrderIncome(input: CompletedOrderIncomeInput) {
  return {
    kind: 'INCOME' as const,
    category: 'Vendas de açaí',
    description: `Pedido ${input.orderNumber}`,
    amountCents: input.totalCents,
    date: input.date,
    status: 'PAID' as const,
    orderNumber: input.orderNumber,
    sourceOrderId: input.orderId,
    notes: 'Lançamento criado automaticamente ao concluir o pedido.',
  };
}

export const FINANCE_CATEGORIES = [
  'Vendas de açaí',
  'Delivery',
  'Insumos',
  'Embalagens',
  'Taxas',
  'Pró-labore',
  'Outros',
] as const;

export function parseBRLToCents(value: string): number {
  const normalized = value.trim().replace(/R\$\s?/gi, '');
  const numeric = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized.replace(/[^0-9.-]/g, '');
  const amount = Number(numeric);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : 0;
}

export function formatDateKey(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}
