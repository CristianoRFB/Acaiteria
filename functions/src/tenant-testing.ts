import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Role } from '../../shared/domain.js';

export const TEST_TENANT_ID = 'acai-mais-sabor';
export const TEST_TENANT_SLUG = 'acai-mais-sabor';
export const TEST_TENANT_B_ID = 'amora-acai-demo';
export const TEST_TENANT_B_SLUG = 'amora-acai-demo';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const rawDb = getFirestore();

function testPath(path: string): string {
  if (/^(users|tenants|tenantSlugs)\//.test(path)) return path;
  return `tenants/${TEST_TENANT_ID}/${path}`;
}

export const testDb = new Proxy(rawDb, {
  get(target, property) {
    if (property === 'doc') return (path: string) => target.doc(testPath(path));
    if (property === 'collection') return (path: string) => target.collection(testPath(path));
    return Reflect.get(target, property, target) as unknown;
  },
}) as Firestore;

export async function ensureTestTenant() {
  await Promise.all([
    rawDb.doc(`tenantSlugs/${TEST_TENANT_SLUG}`).set({ tenantId: TEST_TENANT_ID }),
    rawDb.doc(`tenants/${TEST_TENANT_ID}`).set({
      slug: TEST_TENANT_SLUG,
      displayName: 'QA Açaí',
      status: 'ACTIVE',
      branding: { primaryColor: '#82204f', secondaryColor: '#d7f04a' },
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
    }, { merge: true }),
    rawDb.doc(`tenantSlugs/${TEST_TENANT_B_SLUG}`).set({ tenantId: TEST_TENANT_B_ID }),
    rawDb.doc(`tenants/${TEST_TENANT_B_ID}`).set({
      slug: TEST_TENANT_B_SLUG,
      displayName: 'QA Amora',
      status: 'ACTIVE',
      branding: { primaryColor: '#5634a5', secondaryColor: '#ffb6c9' },
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
    }, { merge: true }),
    rawDb.doc(`tenants/${TEST_TENANT_B_ID}/settings/public`).set({
      storeName: 'QA Amora',
      whatsappEnabled: false,
      orderingEnabled: true,
      enforceHours: false,
      timezone: 'America/Sao_Paulo',
      hours: [],
      fulfillmentModes: ['PICKUP'],
      paymentMethods: ['PIX'],
      deliveryConfig: { mode: 'NONE' },
      status: 'ACTIVE',
    }, { merge: true }),
    rawDb.doc(`tenants/${TEST_TENANT_B_ID}/products/simple`).set({
      name: 'Açaí Amora',
      slug: 'acai-amora',
      description: 'Produto de teste do estabelecimento B',
      active: true,
      categoryId: 'acai',
      productType: 'SIMPLE',
      displayOrder: 1,
      sizes: [{ id: 'unico', label: 'Único', active: true, basePriceCents: 2500, displayOrder: 1 }],
      modifierGroupIds: [],
    }, { merge: true }),
  ]);
}

export async function seedTenantMember(uid: string, role: Role, active = true, profile: Record<string, unknown> = {}) {
  await Promise.all([
    rawDb.doc(`users/${uid}`).set({ active, ...profile }, { merge: true }),
    rawDb.doc(`tenants/${TEST_TENANT_ID}/members/${uid}`).set({
      userId: uid,
      tenantId: TEST_TENANT_ID,
      role,
      status: 'ACTIVE',
    }, { merge: true }),
  ]);
}

export function tenantPayload<T>(data: T): T extends undefined ? { tenantSlug: string } : T & { tenantSlug: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { tenantSlug: TEST_TENANT_SLUG } as T extends undefined ? { tenantSlug: string } : T & { tenantSlug: string };
  }
  const source = data as Record<string, unknown>;
  return { ...source, tenantSlug: typeof source.tenantSlug === 'string' ? source.tenantSlug : TEST_TENANT_SLUG } as T extends undefined ? { tenantSlug: string } : T & { tenantSlug: string };
}
