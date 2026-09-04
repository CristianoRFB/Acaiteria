import { describe, expect, it } from 'vitest';

import { developmentCatalog, developmentStoreConfig } from '../lib/development-seed';
import { validateProductConfiguration } from '../shared/domain';

const comboPrices: Record<string, number[]> = {
  barbie: [2300, 2400, 2500, 2800],
  'banana-ball': [1900, 2000, 2100, 2400],
  beijinho: [2200, 2300, 2400, 2700],
  'bem-casado': [1950, 2050, 2150, 2450],
  chocomaster: [2450, 2550, 2650, 2950],
  'dos-sonhos': [2200, 2300, 2400, 2700],
  favorito: [2450, 2550, 2650, 2950],
  power: [2550, 2650, 2750, 3050],
  raspas: [2200, 2300, 2400, 2700],
  saboroso: [2050, 2150, 2250, 2550],
  jade: [2100, 2200, 2300, 2600],
  'pistache-berry': [2400, 2500, 2600, 2900],
  'yogo-top': [2150, 2250, 2350, 2650],
  joaninha: [1950, 2050, 2150, 2450],
  'kids-1': [2200, 2300, 2400, 2700],
  'kids-2': [2200, 2300, 2400, 2700],
  'mais-sabor': [2400, 2500, 2600, 2900],
  manila: [2150, 2250, 2350, 2650],
  moranguete: [2400, 2500, 2600, 2900],
  prestigio: [2400, 2500, 2600, 2900],
  supreme: [2200, 2300, 2400, 2700],
  tropical: [2300, 2400, 2500, 2800],
  '220-volts': [2100, 2200, 2300, 2600],
  'santa-fe': [2300, 2400, 2500, 2800],
  'explosao-de-oreo': [2450, 2550, 2650, 2950],
  nuvem: [2000, 2100, 2200, 2500],
};

describe('cardápio transcrito', () => {
  it('mantém IDs, slugs, preços e relacionamentos válidos', () => {
    expect(developmentCatalog.categories).toHaveLength(7);
    expect(developmentCatalog.products).toHaveLength(36);
    expect(new Set(developmentCatalog.products.map((product) => product.id)).size).toBe(developmentCatalog.products.length);
    expect(new Set(developmentCatalog.products.map((product) => product.slug)).size).toBe(developmentCatalog.products.length);
    expect(new Set(developmentCatalog.groups.map((group) => group.id)).size).toBe(developmentCatalog.groups.length);
    expect(new Set(developmentCatalog.modifiers.map((modifier) => modifier.id)).size).toBe(developmentCatalog.modifiers.length);
    for (const product of developmentCatalog.products) {
      expect(validateProductConfiguration(product, developmentCatalog.groups, developmentCatalog.modifiers)).toEqual([]);
      expect(product.sizes.every((size) => Number.isSafeInteger(size.basePriceCents) && size.basePriceCents >= 0)).toBe(true);
    }
  });

  it('confere os 26 combinados e seus quatro preços', () => {
    const actual = Object.fromEntries(developmentCatalog.products.filter((product) => product.categoryId === 'combinados').map((product) => [product.id, product.sizes.map((size) => size.basePriceCents)]));
    expect(actual).toEqual(comboPrices);
  });

  it('confere copo, milk-shake, sorvete, shakes, salada e bebidas', () => {
    const prices = (id: string) => developmentCatalog.products.find((product) => product.id === id)?.sizes.map((size) => size.basePriceCents);
    expect(prices('acai-monte-seu')).toEqual([1400, 1500, 1600, 1900]);
    expect(prices('milk-shake')).toEqual([1350, 1450, 1550]);
    expect(prices('sorvete')).toEqual([1500, 1600, 1700]);
    expect(prices('shake-acai-banana-whey')).toEqual([2300]);
    expect(prices('shake-acai-morango')).toEqual([2000]);
    expect(prices('shake-acai-banana')).toEqual([2000]);
    expect(prices('salada-de-frutas')).toEqual([1600]);
    expect(prices('agua-sem-gas')).toEqual([350]);
    expect(prices('agua-com-gas')).toEqual([400]);
    expect(prices('refrigerante')).toEqual([500]);
  });

  it('confere taxa, horários e textos operacionais', () => {
    expect(developmentStoreConfig.deliveryConfig).toEqual({ mode: 'FIXED', fixedFeeCents: 400 });
    expect(developmentStoreConfig.hours.find((day) => day.day === 0)?.windows).toEqual([{ open: '15:00', close: '21:50' }]);
    for (const day of [1, 2, 3, 4, 5, 6]) expect(developmentStoreConfig.hours.find((entry) => entry.day === day)?.windows).toEqual([{ open: '14:00', close: '21:50' }]);
    expect(developmentStoreConfig.orderInstructions).toMatch(/forma de pagamento/);
    expect(developmentStoreConfig.busyDeliveryEstimate).toMatch(/60 minutos ou mais/);
  });
});
