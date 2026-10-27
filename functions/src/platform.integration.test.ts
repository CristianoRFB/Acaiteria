import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { beforeAll, describe, expect, it } from 'vitest';

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor' });
const db = getFirestore();
const projectId = process.env.GCLOUD_PROJECT || 'demo-acai-mais-sabor';
const functionsEndpoint = `http://${process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001'}/${projectId}/southamerica-east1`;
const authEndpoint = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`;
const password = 'Platform-QA-2026!';
let platformToken = '';
let regularToken = '';
let ownerEmail = '';
let newOwnerEmail = '';

async function signIn(email: string) {
  const response = await fetch(authEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const body = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!response.ok || !body.idToken) throw new Error(body.error?.message ?? 'Não foi possível autenticar conta de teste.');
  return body.idToken;
}

async function call(name: string, data: Record<string, unknown>, token?: string) {
  const response = await fetch(`${functionsEndpoint}/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }) });
  return { status: response.status, body: await response.json() as { result?: Record<string, unknown>; error?: { status?: string; message?: string } } };
}

beforeAll(async () => {
  const platform = await getAuth().createUser({ email: `qa-platform-${randomUUID()}@example.test`, password, displayName: 'QA Platform Owner' });
  const regular = await getAuth().createUser({ email: `qa-regular-${randomUUID()}@example.test`, password, displayName: 'QA usuário comum' });
  const owner = await getAuth().createUser({ email: `qa-tenant-owner-${randomUUID()}@example.test`, password, displayName: 'QA Owner' });
  const nextOwner = await getAuth().createUser({ email: `qa-next-owner-${randomUUID()}@example.test`, password, displayName: 'QA Próximo Owner' });
  ownerEmail = owner.email!;
  newOwnerEmail = nextOwner.email!;
  await Promise.all([
    db.doc(`users/${platform.uid}`).set({ uid: platform.uid, active: true, platformRole: 'platform_owner' }),
    db.doc(`users/${regular.uid}`).set({ uid: regular.uid, active: true }),
  ]);
  [platformToken, regularToken] = await Promise.all([signIn(platform.email!), signIn(regular.email!)]);
});

describe('Platform Owner onboarding no Emulator Suite', () => {
  it('cria tenant, membership owner, defaults de operação e audit log', async () => {
    const slug = `qa-loja-${randomUUID().slice(0, 8)}`;
    const result = await call('platformCreateTenant', {
      displayName: 'Loja QA Amora', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);

    expect(result.status).toBe(200);
    const tenantId = String(result.body.result?.tenantId);
    expect(result.body.result?.slug).toBe(slug);
    const [tenant, slugMapping, platformData, settings, audits] = await Promise.all([
      db.doc(`tenants/${tenantId}`).get(),
      db.doc(`tenantSlugs/${slug}`).get(),
      db.doc(`tenants/${tenantId}/private/platform`).get(),
      db.doc(`tenants/${tenantId}/settings/public`).get(),
      db.collection('platformAuditLogs').where('tenantId', '==', tenantId).get(),
    ]);
    const owner = await getAuth().getUserByEmail(ownerEmail);
    const membership = await db.doc(`tenants/${tenantId}/members/${owner.uid}`).get();
    expect(tenant.data()?.status).toBe('ACTIVE');
    expect(tenant.data()?.branding.primaryColor).toBe('#5634A5');
    expect(slugMapping.data()?.tenantId).toBe(tenantId);
    expect(platformData.data()?.ownerUserId).toBe(owner.uid);
    expect(membership.data()?.role).toBe('tenant_owner');
    expect(settings.data()?.storeName).toBe('Loja QA Amora');
    expect(settings.data()?.orderingEnabled).toBe(false);
    expect(settings.data()?.whatsappEnabled).toBe(false);
    expect(settings.data()?.fulfillmentModes).toEqual(['PICKUP']);
    expect(settings.data()?.deliveryConfig).toEqual({ mode: 'NONE' });
    expect(audits.docs.map((item) => item.data().action)).toContain('TENANT_CREATED');

    const suspended = await call('platformUpdateTenant', {
      tenantId,
      status: 'SUSPENDED',
      displayName: 'Loja QA Renomeada',
      ownerEmail: newOwnerEmail,
      branding: { primaryColor: '#A02B61', secondaryColor: '#E2F05A' },
    }, platformToken);
    expect(suspended.status).toBe(200);
    const updatedTenant = await db.doc(`tenants/${tenantId}`).get();
    expect(updatedTenant.data()?.status).toBe('SUSPENDED');
    expect(updatedTenant.data()?.displayName).toBe('Loja QA Renomeada');
    expect((await db.doc(`tenants/${tenantId}/members/${owner.uid}`).get()).data()?.role).toBe('admin');
    const nextOwner = await getAuth().getUserByEmail(newOwnerEmail);
    expect((await db.doc(`tenants/${tenantId}/members/${nextOwner.uid}`).get()).data()?.role).toBe('tenant_owner');
    expect((await db.doc(`tenants/${tenantId}/settings/public`).get()).data()?.storeName).toBe('Loja QA Renomeada');

    const support = await call('platformStartTenantSupport', { tenantId }, platformToken);
    expect(support.status).toBe(200);
    expect(support.body.result?.mode).toBe('READ_ONLY');
    const reactivated = await call('platformUpdateTenant', { tenantId, status: 'ACTIVE' }, platformToken);
    expect(reactivated.status).toBe(200);
    expect((await db.doc(`tenants/${tenantId}`).get()).data()?.status).toBe('ACTIVE');
    expect((await db.collection('platformAuditLogs').where('tenantId', '==', tenantId).get()).size).toBe(4);
  });

  it('atribui planos aprovados apenas pelo platform_owner com precondição e audit log', async () => {
    const slug = `qa-plano-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'Loja QA Planos',
      slug,
      ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const assignment = { tenantId, planId: 'ESSENTIAL', expectedPlanId: null, reason: 'Atribuição manual aprovada para QA' };

    const denied = await call('platformAssignTenantPlan', assignment, regularToken);
    expect(denied.body.error?.status).toBe('PERMISSION_DENIED');
    const anonymous = await call('platformAssignTenantPlan', assignment);
    expect(anonymous.status).not.toBe(200);
    const invalid = await call('platformAssignTenantPlan', { ...assignment, planId: 'FREE' }, platformToken);
    expect(invalid.body.error?.status).toBe('INVALID_ARGUMENT');
    expect((await db.doc(`tenants/${tenantId}/private/subscription`).get()).exists).toBe(false);

    const first = await call('platformAssignTenantPlan', assignment, platformToken);
    expect(first.status).toBe(200);
    expect(first.body.result?.unchanged).toBe(false);
    const subscriptionRef = db.doc(`tenants/${tenantId}/private/subscription`);
    expect((await subscriptionRef.get()).data()).toMatchObject({
      planId: 'ESSENTIAL',
      subscriptionStatus: 'active',
      assignmentMode: 'MANUAL',
      paymentVerified: false,
    });
    expect((await db.doc(`tenants/${tenantId}`).get()).data()).not.toHaveProperty('planId');

    const repeat = await call('platformAssignTenantPlan', assignment, platformToken);
    expect(repeat.status).toBe(200);
    expect(repeat.body.result?.unchanged).toBe(true);

    const conflict = await call('platformAssignTenantPlan', { ...assignment, planId: 'PREMIUM' }, platformToken);
    expect(conflict.body.error?.status).toBe('ABORTED');

    const update = await call('platformAssignTenantPlan', {
      ...assignment, expectedPlanId: 'ESSENTIAL', planId: 'PRO',
    }, platformToken);
    expect(update.status).toBe(200);
    expect((await subscriptionRef.get()).data()?.planId).toBe('PRO');

    const audits = await db.collection('platformAuditLogs')
      .where('tenantId', '==', tenantId).get();
    expect(audits.docs.filter((doc) => doc.data().action === 'PLAN_ASSIGNED_MANUALLY')).toHaveLength(2);
    expect((await db.doc(`tenants/${tenantId}/private/platform`).get()).data()?.ownerUserId).toBeTruthy();
  });

  it('aplica feature gates no backend sem bloquear tenant legado ou reconciliação após downgrade', async () => {
    const slug = `qa-gating-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'Loja QA Gating', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);

    const newEntry = () => ({
      tenantSlug: slug,
      clientRequestId: randomUUID(),
      kind: 'EXPENSE',
      category: 'Insumos',
      description: 'Despesas de QA',
      amountCents: 1350,
      date: '2026-10-27',
      status: 'PAID',
    });
    const createEntry = await call('saveFinanceEntry', newEntry(), ownerToken);
    expect(createEntry.status).toBe(200); // no plan: grandfathered until explicitly assigned
    const priorId = String(createEntry.body.result?.entryId);
    expect((await db.doc(`tenants/${tenantId}/financeEntries/${priorId}`).get()).exists).toBe(true);

    const assign = async (planId: 'ESSENTIAL' | 'PRO', expectedPlanId: 'ESSENTIAL' | 'PRO' | null) =>
      call('platformAssignTenantPlan', {
        tenantId, planId, expectedPlanId, reason: 'Validação de gating com regressão no emulador',
      }, platformToken);
    expect((await assign('ESSENTIAL', null)).status).toBe(200);
    const blockedFinance = await call('saveFinanceEntry', newEntry(), ownerToken);
    expect(blockedFinance.body.error?.status).toBe('FAILED_PRECONDITION');
    expect(blockedFinance.body.error?.message).toMatch(/plano atual/i);

    const cashOpenPayload = {
      tenantSlug: slug, operation: 'OPEN', clientRequestId: randomUUID(),
      initialBalanceCents: 2500, openingDate: '2026-10-27',
    };
    const blockedCash = await call('operateCashRegister', cashOpenPayload, ownerToken);
    expect(blockedCash.body.error?.status).toBe('FAILED_PRECONDITION');

    // Existing documents can still be corrected, never deleted or hidden.
    const corrected = await call('saveFinanceEntry', { ...newEntry(), id: priorId, description: 'Correção de QA' }, ownerToken);
    expect(corrected.status).toBe(200);
    expect((await db.doc(`tenants/${tenantId}/financeEntries/${priorId}`).get()).data()?.description).toBe('Correção de QA');

    expect((await assign('PRO', 'ESSENTIAL')).status).toBe(200);
    const allowedFinance = await call('saveFinanceEntry', newEntry(), ownerToken);
    expect(allowedFinance.status).toBe(200);
    const opened = await call('operateCashRegister', cashOpenPayload, ownerToken);
    expect(opened.status).toBe(200);
    const registerId = String(opened.body.result?.registerId);
    expect(registerId).toBe(cashOpenPayload.clientRequestId);

    // Downgrade stops NEW premium operations but allows register closure.
    expect((await assign('ESSENTIAL', 'PRO')).status).toBe(200);
    const blockedAgain = await call('operateCashRegister', {
      tenantSlug: slug, operation: 'LOCAL_SALE', registerId, clientRequestId: randomUUID(),
      amountCents: 1000, paymentMethod: 'PIX', description: 'Venda QA',
    }, ownerToken);
    expect(blockedAgain.body.error?.status).toBe('FAILED_PRECONDITION');
    const closed = await call('operateCashRegister', {
      tenantSlug: slug, operation: 'CLOSE', registerId,
      countedCashCents: 2500,
    }, ownerToken);
    expect(closed.status).toBe(200);
    expect((await db.doc(`tenants/${tenantId}/cashRegisters/${registerId}`).get()).data()?.status).toBe('CLOSED');
  });

  it('nega onboarding para usuário que não é platform_owner', async () => {
    const result = await call('platformCreateTenant', {
      displayName: 'Loja não autorizada', slug: `nega-${randomUUID().slice(0, 8)}`, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, regularToken);
    expect(result.status).not.toBe(200);
    expect(result.body.error?.status).toBe('PERMISSION_DENIED');
  });

  it('não cria tenant quando a conta owner ainda não existe', async () => {
    const slug = `owner-ausente-${randomUUID().slice(0, 8)}`;
    const result = await call('platformCreateTenant', {
      displayName: 'Loja sem owner', slug, ownerEmail: `inexistente-${randomUUID()}@example.test`,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(result.status).not.toBe(200);
    expect(result.body.error?.status).toBe('NOT_FOUND');
    expect((await db.doc(`tenantSlugs/${slug}`).get()).exists).toBe(false);
  });

  it('não reativa uma identidade ou conta Authentication desativada', async () => {
    const disabled = await getAuth().createUser({ email: `qa-disabled-${randomUUID()}@example.test`, password, disabled: true });
    await db.doc(`users/${disabled.uid}`).set({ uid: disabled.uid, active: false });
    const slug = `owner-inativo-${randomUUID().slice(0, 8)}`;
    const result = await call('platformCreateTenant', {
      displayName: 'Loja com owner inativo', slug, ownerEmail: disabled.email!,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(result.status).not.toBe(200);
    expect(result.body.error?.status).toBe('FAILED_PRECONDITION');
    expect((await db.doc(`tenantSlugs/${slug}`).get()).exists).toBe(false);
  });
});
