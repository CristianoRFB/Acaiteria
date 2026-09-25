import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { processIntegration } from './integration/service.js';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const db = getFirestore();
const functionsEndpoint = 'http://127.0.0.1:5001/demo-acai-mais-sabor/southamerica-east1';
const authEndpoint = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';
const testPassword = 'Functions-Teste-2026!';
let adminToken = '';
const basePayload = { customer: { name: 'Cliente Integração', whatsapp: '17999999999' }, items: [{ productId: 'simple', sizeId: 'unico', quantity: 1, selections: [] }], fulfillment: { mode: 'PICKUP' }, payment: { method: 'PIX', needsChange: false }, clientPreviewTotalCents: 1800 };

async function call(data: unknown, name = 'createOrder', token?: string) {
  const response = await fetch(`${functionsEndpoint}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: { message?: string; status?: string } } };
}

beforeAll(async () => {
  await db.doc('storePublicConfig/main').set({ storeName: 'Integração', whatsappEnabled: false, orderingEnabled: true, enforceHours: false, timezone: 'America/Sao_Paulo', hours: [], fulfillmentModes: ['PICKUP'], paymentMethods: ['PIX'], deliveryConfig: { mode: 'NONE' }, status: 'ACTIVE' });
  await db.doc('categories/acai').set({ name: 'Açaí', active: true, displayOrder: 1 });
  await db.doc('products/simple').set({ name: 'Açaí simples', slug: 'simples', description: '', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 1, sizes: [{ id: 'unico', label: 'Único', active: true, basePriceCents: 1800, displayOrder: 1 }], modifierGroupIds: [] });
  const email = `qa-admin-${crypto.randomUUID()}@example.test`;
  const user = await getAuth().createUser({ email, password: testPassword, displayName: 'QA Admin' });
  await db.doc(`users/${user.uid}`).set({ role: 'admin', active: true, email, name: 'QA Admin' });
  const signIn = await fetch(authEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: testPassword, returnSecureToken: true }) });
  const session = await signIn.json() as { idToken?: string; error?: { message?: string } };
  if (!signIn.ok || !session.idToken) throw new Error(session.error?.message ?? 'Não foi possível iniciar a sessão admin de teste.');
  adminToken = session.idToken;
});

describe('createOrder no Emulator Suite', () => {
  it('concurrent requests create exactly one logical order and reject reused key with changed content', async () => {
    const clientRequestId = crypto.randomUUID();
    const responses = await Promise.all([call({ ...basePayload, clientRequestId }), call({ ...basePayload, clientRequestId })]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses[0].body.result?.publicCode).toBe(responses[1].body.result?.publicCode);
    expect((await db.collection('orders').where('clientRequestId', '==', clientRequestId).get()).size).toBe(1);
    expect((await call({ ...basePayload, clientRequestId, notes: 'different order' })).status).not.toBe(200);
  }, 15000);
  it('persiste snapshot canônico, gera códigos e ignora campos de preço por item', async () => {
    const clientRequestId = crypto.randomUUID();
    const response = await call({ ...basePayload, clientRequestId, items: [{ ...basePayload.items[0], clientTotal: 1, basePriceCents: 1 }] });
    expect(response.status).toBe(200);
    expect(response.body.result?.totalCents).toBe(1800);
    expect(String(response.body.result?.publicCode)).toHaveLength(32);
    const snapshot = await db.collection('orders').where('clientRequestId', '==', clientRequestId).get();
    expect(snapshot.size).toBe(1);
    expect(snapshot.docs[0].data().items[0].unitPriceCents).toBe(1800);
    expect(snapshot.docs[0].data().status).toBe('NEW');
    expect(snapshot.docs[0].data().pricingVerification).toEqual({ status: 'VERIFIED', source: 'SERVER' });
  });
  it('impede pedido duplicado na repetição do mesmo request id', async () => {
    const clientRequestId = crypto.randomUUID();
    const first = await call({ ...basePayload, clientRequestId });
    const second = await call({ ...basePayload, clientRequestId });
    expect(first.body.result?.publicCode).toBe(second.body.result?.publicCode);
    expect(second.body.result?.idempotent).toBe(true);
    expect((await db.collection('orders').where('clientRequestId', '==', clientRequestId).get()).size).toBe(1);
  });
  it('rejeita total adulterado e modifier/grupo inválido', async () => {
    const forgedPrice = await call({ ...basePayload, clientRequestId: crypto.randomUUID(), clientPreviewTotalCents: 1 });
    expect(forgedPrice.status).not.toBe(200);
    expect(forgedPrice.body.error?.message).toMatch(/novo total/i);
    const forgedModifier = await call({ ...basePayload, clientRequestId: crypto.randomUUID(), items: [{ ...basePayload.items[0], selections: [{ groupId: 'fake', items: [{ modifierId: 'free-hack', quantity: 1 }] }] }] });
    expect(forgedModifier.status).not.toBe(200);
    expect(forgedModifier.body.error?.message).toMatch(/grupo/i);
  });
  it('rejeita loja pausada', async () => {
    await db.doc('storePublicConfig/main').update({ orderingEnabled: false, pauseMessage: 'Pausado para teste' });
    const response = await call({ ...basePayload, clientRequestId: crypto.randomUUID() });
    expect(response.status).not.toBe(200);
    expect(response.body.error?.message).toMatch(/Pausado/);
    await db.doc('storePublicConfig/main').update({ orderingEnabled: true });
  });
  it('revalida pedido legado somente se itens e valores coincidirem e recalcula com aceite quando diferem', async () => {
    const matchingId = `legacy-match-${crypto.randomUUID()}`;
    const matchingCode = crypto.randomUUID().replace(/-/g, '');
    const canonicalItem = { productId: 'simple', productName: 'Nome antigo', sizeId: 'unico', sizeLabel: 'Único', quantity: 1, modifierSelections: [], unitPriceCents: 1800, totalPriceCents: 1800 };
    await db.doc(`orders/${matchingId}`).set({ publicCode: matchingCode, orderNumber: '#LEGADO-OK', status: 'PREPARING', customer: basePayload.customer, items: [canonicalItem], fulfillment: { mode: 'PICKUP' }, payment: basePayload.payment, pricing: { subtotalCents: 1800, deliveryFeeCents: 0, totalCents: 1800 } });
    await db.doc(`publicOrders/${matchingCode}`).set({ publicCode: matchingCode, status: 'PREPARING', items: [canonicalItem], pricing: { totalCents: 1800 } });
    const matching = await call({ orderId: matchingId }, 'verifyOrderPricing', adminToken);
    expect(matching.status).toBe(200);
    expect((await db.doc(`orders/${matchingId}`).get()).data()?.pricingVerification).toMatchObject({ status: 'VERIFIED', source: 'SERVER' });

    const mismatchingId = `legacy-diff-${crypto.randomUUID()}`;
    const mismatchingCode = crypto.randomUUID().replace(/-/g, '');
    await db.doc(`orders/${mismatchingId}`).set({ publicCode: mismatchingCode, orderNumber: '#LEGADO-DIF', status: 'NEW', customer: basePayload.customer, items: [{ ...canonicalItem, unitPriceCents: 1, totalPriceCents: 1 }], fulfillment: { mode: 'PICKUP' }, payment: basePayload.payment, pricing: { subtotalCents: 1, deliveryFeeCents: 0, totalCents: 1 } });
    await db.doc(`publicOrders/${mismatchingCode}`).set({ publicCode: mismatchingCode, status: 'NEW', items: [{ ...canonicalItem, unitPriceCents: 1, totalPriceCents: 1 }], pricing: { totalCents: 1 } });
    const mismatching = await call({ orderId: mismatchingId }, 'verifyOrderPricing', adminToken);
    expect(mismatching.status).not.toBe(200);
    expect(mismatching.body.error?.message).toMatch(/difere do cardápio/i);
    expect((await db.doc(`orders/${mismatchingId}`).get()).data()?.pricingVerification).toBeUndefined();

    const edited = await call({ orderId: mismatchingId, customer: basePayload.customer, notes: '', items: basePayload.items, fulfillment: { mode: 'PICKUP' } }, 'updateOrderDetails', adminToken);
    expect(edited.status).toBe(200);
    expect((await db.doc(`orders/${mismatchingId}`).get()).data()).toMatchObject({ pricing: { totalCents: 1800 }, pricingVerification: { status: 'VERIFIED', source: 'SERVER' }, customerEditApproval: { status: 'PENDING' } });
  }, 20000);
});

describe('persisted integration outbox', () => {
  async function fixture(provider: string) {
    const ref = db.collection('orders').doc();
    await ref.set({ status: 'NEW', items: [{ productId: 'p', sizeId: 's', modifierSelections: [] }], payment: { method: 'PIX' }, pricing: { totalCents: 100 }, createdAt: new Date(), updatedAt: new Date() });
    await ref.update({ integration: { provider, status: 'PENDING', attemptCount: 0 } });
    return ref;
  }
  it('persists acceptance, deterministic external ID and one attempt under concurrent processing', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true'; process.env.LOCAL_PROVIDER_SCENARIO = 'accept';
    const ref = await fixture('local');
    await Promise.all([processIntegration(ref.id), processIntegration(ref.id)]);
    const order = (await ref.get()).data()!;
    expect(order.integration.status).toBe('ACCEPTED');
    expect(order.integration.externalOrderId).toBe(`LOCAL-${ref.id}`);
    expect((await ref.collection('integrationAttempts').get()).size).toBe(1);
  }, 15000);
  it('preserves a failed order, respects backoff, retries transient failures and retains attempts', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true'; process.env.LOCAL_PROVIDER_SCENARIO = 'transient';
    const ref = await fixture('local');
    await processIntegration(ref.id);
    expect((await ref.get()).data()?.integration.retryable).toBe(true);
    await processIntegration(ref.id);
    expect((await ref.get()).data()?.integration.attemptCount).toBe(1);
    await ref.update({ 'integration.nextAttemptAtMs': 0 });
    await processIntegration(ref.id);
    expect((await ref.get()).data()?.integration.status).toBe('ACCEPTED');
    expect((await ref.collection('integrationAttempts').get()).size).toBe(2);
  });
  it('missing mappings never send a Saipos order or lose internal data', async () => {
    const ref = await fixture('saipos');
    await processIntegration(ref.id);
    const state = (await ref.get()).data()?.integration;
    expect(state.errorCode).toBe('MAPPING_MISSING');
    expect(state.retryable).toBe(false);
    expect(state.externalOrderId).toBeUndefined();
  });
  it('expired claim becomes unknown and cannot be blindly replayed', async () => {
    const ref = await fixture('saipos');
    await ref.update({ 'integration.status': 'SENDING', 'integration.leaseUntilMs': 0, 'integration.attemptCount': 1 });
    await processIntegration(ref.id);
    expect((await ref.get()).data()?.integration.status).toBe('UNKNOWN');
    await processIntegration(ref.id);
    expect((await ref.get()).data()?.integration.attemptCount).toBe(1);
  });
});
