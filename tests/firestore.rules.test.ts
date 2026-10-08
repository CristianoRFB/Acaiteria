import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const tenantA = 'acai-mais-sabor';
const tenantB = 'amora-acai-demo';

function tenantDoc(db: unknown, tenantId: string, ...segments: string[]) {
  return doc(db as never, `tenants/${tenantId}/${segments.join('/')}`);
}

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-acai-mais-sabor', firestore: { host, port: Number(port), rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants', tenantA), { slug: tenantA, displayName: 'Açaí + Sabor', status: 'ACTIVE', branding: { primaryColor: '#82204f', secondaryColor: '#d7f04a' }, locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL' });
    await setDoc(doc(db, 'tenants', tenantB), { slug: tenantB, displayName: 'Amora Demo', status: 'ACTIVE', branding: { primaryColor: '#5634a5', secondaryColor: '#ffb6c9' }, locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL' });
    await setDoc(doc(db, 'tenants/suspended-demo'), { slug: 'suspended-demo', displayName: 'Suspenso', status: 'SUSPENDED', branding: { primaryColor: '#111111', secondaryColor: '#eeeeee' }, locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL' });
    await setDoc(doc(db, `tenantSlugs/${tenantA}`), { tenantId: tenantA });
    await setDoc(doc(db, `tenantSlugs/${tenantB}`), { tenantId: tenantB });
    await setDoc(doc(db, 'tenantSlugs/suspended-demo'), { tenantId: 'suspended-demo' });

    for (const [uid, platformRole] of [['platform-uid', 'platform_owner']] as const) {
      await setDoc(doc(db, `users/${uid}`), { active: true, platformRole });
    }
    for (const uid of ['owner-a', 'staff-a', 'driver-a', 'owner-b', 'driver-b', 'inactive-a']) {
      await setDoc(doc(db, `users/${uid}`), { active: uid !== 'inactive-a' });
    }
    const memberships: Array<[string, string, string]> = [
      [tenantA, 'owner-a', 'tenant_owner'], [tenantA, 'staff-a', 'staff'], [tenantA, 'driver-a', 'driver'],
      [tenantA, 'inactive-a', 'staff'], [tenantB, 'owner-b', 'tenant_owner'], [tenantB, 'driver-b', 'driver'],
    ];
    for (const [tenantId, uid, role] of memberships) {
      await setDoc(doc(db, `tenants/${tenantId}/members/${uid}`), { userId: uid, tenantId, role, status: 'ACTIVE' });
    }

    const product = (name: string) => ({ name, slug: name.toLowerCase().replaceAll(' ', '-'), description: 'Produto de teste', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 1, sizes: [], modifierGroupIds: [] });
    await setDoc(doc(db, `tenants/${tenantA}/products/acai`), product('Açaí A'));
    await setDoc(doc(db, `tenants/${tenantB}/products/acai`), product('Açaí B'));
    await setDoc(doc(db, `tenants/${tenantA}/settings/public`), { storeName: 'Açaí + Sabor', orderingEnabled: true });
    await setDoc(doc(db, `tenants/${tenantB}/settings/public`), { storeName: 'Amora Demo', orderingEnabled: true });
    await setDoc(doc(db, `tenants/${tenantA}/orders/order-a`), { status: 'NEW', tenantId: tenantA });
    await setDoc(doc(db, `tenants/${tenantB}/orders/order-b`), { status: 'NEW', tenantId: tenantB });
    await setDoc(doc(db, `tenants/${tenantA}/publicOrders/public-code-a`), { publicCode: 'public-code-a', status: 'OUT_FOR_DELIVERY', deliveryCode: '4827' });
    await setDoc(doc(db, `tenants/${tenantB}/publicOrders/public-code-b`), { publicCode: 'public-code-b', status: 'NEW' });
    await setDoc(doc(db, `tenants/${tenantA}/deliveryDrivers/driver-a`), { name: 'Motoboy A', enabled: true, status: 'AVAILABLE' });
    await setDoc(doc(db, `tenants/${tenantB}/deliveryDrivers/driver-b`), { name: 'Motoboy B', enabled: true, status: 'AVAILABLE' });
    await setDoc(doc(db, `tenants/${tenantA}/deliveries/delivery-a`), { orderId: 'order-a', driverId: 'driver-a', status: 'ASSIGNED' });
    await setDoc(doc(db, `tenants/${tenantB}/deliveries/delivery-b`), { orderId: 'order-b', driverId: 'driver-b', status: 'ASSIGNED' });
    await setDoc(doc(db, `tenants/${tenantA}/deliveryEvents/event-a`), { deliveryId: 'delivery-a', type: 'ASSIGNED' });
    await setDoc(doc(db, `tenants/${tenantB}/deliveryEvents/event-b`), { deliveryId: 'delivery-b', type: 'ASSIGNED' });
    await setDoc(doc(db, `tenants/${tenantA}/deliverySecrets/delivery-a`), { codeHash: 'secret' });
    await setDoc(doc(db, `tenants/${tenantA}/financeEntries/sale-a`), { amountCents: 12345, status: 'PAID' });
    await setDoc(doc(db, `tenants/${tenantB}/financeEntries/sale-b`), { amountCents: 99999, status: 'PAID' });
    await setDoc(doc(db, `tenants/${tenantA}/cashRegisters/open-a`), { status: 'OPEN', expectedCashCents: 1000 });
    await setDoc(doc(db, `tenants/${tenantB}/cashRegisters/open-b`), { status: 'OPEN', expectedCashCents: 9000 });
    await setDoc(doc(db, `tenants/${tenantA}/cashMovements/movement-a`), { registerId: 'open-a', type: 'SUPPLY', direction: 'IN', amountCents: 100, cashAmountCents: 100 });
    await setDoc(doc(db, 'platformAuditLogs/audit-a'), { action: 'TENANT_CREATED', tenantId: tenantA, actorUid: 'platform-uid' });
    await setDoc(doc(db, 'products/legacy-global'), { active: true });
  });
}, 30000);

afterAll(async () => { if (env) await env.cleanup(); });

describe('tenant-aware Firestore Rules', () => {
  it('public users resolve public tenant metadata and read only tenant-scoped active catalog', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, `tenantSlugs/${tenantA}`)));
    await assertFails(getDocs(collection(db, 'tenantSlugs')));
    await assertSucceeds(getDoc(doc(db, `tenants/${tenantA}`)));
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'products/acai')));
    await assertSucceeds(getDoc(tenantDoc(db, tenantB, 'products/acai')));
    await assertFails(getDoc(doc(db, 'products/legacy-global')));
    await assertFails(getDoc(tenantDoc(db, tenantA, 'orders/order-a')));
    await assertFails(setDoc(tenantDoc(db, tenantA, 'orders/forged'), { status: 'COMPLETED' }));
  });

  it('tenant owner A manages only A and cannot promote itself or access B', async () => {
    const db = env.authenticatedContext('owner-a').firestore();
    const validProduct = { name: 'Produto novo', slug: 'produto-novo', description: 'Descrição', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 2, sizes: [], modifierGroupIds: [] };
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'orders/order-a')));
    await assertSucceeds(setDoc(tenantDoc(db, tenantA, 'products/new'), validProduct));
    await assertSucceeds(setDoc(tenantDoc(db, tenantA, 'settings/public'), { storeName: 'Loja atualizada' }));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'orders/order-b')));
    // The public menu configuration can be read by customers, but an owner from A cannot change B.
    await assertSucceeds(getDoc(tenantDoc(db, tenantB, 'settings/public')));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'settings/private')));
    await assertFails(setDoc(tenantDoc(db, tenantB, 'products/hacked'), validProduct));
    await assertFails(setDoc(doc(db, 'tenants', tenantB), { status: 'SUSPENDED' }, { merge: true }));
    await assertFails(setDoc(doc(db, `tenants/${tenantA}/members/owner-a`), { role: 'platform_owner' }, { merge: true }));
    await assertFails(getDoc(doc(db, 'products/legacy-global')));
  });

  it('staff A reads operational and financial data for A but never B or admin-only settings', async () => {
    const db = env.authenticatedContext('staff-a').firestore();
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'orders/order-a')));
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'financeEntries/sale-a')));
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'cashRegisters/open-a')));
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'cashMovements/movement-a')));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'financeEntries/sale-b')));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'orders/order-b')));
    await assertFails(setDoc(tenantDoc(db, tenantA, 'cashRegisters/open-a'), { expectedCashCents: 999999 }, { merge: true }));
    await assertFails(setDoc(tenantDoc(db, tenantA, 'financeEntries/forged'), { amountCents: 1 }));
    await assertFails(setDoc(tenantDoc(db, tenantA, 'settings/private'), { secret: true }));
  });

  it('driver A reads only its own tenant profile, delivery, event, and history', async () => {
    const db = env.authenticatedContext('driver-a').firestore();
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'deliveryDrivers/driver-a')));
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'deliveries/delivery-a')));
    await assertSucceeds(getDoc(tenantDoc(db, tenantA, 'deliveryEvents/event-a')));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'deliveryDrivers/driver-b')));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'deliveries/delivery-b')));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'deliveryEvents/event-b')));
    await assertFails(getDoc(tenantDoc(db, tenantA, 'deliverySecrets/delivery-a')));
    await assertFails(getDoc(tenantDoc(db, tenantA, 'financeEntries/sale-a')));
    await assertFails(setDoc(tenantDoc(db, tenantA, 'deliveries/delivery-a'), { status: 'DELIVERED' }, { merge: true }));
    await assertFails(getDoc(tenantDoc(db, tenantB, 'orders/order-b')));
  });

  it('membership from B does not authorize A and a missing membership grants no tenant access', async () => {
    const ownerB = env.authenticatedContext('owner-b').firestore();
    const noMembership = env.authenticatedContext('unassigned-user').firestore();
    await assertSucceeds(getDoc(tenantDoc(ownerB, tenantB, 'orders/order-b')));
    await assertFails(getDoc(tenantDoc(ownerB, tenantA, 'orders/order-a')));
    await assertFails(getDoc(tenantDoc(noMembership, tenantA, 'orders/order-a')));
    // Active catalog is intentionally public; private operational data above remains membership-gated.
    await assertSucceeds(getDoc(tenantDoc(noMembership, tenantA, 'products/acai')));
  });

  it('suspended tenant metadata is explicit while operational data is blocked', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'tenants/suspended-demo')));
    await assertFails(getDoc(tenantDoc(db, 'suspended-demo', 'products/acai')));
    const member = env.authenticatedContext('owner-a').firestore();
    await assertFails(getDoc(tenantDoc(member, 'suspended-demo', 'orders/order-a')));
  });

  it('public tracking is scoped, non-enumerable, and delivery secrets stay private', async () => {
    const anonymous = env.unauthenticatedContext().firestore();
    const driver = env.authenticatedContext('driver-a').firestore();
    await assertSucceeds(getDoc(tenantDoc(anonymous, tenantA, 'publicOrders/public-code-a')));
    await assertFails(getDoc(tenantDoc(anonymous, tenantB, 'publicOrders/public-code-a')));
    await assertFails(getDocs(collection(anonymous, `tenants/${tenantA}/publicOrders`)));
    await assertFails(getDoc(tenantDoc(driver, tenantA, 'publicOrders/public-code-a')));
    await assertFails(getDoc(tenantDoc(anonymous, tenantA, 'deliverySecrets/delivery-a')));
  });

  it('platform owner can inspect global tenant registry but still needs membership for operations', async () => {
    const db = env.authenticatedContext('platform-uid').firestore();
    await assertSucceeds(getDocs(collection(db, 'tenants')));
    await assertSucceeds(getDoc(doc(db, 'users', 'owner-a')));
    await assertSucceeds(getDoc(doc(db, 'platformAuditLogs/audit-a')));
    await assertSucceeds(getDocs(collection(db, 'platformAuditLogs')));
    await assertFails(getDoc(tenantDoc(db, tenantA, 'orders/order-a')));
    await assertFails(setDoc(doc(db, 'users', 'owner-a'), { active: false }));
    await assertFails(setDoc(doc(db, 'platformAuditLogs/forged'), { action: 'TENANT_CREATED' }));
  });

  it('tenant admins and staff cannot inspect or forge global platform audit logs', async () => {
    const owner = env.authenticatedContext('owner-a').firestore();
    const staff = env.authenticatedContext('staff-a').firestore();
    await assertFails(getDoc(doc(owner, 'platformAuditLogs/audit-a')));
    await assertFails(getDocs(collection(staff, 'platformAuditLogs')));
    await assertFails(setDoc(doc(owner, 'platformAuditLogs/forged'), { action: 'TENANT_SUSPENDED' }));
  });

  it('an inactive identity and client writes to identity/membership are denied', async () => {
    const db = env.authenticatedContext('inactive-a').firestore();
    await assertFails(getDoc(tenantDoc(db, tenantA, 'orders/order-a')));
    await assertFails(getDoc(tenantDoc(db, tenantA, 'members/inactive-a')));
    await assertFails(setDoc(doc(db, 'users', 'inactive-a'), { active: true }, { merge: true }));
    await assertFails(setDoc(tenantDoc(db, tenantA, 'members/inactive-a'), { role: 'tenant_owner' }, { merge: true }));
  });

  it('tenant-scoped queries must carry constraints that the rules can prove', async () => {
    const publicDb = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(query(collection(publicDb, `tenants/${tenantA}/products`), where('active', '==', true))));
    await assertFails(getDocs(collection(publicDb, `tenants/${tenantA}/products`)));
  });
});
