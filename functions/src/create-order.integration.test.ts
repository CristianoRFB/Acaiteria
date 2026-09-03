import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const db = getFirestore();
const endpoint = 'http://127.0.0.1:5001/demo-acai-mais-sabor/southamerica-east1/createOrder';
const basePayload = { customer: { name: 'Cliente Integração', whatsapp: '17999999999' }, items: [{ productId: 'simple', sizeId: 'unico', quantity: 1, selections: [] }], fulfillment: { mode: 'PICKUP' }, payment: { method: 'PIX' }, clientPreviewTotalCents: 1800 };

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
