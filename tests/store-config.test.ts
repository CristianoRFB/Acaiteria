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

  it('descarta horários impossíveis sem deixar o cálculo operacional inconsistente', () => {
    const config = normalizeStoreConfig({
      hours: [{ day: 1, closed: false, windows: [{ open: '99:99', close: '25:80' }] }],
      holidayHours: [{ open: '12:00', close: 'invalido' }],
      deliveryConfig: { mode: 'ZONES', zones: [{ id: 'centro', name: 'Centro', feeCents: -500, active: true }] },
    });
    expect(config.hours.find((day) => day.day === 1)?.windows).toEqual([{ open: '14:00', close: '21:50' }]);
    expect(config.holidayHours).toEqual(defaultStorePublicConfig.holidayHours);
    expect(config.deliveryConfig.zones?.[0].feeCents).toBe(0);
  });
});
