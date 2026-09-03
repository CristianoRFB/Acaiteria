import { describe, expect, it } from 'vitest';
import { calculateCartPreview, calculateDeliveryFee, calculateItemPrice, formatBRL, isStoreOpen, normalizeSelections, validateGroupSelection, type CatalogSnapshot, type StorePublicConfig } from '../shared/domain';
import { developmentCatalog } from '../lib/development-seed';

describe('motor de preços em centavos', () => {
  it('formata BRL sem usar float na persistência', () => expect(formatBRL(2350)).toContain('23,50'));
  it('calcula base, cota, extra, premium e quantidade', () => {
    const item = calculateItemPrice({ cartItemId: '1', productId: 'acai-monte-seu', sizeId: '300ml', quantity: 2, selections: [
      { groupId: 'base', items: [{ modifierId: 'acai-tradicional', quantity: 1 }] },
      { groupId: 'frutas', items: [{ modifierId: 'banana', quantity: 1 }, { modifierId: 'morango', quantity: 1 }] },
      { groupId: 'complementos', items: [{ modifierId: 'granola', quantity: 2 }, { modifierId: 'nutella', quantity: 1 }] },
    ] }, developmentCatalog);
    // 1400 base; 3 itens comuns incluídos (base + banana + morango); 2 granolas pagas = 300; premium = 400.
    expect(item.unitPriceCents).toBe(2100);
    expect(item.totalPriceCents).toBe(4200);
  });
  it('soma carrinho e multiplica quantidades', () => {
    const result = calculateCartPreview([{ cartItemId: 'simple', productId: 'acai-classico', sizeId: 'unico', selections: [], quantity: 3 }], developmentCatalog);
    expect(result.subtotalCents).toBe(5400);
  });
  it('rejeita modificador indisponível e grupo obrigatório ausente', () => {
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'acai-monte-seu', sizeId: '300ml', quantity: 1, selections: [] }, developmentCatalog)).toThrow(/pelo menos/);
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'acai-monte-seu', sizeId: '300ml', quantity: 1, selections: [{ groupId: 'base', items: [{ modifierId: 'acai-tradicional', quantity: 1 }] }, { groupId: 'frutas', items: [{ modifierId: 'kiwi', quantity: 1 }] }] }, developmentCatalog)).toThrow(/indisponível/);
  });
  it('rejeita duplicata e máximo por modifier', () => {
    const modifiers = new Map(developmentCatalog.modifiers.map((modifier) => [modifier.id, modifier]));
    const base = developmentCatalog.groups.find((group) => group.id === 'base')!;
    expect(validateGroupSelection(base, { groupId: 'base', items: [{ modifierId: 'acai-tradicional', quantity: 2 }] }, modifiers).valid).toBe(false);
    const complements = developmentCatalog.groups.find((group) => group.id === 'complementos')!;
    expect(validateGroupSelection(complements, { groupId: 'complementos', items: [{ modifierId: 'granola', quantity: 3 }] }, modifiers).valid).toBe(false);
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
    const forged = { cartItemId: 'hack', productId: 'acai-classico', sizeId: 'unico', selections: [], quantity: 1, clientTotal: 1 } as unknown as Parameters<typeof calculateItemPrice>[0];
    expect(calculateItemPrice(forged, developmentCatalog).totalPriceCents).toBe(1800);
  });
  it('rejeita produto, tamanho e modifier inexistentes', () => {
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'fake', sizeId: 'x', selections: [], quantity: 1 }, developmentCatalog as CatalogSnapshot)).toThrow(/Produto/);
    expect(() => calculateItemPrice({ cartItemId: 'x', productId: 'acai-classico', sizeId: 'fake', selections: [], quantity: 1 }, developmentCatalog)).toThrow(/Tamanho/);
  });
});
