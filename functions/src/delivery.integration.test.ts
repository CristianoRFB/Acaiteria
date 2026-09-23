import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const auth = getAuth();
const db = getFirestore();
const projectId = process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor';
const functionsEndpoint = `http://127.0.0.1:5001/${projectId}/southamerica-east1`;
const authEndpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';
const testPassword = 'Motoboy-Teste-2026!';
let adminToken = '';
let driverToken = '';
let driverUid = '';

async function createSignedInUser(role: 'admin' | 'driver', email: string) {
  const user = await auth.createUser({ email, password: testPassword, displayName: role });
  await db.doc(`users/${user.uid}`).set({ role, active: true, name: role, email });
  if (role === 'driver') await db.doc(`deliveryDrivers/${user.uid}`).set({ userId: user.uid, name: role, email, phone: '17999999999', status: 'BUSY', enabled: true });
  const response = await fetch(authEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: testPassword, returnSecureToken: true }) });
  const result = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !result.idToken) throw new Error(result.error?.message ?? 'Não foi possível iniciar a sessão do emulador.');
  return { uid: user.uid, token: result.idToken };
}

async function call(name: string, token: string, data: unknown) {
  const response = await fetch(`${functionsEndpoint}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: { status?: string; message?: string } } };
}

async function createArrivedCashDelivery(driverId: string) {
  const deliveryId = `delivery-${randomUUID()}`;
  const orderId = `order-${randomUUID()}`;
  const registerId = `register-${randomUUID()}`;
  const publicCode = `public-${randomUUID()}`;
  const code = '4827';
  await db.doc(`orders/${orderId}`).set({ status: 'OUT_FOR_DELIVERY', orderNumber: '#QA-1', publicCode, fulfillment: { mode: 'DELIVERY' }, pricing: { totalCents: 2450 }, payment: { method: 'CASH' }, customer: { name: 'Cliente teste' }, updatedAt: new Date() });
  await db.doc(`publicOrders/${publicCode}`).set({ publicCode, orderNumber: '#QA-1', status: 'OUT_FOR_DELIVERY', deliveryStatus: 'ARRIVED' });
  await db.doc(`deliveries/${deliveryId}`).set({ orderId, orderNumber: '#QA-1', driverId, driverIds: [driverId], status: 'ARRIVED', customerName: 'Cliente teste', totalCents: 2450 });
  await db.doc(`deliverySecrets/${deliveryId}`).set({ deliveryId, codeHash: createHash('sha256').update(code).digest('hex'), failedCodeAttempts: 0, failedCodeWindowStartedAtMs: Date.now(), failedCodeLockedUntilMs: 0 });
  await db.doc(`deliveryDrivers/${driverId}`).update({ status: 'BUSY', currentDeliveryId: deliveryId });
  await db.doc(`cashRegisters/${registerId}`).set({ status: 'OPEN', expectedCashCents: 1000, initialBalanceCents: 1000 });
  await db.doc('cashControl/main').set({ openRegisterId: registerId });
  return { deliveryId, orderId, registerId, publicCode, code };
}

beforeAll(async () => {
  const suffix = randomUUID();
  const [admin, driver] = await Promise.all([
    createSignedInUser('admin', `qa-admin-${suffix}@example.test`),
    createSignedInUser('driver', `qa-driver-${suffix}@example.test`),
  ]);
  adminToken = admin.token;
  driverToken = driver.token;
  driverUid = driver.uid;
  process.env.FUNCTIONS_EMULATOR = 'true';
});

describe('delivery operations in Firebase Emulator Suite', () => {
  it('persists wrong-code attempts, rate-limits after five tries, and never completes the order', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    const offline = await call('setDriverAvailability', driverToken, { status: 'OFFLINE' });
    expect(offline.status).not.toBe(200);
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.status).toBe('BUSY');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: '0000' });
      expect(response.status).not.toBe(200);
    }
    const locked = await call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code });
    expect(locked.body.error?.status).toBe('RESOURCE_EXHAUSTED');
    const secret = (await db.doc(`deliverySecrets/${fixture.deliveryId}`).get()).data();
    expect(secret?.failedCodeLockedUntilMs).toBeGreaterThan(Date.now());
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('OUT_FOR_DELIVERY');
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).exists).toBe(false);
  });

  it('completes an arrived delivery and records finance/cash exactly once under concurrent confirmation', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    const results = await Promise.all([
      call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code }),
      call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code }),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('COMPLETED');
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('DELIVERED');
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).data()?.amountCents).toBe(2450);
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).data()?.cashAmountCents).toBe(2450);
    expect((await db.doc(`cashRegisters/${fixture.registerId}`).get()).data()?.expectedCashCents).toBe(3450);
    expect((await db.doc(`deliveryDrivers/${driverUid}/deliveryHistory/${fixture.deliveryId}`).get()).data()?.status).toBe('DELIVERED');
  }, 20000);

  it('cancelling an assigned delivery frees its driver and updates both tracking records', async () => {
    const orderId = `order-${randomUUID()}`;
    const deliveryId = `delivery-${orderId}`;
    const publicCode = `public-${randomUUID()}`;
    await db.doc(`orders/${orderId}`).set({ status: 'PREPARING', orderNumber: '#QA-CANCEL', publicCode, fulfillment: { mode: 'DELIVERY' }, pricing: { totalCents: 1200 }, updatedAt: new Date() });
    await db.doc(`publicOrders/${publicCode}`).set({ publicCode, status: 'PREPARING', deliveryDriverName: 'driver' });
    await db.doc(`deliveries/${deliveryId}`).set({ orderId, orderNumber: '#QA-CANCEL', driverId: driverUid, driverIds: [driverUid], status: 'ACCEPTED' });
    await db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'BUSY', currentDeliveryId: deliveryId });
    const result = await call('updateOrderStatus', adminToken, { orderId, status: 'CANCELLED', reason: 'Teste de QA' });
    expect(result.status).toBe(200);
    expect((await db.doc(`deliveries/${deliveryId}`).get()).data()?.status).toBe('CANCELLED');
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.status).toBe('AVAILABLE');
    expect((await db.doc(`publicOrders/${publicCode}`).get()).data()?.deliveryStatus).toBe('CANCELLED');
  }, 20000);

  it('reassigns safely before pickup, edits the new driver profile, and retains both histories', async () => {
    const suffix = randomUUID();
    const newDriver = await createSignedInUser('driver', `qa-driver-new-${suffix}@example.test`);
    await db.doc(`deliveryDrivers/${newDriver.uid}`).update({ status: 'AVAILABLE' });
    const orderId = `order-${randomUUID()}`;
    const deliveryId = `delivery-${orderId}`;
    const publicCode = `public-${randomUUID()}`;
    await db.doc(`orders/${orderId}`).set({ status: 'PREPARING', orderNumber: '#QA-REASSIGN', publicCode, fulfillment: { mode: 'DELIVERY' }, pricing: { totalCents: 1200 }, updatedAt: new Date() });
    await db.doc(`publicOrders/${publicCode}`).set({ publicCode, status: 'PREPARING' });
    await db.doc(`deliveries/${deliveryId}`).set({ orderId, orderNumber: '#QA-REASSIGN', driverId: driverUid, driverIds: [driverUid], driverName: 'Anterior', status: 'ACCEPTED', customerName: 'Cliente teste' });
    await db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'BUSY', currentDeliveryId: deliveryId });
    const reassigned = await call('reassignDelivery', adminToken, { deliveryId, driverId: newDriver.uid });
    expect(reassigned.status).toBe(200);
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.status).toBe('AVAILABLE');
    expect((await db.doc(`deliveryDrivers/${newDriver.uid}`).get()).data()?.currentDeliveryId).toBe(deliveryId);
    expect((await db.doc(`deliveries/${deliveryId}`).get()).data()?.status).toBe('ASSIGNED');
    expect((await db.doc(`deliveryDrivers/${driverUid}/deliveryHistory/${deliveryId}`).get()).data()?.status).toBe('REASSIGNED');
    const edited = await call('updateDeliveryDriver', adminToken, { driverId: newDriver.uid, name: 'Motoboy Editado', phone: '17988887777', email: `edited-${suffix}@example.test` });
    expect(edited.status).toBe(200);
    expect((await db.doc(`deliveryDrivers/${newDriver.uid}`).get()).data()).toMatchObject({ name: 'Motoboy Editado', phone: '17988887777' });
  }, 30000);

  it('removes legacy tracking tokens from old delivery documents', async () => {
    const deliveryId = `legacy-${randomUUID()}`;
    await db.doc(`deliveries/${deliveryId}`).set({ status: 'DELIVERED', publicCode: `secret-${randomUUID()}`, deliveryCodeHash: 'legacy-hash', deliveryCodeHint: '48••' });
    const result = await call('sanitizeLegacyDeliveryLinks', adminToken, {});
    expect(result.status).toBe(200);
    const delivery = (await db.doc(`deliveries/${deliveryId}`).get()).data();
    expect(delivery?.publicCode).toBeUndefined();
    expect(delivery?.deliveryCodeHash).toBeUndefined();
    expect(delivery?.deliveryCodeHint).toBeUndefined();
  });
});
