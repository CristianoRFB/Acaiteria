import { describe, expect, it } from 'vitest';

import { canTransitionDelivery, deliveryStatusMessage, maskDeliveryCode } from '@/shared/delivery';

describe('delivery domain', () => {
  it('permite apenas a sequência operacional esperada', () => {
    expect(canTransitionDelivery('READY_FOR_DELIVERY', 'ASSIGNED')).toBe(true);
    expect(canTransitionDelivery('ASSIGNED', 'READY_FOR_DELIVERY')).toBe(true);
    expect(canTransitionDelivery('ARRIVED', 'DELIVERED')).toBe(true);
    expect(canTransitionDelivery('DELIVERED', 'ON_THE_WAY')).toBe(false);
    expect(canTransitionDelivery('CANCELLED', 'ASSIGNED')).toBe(false);
  });
  it('nunca exibe o código completo na máscara ou nas mensagens', () => {
    expect(maskDeliveryCode('4827')).toBe('48••');
    expect(maskDeliveryCode('abc')).toBe('••••');
    expect(deliveryStatusMessage('ARRIVED')).toContain('código');
  });
});
