import { describe, expect, it } from 'vitest';

import { developmentCatalog, developmentStoreConfig } from '../lib/development-seed';
import { calculateCartPreview, calculateDeliveryFee, calculateItemPrice, formatBRL, formatNextOpening, getDeliveryEstimate, getNextOpening, getStoreAvailability, isStoreOpen, normalizeSelections, validateGroupSelection, type CatalogSnapshot, type StorePublicConfig } from '../shared/domain';

describe('motor de preços em centavos', () => {
  it('formata BRL sem usar float na persistência', () => expect(formatBRL(2350)).toContain('23,50'));

  it('calcula copo, acompanhamentos individuais e quantidade', () => {
    const item = calculateItemPrice({ cartItemId: '1', productId: 'acai-monte-seu', sizeId: '300ml', quantity: 2, selections: [
      { groupId: 'sabores-base', items: [{ modifierId: 'base-acai', quantity: 1 }] },
      { groupId: 'frutas', items: [{ modifierId: 'fruta-banana', quantity: 1 }] },
      { groupId: 'granola', items: [{ modifierId: 'granola-tradicional', quantity: 2 }] },
      { groupId: 'chocolates', items: [{ modifierId: 'chocolate-nutella', quantity: 1 }] },
    ] }, developmentCatalog);

    expect(item.unitPriceCents).toBe(3050);
    expect(item.totalPriceCents).toBe(6100);
  });

  it('aplica um sabor incluído e cobra adicionais no milk-shake', () => {
    const normal = calculateItemPrice({ cartItemId: 'milk', productId: 'milk-shake', sizeId: '300ml', quantity: 1, selections: [{ groupId: 'sabores-milk-shake', items: [{ modifierId: 'milk-chocolate', quantity: 1 }, { modifierId: 'milk-morango', quantity: 1 }] }] }, developmentCatalog);
    const pistache = calculateItemPrice({ cartItemId: 'pistache', productId: 'milk-shake', sizeId: '300ml', quantity: 1, selections: [{ groupId: 'sabores-milk-shake', items: [{ modifierId: 'milk-pistache', quantity: 1 }, { modifierId: 'milk-morango', quantity: 1 }] }] }, developmentCatalog);
    expect(normal.totalPriceCents).toBe(1600);
    expect(pistache.totalPriceCents).toBe(1550);
  });

  it('soma carrinho e multiplica quantidades', () => {
    const result = calculateCartPreview([{ cartItemId: 'simple', productId: 'agua-sem-gas', sizeId: 'unico', selections: [], quantity: 3 }], developmentCatalog);
    expect(result.subtotalCents).toBe(1050);
  });

  it('rejeita modificador indisponível e grupo obrigatório ausente', () => {
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'acai-monte-seu', sizeId: '300ml', quantity: 1, selections: [] }, developmentCatalog)).toThrow(/pelo menos/);
    const unavailableCatalog: CatalogSnapshot = { ...developmentCatalog, modifiers: developmentCatalog.modifiers.map((modifier) => modifier.id === 'fruta-kiwi' ? { ...modifier, available: false } : modifier) };
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'acai-monte-seu', sizeId: '300ml', quantity: 1, selections: [{ groupId: 'sabores-base', items: [{ modifierId: 'base-acai', quantity: 1 }] }, { groupId: 'frutas', items: [{ modifierId: 'fruta-kiwi', quantity: 1 }] }] }, unavailableCatalog)).toThrow(/indisponível/);
  });

  it('rejeita duplicata e máximo por adicional', () => {
    const modifiers = new Map(developmentCatalog.modifiers.map((modifier) => [modifier.id, modifier]));
    const base = developmentCatalog.groups.find((group) => group.id === 'sabores-base')!;
    expect(validateGroupSelection(base, { groupId: base.id, items: [{ modifierId: 'base-acai', quantity: 2 }] }, modifiers).valid).toBe(false);
    const chocolates = developmentCatalog.groups.find((group) => group.id === 'chocolates')!;
    expect(validateGroupSelection(chocolates, { groupId: chocolates.id, items: [{ modifierId: 'chocolate-nutella', quantity: 4 }] }, modifiers).valid).toBe(false);
  });

  it('normaliza seleções repetidas de forma determinística', () => expect(normalizeSelections([{ groupId: 'b', items: [{ modifierId: 'x', quantity: 1 }] }, { groupId: 'b', items: [{ modifierId: 'x', quantity: 2 }] }])).toEqual([{ groupId: 'b', items: [{ modifierId: 'x', quantity: 3 }] }]));
});

describe('horário e delivery', () => {
  const config: Pick<StorePublicConfig, 'hours' | 'timezone'> = { timezone: 'America/Sao_Paulo', hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: day !== 1, windows: day === 1 ? [{ open: '12:00', close: '14:00' }] : [] })) };
  it('respeita abertura, fechamento, borda e timezone da loja', () => {
    expect(isStoreOpen(new Date('2026-08-31T15:00:00Z'), config)).toBe(true);
    expect(isStoreOpen(new Date('2026-08-31T17:00:00Z'), config)).toBe(false);
    expect(isStoreOpen(new Date('2026-08-30T16:00:00Z'), config)).toBe(false);
  });
  it('aplica o horário real de segunda a sábado, domingo e bordas exatas', () => {
    expect(isStoreOpen(new Date('2026-08-31T16:59:00Z'), developmentStoreConfig)).toBe(false);
    expect(isStoreOpen(new Date('2026-08-31T17:00:00Z'), developmentStoreConfig)).toBe(true);
    expect(isStoreOpen(new Date('2026-09-06T00:49:00Z'), developmentStoreConfig)).toBe(true);
    expect(isStoreOpen(new Date('2026-09-06T00:50:00Z'), developmentStoreConfig)).toBe(false);
    expect(isStoreOpen(new Date('2026-09-06T17:59:00Z'), developmentStoreConfig)).toBe(false);
    expect(isStoreOpen(new Date('2026-09-06T18:00:00Z'), developmentStoreConfig)).toBe(true);
  });
  it('trata feriado como domingo e mostra a próxima abertura', () => {
    const holidayConfig = { ...developmentStoreConfig, holidayDates: ['2026-09-07'] };
    expect(isStoreOpen(new Date('2026-09-07T17:30:00Z'), holidayConfig)).toBe(false);
    expect(isStoreOpen(new Date('2026-09-07T18:00:00Z'), holidayConfig)).toBe(true);
    const next = getNextOpening(new Date('2026-09-07T17:30:00Z'), holidayConfig);
    expect(formatNextOpening(next)).toBe('Hoje às 15:00');
  });
  it('retorna estimativa contextual e estado operacional coerente', () => {
    expect(getDeliveryEstimate(new Date('2026-08-31T18:00:00Z'), developmentStoreConfig).label).toBe('30–40 min');
    expect(getDeliveryEstimate(new Date('2026-09-05T18:00:00Z'), developmentStoreConfig).label).toBe('a partir de 60 min');
    expect(getDeliveryEstimate(new Date('2026-09-07T18:00:00Z'), { ...developmentStoreConfig, holidayDates: ['2026-09-07'] }).busy).toBe(true);
    expect(getStoreAvailability(new Date('2026-08-31T17:00:00Z'), developmentStoreConfig).acceptingOrders).toBe(true);
    expect(getStoreAvailability(new Date('2026-08-31T16:59:00Z'), developmentStoreConfig).reason).toBe('OUTSIDE_HOURS');
    expect(getStoreAvailability(new Date('2026-08-31T16:59:00Z'), { ...developmentStoreConfig, enforceHours: false }).acceptingOrders).toBe(true);
    expect(getStoreAvailability(new Date('2026-08-31T17:00:00Z'), { ...developmentStoreConfig, orderingEnabled: false }).reason).toBe('PAUSED');
  });
  it('calcula none, confirm, fixed e zones', () => {
    expect(() => calculateDeliveryFee({ mode: 'NONE' }, 'DELIVERY')).toThrow();
    expect(calculateDeliveryFee({ mode: 'CONFIRM' }, 'DELIVERY')).toBe(0);
    expect(calculateDeliveryFee({ mode: 'FIXED', fixedFeeCents: 600 }, 'DELIVERY')).toBe(600);
    expect(calculateDeliveryFee({ mode: 'ZONES', zones: [{ id: 'centro', name: 'Centro', feeCents: 400, active: true }] }, 'DELIVERY', 'centro')).toBe(400);
    expect(calculateDeliveryFee({ mode: 'NONE' }, 'PICKUP')).toBe(0);
  });
});

describe('adulteração', () => {
  it('ignora qualquer total do cliente porque o domínio recebe apenas IDs', () => {
    const forged = { cartItemId: 'hack', productId: 'agua-sem-gas', sizeId: 'unico', selections: [], quantity: 1, clientTotal: 1 } as unknown as Parameters<typeof calculateItemPrice>[0];
    expect(calculateItemPrice(forged, developmentCatalog).totalPriceCents).toBe(350);
  });
  it('rejeita produto, tamanho e adicional inexistentes', () => {
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'fake', sizeId: 'x', selections: [], quantity: 1 }, developmentCatalog)).toThrow(/Produto/);
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'agua-sem-gas', sizeId: 'fake', selections: [], quantity: 1 }, developmentCatalog)).toThrow(/Tamanho/);
  });
});
