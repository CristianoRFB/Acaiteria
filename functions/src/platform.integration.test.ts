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

  it('enforces five Pro driver seats atomically, preserves existing accounts on downgrade, and enables reactivation', async () => {
    const slug = `qa-seats-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'Loja QA Entregadores', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    const plan = (planId: 'ESSENTIAL' | 'PRO', expectedPlanId: 'ESSENTIAL' | 'PRO' | null) =>
      call('platformAssignTenantPlan', {
        tenantId, planId, expectedPlanId, reason: 'Verificar cota transacional de entregadores',
      }, platformToken);
    const driverPayload = () => ({
      tenantSlug: slug,
      name: 'Motoboy QA',
      phone: '17999990000',
      email: `qa-driver-seat-${randomUUID()}@example.test`,
      password: 'Seat-QA-2026!',
    });
    expect((await plan('ESSENTIAL', null)).status).toBe(200);
    const denied = await call('createDeliveryDriver', driverPayload(), ownerToken);
    expect(denied.body.error?.status).toBe('FAILED_PRECONDITION');
    expect((await db.collection(`tenants/${tenantId}/deliveryDrivers`).get()).empty).toBe(true);

    expect((await plan('PRO', 'ESSENTIAL')).status).toBe(200);
    // Existing drivers (for example imported during migration) consume seats.
    await Promise.all(Array.from({ length: 4 }, (_, index) =>
      db.doc(`tenants/${tenantId}/deliveryDrivers/legacy-${index}`).set({
        userId: `legacy-${index}`, enabled: true, status: 'OFFLINE',
      })));

    // Both requests observe only one seat remaining. The shared transactional
    // lock must serialize them so exactly one account is activated.
    const [first, second] = await Promise.all([
      call('createDeliveryDriver', driverPayload(), ownerToken),
      call('createDeliveryDriver', driverPayload(), ownerToken),
    ]);
    const accepted = [first, second].filter((result) => result.status === 200);
    const rejected = [first, second].filter((result) => result.status !== 200);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].body.error?.status).toMatch(/RESOURCE_EXHAUSTED|ABORTED/);
    const driverId = String(accepted[0].body.result?.uid);
    expect((await db.collection(`tenants/${tenantId}/deliveryDrivers`).where('enabled', '==', true).get()).size).toBe(5);

    expect((await plan('ESSENTIAL', 'PRO')).status).toBe(200);
    const existing = await db.doc(`tenants/${tenantId}/deliveryDrivers/${driverId}`).get();
    expect(existing.data()?.enabled).toBe(true); // no deletion or forced disable
    expect((await call('createDeliveryDriver', driverPayload(), ownerToken)).body.error?.status).toBe('FAILED_PRECONDITION');

    const disabled = await call('setDeliveryDriverEnabled', { tenantSlug: slug, driverId, enabled: false }, ownerToken);
    expect(disabled.status).toBe(200);
    const cannotReactivate = await call('setDeliveryDriverEnabled', { tenantSlug: slug, driverId, enabled: true }, ownerToken);
    expect(cannotReactivate.body.error?.status).toBe('FAILED_PRECONDITION');

    expect((await plan('PRO', 'ESSENTIAL')).status).toBe(200);
    const reactivated = await call('setDeliveryDriverEnabled', { tenantSlug: slug, driverId, enabled: true }, ownerToken);
    expect(reactivated.status).toBe(200);
    expect((await db.collection(`tenants/${tenantId}/deliveryDrivers`).where('enabled', '==', true).get()).size).toBe(5);
  }, 60000);

  it('exposes tenant capabilities only to authenticated members, scoped to their tenant', async () => {
    const slug = `qa-cap-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Capacidades', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    const requested = { tenantSlug: slug };

    const unassigned = await call('getTenantCommercialCapabilities', requested, ownerToken);
    expect(unassigned.status).toBe(200);
    expect(unassigned.body.result).toMatchObject({ mode: 'UNASSIGNED', planId: null, features: null });

    const denied = await call('getTenantCommercialCapabilities', requested, regularToken);
    expect(denied.body.error?.status).toBe('PERMISSION_DENIED');
    const anonymous = await call('getTenantCommercialCapabilities', requested);
    expect(anonymous.status).not.toBe(200);

    const assigned = await call('platformAssignTenantPlan', {
      tenantId, planId: 'ESSENTIAL', expectedPlanId: null,
      reason: 'Exibir capacidades ao proprietário para testes',
    }, platformToken);
    expect(assigned.status).toBe(200);
    const capabilities = await call('getTenantCommercialCapabilities', requested, ownerToken);
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.result?.mode).toBe('ASSIGNED');
    expect(capabilities.body.result?.planId).toBe('ESSENTIAL');
    expect((capabilities.body.result?.features as Record<string, boolean>).CASH_REGISTER).toBe(false);
    expect((capabilities.body.result?.limits as Record<string, number>).ordersPerMonth).toBe(300);
    expect(capabilities.body.result).not.toHaveProperty('subscriptionStatus');
    expect(capabilities.body.result).not.toHaveProperty('paymentVerified');

    const other = await call('getTenantCommercialCapabilities', {
      tenantSlug: `qa-other-${randomUUID().slice(0, 8)}`,
    }, ownerToken);
    expect(other.status).not.toBe(200);
  });

  it('reserva vagas internas sem ultrapassar o Essencial em convites concorrentes', async () => {
    const slug = `qa-users-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Equipe', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    const assign = await call('platformAssignTenantPlan', {
      tenantId, planId: 'ESSENTIAL', expectedPlanId: null,
      reason: 'Teste de limite de usuários internos e concorrência',
    }, platformToken);
    expect(assign.status).toBe(200);

    const team = await Promise.all(Array.from({ length: 4 }, () =>
      getAuth().createUser({ email: `qa-team-${randomUUID()}@example.test`, password })));
    const payload = (email: string, enabled: boolean, role: 'admin' | 'staff' = 'staff') => ({
      tenantSlug: slug, email, role, enabled, reason: 'Alteração autorizada para testes de equipe',
    });

    // Role/tenant checks happen server-side; an anonymous or unrelated user
    // cannot grant an admin role even if they know tenantSlug and email.
    const denied = await call('setTenantInternalMember', payload(team[0].email!, true, 'admin'), regularToken);
    expect(denied.body.error?.status).toBe('PERMISSION_DENIED');
    expect((await db.doc(`tenants/${tenantId}/members/${team[0].uid}`).get()).exists).toBe(false);

    const missing = await call('setTenantInternalMember', payload(`unregistered-${randomUUID()}@example.test`, true), ownerToken);
    expect(missing.body.error?.status).toBe('NOT_FOUND');
    const first = await call('setTenantInternalMember', payload(team[0].email!, true), ownerToken);
    expect(first.status).toBe(200);
    const repeated = await call('setTenantInternalMember', payload(team[0].email!, true), ownerToken);
    expect(repeated.status).toBe(200);
    expect(repeated.body.result?.unchanged).toBe(true);

    // There is now just one free internal seat. Competing requests may not
    // both grant it even if they initially read the same quota.
    const results = await Promise.all([
      call('setTenantInternalMember', payload(team[1].email!, true), ownerToken),
      call('setTenantInternalMember', payload(team[2].email!, true, 'admin'), ownerToken),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status !== 200)).toHaveLength(1);
    expect(results.find((result) => result.status !== 200)?.body.error?.status)
      .toMatch(/RESOURCE_EXHAUSTED|ABORTED/);
    const active = await db.collection(`tenants/${tenantId}/members`)
      .where('status', '==', 'ACTIVE').get();
    expect(active.docs.filter((doc) => ['staff', 'admin'].includes(String(doc.data().role)))).toHaveLength(2);
    expect(active.docs.filter((doc) => doc.data().role === 'tenant_owner')).toHaveLength(1);

    const firstAsStaff = await signIn(team[0].email!);
    const selfPromotion = await call('setTenantInternalMember', payload(team[3].email!, true, 'admin'), firstAsStaff);
    expect(selfPromotion.body.error?.status).toBe('PERMISSION_DENIED');

    const disabled = await call('setTenantInternalMember', payload(team[0].email!, false), ownerToken);
    expect(disabled.status).toBe(200);
    const granted = await call('setTenantInternalMember', payload(team[3].email!, true), ownerToken);
    expect(granted.status).toBe(200);

    const auditable = await db.collection(`tenants/${tenantId}/auditLogs`)
      .where('action', '==', 'INTERNAL_MEMBER_GRANTED').get();
    expect(auditable.size).toBe(3);
    const noPlaintextSecrets = await db.doc(`users/${team[3].uid}`).get();
    expect(JSON.stringify(noPlaintextSecrets.data())).not.toContain(password);
  }, 120000);

  it('gates new dispatch/reassignment in Essential but preserves Pro behavior', async () => {
    const slug = `qa-dispatch-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Dispatch', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    const assignPlan = (planId: 'ESSENTIAL' | 'PRO', expectedPlanId: 'ESSENTIAL' | 'PRO' | null) =>
      call('platformAssignTenantPlan', {
        tenantId, planId, expectedPlanId, reason: 'Testes de recursos exclusivos de entregas',
      }, platformToken);
    expect((await assignPlan('ESSENTIAL', null)).status).toBe(200);
    const data = { tenantSlug: slug, deliveryId: 'missing-delivery', driverId: 'missing-driver' };
    for (const operation of ['assignDelivery', 'reassignDelivery']) {
      const denied = await call(operation, data, ownerToken);
      expect(denied.body.error?.status).toBe('FAILED_PRECONDITION');
      expect(denied.body.error?.message).toMatch(/plano atual/i);
      const unauthenticated = await call(operation, data);
      expect(unauthenticated.status).not.toBe(200);
    }
    expect((await assignPlan('PRO', 'ESSENTIAL')).status).toBe(200);
    const dispatch = await call('assignDelivery', data, ownerToken);
    expect(dispatch.body.error?.status).toBe('NOT_FOUND');
    // Reassignment has its own preconditions once the Pro gate is passed.
    const reassign = await call('reassignDelivery', data, ownerToken);
    expect(reassign.body.error?.status).toBe('FAILED_PRECONDITION');
    expect(reassign.body.error?.message).not.toMatch(/plano atual/i);
    expect((await db.collection(`tenants/${tenantId}/deliveryEvents`).get()).empty).toBe(true);
  }, 60000);

  it('does not let platform owner transfers bypass internal member quotas', async () => {
    const slug = `qa-owner-seat-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Transfer Quota', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    expect((await call('platformAssignTenantPlan', {
      tenantId, planId: 'ESSENTIAL', expectedPlanId: null,
      reason: 'Testar troca segura de propriedade',
    }, platformToken)).status).toBe(200);
    const subscription = db.doc(`tenants/${tenantId}/private/subscription`);
    await subscription.update({ limitOverrides: { internalUsers: 0 } });
    const attempt = await call('platformUpdateTenant', {
      tenantId, ownerEmail: newOwnerEmail,
    }, platformToken);
    expect(attempt.body.error?.status).toBe('RESOURCE_EXHAUSTED');
    const oldOwner = await getAuth().getUserByEmail(ownerEmail);
    expect((await db.doc(`tenants/${tenantId}/private/platform`).get()).data()?.ownerUserId).toBe(oldOwner.uid);
    expect((await db.doc(`tenants/${tenantId}/members/${oldOwner.uid}`).get()).data()?.role).toBe('tenant_owner');

    await subscription.update({ limitOverrides: { internalUsers: 1 } });
    const transferred = await call('platformUpdateTenant', {
      tenantId, ownerEmail: newOwnerEmail,
    }, platformToken);
    expect(transferred.status).toBe(200);
    const nextOwner = await getAuth().getUserByEmail(newOwnerEmail);
    expect((await db.doc(`tenants/${tenantId}/members/${oldOwner.uid}`).get()).data()?.role).toBe('admin');
    expect((await db.doc(`tenants/${tenantId}/members/${nextOwner.uid}`).get()).data()?.role).toBe('tenant_owner');
    expect((await db.doc(`tenants/${tenantId}/private/platform`).get()).data()?.ownerUserId).toBe(nextOwner.uid);
  }, 60000);

  it('activates a single 14-day Pro trial, expires it server-side and allows manual conversion', async () => {
    const slug = `qa-trial-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Trial Pro', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    const trialPayload = { tenantId, reason: 'Teste Pro gratuito por quatorze dias' };
    const denied = await call('platformStartProTrial', trialPayload, regularToken);
    expect(denied.body.error?.status).toBe('PERMISSION_DENIED');

    const started = await call('platformStartProTrial', trialPayload, platformToken);
    expect(started.status).toBe(200);
    expect(started.body.result).toMatchObject({ planId: 'PRO', subscriptionStatus: 'trialing' });
    const subscriptionRef = db.doc(`tenants/${tenantId}/private/subscription`);
    const initial = (await subscriptionRef.get()).data()!;
    expect(initial.paymentVerified).toBe(false);
    expect(initial.trialUsedAt).toBeTruthy();
    const trialUntilMillis = (initial.trialUntil as { toMillis: () => number }).toMillis();
    expect(trialUntilMillis - Date.now()).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(trialUntilMillis - Date.now()).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);

    const snapshot = await call('getTenantCommercialCapabilities', { tenantSlug: slug }, ownerToken);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.result).toMatchObject({ mode: 'ASSIGNED', planId: 'PRO', accessState: 'TRIALING' });
    expect(snapshot.body.result?.trialUntilMillis).toBe(trialUntilMillis);
    const financeInput = () => ({
      tenantSlug: slug, clientRequestId: randomUUID(),
      kind: 'EXPENSE', category: 'Insumos', description: 'Lançamento em período de teste',
      amountCents: 1350, date: '2026-10-27', status: 'PAID',
    });
    const createdEntry = await call('saveFinanceEntry', financeInput(), ownerToken);
    expect(createdEntry.status).toBe(200);
    const entryId = String(createdEntry.body.result?.entryId);

    await subscriptionRef.update({ trialUntil: new Date(Date.now() - 1000) });
    const expired = await call('getTenantCommercialCapabilities', { tenantSlug: slug }, ownerToken);
    expect(expired.status).toBe(200);
    expect(expired.body.result).toMatchObject({ mode: 'BLOCKED', accessState: 'EXPIRED_TRIAL', features: null });
    expect((await call('saveFinanceEntry', financeInput(), ownerToken)).body.error?.status).toBe('FAILED_PRECONDITION');
    // Existing historical entries remain editable; downgrade/expiry never deletes data.
    expect((await call('saveFinanceEntry', { ...financeInput(), id: entryId, description: 'Correção pós-trial' }, ownerToken)).status).toBe(200);
    expect((await db.doc(`tenants/${tenantId}/financeEntries/${entryId}`).get()).exists).toBe(true);

    const repeated = await call('platformStartProTrial', trialPayload, platformToken);
    expect(repeated.body.error?.status).toBe('FAILED_PRECONDITION');
    const converted = await call('platformAssignTenantPlan', {
      tenantId, planId: 'PRO', expectedPlanId: 'PRO',
      reason: 'Converter trial Pro para atribuição ativa manual',
    }, platformToken);
    expect(converted.status).toBe(200);
    expect(converted.body.result?.unchanged).toBe(false);
    const active = (await subscriptionRef.get()).data()!;
    expect(active.subscriptionStatus).toBe('active');
    expect(active.trialUntil).toBeUndefined();
    expect(active.trialUsedAt).toBeTruthy();
    expect((await call('saveFinanceEntry', financeInput(), ownerToken)).status).toBe(200);
    expect((await call('platformStartProTrial', trialPayload, platformToken)).body.error?.status).toBe('FAILED_PRECONDITION');
    const audits = await db.collection('platformAuditLogs').where('tenantId', '==', tenantId).get();
    expect(audits.docs.filter((doc) => doc.data().action === 'PRO_TRIAL_STARTED')).toHaveLength(1);
  }, 120000);

  it('suspends and resumes manually assigned subscriptions without deleting records', async () => {
    const slug = `qa-sub-status-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Status de Assinatura', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    expect((await call('platformAssignTenantPlan', {
      tenantId, planId: 'PRO', expectedPlanId: null,
      reason: 'Plano Pro manual para testes de suspensão',
    }, platformToken)).status).toBe(200);
    const ownerToken = await signIn(ownerEmail);
    const expense = () => ({
      tenantSlug: slug, clientRequestId: randomUUID(), kind: 'EXPENSE',
      category: 'Insumos', description: 'Entrada de QA', amountCents: 1200,
      date: '2026-10-27', status: 'PAID',
    });
    const saved = await call('saveFinanceEntry', expense(), ownerToken);
    expect(saved.status).toBe(200);
    const entryId = String(saved.body.result?.entryId);
    const payload = { tenantId, expectedStatus: 'active', status: 'suspended', reason: 'Suspensão manual para teste de segurança' };
    expect((await call('platformSetSubscriptionStatus', payload, regularToken)).body.error?.status).toBe('PERMISSION_DENIED');
    expect((await call('platformSetSubscriptionStatus', payload, platformToken)).status).toBe(200);
    const blocked = await call('saveFinanceEntry', expense(), ownerToken);
    expect(blocked.body.error?.status).toBe('FAILED_PRECONDITION');
    expect((await call('getTenantCommercialCapabilities', { tenantSlug: slug }, ownerToken)).body.result)
      .toMatchObject({ mode: 'BLOCKED', accessState: 'INACTIVE_SUBSCRIPTION' });
    expect((await call('saveFinanceEntry', { ...expense(), id: entryId, description: 'Corrigido' }, ownerToken)).status).toBe(200);
    expect((await db.doc(`tenants/${tenantId}/financeEntries/${entryId}`).get()).exists).toBe(true);

    const replay = await call('platformSetSubscriptionStatus', payload, platformToken);
    expect(replay.status).toBe(200);
    expect(replay.body.result?.unchanged).toBe(true);
    const resume = await call('platformSetSubscriptionStatus', {
      tenantId, expectedStatus: 'suspended', status: 'active',
      reason: 'Reativação manual autorizada em QA',
    }, platformToken);
    expect(resume.status).toBe(200);
    expect((await call('saveFinanceEntry', expense(), ownerToken)).status).toBe(200);
    const audits = await db.collection('platformAuditLogs').where('tenantId', '==', tenantId).get();
    expect(audits.docs.filter((doc) => doc.data().action === 'SUBSCRIPTION_STATUS_UPDATED')).toHaveLength(2);
  }, 120000);

  it('enforces tenant report window on the backend, sanitizes orders and preserves ledger history', async () => {
    const slug = `qa-report-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Commercial Reports', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    // Use ISO keys via formatToParts rather than relying on environment locale.
    const dayKey = (d: Date) => {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(d);
      const v = (key: string) => p.find((part) => part.type === key)?.value;
      return `${v('year')}-${v('month')}-${v('day')}`;
    };
    const today = dayKey(new Date());
    const oldDay = dayKey(new Date(Date.now() - 400 * 86_400_000));
    const month = today.slice(0, 7);
    const oldMonth = oldDay.slice(0, 7);
    await Promise.all([
      db.doc(`tenants/${tenantId}/financeEntries/recent`).set({
        date: today, kind: 'INCOME', category: 'Vendas de açaí',
        amountCents: 2500, status: 'PAID', paymentMethod: 'PIX',
        description: 'Receita com campo interno', notes: 'NÃO EXPOR SEGREDO',
      }),
      db.doc(`tenants/${tenantId}/financeEntries/historic`).set({
        date: oldDay, kind: 'INCOME', category: 'Vendas de açaí',
        amountCents: 1200, status: 'PAID',
      }),
      db.doc(`tenants/${tenantId}/orders/report-qa`).set({
        status: 'COMPLETED', updatedAt: new Date(),
        customer: { name: 'NOME PRIVADO', whatsapp: '17999990000' },
        items: [{ productName: 'Açaí tradicional', quantity: 1, totalPriceCents: 2500 }],
        pricing: { totalCents: 2500 }, fulfillment: { mode: 'PICKUP' },
      }),
    ]);
    const ask = (requestedMonth: string, token = ownerToken, slugOverride = slug) =>
      call('getTenantMonthlySalesReport', { tenantSlug: slugOverride, month: requestedMonth }, token);

    const legacy = await ask(month);
    expect(legacy.status).toBe(200);
    expect(legacy.body.result?.entries).toHaveLength(1);
    expect(JSON.stringify(legacy.body.result)).not.toMatch(/NÃO EXPOR SEGREDO|NOME PRIVADO|17999990000/);

    const unauthorized = await ask(month, regularToken);
    expect(unauthorized.body.error?.status).toBe('PERMISSION_DENIED');
    expect((await ask(month, ownerToken, 'not-existing-tenant')).status).not.toBe(200);

    const assign = (planId: 'ESSENTIAL' | 'PRO' | 'PREMIUM', expectedPlanId: 'ESSENTIAL' | 'PRO' | 'PREMIUM' | null) =>
      call('platformAssignTenantPlan', { tenantId, planId, expectedPlanId,
        reason: 'Validar janela comercial sem apagar histórico' }, platformToken);
    expect((await assign('ESSENTIAL', null)).status).toBe(200);
    expect((await ask(month)).body.error?.status).toBe('PERMISSION_DENIED'); // no finance insights in Essential
    expect((await assign('PRO', 'ESSENTIAL')).status).toBe(200);
    expect((await ask(month)).status).toBe(200);
    expect((await ask(oldMonth)).body.error?.status).toBe('PERMISSION_DENIED'); // older than 365 days

    expect((await assign('PREMIUM', 'PRO')).status).toBe(200);
    const fullHistory = await ask(oldMonth);
    expect(fullHistory.status).toBe(200);
    expect(fullHistory.body.result?.entries).toHaveLength(1);
    expect((await db.doc(`tenants/${tenantId}/financeEntries/historic`).get()).exists).toBe(true);

    expect((await assign('PRO', 'PREMIUM')).status).toBe(200);
    expect((await ask(oldMonth)).body.error?.status).toBe('PERMISSION_DENIED');
    expect((await db.doc(`tenants/${tenantId}/financeEntries/historic`).get()).exists).toBe(true);
  }, 120000);

  it('rejects SaaS and operational routes as tenant slugs before any provisioning', async () => {
    for (const slug of ['saas', 'platform', 'admin', 'checkout']) {
      const response = await call('platformCreateTenant', {
        displayName: 'Reserved name test', slug, ownerEmail,
        branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
        timezone: 'America/Sao_Paulo',
      }, platformToken);
      expect(response.body.error?.status).toBe('INVALID_ARGUMENT');
      expect((await db.doc(`tenantSlugs/${slug}`).get()).exists).toBe(false);
    }
  });

  it('starts Pro trial once via tenant owner and rejects concurrent replay or unrelated actors', async () => {
    const slug = `qa-trial-self-${randomUUID().slice(0, 8)}`;
    const created = await call('platformCreateTenant', {
      displayName: 'QA Trial Self Service', slug, ownerEmail,
      branding: { primaryColor: '#5634A5', secondaryColor: '#FFB6C9' },
      timezone: 'America/Sao_Paulo',
    }, platformToken);
    expect(created.status).toBe(200);
    const tenantId = String(created.body.result?.tenantId);
    const ownerToken = await signIn(ownerEmail);
    const payload = { tenantSlug: slug };
    const unauthorized = await call('tenantStartProTrial', payload, regularToken);
    expect(unauthorized.body.error?.status).toBe('PERMISSION_DENIED');
    const anonymous = await call('tenantStartProTrial', payload);
    expect(anonymous.status).not.toBe(200);
    const [a, b] = await Promise.all([
      call('tenantStartProTrial', payload, ownerToken),
      call('tenantStartProTrial', payload, ownerToken),
    ]);
    expect([a,b].filter((response) => response.status === 200)).toHaveLength(1);
    expect([a,b].filter((response) => response.status !== 200)).toHaveLength(1);
    expect([a,b].find((response) => response.status !== 200)?.body.error?.status)
      .toMatch(/FAILED_PRECONDITION|ABORTED/);
    const data = (await db.doc(`tenants/${tenantId}/private/subscription`).get()).data();
    expect(data).toMatchObject({
      planId: 'PRO', subscriptionStatus: 'trialing', paymentVerified: false,
      assignmentMode: 'TRIAL',
    });
    expect(data?.trialUsedAt).toBeTruthy();
    expect((await call('tenantStartProTrial', payload, ownerToken)).body.error?.status).toBe('FAILED_PRECONDITION');
    expect((await call('getTenantCommercialCapabilities', payload, ownerToken)).body.result)
      .toMatchObject({ mode: 'ASSIGNED', planId: 'PRO', accessState: 'TRIALING' });
    const audits = await db.collection('platformAuditLogs').where('tenantId', '==', tenantId).get();
    expect(audits.docs.filter((entry) => entry.data().action === 'PRO_TRIAL_STARTED')).toHaveLength(1);
    expect(audits.docs.find((entry) => entry.data().action === 'PRO_TRIAL_STARTED')?.data().source)
      .toBe('TENANT_OWNER_CALLABLE');
  }, 120000);

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
