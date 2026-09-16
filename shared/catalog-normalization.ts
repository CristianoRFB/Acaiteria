import type { Product, ProductSize } from './domain.js';

type CatalogRecord = Record<string, unknown> & { id: string };

function asText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeSize(value: unknown, index: number): ProductSize | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const price = typeof raw.basePriceCents === 'number' && Number.isSafeInteger(raw.basePriceCents) && raw.basePriceCents >= 0
    ? raw.basePriceCents
    : 0;
  return {
    id: asText(raw.id, `tamanho-${index + 1}`),
    label: asText(raw.label, `Tamanho ${index + 1}`),
    active: raw.active !== false,
    basePriceCents: price,
    includedModifiersCount: typeof raw.includedModifiersCount === 'number' ? raw.includedModifiersCount : undefined,
    displayOrder: typeof raw.displayOrder === 'number' && Number.isFinite(raw.displayOrder) ? raw.displayOrder : index + 1,
  };
}

export function normalizeCatalogProduct(raw: CatalogRecord): Product {
  const sizes = Array.isArray(raw.sizes)
    ? raw.sizes.map(normalizeSize).filter((size): size is ProductSize => size !== null)
    : [];
  const modifierGroupIds = Array.isArray(raw.modifierGroupIds)
    ? raw.modifierGroupIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];
  return {
    id: raw.id,
    name: asText(raw.name, 'Produto sem nome'),
    slug: asText(raw.slug, raw.id),
    description: asText(raw.description, 'Produto em configuração.'),
    active: raw.active === true,
    categoryId: asText(raw.categoryId, ''),
    productType: raw.productType === 'SIMPLE' ? 'SIMPLE' : 'CUSTOMIZABLE',
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl : undefined,
    displayOrder: typeof raw.displayOrder === 'number' && Number.isFinite(raw.displayOrder) ? raw.displayOrder : 9999,
    sizes,
    modifierGroupIds,
    updatedAt: raw.updatedAt,
  };
}

export function isOrderableCatalogProduct(product: Product) {
  return product.active && product.sizes.some((size) => size.active && size.basePriceCents > 0);
}
