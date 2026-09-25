import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection, query, where, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8180').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-acai-mais-sabor', firestore: { host, port: Number(port), rules: readFileSync(resolve('firestore.rules'), 'utf8') } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'products', 'active'), { name: 'Produto ativo', slug: 'produto-ativo', description: 'Descrição', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 1, sizes: [], modifierGroupIds: [] });
    await setDoc(doc(db, 'orders', 'secret'), { status: 'NEW' });
    await setDoc(doc(db, 'users', 'admin-uid'), { role: 'admin' });
    await setDoc(doc(db, 'users', 'staff-uid'), { role: 'staff' });
    await setDoc(doc(db, 'users', 'driver-uid'), { role: 'driver' });
    await setDoc(doc(db, 'users', 'other-driver-uid'), { role: 'driver' });
    await setDoc(doc(db, 'users', 'inactive-driver-uid'), { role: 'driver', active: false });
    await setDoc(doc(db, 'publicOrders', 'customer-tracking-code'), { publicCode: 'customer-tracking-code', status: 'OUT_FOR_DELIVERY', deliveryCode: '4827' });
    await setDoc(doc(db, 'deliveryDrivers', 'driver-uid'), { name: 'Motoboy teste', status: 'AVAILABLE', enabled: true });
    await setDoc(doc(db, 'deliveryDrivers', 'other-driver-uid'), { name: 'Outro motoboy', status: 'AVAILABLE', enabled: true });
    await setDoc(doc(db, 'deliveryDrivers', 'inactive-driver-uid'), { name: 'Motoboy inativo', status: 'OFFLINE', enabled: false });
    await setDoc(doc(db, 'deliveries', 'delivery-own'), { orderId: 'secret', driverId: 'driver-uid', status: 'ASSIGNED', customerName: 'Cliente', address: { street: 'Rua A', number: '1', neighborhood: 'Centro' }, totalCents: 1000 });
    await setDoc(doc(db, 'deliveries', 'delivery-other'), { orderId: 'secret', driverId: 'other-driver-uid', driverIds: ['driver-uid', 'other-driver-uid'], status: 'ASSIGNED', customerName: 'Outro', address: { street: 'Rua B', number: '2', neighborhood: 'Centro' }, totalCents: 1000 });
    await setDoc(doc(db, 'deliveries', 'delivery-inactive'), { orderId: 'secret', driverId: 'inactive-driver-uid', status: 'ASSIGNED', customerName: 'Conta inativa', address: { street: 'Rua C', number: '3', neighborhood: 'Centro' }, totalCents: 1000 });
    await setDoc(doc(db, 'deliveries', 'delivery-history'), { orderId: 'secret', driverId: null, driverIds: ['driver-uid'], status: 'READY_FOR_DELIVERY', customerName: 'Histórico', address: { street: 'Rua D', number: '4', neighborhood: 'Centro' }, totalCents: 1000 });
    await setDoc(doc(db, 'deliveryDrivers', 'driver-uid', 'deliveryHistory', 'delivery-history'), { deliveryId: 'delivery-history', status: 'DRIVER_REJECTED' });
    await setDoc(doc(db, 'deliveryEvents', 'event-own'), { deliveryId: 'delivery-own', type: 'ASSIGNED' });
    await setDoc(doc(db, 'deliveryEvents', 'event-other'), { deliveryId: 'delivery-other', type: 'ASSIGNED' });
    await setDoc(doc(db, 'deliveryEvents', 'event-history'), { deliveryId: 'delivery-history', type: 'REASSIGNED' });
    await setDoc(doc(db, 'financeEntries', 'sensitive'), { kind: 'INCOME', amountCents: 12345, status: 'PAID' });
    await setDoc(doc(db, 'cashRegisters', 'open'), { status: 'OPEN', expectedCashCents: 1000 });
    await setDoc(doc(db, 'cashMovements', 'movement'), { registerId: 'open', type: 'SUPPLY', direction: 'IN', amountCents: 100, cashAmountCents: 100 });
  });
}, 30000);
afterAll(() => env.cleanup());

describe('Firestore Rules deny by default', () => {
  it('público lê catálogo ativo, mas não escreve nem acessa pedidos/usuários', async () => {
    const db = env.unauthenticatedContext().firestore();
    const publicCode = `ATESTEA${Date.now()}`;
    await assertSucceeds(getDoc(doc(db, 'products', 'active')));
    await assertFails(setDoc(doc(db, 'products', 'hacked'), { active: true }));
    await assertFails(getDocs(collection(db, 'orders')));
    await assertFails(getDoc(doc(db, 'orders', 'secret')));
    await assertFails(getDoc(doc(db, 'users', 'admin-uid')));
    await assertFails(getDoc(doc(db, 'integrationConfig', 'saipos')));
    await assertFails(getDocs(collection(db, 'orders', 'secret', 'integrationAttempts')));
    await assertFails(setDoc(doc(db, 'publicOrders', publicCode), { publicCode, status: 'NEW', orderNumber: `#${publicCode}`, items: [{ productId: 'copo', quantity: 1 }], pricing: { totalCents: 1000 }, fulfillment: { mode: 'PICKUP' }, createdAt: Timestamp.now(), updatedAt: Timestamp.now() }));
    await assertSucceeds(getDoc(doc(db, 'publicOrders', 'customer-tracking-code')));
    await assertFails(getDoc(doc(db, 'publicOrders', `${publicCode}-wrong`)));
    await assertFails(getDocs(collection(db, 'publicOrders')));
    await assertFails(setDoc(doc(db, 'publicOrders', publicCode), { publicCode, status: 'NEW', orderNumber: `#${publicCode}`, items: [], pricing: { totalCents: 1 } }));
    await assertFails(setDoc(doc(db, 'orders', `request-${Date.now()}`), { status: 'NEW', pricing: { totalCents: 1 } }));
  });
  it('staff lê pedidos, mas não ganha escrita administrativa', async () => {
    const db = env.authenticatedContext('staff-uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'orders', 'secret')));
    await assertFails(setDoc(doc(db, 'products', 'blocked'), { active: true }));
    await assertFails(setDoc(doc(db, 'users', 'staff-uid'), { role: 'admin' }));
    await assertFails(setDoc(doc(db, 'orders', 'secret'), { status: 'COMPLETED' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'publicOrders', 'staff-forgery'), { status: 'COMPLETED' }));
    await assertFails(setDoc(doc(db, 'cashRegisters', 'open'), { expectedCashCents: 999999 }, { merge: true }));
    await assertFails(setDoc(doc(db, 'cashMovements', 'forged'), { registerId: 'open', type: 'SALE', direction: 'IN', amountCents: 100, cashAmountCents: 100 }));
    await assertFails(setDoc(doc(db, 'financeEntries', 'order-forged'), { kind: 'INCOME', status: 'PAID', sourceOrderId: 'secret', amountCents: 100 }));
  });
  it('entregador só lê seu perfil e suas entregas, sem escrita direta', async () => {
    const db = env.authenticatedContext('driver-uid').firestore();
    await assertSucceeds(getDoc(doc(db, 'deliveryDrivers', 'driver-uid')));
    await assertFails(getDoc(doc(db, 'deliveryDrivers', 'other-driver-uid')));
    await assertFails(getDoc(doc(db, 'users', 'admin-uid')));
    await assertSucceeds(getDoc(doc(db, 'deliveries', 'delivery-own')));
    await assertFails(getDoc(doc(db, 'deliveries', 'delivery-history')));
    await assertSucceeds(getDoc(doc(db, 'deliveryDrivers', 'driver-uid', 'deliveryHistory', 'delivery-history')));
    await assertFails(getDoc(doc(db, 'deliveryDrivers', 'other-driver-uid', 'deliveryHistory', 'delivery-history')));
    await assertFails(getDoc(doc(db, 'deliveries', 'delivery-other')));
    await assertSucceeds(getDoc(doc(db, 'deliveryEvents', 'event-own')));
    await assertFails(getDoc(doc(db, 'deliveryEvents', 'event-other')));
    await assertFails(getDoc(doc(db, 'deliveryEvents', 'event-history')));
    await assertSucceeds(getDocs(query(collection(db, 'deliveries'), where('driverId', '==', 'driver-uid'))));
    await assertFails(setDoc(doc(db, 'deliveries', 'delivery-own'), { status: 'DELIVERED' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'deliveryDrivers', 'driver-uid'), { status: 'BUSY' }, { merge: true }));
    await assertFails(getDoc(doc(db, 'deliverySecrets', 'delivery-own')));
    await assertFails(getDoc(doc(db, 'publicOrders', 'customer-tracking-code')));
    await assertFails(getDoc(doc(db, 'financeEntries', 'sensitive')));
    await assertFails(getDoc(doc(db, 'cashRegisters', 'open')));
    await assertFails(getDoc(doc(db, 'cashMovements', 'movement')));
    await assertFails(setDoc(doc(db, 'users', 'driver-uid'), { role: 'admin' }, { merge: true }));
  });
  it('conta desativada perde acesso Firestore mesmo com sessão ainda válida', async () => {
    const db = env.authenticatedContext('inactive-driver-uid').firestore();
    await assertFails(getDoc(doc(db, 'deliveryDrivers', 'inactive-driver-uid')));
    await assertFails(getDoc(doc(db, 'deliveries', 'delivery-inactive')));
    await assertFails(getDoc(doc(db, 'orders', 'secret')));
  });
  it('acompanhamento público funciona sem sessão, mas link não expõe código a sessão de entregador', async () => {
    const anonymousDb = env.unauthenticatedContext().firestore();
    const driverDb = env.authenticatedContext('driver-uid').firestore();
    const trackingRef = doc(anonymousDb, 'publicOrders', 'customer-tracking-code');
    await assertSucceeds(getDoc(trackingRef));
    await assertFails(getDoc(doc(driverDb, 'publicOrders', 'customer-tracking-code')));
    await assertFails(getDocs(collection(driverDb, 'publicOrders')));
  });
  it('admin pode editar catálogo e configuração, mas operações financeiras passam pelo backend', async () => {
    const db = env.authenticatedContext('admin-uid').firestore();
    await assertSucceeds(setDoc(doc(db, 'products', 'new'), { name: 'Produto novo', slug: 'produto-novo', description: 'Descrição', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 2, sizes: [], modifierGroupIds: [] }));
    await assertSucceeds(setDoc(doc(db, 'storePublicConfig', 'main'), { orderingEnabled: true }));
    await assertFails(setDoc(doc(db, 'orders', 'bypass'), { status: 'COMPLETED' }));
    await assertFails(setDoc(doc(db, 'publicOrders', 'admin-forgery'), { status: 'NEW' }));
    await assertFails(setDoc(doc(db, 'financeEntries', 'manual'), { kind: 'EXPENSE', category: 'Insumos', amountCents: 1200 }));
    await assertFails(setDoc(doc(db, 'cashControl', 'main'), { openRegisterId: 'fake' }));
    await assertFails(setDoc(doc(db, 'cashRegisters', 'open'), { status: 'OPEN' }));
    await assertFails(setDoc(doc(db, 'cashMovements', 'fake-sale'), { amountCents: 1, sourceOrderId: 'bypass' }));
    await assertFails(setDoc(doc(db, 'users', 'staff-uid'), { role: 'admin' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'deliveryDrivers', 'driver-uid'), { status: 'AVAILABLE' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'integrationConfig', 'saipos'), { mappings: {} }));
  });
});
