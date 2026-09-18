import type { CatalogSnapshot, Modifier, ModifierGroup, Product } from './domain.js';

const beverageModifierIds = ['refri-coca-cola', 'refri-guarana', 'refri-fanta', 'refri-sprite', 'refri-pepsi', 'refri-sukita'];

const beverageModifiers: Modifier[] = [
  ['refri-coca-cola', 'Coca-Cola'],
  ['refri-guarana', 'Guaraná'],
  ['refri-fanta', 'Fanta Laranja'],
  ['refri-sprite', 'Sprite'],
  ['refri-pepsi', 'Pepsi'],
  ['refri-sukita', 'Sukita Laranja'],
].map(([id, name], index) => ({
  id,
  name,
  active: true,
  available: true,
  priceCents: 0,
  premium: false,
  maxQuantity: 1,
  allergenKeys: [],
  displayOrder: index + 1,
  imageUrl: '/menu/products/bebida.webp',
}));

const beverageGroup: ModifierGroup = {
  id: 'sabores-refrigerante',
  name: 'Escolha o sabor',
  description: 'Selecione o refrigerante que você quer receber.',
  active: true,
  required: true,
  minSelections: 1,
  maxSelections: 1,
  allowDuplicate: false,
  displayOrder: 1,
  pricingMode: 'includedQuota',
  modifierIds: beverageModifierIds,
};

const beverageSizes = [
  { id: '350ml', label: '350 ml', active: true, basePriceCents: 500, displayOrder: 1 },
  { id: '600ml', label: '600 ml', active: true, basePriceCents: 700, displayOrder: 2 },
  { id: '1l', label: '1 litro', active: true, basePriceCents: 1000, displayOrder: 3 },
];

function beverageProduct(existing?: Product): Product {
  return {
    id: 'refrigerante',
    name: 'Refrigerantes',
    slug: 'refrigerantes',
    description: 'Escolha o sabor e o tamanho do seu refrigerante.',
    active: existing?.active ?? true,
    categoryId: existing?.categoryId ?? 'bebidas',
    productType: 'CUSTOMIZABLE',
    imageUrl: existing?.imageUrl || '/menu/products/bebida.webp',
    displayOrder: existing?.displayOrder ?? 3,
    sizes: beverageSizes,
    modifierGroupIds: ['sabores-refrigerante'],
    ...(existing?.updatedAt ? { updatedAt: existing.updatedAt } : {}),
  };
}

/** Mantém bebidas antigas compatíveis, enriquecendo Refrigerante com sabor, ml e imagem. */
export function withBeverageOptions(catalog: CatalogSnapshot): CatalogSnapshot {
  const existing = catalog.products.find((product) => product.id === 'refrigerante');
  const products = existing
    ? catalog.products.map((product) => product.id === 'refrigerante' ? beverageProduct(product) : product)
    : [...catalog.products, beverageProduct()];
  const groups = catalog.groups.some((group) => group.id === beverageGroup.id)
    ? catalog.groups.map((group) => group.id === beverageGroup.id ? beverageGroup : group)
    : [...catalog.groups, beverageGroup];
  const modifiers = [...catalog.modifiers];
  for (const modifier of beverageModifiers) if (!modifiers.some((item) => item.id === modifier.id)) modifiers.push(modifier);
  return { ...catalog, products, groups, modifiers };
}
