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
