import { describe, expect, it } from 'vitest';
import { defaultStorePublicConfig, normalizeStoreConfig } from '../shared/store-config';

describe('store config normalization', () => {
  it('fills every required field from a legacy partial document', () => {
    const config = normalizeStoreConfig({ storeName: 'Minha loja', orderingEnabled: false });
    expect(config.storeName).toBe('Minha loja');
    expect(config.orderingEnabled).toBe(false);
    expect(config.hours).toHaveLength(7);
    expect(config.fulfillmentModes).toEqual(['PICKUP', 'DELIVERY']);
    expect(config.paymentMethods).toEqual(['PIX', 'CARD', 'CASH']);
    expect(config.deliveryConfig).toEqual({ mode: 'FIXED', fixedFeeCents: 400 });
  });

  it('repairs null, malformed arrays and placeholder contact data', () => {
    const config = normalizeStoreConfig({ hours: null, fulfillmentModes: [], paymentMethods: ['INVALID'], address: 'Endereço pendente de confirmação', deliveryConfig: { mode: 'INVALID' } });
    expect(config.hours).toEqual(defaultStorePublicConfig.hours);
    expect(config.fulfillmentModes).toEqual(defaultStorePublicConfig.fulfillmentModes);
    expect(config.paymentMethods).toEqual(defaultStorePublicConfig.paymentMethods);
    expect(config.address).toBe(defaultStorePublicConfig.address);
    expect(config.deliveryConfig).toEqual(defaultStorePublicConfig.deliveryConfig);
  });
});
