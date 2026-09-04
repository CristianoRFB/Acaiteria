import { describe, expect, it } from 'vitest';
import { createOrderSchema } from './index.js';

const valid = { clientRequestId: '8bc68d79-8242-4def-8eb1-3d22a6f56d37', customer: { name: 'Cliente Teste', whatsapp: '5517999999999' }, items: [{ productId: 'p', sizeId: 's', quantity: 1, selections: [] }], fulfillment: { mode: 'PICKUP' }, payment: { method: 'PIX', needsChange: false }, clientPreviewTotalCents: 1 };
describe('validação da Function createOrder', () => {
  it('aceita payload mínimo válido', () => expect(createOrderSchema.safeParse(valid).success).toBe(true));
  it('rejeita delivery sem endereço', () => expect(createOrderSchema.safeParse({ ...valid, fulfillment: { mode: 'DELIVERY' } }).success).toBe(false));
  it('rejeita item/quantidade fora dos limites', () => expect(createOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 100 }] }).success).toBe(false));
  it('rejeita troco quando pagamento não é dinheiro', () => expect(createOrderSchema.safeParse({ ...valid, payment: { method: 'PIX', needsChange: true, changeForCents: 5000 } }).success).toBe(false));
  it('exige valor quando o cliente precisa de troco', () => expect(createOrderSchema.safeParse({ ...valid, payment: { method: 'CASH', needsChange: true } }).success).toBe(false));
  it('aceita decisão explícita de não precisar de troco', () => expect(createOrderSchema.safeParse({ ...valid, payment: { method: 'CASH', needsChange: false } }).success).toBe(true));
  it('rejeita request id que impediria idempotência', () => expect(createOrderSchema.safeParse({ ...valid, clientRequestId: 'not-a-uuid' }).success).toBe(false));
});
