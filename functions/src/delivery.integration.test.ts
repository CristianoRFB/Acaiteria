import { createHash, randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const auth = getAuth();
const db = getFirestore();
const projectId = process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor';
const functionsEndpoint = `http://127.0.0.1:5001/${projectId}/southamerica-east1`;
const authEndpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';
const testPassword = 'Motoboy-Teste-2026!';
let adminToken = '';
let secondAdminToken = '';
let driverToken = '';
let driverUid = '';
let driverEmail = '';

async function createSignedInUser(role: 'admin' | 'driver', email: string) {
  const user = await auth.createUser({ email, password: testPassword, displayName: role });
  await db.doc(`users/${user.uid}`).set({ role, active: true, name: role, email });
  if (role === 'driver') await db.doc(`deliveryDrivers/${user.uid}`).set({ userId: user.uid, name: role, email, phone: '17999999999', status: 'BUSY', enabled: true });
  const response = await fetch(authEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: testPassword, returnSecureToken: true }) });
  const result = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !result.idToken) throw new Error(result.error?.message ?? 'Não foi possível iniciar a sessão do emulador.');
  return { uid: user.uid, email, token: result.idToken };
}

async function signInWithPassword(email: string) {
  const response = await fetch(authEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword, returnSecureToken: true }),
  });
  const result = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !result.idToken) throw new Error(result.error?.message ?? 'Não foi possível abrir uma segunda sessão no emulador.');
  return result.idToken;
}

async function call(name: string, token: string, data: unknown) {
  const response = await fetch(`${functionsEndpoint}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ data }) });
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: { status?: string; message?: string } } };
}

async function createArrivedCashDelivery(driverId: string) {
  const orderId = `order-${randomUUID()}`;
  const deliveryId = `delivery-${orderId}`;
  const publicCode = `public-${randomUUID()}`;
  const code = '4827';
  await db.doc(`orders/${orderId}`).set({ status: 'OUT_FOR_DELIVERY', orderNumber: '#QA-1', publicCode, fulfillment: { mode: 'DELIVERY' }, pricing: { totalCents: 2450 }, payment: { method: 'CASH' }, customer: { name: 'Cliente teste' }, updatedAt: new Date() });
  await db.doc(`publicOrders/${publicCode}`).set({ publicCode, orderNumber: '#QA-1', status: 'OUT_FOR_DELIVERY', deliveryStatus: 'ARRIVED', deliveryCode: code, deliveryCodeHint: `${code.slice(0, 2)}••` });
  await db.doc(`deliveries/${deliveryId}`).set({ orderId, orderNumber: '#QA-1', driverId, driverIds: [driverId], status: 'ARRIVED', customerName: 'Cliente teste', totalCents: 2450 });
  await db.doc(`deliverySecrets/${deliveryId}`).set({ deliveryId, codeHash: createHash('sha256').update(code).digest('hex'), failedCodeAttempts: 0, failedCodeWindowStartedAtMs: Date.now(), failedCodeLockedUntilMs: 0 });
  await db.doc(`deliveryDrivers/${driverId}`).update({ status: 'BUSY', currentDeliveryId: deliveryId });
  const opened = await call('operateCashRegister', adminToken, {
    operation: 'OPEN',
    clientRequestId: randomUUID(),
    initialBalanceCents: 1000,
    openingDate: '2026-09-24',
    note: 'Abertura de caixa de teste',
  });
  if (opened.status !== 200 || typeof opened.body.result?.registerId !== 'string') {
    throw new Error(opened.body.error?.message ?? 'Não foi possível abrir o caixa de teste.');
  }
  return { deliveryId, orderId, registerId: opened.body.result.registerId, publicCode, code };
}

async function createReadyDelivery() {
  const deliveryId = `delivery-${randomUUID()}`;
  const orderId = `order-${randomUUID()}`;
  const publicCode = `public-${randomUUID()}`;
  await db.doc(`orders/${orderId}`).set({ status: 'PREPARING', orderNumber: '#QA-READY', publicCode, fulfillment: { mode: 'DELIVERY' }, pricing: { totalCents: 1800 }, payment: { method: 'PIX' }, customer: { name: 'Cliente teste' }, updatedAt: new Date() });
  await db.doc(`publicOrders/${publicCode}`).set({ publicCode, orderNumber: '#QA-READY', status: 'PREPARING' });
  await db.doc(`deliveries/${deliveryId}`).set({ orderId, orderNumber: '#QA-READY', status: 'READY_FOR_DELIVERY', customerName: 'Cliente teste', address: { street: 'Rua de teste', number: '10', neighborhood: 'Centro' }, totalCents: 1800 });
  await db.doc(`deliverySecrets/${deliveryId}`).set({ deliveryId, publicCode, deliveryCode: '3914', codeHash: createHash('sha256').update('3914').digest('hex') });
  return { deliveryId, orderId, publicCode };
}

beforeAll(async () => {
  const suffix = randomUUID();
  const [admin, driver] = await Promise.all([
    createSignedInUser('admin', `qa-admin-${suffix}@example.test`),
    createSignedInUser('driver', `qa-driver-${suffix}@example.test`),
  ]);
  const secondAdmin = await createSignedInUser('admin', `qa-admin-second-${suffix}@example.test`);
  adminToken = admin.token;
  secondAdminToken = secondAdmin.token;
  driverToken = driver.token;
  driverUid = driver.uid;
  driverEmail = driver.email;
  process.env.FUNCTIONS_EMULATOR = 'true';
});

afterEach(async () => {
  const control = await db.doc('cashControl/main').get();
  const registerId = String(control.data()?.openRegisterId ?? '');
  if (!registerId) return;
  const register = await db.doc(`cashRegisters/${registerId}`).get();
  if (!register.exists || register.data()?.status !== 'OPEN') return;
  await call('operateCashRegister', adminToken, {
    operation: 'CLOSE',
    registerId,
    countedCashCents: Number(register.data()?.expectedCashCents ?? register.data()?.initialBalanceCents ?? 0),
    note: 'Encerramento automático do teste',
  });
});

describe('delivery operations in Firebase Emulator Suite', () => {
  it('serializes two admins assigning the same ready order and accepts only one winner', async () => {
    const fixture = await createReadyDelivery();
    const secondDriver = await createSignedInUser('driver', `qa-driver-race-${randomUUID()}@example.test`);
    await Promise.all([
      db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'AVAILABLE', currentDeliveryId: null }),
      db.doc(`deliveryDrivers/${secondDriver.uid}`).update({ status: 'AVAILABLE' }),
    ]);
    const results = await Promise.all([
      call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driverUid }),
      call('assignDelivery', secondAdminToken, { deliveryId: fixture.deliveryId, driverId: secondDriver.uid }),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    const assigned = (await db.doc(`deliveries/${fixture.deliveryId}`).get()).data();
    expect(assigned?.status).toBe('ASSIGNED');
    if (assigned?.status === 'ASSIGNED') {
      const assignedDriver = String(assigned.driverId);
      const otherDriver = assignedDriver === driverUid ? secondDriver.uid : driverUid;
      expect((await db.doc(`deliveryDrivers/${assignedDriver}`).get()).data()?.status).toBe('BUSY');
      expect((await db.doc(`deliveryDrivers/${otherDriver}`).get()).data()?.status).toBe('AVAILABLE');
    }
    const events = await db.collection('deliveryEvents').where('deliveryId', '==', fixture.deliveryId).get();
    expect(events.docs.filter((event) => event.data().type === 'ASSIGNED')).toHaveLength(1);
  }, 20000);

  it('handles a duplicate assign click for the same order and driver exactly once', async () => {
    const fixture = await createReadyDelivery();
    await db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'AVAILABLE', currentDeliveryId: null });
    const attempts = await Promise.all([
      call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driverUid }),
      call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driverUid }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 200)).toHaveLength(1);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()).toMatchObject({ status: 'ASSIGNED', driverId: driverUid });
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()).toMatchObject({ status: 'BUSY', currentDeliveryId: fixture.deliveryId });
    const events = await db.collection('deliveryEvents').where('deliveryId', '==', fixture.deliveryId).get();
    expect(events.docs.filter((event) => event.data().type === 'ASSIGNED')).toHaveLength(1);
  }, 20000);

  it('does not assign a delivery to a driver whose user account was deactivated separately', async () => {
    const driver = await createSignedInUser('driver', `qa-driver-inactive-user-${randomUUID()}@example.test`);
    const fixture = await createReadyDelivery();
    await Promise.all([
      db.doc(`deliveryDrivers/${driver.uid}`).update({ status: 'AVAILABLE' }),
      db.doc(`users/${driver.uid}`).update({ active: false }),
    ]);

    const assigned = await call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driver.uid });
    expect(assigned.status).not.toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()).toMatchObject({ status: 'READY_FOR_DELIVERY' });
    expect((await db.doc(`deliveryDrivers/${driver.uid}`).get()).data()).toMatchObject({ status: 'AVAILABLE' });
  }, 20000);

  it('accepts a corrida once when two sessions of the same driver tap aceitar concurrently', async () => {
    const fixture = await createReadyDelivery();
    await db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'AVAILABLE', currentDeliveryId: null });
    expect((await call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driverUid })).status).toBe(200);

    const secondSessionToken = await signInWithPassword(driverEmail);
    const responses = await Promise.all([
      call('respondDelivery', driverToken, { deliveryId: fixture.deliveryId, decision: 'ACCEPT' }),
      call('respondDelivery', secondSessionToken, { deliveryId: fixture.deliveryId, decision: 'ACCEPT' }),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('ACCEPTED');
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.currentDeliveryId).toBe(fixture.deliveryId);
    const events = await db.collection('deliveryEvents').where('deliveryId', '==', fixture.deliveryId).get();
    expect(events.docs.filter((event) => event.data().type === 'ACCEPTED')).toHaveLength(1);
  }, 20000);

  it('rejects assignment and driver mutations when the current-delivery pointer is inconsistent', async () => {
    const driver = await createSignedInUser('driver', `qa-driver-stale-pointer-${randomUUID()}@example.test`);
    const activeDeliveryId = `delivery-active-${randomUUID()}`;
    await db.doc(`deliveryDrivers/${driver.uid}`).update({ status: 'AVAILABLE', currentDeliveryId: activeDeliveryId });
    await db.doc(`deliveries/${activeDeliveryId}`).set({ status: 'ASSIGNED', driverId: driver.uid, orderId: `order-${randomUUID()}` });
    const next = await createReadyDelivery();

    const assignment = await call('assignDelivery', adminToken, { deliveryId: next.deliveryId, driverId: driver.uid });
    expect(assignment.status).not.toBe(200);
    expect((await db.doc(`deliveries/${next.deliveryId}`).get()).data()?.status).toBe('READY_FOR_DELIVERY');
    expect((await db.doc(`deliveryDrivers/${driver.uid}`).get()).data()).toMatchObject({ status: 'AVAILABLE', currentDeliveryId: activeDeliveryId });

    const availability = await call('setDriverAvailability', driver.token, { status: 'AVAILABLE' });
    expect(availability.status).not.toBe(200);
    const disable = await call('setDeliveryDriverEnabled', adminToken, { driverId: driver.uid, enabled: false });
    expect(disable.status).not.toBe(200);
    expect((await db.doc(`deliveryDrivers/${driver.uid}`).get()).data()).toMatchObject({ enabled: true, status: 'AVAILABLE', currentDeliveryId: activeDeliveryId });
  }, 20000);

  it('rejects accepting or advancing another delivery when the driver pointer changed', async () => {
    const driver = await createSignedInUser('driver', `qa-driver-other-run-${randomUUID()}@example.test`);
    await db.doc(`deliveryDrivers/${driver.uid}`).update({ status: 'AVAILABLE', currentDeliveryId: null });
    const fixture = await createReadyDelivery();
    expect((await call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driver.uid })).status).toBe(200);

    await db.doc(`deliveryDrivers/${driver.uid}`).update({ currentDeliveryId: 'different-delivery' });
    const accept = await call('respondDelivery', driver.token, { deliveryId: fixture.deliveryId, decision: 'ACCEPT' });
    expect(accept.status).not.toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('ASSIGNED');

    await db.doc(`deliveryDrivers/${driver.uid}`).update({ currentDeliveryId: fixture.deliveryId });
    expect((await call('respondDelivery', driver.token, { deliveryId: fixture.deliveryId, decision: 'ACCEPT' })).status).toBe(200);
    await db.doc(`deliveryDrivers/${driver.uid}`).update({ currentDeliveryId: 'different-delivery' });
    const advance = await call('progressDelivery', driver.token, { deliveryId: fixture.deliveryId, status: 'PICKED_UP' });
    expect(advance.status).not.toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('ACCEPTED');
  }, 20000);

  it('does not let a driver mutate a delivery that is not the current linked run', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    await db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'BUSY', currentDeliveryId: 'another-current-delivery' });

    const failure = await call('reportDeliveryFailure', driverToken, { deliveryId: fixture.deliveryId, reason: 'Teste de vínculo inconsistente.' });
    const confirmation = await call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code });
    expect(failure.status).not.toBe(200);
    expect(confirmation.status).not.toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('ARRIVED');
    expect((await db.doc(`deliverySecrets/${fixture.deliveryId}`).get()).data()?.failedCodeAttempts).toBe(0);
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).exists).toBe(false);
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).exists).toBe(false);
  });

  it('persists wrong-code attempts, rate-limits after five tries, and never completes the order', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    const otherDriver = await createSignedInUser('driver', `qa-driver-wrong-owner-${randomUUID()}@example.test`);
    const tracking = await call('getPublicOrder', driverToken, { publicCode: fixture.publicCode });
    expect(tracking.status).toBe(200);
    expect(tracking.body.result).not.toHaveProperty('deliveryCode');
    expect(tracking.body.result).not.toHaveProperty('deliveryCodeHint');
    const wrongOwner = await call('confirmDelivery', otherDriver.token, { deliveryId: fixture.deliveryId, code: fixture.code });
    expect(wrongOwner.status).not.toBe(200);
    expect((await db.doc(`deliverySecrets/${fixture.deliveryId}`).get()).data()?.failedCodeAttempts).toBe(0);
    const offline = await call('setDriverAvailability', driverToken, { status: 'OFFLINE' });
    const available = await call('setDriverAvailability', driverToken, { status: 'AVAILABLE' });
    expect(offline.status).not.toBe(200);
    expect(available.status).not.toBe(200);
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()).toMatchObject({ status: 'BUSY', currentDeliveryId: fixture.deliveryId });
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
    expect((await db.doc('cashControl/main').get()).data()?.openRegisterId).toBe(fixture.registerId);
    expect((await db.doc(`cashMovements/opening-${fixture.registerId}`).get()).exists).toBe(true);
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
    const replayedCode = await call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code });
    expect(replayedCode.status).not.toBe(200);
    expect((await db.doc(`cashRegisters/${fixture.registerId}`).get()).data()?.expectedCashCents).toBe(3450);
  }, 20000);

  it('records a delivery failure, requeues without finance writes, reassigns, and completes with the new driver', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    const failed = await call('reportDeliveryFailure', driverToken, {
      deliveryId: fixture.deliveryId,
      reason: 'Cliente não estava no endereço; pedido retornou à loja.',
    });
    expect(failed.status).toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()).toMatchObject({ status: 'DELIVERY_FAILED', failureReason: 'Cliente não estava no endereço; pedido retornou à loja.' });
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.status).toBe('AVAILABLE');
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('OUT_FOR_DELIVERY');
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).exists).toBe(false);
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).exists).toBe(false);

    const requeued = await call('requeueDelivery', adminToken, { deliveryId: fixture.deliveryId });
    expect(requeued.status).toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()).toMatchObject({ status: 'READY_FOR_DELIVERY', driverId: null, driverName: null });
    expect((await db.doc(`deliveryDrivers/${driverUid}/deliveryHistory/${fixture.deliveryId}`).get()).data()?.status).toBe('RETURNED_TO_QUEUE');
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).not.toBe('COMPLETED');
    const requeueEvent = (await db.collection('deliveryEvents').where('deliveryId', '==', fixture.deliveryId).get()).docs.find((event) => event.data().type === 'READY_FOR_DELIVERY');
    expect(requeueEvent?.data()?.actorRole).toBe('admin');

    const nextDriver = await createSignedInUser('driver', `qa-driver-retry-${randomUUID()}@example.test`);
    await db.doc(`deliveryDrivers/${nextDriver.uid}`).update({ status: 'AVAILABLE' });
    expect((await call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: nextDriver.uid })).status).toBe(200);
    expect((await call('respondDelivery', nextDriver.token, { deliveryId: fixture.deliveryId, decision: 'ACCEPT' })).status).toBe(200);
    for (const status of ['PICKED_UP', 'ON_THE_WAY', 'ARRIVED']) {
      expect((await call('progressDelivery', nextDriver.token, { deliveryId: fixture.deliveryId, status })).status).toBe(200);
    }
    expect((await call('confirmDelivery', nextDriver.token, { deliveryId: fixture.deliveryId, code: fixture.code })).status).toBe(200);
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('COMPLETED');
    expect((await db.doc(`deliveryDrivers/${nextDriver.uid}`).get()).data()?.status).toBe('AVAILABLE');
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).data()?.amountCents).toBe(2450);
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).data()?.cashAmountCents).toBe(2450);
    const events = await db.collection('deliveryEvents').where('deliveryId', '==', fixture.deliveryId).get();
    expect(events.docs.map((event) => event.data().type)).toEqual(expect.arrayContaining(['DELIVERY_FAILED', 'READY_FOR_DELIVERY', 'ASSIGNED', 'PICKED_UP', 'ON_THE_WAY', 'ARRIVED', 'DELIVERED']));
  }, 30000);

  it('lets the admin cancel a failed delivery while retaining failure history and avoiding finance entries', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    expect((await call('reportDeliveryFailure', driverToken, { deliveryId: fixture.deliveryId, reason: 'Cliente recusou o pedido.' })).status).toBe(200);
    const cancelled = await call('updateOrderStatus', adminToken, { orderId: fixture.orderId, status: 'CANCELLED', reason: 'Cancelado após revisão da falha.' });
    expect(cancelled.status).toBe(200);
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('CANCELLED');
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('CANCELLED');
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.status).toBe('AVAILABLE');
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).exists).toBe(false);
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).exists).toBe(false);
    const confirmationAfterCancellation = await call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code });
    expect(confirmationAfterCancellation.status).not.toBe(200);
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('CANCELLED');
    const events = await db.collection('deliveryEvents').where('deliveryId', '==', fixture.deliveryId).get();
    expect(events.docs.map((event) => event.data().type)).toEqual(expect.arrayContaining(['DELIVERY_FAILED', 'CANCELLED']));
  }, 20000);

  it('records local cash sales once and keeps Pix and card out of physical cash', async () => {
    const opened = await call('operateCashRegister', adminToken, {
      operation: 'OPEN',
      clientRequestId: randomUUID(),
      initialBalanceCents: 2000,
      openingDate: '2026-09-24',
      note: 'Abertura para teste de formas de pagamento',
    });
    expect(opened.status).toBe(200);
    const registerId = String(opened.body.result?.registerId);
    const saleId = randomUUID();
    const sale = {
      operation: 'LOCAL_SALE',
      clientRequestId: saleId,
      registerId,
      amountCents: 1550,
      paymentMethod: 'CASH',
      description: 'Venda em dinheiro de teste',
    };
    const duplicateCashSale = await Promise.all([
      call('operateCashRegister', adminToken, sale),
      call('operateCashRegister', adminToken, sale),
    ]);
    expect(duplicateCashSale.every((result) => result.status === 200)).toBe(true);
    expect((await db.doc(`cashRegisters/${registerId}`).get()).data()?.expectedCashCents).toBe(3550);
    expect((await db.doc(`cashMovements/local-${saleId}`).get()).data()?.cashAmountCents).toBe(1550);
    expect((await db.doc(`financeEntries/local-${saleId}`).get()).data()?.amountCents).toBe(1550);

    for (const [paymentMethod, amountCents] of [['PIX', 2300], ['CARD', 3100]] as const) {
      const clientRequestId = randomUUID();
      const result = await call('operateCashRegister', adminToken, {
        operation: 'LOCAL_SALE', clientRequestId, registerId, amountCents,
        paymentMethod, description: `Venda ${paymentMethod} de teste`,
      });
      expect(result.status).toBe(200);
      expect((await db.doc(`cashMovements/local-${clientRequestId}`).get()).data()?.cashAmountCents).toBe(0);
    }
    expect((await db.doc(`cashRegisters/${registerId}`).get()).data()?.expectedCashCents).toBe(3550);
  }, 20000);

  it('blocks delivery completion after cash closure without partially changing order, delivery, or finance', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    const closed = await call('operateCashRegister', adminToken, {
      operation: 'CLOSE',
      registerId: fixture.registerId,
      countedCashCents: 1000,
    });
    expect(closed.status).toBe(200);

    const confirmation = await call('confirmDelivery', driverToken, {
      deliveryId: fixture.deliveryId,
      code: fixture.code,
    });
    expect(confirmation.status).not.toBe(200);
    expect((await db.doc(`orders/${fixture.orderId}`).get()).data()?.status).toBe('OUT_FOR_DELIVERY');
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('ARRIVED');
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).exists).toBe(false);
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).exists).toBe(false);
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()?.status).toBe('BUSY');
  }, 20000);

  it('records completed Pix delivery in finance without increasing physical cash', async () => {
    const fixture = await createArrivedCashDelivery(driverUid);
    await db.doc(`orders/${fixture.orderId}`).update({ payment: { method: 'PIX' } });
    const result = await call('confirmDelivery', driverToken, { deliveryId: fixture.deliveryId, code: fixture.code });
    expect(result.status).toBe(200);
    expect((await db.doc(`financeEntries/order-${fixture.orderId}`).get()).data()).toMatchObject({ amountCents: 2450, paymentMethod: 'PIX' });
    expect((await db.doc(`cashMovements/order-${fixture.orderId}`).get()).data()?.cashAmountCents).toBe(0);
    expect((await db.doc(`cashRegisters/${fixture.registerId}`).get()).data()?.expectedCashCents).toBe(1000);
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
    expect((await call('respondDelivery', driverToken, { deliveryId, decision: 'ACCEPT' })).status).not.toBe(200);
    expect((await call('progressDelivery', driverToken, { deliveryId, status: 'PICKED_UP' })).status).not.toBe(200);
    expect((await db.doc(`deliveries/${deliveryId}`).get()).data()?.driverId).toBe(newDriver.uid);
    expect((await db.doc(`deliveryDrivers/${driverUid}/deliveryHistory/${deliveryId}`).get()).data()?.status).toBe('REASSIGNED');
    const edited = await call('updateDeliveryDriver', adminToken, { driverId: newDriver.uid, name: 'Motoboy Editado', phone: '17988887777', email: `edited-${suffix}@example.test` });
    expect(edited.status).toBe(200);
    expect((await db.doc(`deliveryDrivers/${newDriver.uid}`).get()).data()).toMatchObject({ name: 'Motoboy Editado', phone: '17988887777' });
  }, 30000);

  it('does not reassign an active delivery to a driver whose user account is inactive', async () => {
    const newDriver = await createSignedInUser('driver', `qa-driver-inactive-reassign-${randomUUID()}@example.test`);
    const orderId = `order-${randomUUID()}`;
    const deliveryId = `delivery-${orderId}`;
    await db.doc(`orders/${orderId}`).set({ status: 'PREPARING', orderNumber: '#QA-INACTIVE-REASSIGN', fulfillment: { mode: 'DELIVERY' }, pricing: { totalCents: 1200 }, updatedAt: new Date() });
    await db.doc(`deliveries/${deliveryId}`).set({ orderId, orderNumber: '#QA-INACTIVE-REASSIGN', driverId: driverUid, driverName: 'Anterior', status: 'ACCEPTED' });
    await Promise.all([
      db.doc(`deliveryDrivers/${driverUid}`).update({ status: 'BUSY', currentDeliveryId: deliveryId }),
      db.doc(`deliveryDrivers/${newDriver.uid}`).update({ status: 'AVAILABLE' }),
      db.doc(`users/${newDriver.uid}`).update({ active: false }),
    ]);

    const reassigned = await call('reassignDelivery', adminToken, { deliveryId, driverId: newDriver.uid });
    expect(reassigned.status).not.toBe(200);
    expect((await db.doc(`deliveries/${deliveryId}`).get()).data()).toMatchObject({ status: 'ACCEPTED', driverId: driverUid });
    expect((await db.doc(`deliveryDrivers/${driverUid}`).get()).data()).toMatchObject({ status: 'BUSY', currentDeliveryId: deliveryId });
    expect((await db.doc(`deliveryDrivers/${newDriver.uid}`).get()).data()).toMatchObject({ status: 'AVAILABLE' });
  }, 20000);

  it('disables and re-enables a driver through Auth, user status, and assignment eligibility', async () => {
    const driver = await createSignedInUser('driver', `qa-driver-toggle-${randomUUID()}@example.test`);
    await db.doc(`deliveryDrivers/${driver.uid}`).update({ status: 'AVAILABLE' });
    const fixture = await createReadyDelivery();

    const disabled = await call('setDeliveryDriverEnabled', adminToken, { driverId: driver.uid, enabled: false });
    expect(disabled.status).toBe(200);
    expect((await db.doc(`deliveryDrivers/${driver.uid}`).get()).data()).toMatchObject({ enabled: false, status: 'INACTIVE' });
    expect((await db.doc(`users/${driver.uid}`).get()).data()?.active).toBe(false);
    expect((await auth.getUser(driver.uid)).disabled).toBe(true);
    expect((await call('setDriverAvailability', driver.token, { status: 'AVAILABLE' })).status).not.toBe(200);
    expect((await call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driver.uid })).status).not.toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.status).toBe('READY_FOR_DELIVERY');

    const reenabled = await call('setDeliveryDriverEnabled', adminToken, { driverId: driver.uid, enabled: true });
    expect(reenabled.status).toBe(200);
    expect((await db.doc(`deliveryDrivers/${driver.uid}`).get()).data()).toMatchObject({ enabled: true, status: 'OFFLINE' });
    expect((await db.doc(`users/${driver.uid}`).get()).data()?.active).toBe(true);
    expect((await auth.getUser(driver.uid)).disabled).toBe(false);
    expect((await call('setDriverAvailability', driver.token, { status: 'AVAILABLE' })).status).toBe(200);
    expect((await call('assignDelivery', adminToken, { deliveryId: fixture.deliveryId, driverId: driver.uid })).status).toBe(200);
    expect((await db.doc(`deliveries/${fixture.deliveryId}`).get()).data()?.driverId).toBe(driver.uid);
    expect((await call('setDeliveryDriverEnabled', adminToken, { driverId: driver.uid, enabled: false })).status).not.toBe(200);
    expect((await db.doc(`deliveryDrivers/${driver.uid}`).get()).data()).toMatchObject({ enabled: true, status: 'BUSY', currentDeliveryId: fixture.deliveryId });
  }, 30000);

  it('keeps Auth aligned when two admins toggle the same driver concurrently', async () => {
    const driver = await createSignedInUser('driver', `qa-driver-toggle-race-${randomUUID()}@example.test`);
    await db.doc(`deliveryDrivers/${driver.uid}`).update({ status: 'OFFLINE' });
    const results = await Promise.all([
      call('setDeliveryDriverEnabled', adminToken, { driverId: driver.uid, enabled: false }),
      call('setDeliveryDriverEnabled', secondAdminToken, { driverId: driver.uid, enabled: true }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);

    const [driverRecord, userRecord, authRecord] = await Promise.all([
      db.doc(`deliveryDrivers/${driver.uid}`).get(),
      db.doc(`users/${driver.uid}`).get(),
      auth.getUser(driver.uid),
    ]);
    const enabled = driverRecord.data()?.enabled === true && userRecord.data()?.active === true;
    expect(driverRecord.data()?.enabled).toBe(userRecord.data()?.active);
    expect(authRecord.disabled).toBe(!enabled);
  }, 30000);

  it('does not partially disable a driver record without a matching Auth account', async () => {
    const driverId = `missing-auth-${randomUUID()}`;
    await db.doc(`deliveryDrivers/${driverId}`).set({ userId: driverId, status: 'AVAILABLE', enabled: true });
    await db.doc(`users/${driverId}`).set({ role: 'driver', active: true });

    const result = await call('setDeliveryDriverEnabled', adminToken, { driverId, enabled: false });
    expect(result.status).not.toBe(200);
    expect((await db.doc(`deliveryDrivers/${driverId}`).get()).data()).toMatchObject({ enabled: true, status: 'AVAILABLE' });
    expect((await db.doc(`users/${driverId}`).get()).data()?.active).toBe(true);
  }, 20000);

  it('creates a driver access that can authenticate without storing its initial password in Firestore', async () => {
    const suffix = randomUUID();
    const email = `qa-driver-created-${suffix}@example.test`;
    const password = `QA-${randomUUID()}!`;
    const created = await call('createDeliveryDriver', adminToken, {
      name: 'Motoboy Criado QA',
      phone: '17999990002',
      email,
      password,
    });
    expect(created.status).toBe(200);
    const uid = String(created.body.result?.uid);
    expect((await auth.getUser(uid)).email).toBe(email);
    expect((await db.doc(`users/${uid}`).get()).data()).toMatchObject({ role: 'driver', active: true, phone: '17999990002' });
    const driverRecord = (await db.doc(`deliveryDrivers/${uid}`).get()).data();
    expect(driverRecord).toMatchObject({ enabled: true, status: 'OFFLINE', phone: '17999990002' });
    expect(JSON.stringify(driverRecord)).not.toContain(password);
    expect(JSON.stringify((await db.doc(`users/${uid}`).get()).data())).not.toContain(password);

    const login = await fetch(authEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const loginResult = await login.json() as { idToken?: string };
    expect(login.ok).toBe(true);
    expect(typeof loginResult.idToken).toBe('string');
    expect((await call('setDriverAvailability', String(loginResult.idToken), { status: 'AVAILABLE' })).status).toBe(200);
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
