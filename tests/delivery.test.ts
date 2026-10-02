import { describe, expect, it } from 'vitest';

import { canTransitionDelivery, deliveryStatusMessage, formatDeliveryDestination, getDeliveryActionError, maskDeliveryCode, recordDeliveryCodeFailure } from '@/shared/delivery';

describe('delivery domain', () => {
  it('permite apenas a sequência operacional esperada', () => {
    expect(canTransitionDelivery('READY_FOR_DELIVERY', 'ASSIGNED')).toBe(true);
    expect(canTransitionDelivery('ASSIGNED', 'READY_FOR_DELIVERY')).toBe(true);
    expect(canTransitionDelivery('ACCEPTED', 'PICKED_UP')).toBe(true);
    expect(canTransitionDelivery('PICKED_UP', 'ON_THE_WAY')).toBe(true);
    expect(canTransitionDelivery('PICKED_UP', 'DELIVERY_FAILED')).toBe(true);
    expect(canTransitionDelivery('ARRIVED', 'DELIVERED')).toBe(true);
    expect(canTransitionDelivery('DELIVERED', 'ON_THE_WAY')).toBe(false);
    expect(canTransitionDelivery('CANCELLED', 'ASSIGNED')).toBe(false);
  });
  it('locks code confirmation after five failed attempts and releases after cooldown', () => {
    let state = { failedAttempts: 0, windowStartedAtMs: 1_000, lockedUntilMs: 0 };
    for (let i = 0; i < 4; i += 1) state = recordDeliveryCodeFailure(state, 2_000 + i)!;
    expect(state.failedAttempts).toBe(4);
    state = recordDeliveryCodeFailure(state, 2_100)!;
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntilMs).toBe(302_100);
    expect(recordDeliveryCodeFailure(state, 3_000)).toBeNull();
    expect(recordDeliveryCodeFailure(state, state.lockedUntilMs)).not.toBeNull();
  });
  it('nunca exibe o código completo na máscara ou nas mensagens', () => {
    expect(maskDeliveryCode('4827')).toBe('48••');
    expect(maskDeliveryCode('abc')).toBe('••••');
    expect(deliveryStatusMessage('ARRIVED')).toContain('código');
  });
  it('mostra o destino sem repetir complemento e referência', () => {
    expect(formatDeliveryDestination({ street: 'Rua Teste', number: '123', neighborhood: 'Centro', complement: 'Apto 4', reference: 'Portão azul' })).toBe('Rua Teste, 123 · Centro');
    expect(formatDeliveryDestination()).toBe('Endereço não informado');
  });
  it('remove códigos técnicos dos erros apresentados ao entregador', () => {
    expect(getDeliveryActionError(new Error('Código incorreto. [403]'), 'Erro')).toBe('Código incorreto.');
    expect(getDeliveryActionError(new Error('A loja precisa abrir o Caixa. [400]'), 'Erro')).toBe('A loja precisa abrir o Caixa.');
    expect(getDeliveryActionError(null, 'Erro')).toBe('Erro');
  });
});
