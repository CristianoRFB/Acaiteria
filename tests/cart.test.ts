import { describe, expect, it } from 'vitest';

import { developmentCatalog } from '../lib/development-seed';
import { calculateCartPreview, type CartItemDraft } from '../shared/domain';

describe('operações de carrinho', () => {
  const base: CartItemDraft = { cartItemId: 'one', productId: 'agua-sem-gas', sizeId: 'unico', selections: [], quantity: 1 };
  it('adiciona, edita, duplica, remove e preserva IDs no draft serializável', () => {
    let items: CartItemDraft[] = [];
    items = [...items, base];
    items = items.map((item) => item.cartItemId === 'one' ? { ...item, quantity: 2 } : item);
    items = [...items, { ...items[0], cartItemId: 'two' }];
    expect(JSON.parse(JSON.stringify(items))).toHaveLength(2);
    expect(calculateCartPreview(items, developmentCatalog).subtotalCents).toBe(1400);
    items = items.filter((item) => item.cartItemId !== 'one');
    expect(items).toEqual([{ ...base, cartItemId: 'two', quantity: 2 }]);
  });
});
