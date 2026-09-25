import { randomUUID } from 'node:crypto';
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
const testPassword = 'Finance-QA-2026!';
let adminToken = '';
let staffToken = '';

async function createSignedInUser(role: 'admin' | 'staff', email: string) {
  const user = await auth.createUser({ email, password: testPassword, displayName: role });
  await db.doc(`users/${user.uid}`).set({ role, active: true, name: role, email });
  const response = await fetch(authEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: testPassword, returnSecureToken: true }),
  });
  const result = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !result.idToken) throw new Error(result.error?.message ?? 'Não foi possível iniciar sessão no emulador.');
  return result.idToken;
}

async function call(name: string, token: string, data: unknown) {
  const response = await fetch(`${functionsEndpoint}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: { status?: string; message?: string } } };
}

function entryPayload(clientRequestId = randomUUID()) {
  return {
    clientRequestId,
    kind: 'EXPENSE',
    category: 'Insumos',
    description: 'Compra de frutas para QA',
    amountCents: 1234,
    date: '2026-09-25',
    status: 'PAID',
    orderNumber: '#QA-42',
    notes: 'Registro de teste',
  };
}

beforeAll(async () => {
  const suffix = randomUUID();
  [adminToken, staffToken] = await Promise.all([
    createSignedInUser('admin', `qa-finance-admin-${suffix}@example.test`),
    createSignedInUser('staff', `qa-finance-staff-${suffix}@example.test`),
  ]);
});

describe('finance callables in Firebase Emulator Suite', () => {
  it('permits admin only and rejects malformed amounts without creating entries', async () => {
    const payload = entryPayload();
    const staffSave = await call('saveFinanceEntry', staffToken, payload);
    expect(staffSave.status).not.toBe(200);
    expect(staffSave.body.error?.status).toBe('PERMISSION_DENIED');

    const noAuth = await call('saveFinanceEntry', '', payload);
    expect(noAuth.status).not.toBe(200);

    const invalid = await call('saveFinanceEntry', adminToken, { ...payload, amountCents: 0 });
    expect(invalid.status).not.toBe(200);
    expect((await db.doc(`financeEntries/manual-${payload.clientRequestId}`).get()).exists).toBe(false);
  });

  it('replays the same manual entry once and rejects a reused key with changed values', async () => {
    const payload = entryPayload();
    const first = await call('saveFinanceEntry', adminToken, payload);
    expect(first.status).toBe(200);
    const entryId = `manual-${payload.clientRequestId}`;
    expect(first.body.result?.entryId).toBe(entryId);

    const replay = await call('saveFinanceEntry', adminToken, payload);
    expect(replay.status).toBe(200);
    expect(replay.body.result?.idempotent).toBe(true);

    const changed = await call('saveFinanceEntry', adminToken, { ...payload, amountCents: 9999 });
    expect(changed.status).not.toBe(200);
    expect(changed.body.error?.status).toBe('ALREADY_EXISTS');
    expect(changed.body.error?.message).toMatch(/outros dados/i);
    expect((await db.doc(`financeEntries/${entryId}`).get()).data()?.amountCents).toBe(1234);
  });

  it('allows editing manual entries and status changes but protects automatic order entries', async () => {
    const payload = entryPayload();
    const created = await call('saveFinanceEntry', adminToken, payload);
    expect(created.status).toBe(200);
    const entryId = String(created.body.result?.entryId);

    const edited = await call('saveFinanceEntry', adminToken, { ...payload, id: entryId, clientRequestId: randomUUID(), description: 'Compra corrigida', amountCents: 1450 });
    expect(edited.status).toBe(200);
    expect((await db.doc(`financeEntries/${entryId}`).get()).data()).toMatchObject({ description: 'Compra corrigida', amountCents: 1450 });

    const changedStatus = await call('updateFinanceStatus', adminToken, { id: entryId, status: 'PENDING' });
    expect(changedStatus.status).toBe(200);
    expect((await db.doc(`financeEntries/${entryId}`).get()).data()?.status).toBe('PENDING');

    const automaticId = `auto-${randomUUID()}`;
    await db.doc(`financeEntries/${automaticId}`).set({ kind: 'INCOME', amountCents: 2400, sourceOrderId: 'order-qa', status: 'PAID' });
    const editAutomatic = await call('saveFinanceEntry', adminToken, { ...payload, id: automaticId, clientRequestId: randomUUID() });
    const changeAutomaticStatus = await call('updateFinanceStatus', adminToken, { id: automaticId, status: 'PENDING' });
    expect(editAutomatic.status).not.toBe(200);
    expect(changeAutomaticStatus.status).not.toBe(200);
    expect((await db.doc(`financeEntries/${automaticId}`).get()).data()).toMatchObject({ amountCents: 2400, status: 'PAID' });
  });

  it('does not allow staff to alter financial status or mark a missing entry as paid', async () => {
    const staffResult = await call('updateFinanceStatus', staffToken, { id: 'manual-missing', status: 'PAID' });
    expect(staffResult.status).not.toBe(200);
    expect(staffResult.body.error?.status).toBe('PERMISSION_DENIED');

    const missing = await call('updateFinanceStatus', adminToken, { id: 'manual-missing', status: 'PAID' });
    expect(missing.status).not.toBe(200);
    expect(missing.body.error?.status).toBe('NOT_FOUND');
  });
});
