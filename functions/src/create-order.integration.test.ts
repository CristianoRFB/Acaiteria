import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { processIntegration } from './integration/service.js';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const db = getFirestore();
const endpoint = 'http://127.0.0.1:5001/demo-acai-mais-sabor/southamerica-east1/createOrder';
const basePayload = { customer: { name: 'Cliente Integração', whatsapp: '17999999999' }, items: [{ productId: 'simple', sizeId: 'unico', quantity: 1, selections: [] }], fulfillment: { mode: 'PICKUP' }, payment: { method: 'PIX', needsChange: false }, clientPreviewTotalCents: 1800 };

async function call(data: unknown) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data }) });
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: { message?: string; status?: string } } };
}

beforeAll(async () => {
  await db.doc('storePublicConfig/main').set({ storeName: 'Integração', whatsappEnabled: false, orderingEnabled: true, enforceHours: false, timezone: 'America/Sao_Paulo', hours: [], fulfillmentModes: ['PICKUP'], paymentMethods: ['PIX'], deliveryConfig: { mode: 'NONE' }, status: 'ACTIVE' });
  await db.doc('categories/acai').set({ name: 'Açaí', active: true, displayOrder: 1 });
  await db.doc('products/simple').set({ name: 'Açaí simples', slug: 'simples', description: '', active: true, categoryId: 'acai', productType: 'SIMPLE', displayOrder: 1, sizes: [{ id: 'unico', label: 'Único', active: true, basePriceCents: 1800, displayOrder: 1 }], modifierGroupIds: [] });
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
    expect(String(response.body.result?.publicCode)).toHaveLength(22);
    const snapshot = await db.collection('orders').where('clientRequestId', '==', clientRequestId).get();
    expect(snapshot.size).toBe(1);
    expect(snapshot.docs[0].data().items[0].unitPriceCents).toBe(1800);
    expect(snapshot.docs[0].data().status).toBe('NEW');
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
  });
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
