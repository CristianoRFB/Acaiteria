import type { CatalogSnapshot, StorePublicConfig } from '@/shared/domain';

export const developmentStoreConfig: StorePublicConfig = {
  storeName: 'Açaí + Sabor',
  instagramHandle: '@acaimaissabor.stafedosul',
  address: 'Endereço pendente de confirmação',
  city: 'Santa Fé do Sul/SP',
  whatsappEnabled: false,
  orderingEnabled: true,
  enforceHours: false,
  timezone: 'America/Sao_Paulo',
  hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: false, windows: [{ open: '10:00', close: '22:00' }] })),
  fulfillmentModes: ['PICKUP', 'DELIVERY'],
  paymentMethods: ['PIX', 'CARD', 'CASH'],
  deliveryConfig: { mode: 'FIXED', fixedFeeCents: 500 },
  privacyNotice: 'Seus dados são usados apenas para preparar e entregar este pedido. Política final pendente de revisão.',
  status: 'ACTIVE',
};

export const developmentCatalog: CatalogSnapshot = {
  categories: [{ id: 'acai', name: 'Açaí', active: true, displayOrder: 1 }],
  products: [
    {
      id: 'acai-monte-seu', name: 'Monte seu açaí', slug: 'monte-seu-acai', description: 'Escolha o tamanho e combine seus favoritos.', active: true, categoryId: 'acai', productType: 'CUSTOMIZABLE', imageUrl: '/development-acai-placeholder.png', displayOrder: 1,
      sizes: [
        { id: '300ml', label: '300 ml', active: true, basePriceCents: 1400, includedModifiersCount: 3, displayOrder: 1 },
        { id: '500ml', label: '500 ml', active: true, basePriceCents: 1900, includedModifiersCount: 5, displayOrder: 2 },
        { id: '700ml', label: '700 ml', active: true, basePriceCents: 2400, includedModifiersCount: 7, displayOrder: 3 },
      ], modifierGroupIds: ['base', 'frutas', 'complementos', 'coberturas'],
    },
    { id: 'acai-classico', name: 'Açaí clássico', slug: 'acai-classico', description: 'Açaí pronto para pedir sem adicionais.', active: true, categoryId: 'acai', productType: 'SIMPLE', imageUrl: '/development-acai-placeholder.png', displayOrder: 2, sizes: [{ id: 'unico', label: 'Tamanho único', active: true, basePriceCents: 1800, displayOrder: 1 }], modifierGroupIds: [] },
  ],
  groups: [
    { id: 'base', name: 'Base', description: 'Escolha 1', active: true, required: true, minSelections: 1, maxSelections: 1, allowDuplicate: false, displayOrder: 1, pricingMode: 'includedQuota', modifierIds: ['acai-tradicional', 'acai-zero'] },
    { id: 'frutas', name: 'Frutas', description: 'Escolha até 2', active: true, required: false, minSelections: 0, maxSelections: 2, allowDuplicate: false, displayOrder: 2, pricingMode: 'includedQuota', modifierIds: ['banana', 'morango', 'kiwi'] },
    { id: 'complementos', name: 'Complementos', description: 'Os primeiros itens usam a cota do tamanho', active: true, required: false, minSelections: 0, maxSelections: 8, allowDuplicate: true, maxPerModifier: 3, displayOrder: 3, pricingMode: 'includedQuota', modifierIds: ['granola', 'leite-po', 'pacoca', 'nutella'] },
    { id: 'coberturas', name: 'Coberturas', description: 'Escolha até 2', active: true, required: false, minSelections: 0, maxSelections: 2, freeIncludedCount: 1, allowDuplicate: false, displayOrder: 4, pricingMode: 'includedQuota', modifierIds: ['chocolate', 'morango-calda'] },
  ],
  modifiers: [
    { id: 'acai-tradicional', name: 'Açaí tradicional', active: true, available: true, priceCents: 0, premium: false, allergenKeys: [], displayOrder: 1 },
    { id: 'acai-zero', name: 'Açaí zero', active: true, available: true, priceCents: 150, premium: true, allergenKeys: [], displayOrder: 2 },
    { id: 'banana', name: 'Banana', active: true, available: true, priceCents: 200, premium: false, allergenKeys: [], displayOrder: 1 },
    { id: 'morango', name: 'Morango', active: true, available: true, priceCents: 300, premium: false, allergenKeys: [], displayOrder: 2 },
    { id: 'kiwi', name: 'Kiwi', active: true, available: false, priceCents: 350, premium: false, allergenKeys: [], displayOrder: 3 },
    { id: 'granola', name: 'Granola', active: true, available: true, priceCents: 150, premium: false, maxQuantity: 2, allergenKeys: ['glúten'], displayOrder: 1 },
    { id: 'leite-po', name: 'Leite em pó', active: true, available: true, priceCents: 150, premium: false, maxQuantity: 3, allergenKeys: ['leite'], displayOrder: 2 },
    { id: 'pacoca', name: 'Paçoca', active: true, available: true, priceCents: 150, premium: false, maxQuantity: 3, allergenKeys: ['amendoim'], displayOrder: 3 },
    { id: 'nutella', name: 'Creme de avelã', active: true, available: true, priceCents: 400, premium: true, maxQuantity: 2, allergenKeys: ['avelã', 'leite'], displayOrder: 4 },
    { id: 'chocolate', name: 'Calda de chocolate', active: true, available: true, priceCents: 150, premium: false, allergenKeys: [], displayOrder: 1 },
    { id: 'morango-calda', name: 'Calda de morango', active: true, available: true, priceCents: 150, premium: false, allergenKeys: [], displayOrder: 2 },
  ],
};
