import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Seed bloqueado: FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST são obrigatórios. Nunca execute este script contra produção.');
}
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const db = getFirestore();

const config = {
  storeName: 'Açaí + Sabor', instagramHandle: '@acaimaissabor.stafedosul', address: 'Endereço pendente de confirmação', city: 'Santa Fé do Sul/SP', whatsappEnabled: false, orderingEnabled: true, pauseMessage: '', enforceHours: false, timezone: 'America/Sao_Paulo', hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: false, windows: [{ open: '10:00', close: '22:00' }] })), fulfillmentModes: ['PICKUP', 'DELIVERY'], paymentMethods: ['PIX', 'CARD', 'CASH'], deliveryConfig: { mode: 'FIXED', fixedFeeCents: 500 }, privacyNotice: 'Dados usados apenas para atender o pedido. Texto final pendente de revisão.', status: 'ACTIVE', updatedAt: Timestamp.now(), developmentSeed: true,
};
const products = {
  'acai-monte-seu': { name: 'Monte seu açaí', slug: 'monte-seu-acai', description: 'Escolha o tamanho e combine seus favoritos.', active: true, categoryId: 'acai', productType: 'CUSTOMIZABLE', imageUrl: '/development-acai-placeholder.png', displayOrder: 1, sizes: [{ id: '300ml', label: '300 ml', active: true, basePriceCents: 1400, includedModifiersCount: 3, displayOrder: 1 }, { id: '500ml', label: '500 ml', active: true, basePriceCents: 1900, includedModifiersCount: 5, displayOrder: 2 }, { id: '700ml', label: '700 ml', active: true, basePriceCents: 2400, includedModifiersCount: 7, displayOrder: 3 }], modifierGroupIds: ['base', 'frutas', 'complementos', 'coberturas'], updatedAt: Timestamp.now(), developmentSeed: true },
  'acai-classico': { name: 'Açaí clássico', slug: 'acai-classico', description: 'Açaí pronto para pedir sem adicionais.', active: true, categoryId: 'acai', productType: 'SIMPLE', imageUrl: '/development-acai-placeholder.png', displayOrder: 2, sizes: [{ id: 'unico', label: 'Tamanho único', active: true, basePriceCents: 1800, displayOrder: 1 }], modifierGroupIds: [], updatedAt: Timestamp.now(), developmentSeed: true },
};
const groups = {
  base: { name: 'Base', description: 'Escolha 1', active: true, required: true, minSelections: 1, maxSelections: 1, allowDuplicate: false, displayOrder: 1, pricingMode: 'includedQuota', modifierIds: ['acai-tradicional', 'acai-zero'] },
  frutas: { name: 'Frutas', description: 'Escolha até 2', active: true, required: false, minSelections: 0, maxSelections: 2, allowDuplicate: false, displayOrder: 2, pricingMode: 'includedQuota', modifierIds: ['banana', 'morango', 'kiwi'] },
  complementos: { name: 'Complementos', description: 'Os primeiros itens usam a cota do tamanho', active: true, required: false, minSelections: 0, maxSelections: 8, allowDuplicate: true, maxPerModifier: 3, displayOrder: 3, pricingMode: 'includedQuota', modifierIds: ['granola', 'leite-po', 'pacoca', 'nutella'] },
  coberturas: { name: 'Coberturas', description: 'Escolha até 2', active: true, required: false, minSelections: 0, maxSelections: 2, freeIncludedCount: 1, allowDuplicate: false, displayOrder: 4, pricingMode: 'includedQuota', modifierIds: ['chocolate', 'morango-calda'] },
};
const modifier = (name, priceCents, premium = false, available = true, displayOrder = 1, extra = {}) => ({ name, active: true, available, priceCents, premium, allergenKeys: [], displayOrder, updatedAt: Timestamp.now(), developmentSeed: true, ...extra });
const modifiers = {
  'acai-tradicional': modifier('Açaí tradicional', 0), 'acai-zero': modifier('Açaí zero', 150, true, true, 2), banana: modifier('Banana', 200), morango: modifier('Morango', 300, false, true, 2), kiwi: modifier('Kiwi', 350, false, false, 3), granola: modifier('Granola', 150, false, true, 1, { maxQuantity: 2, allergenKeys: ['glúten'] }), 'leite-po': modifier('Leite em pó', 150, false, true, 2, { maxQuantity: 3, allergenKeys: ['leite'] }), pacoca: modifier('Paçoca', 150, false, true, 3, { maxQuantity: 3, allergenKeys: ['amendoim'] }), nutella: modifier('Creme de avelã', 400, true, true, 4, { maxQuantity: 2, allergenKeys: ['avelã', 'leite'] }), chocolate: modifier('Calda de chocolate', 150), 'morango-calda': modifier('Calda de morango', 150, false, true, 2),
};

const batch = db.batch();
batch.set(db.doc('storePublicConfig/main'), config);
batch.set(db.doc('categories/acai'), { name: 'Açaí', active: true, displayOrder: 1, developmentSeed: true });
for (const [id, value] of Object.entries(products)) batch.set(db.doc(`products/${id}`), value);
for (const [id, value] of Object.entries(groups)) batch.set(db.doc(`modifierGroups/${id}`), { ...value, developmentSeed: true });
for (const [id, value] of Object.entries(modifiers)) batch.set(db.doc(`modifiers/${id}`), value);
await batch.commit();

if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
  let user;
  try { user = await getAuth().getUserByEmail(process.env.SEED_ADMIN_EMAIL); } catch { user = await getAuth().createUser({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD, emailVerified: true }); }
  await db.doc(`users/${user.uid}`).set({ role: 'admin', email: process.env.SEED_ADMIN_EMAIL, developmentSeed: true });
  process.stdout.write('Seed de desenvolvimento criado, incluindo usuário admin informado por ambiente.\n');
} else {
  process.stdout.write('Seed de desenvolvimento criado. Admin omitido: defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD para criá-lo no emulador.\n');
}
