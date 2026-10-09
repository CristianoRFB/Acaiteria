import { randomBytes } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { menuCatalog, storePublicConfigSeed } from '../../shared/menu-data.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Seed bloqueado: FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST são obrigatórios. Nunca execute este script contra produção.');
}

const projectId = process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor';
if (!projectId.startsWith('demo-')) throw new Error('Seed bloqueado: use somente um projeto Firebase Emulator demo-.');
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();
const now = Timestamp.now();

const tenants = [
  {
    id: 'acai-mais-sabor',
    slug: 'acai-mais-sabor',
    displayName: 'Açaí + Sabor',
    branding: { primaryColor: '#82204f', secondaryColor: '#d7f04a', logoUrl: '/logo-acai-sabor.jpg' },
    config: { ...storePublicConfigSeed, updatedAt: now, developmentSeed: true },
    catalog: menuCatalog,
  },
  {
    id: 'amora-acai-demo',
    slug: 'amora-acai-demo',
    displayName: 'Amora Açaí — Demonstração',
    branding: { primaryColor: '#5634a5', secondaryColor: '#ffb6c9' },
    config: {
      storeName: 'Amora Açaí — Demonstração',
      instagramHandle: '',
      address: 'Endereço fictício de demonstração',
      city: 'Local de demonstração',
      phoneDisplay: '',
      whatsappNumber: '',
      whatsappEnabled: false,
      orderingEnabled: true,
      pauseMessage: 'A loja de demonstração não está recebendo pedidos agora.',
      enforceHours: false,
      timezone: 'America/Sao_Paulo',
      hours: storePublicConfigSeed.hours,
      holidayDates: [],
      holidayHours: storePublicConfigSeed.holidayHours,
      fulfillmentModes: ['PICKUP', 'DELIVERY'],
      paymentMethods: ['PIX', 'CARD', 'CASH'],
      deliveryConfig: { mode: 'FIXED', fixedFeeCents: 500 },
      orderInstructions: 'Este é um fluxo fictício de demonstração; não informe dados reais.',
      deliveryEstimate: 'Prazo fictício para validar a loja de demonstração.',
      busyDeliveryEstimate: 'Prazo fictício em períodos de demonstração movimentados.',
      orderEstimateMinutes: 15,
      holidayHoursNote: 'Horário fictício da loja de demonstração.',
      gratitudeMessage: 'Obrigado por testar a loja de demonstração.',
      privacyNotice: 'Use somente dados fictícios nesta demonstração.',
      status: 'ACTIVE',
      updatedAt: now,
      developmentSeed: true,
    },
    catalog: createDemoCatalog(menuCatalog),
  },
];

for (const tenant of tenants) {
  const metadata = {
    slug: tenant.slug,
    displayName: tenant.displayName,
    status: 'ACTIVE',
    branding: tenant.branding,
    locale: 'pt-BR',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    createdAt: now,
    updatedAt: now,
  };
  const batch = db.batch();
  batch.set(db.doc(`tenantSlugs/${tenant.slug}`), { tenantId: tenant.id, createdAt: now }, { merge: true });
  batch.set(db.doc(`tenants/${tenant.id}`), metadata, { merge: true });
  batch.set(db.doc(`tenants/${tenant.id}/settings/public`), tenant.config, { merge: true });
  for (const name of ['categories', 'products', 'modifierGroups', 'modifiers', 'promotions']) {
    for (const item of tenant.catalog[name] ?? []) {
      const { id, ...data } = item;
      batch.set(db.doc(`tenants/${tenant.id}/${name}/${id}`), { ...data, ...(name === 'products' || name === 'modifiers' ? { updatedAt: now } : {}), developmentSeed: true }, { merge: true });
    }
  }
  await batch.commit();
}

async function createOrFindUser(email, password, displayName) {
  try { return await auth.getUserByEmail(email); }
  catch {
    return auth.createUser({ email, password, displayName, emailVerified: true });
  }
}

async function writeIdentityAndMembership(user, tenantId, role) {
  const batch = db.batch();
  batch.set(db.doc(`users/${user.uid}`), {
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    active: true,
    updatedAt: now,
    developmentSeed: true,
  }, { merge: true });
  batch.set(db.doc(`tenants/${tenantId}/members/${user.uid}`), {
    userId: user.uid,
    tenantId,
    role,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    developmentSeed: true,
  }, { merge: true });
  await batch.commit();
  return user;
}

if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
  const admin = await createOrFindUser(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, 'Responsável Açaí + Sabor');
  await writeIdentityAndMembership(admin, 'acai-mais-sabor', 'tenant_owner');
}

const demoOwner = await createOrFindUser(
  'owner@amora-acai.test',
  randomBytes(24).toString('base64url'),
  'Responsável de demonstração Amora Açaí',
);
await writeIdentityAndMembership(demoOwner, 'amora-acai-demo', 'tenant_owner');

const demoDriver = await createOrFindUser(
  process.env.SEED_DEMO_DRIVER_EMAIL ?? 'driver@amora-acai.test',
  process.env.SEED_DEMO_DRIVER_PASSWORD ?? randomBytes(24).toString('base64url'),
  'Entregador de demonstração Amora Açaí',
);
if (process.env.SEED_DEMO_DRIVER_PASSWORD) {
  await auth.updateUser(demoDriver.uid, { password: process.env.SEED_DEMO_DRIVER_PASSWORD });
}
await writeIdentityAndMembership(demoDriver, 'amora-acai-demo', 'driver');
await db.doc(`tenants/amora-acai-demo/deliveryDrivers/${demoDriver.uid}`).set({
  name: 'Entregador Amora Demo',
  email: demoDriver.email,
  phone: '(00) 00000-0000',
  enabled: true,
  status: 'AVAILABLE',
  currentDeliveryId: null,
  createdAt: now,
  updatedAt: now,
  developmentSeed: true,
});

if (process.env.SEED_PLATFORM_OWNER_EMAIL && process.env.SEED_PLATFORM_OWNER_PASSWORD) {
  const owner = await createOrFindUser(process.env.SEED_PLATFORM_OWNER_EMAIL, process.env.SEED_PLATFORM_OWNER_PASSWORD, 'Platform Owner (emulador)');
  await db.doc(`users/${owner.uid}`).set({ platformRole: 'platform_owner', active: true, updatedAt: now, developmentSeed: true }, { merge: true });
}

process.stdout.write('Emulador preparado com Tenant A preservando seu catálogo de referência, Tenant B independente, memberships tenant-aware e nenhum dado de clientes copiado.\n');
process.stdout.write('Para provisionar logins do Tenant A e Platform Owner, informe as variáveis SEED_ADMIN_* e SEED_PLATFORM_OWNER_* ao executar o seed.\n');

function createDemoCatalog(source) {
  const categoryId = (id) => `amora-${id}`;
  const productId = (id) => `amora-${id}`;
  const groupId = (id) => `amora-${id}`;
  const modifierId = (id) => `amora-${id}`;
  const sizeId = (id) => `amora-${id}`;
  return {
    categories: source.categories.map((item) => ({ ...item, id: categoryId(item.id), name: `Amora • ${item.name}` })),
    products: source.products.map((item) => ({
      ...item,
      id: productId(item.id),
      name: `Amora ${item.name}`,
      slug: `amora-${item.slug}`,
      description: `Item demonstrativo de Amora Açaí: ${item.description}`,
      categoryId: categoryId(item.categoryId),
      modifierGroupIds: item.modifierGroupIds.map(groupId),
      sizes: item.sizes.map((size) => ({ ...size, id: sizeId(size.id), basePriceCents: size.basePriceCents + 150 })),
    })),
    groups: source.groups.map((item) => ({
      ...item,
      id: groupId(item.id),
      name: `Amora • ${item.name}`,
      modifierIds: item.modifierIds.map(modifierId),
      ...(item.appliesToSizeIds ? { appliesToSizeIds: item.appliesToSizeIds.map(sizeId) } : {}),
    })),
    modifiers: source.modifiers.map((item) => ({
      ...item,
      id: modifierId(item.id),
      name: `Amora • ${item.name}`,
      priceCents: item.priceCents + 50,
    })),
    promotions: [],
  };
}
