import { describe, expect, it, afterEach, vi } from 'vitest';
import { LocalOrderProvider, SaiposOrderProvider, missingMappings, providerFor, safeError, retryDelay, type ProviderOrder } from './provider.js';
import { emptyMappings, customerIntegrationMessage } from '../../../shared/integration.js';
const order: ProviderOrder = { id: 'fixture', items: [{ productId: 'p', sizeId: '700ml', productName: 'Teste', sizeLabel: '700 ml', quantity: 1, unitPriceCents: 2000, totalPriceCents: 2000, modifierSelections: [{ groupId: 'g', groupName: 'Extras', items: [{ modifierId: 'm', name: 'Extra', quantity: 1, premium: false, unitChargeCents: 200, totalChargeCents: 200 }] }] }], payment: { method: 'PIX' }, pricing: { totalCents: 2000 } };
afterEach(() => vi.unstubAllEnvs());
describe('provider boundary', () => {
  it('preserves external identity across replay', async () => {
    const provider = new LocalOrderProvider();
    expect(await provider.submitOrder(order, 1)).toEqual(await provider.submitOrder(order, 2));
    expect((await provider.submitOrder(order, 1)).externalOrderId).toBe('LOCAL-fixture');
  });
  it.each(['reject', 'permanent'] as const)('classifies %s as permanent', async (scenario) => {
    await expect(new LocalOrderProvider(scenario).submitOrder(order, 1)).rejects.toMatchObject({ category: 'PERMANENT' });
  });
  it('models timeout and transient recovery deterministically', async () => {
    await expect(new LocalOrderProvider('timeout').submitOrder(order, 1)).rejects.toMatchObject({ code: 'TIMEOUT', category: 'TRANSIENT' });
    const provider = new LocalOrderProvider('transient');
    await expect(provider.submitOrder(order, 1)).rejects.toMatchObject({ category: 'TRANSIENT' });
    expect((await provider.submitOrder(order, 2)).externalOrderId).toBe('LOCAL-fixture');
    expect(retryDelay(2)).toBeGreaterThan(retryDelay(1));
  });
  it('fails closed for undocumented Saipos and local mode outside emulator', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
    expect(() => providerFor('local')).toThrow(/emuladores/);
    await expect(new SaiposOrderProvider().submitOrder()).rejects.toMatchObject({ code: 'CONTRACT_UNCONFIRMED' });
  });
  it('requires product, variant, modifier and payment codes, without parsing opaque codes', () => {
    const mappings = emptyMappings();
    expect(missingMappings(order, mappings)).toEqual(['products:p', 'variants:p:700ml', 'modifiers:m', 'payments:PIX']);
    mappings.products.p = 'PAI'; mappings.variants['p:700ml'] = 'opaque:700'; mappings.modifiers.m = 'PAI.FILHO'; mappings.payments.PIX = '42';
    expect(missingMappings(order, mappings)).toEqual([]);
  });
  it('sanitizes unknown errors and never claims Saipos confirmation for local/pending orders', () => {
    expect(safeError(new Error('secret-token')).message).not.toContain('secret-token');
    expect(customerIntegrationMessage({ provider: 'saipos', status: 'PENDING', attemptCount: 0 })).toContain('Não envie outro');
    expect(customerIntegrationMessage({ provider: 'local', status: 'ACCEPTED', attemptCount: 1 })).toContain('Nenhuma venda');
  });
});
