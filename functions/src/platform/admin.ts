import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { defaultStorePublicConfig } from '../../../shared/store-config.js';
import { rawDb } from '../tenant.js';

const region = 'southamerica-east1';
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Informe uma cor hexadecimal, como #5634A5.');
const brandingSchema = z.object({
  primaryColor: colorSchema,
  secondaryColor: colorSchema,
  logoUrl: z.string().trim().max(1000).optional().refine((value) => !value || value.startsWith('/') || value.startsWith('https://'), 'A logo deve usar HTTPS ou um caminho local.'),
  faviconUrl: z.string().trim().max(1000).optional().refine((value) => !value || value.startsWith('/') || value.startsWith('https://'), 'O favicon deve usar HTTPS ou um caminho local.'),
});
const createTenantSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(50),
  ownerEmail: z.email().trim().toLowerCase(),
  branding: brandingSchema,
  timezone: z.string().trim().min(1).max(80).default('America/Sao_Paulo'),
});
const updateTenantSchema = z.object({
  tenantId: z.string().min(1).max(100),
  displayName: z.string().trim().min(2).max(80).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
  branding: brandingSchema.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  ownerEmail: z.email().trim().toLowerCase().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'tenantId'), 'Informe ao menos uma alteração.');
const supportSchema = z.object({ tenantId: z.string().min(1).max(100) });

function requireUser(uid: string | undefined): asserts uid is string {
  if (!uid) throw new HttpsError('unauthenticated', 'Entre com a conta de plataforma.');
}

async function requirePlatformOwner(uid: string | undefined): Promise<string> {
  requireUser(uid);
  const identity = await rawDb.doc(`users/${uid}`).get();
  if (!identity.exists || identity.data()?.active === false || identity.data()?.platformRole !== 'platform_owner') {
    throw new HttpsError('permission-denied', 'Somente a pessoa responsável pela plataforma pode fazer isso.');
  }
  return uid;
}

function validateTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(); }
  catch { throw new HttpsError('invalid-argument', 'Fuso horário inválido.'); }
}

async function findOwner(email: string) {
  try {
    const owner = await getAuth().getUserByEmail(email);
    if (owner.disabled) throw new HttpsError('failed-precondition', 'A conta do owner está desativada no Firebase Authentication.');
    const identity = await rawDb.doc(`users/${owner.uid}`).get();
    if (identity.exists && identity.data()?.active === false) throw new HttpsError('failed-precondition', 'A identidade global desse owner está desativada.');
    return owner;
  }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'A conta do owner ainda não existe. Crie ou convide a conta no Firebase Authentication e tente novamente.');
    }
    throw error;
  }
}

function auditRef() { return rawDb.collection('platformAuditLogs').doc(randomUUID()); }

export const platformCreateTenant = onCall({ region, timeoutSeconds: 20, memory: '256MiB', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async (request) => {
  const actorUid = await requirePlatformOwner(request.auth?.uid);
  const parsed = createTenantSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Dados do estabelecimento inválidos.');
  const input = parsed.data;
  validateTimezone(input.timezone);
  const owner = await findOwner(input.ownerEmail);
  const tenantId = input.slug;
  const tenantRef = rawDb.doc(`tenants/${tenantId}`);
  const slugRef = rawDb.doc(`tenantSlugs/${input.slug}`);
  const ownerMembershipRef = rawDb.doc(`tenants/${tenantId}/members/${owner.uid}`);
  const privateRef = rawDb.doc(`tenants/${tenantId}/private/platform`);
  const publicSettingsRef = rawDb.doc(`tenants/${tenantId}/settings/public`);
  const audit = auditRef();

  await rawDb.runTransaction(async (transaction) => {
    const [tenant, slug, ownerIdentity] = await Promise.all([
      transaction.get(tenantRef), transaction.get(slugRef), transaction.get(rawDb.doc(`users/${owner.uid}`)),
    ]);
    if (tenant.exists || slug.exists) throw new HttpsError('already-exists', 'Esse endereço já está sendo usado. Escolha outro slug.');
    if (ownerIdentity.exists && ownerIdentity.data()?.active === false) throw new HttpsError('failed-precondition', 'A identidade global desse owner está desativada.');
    transaction.create(tenantRef, {
      slug: input.slug,
      displayName: input.displayName,
      status: 'ACTIVE',
      branding: input.branding,
      locale: 'pt-BR',
      timezone: input.timezone,
      currency: 'BRL',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(slugRef, { tenantId, createdAt: FieldValue.serverTimestamp() });
    transaction.set(ownerMembershipRef, {
      userId: owner.uid,
      tenantId,
      role: 'tenant_owner',
      status: 'ACTIVE',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(privateRef, { ownerUserId: owner.uid, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(publicSettingsRef, {
      ...defaultStorePublicConfig,
      storeName: input.displayName,
      timezone: input.timezone,
      status: 'ACTIVE',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(rawDb.doc(`users/${owner.uid}`), {
      uid: owner.uid,
      email: owner.email ?? input.ownerEmail,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.create(audit, {
      action: 'TENANT_CREATED',
      actorUid,
      tenantId,
      affectedUserId: owner.uid,
      summary: `Estabelecimento ${input.displayName} criado e owner vinculado.`,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { tenantId, slug: input.slug, status: 'ACTIVE' as const };
});

export const platformUpdateTenant = onCall({ region, timeoutSeconds: 20, memory: '256MiB', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async (request) => {
  const actorUid = await requirePlatformOwner(request.auth?.uid);
  const parsed = updateTenantSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Alteração inválida.');
  const input = parsed.data;
  if (input.timezone) validateTimezone(input.timezone);
  const newOwner = input.ownerEmail ? await findOwner(input.ownerEmail) : undefined;
  const tenantRef = rawDb.doc(`tenants/${input.tenantId}`);
  const privateRef = rawDb.doc(`tenants/${input.tenantId}/private/platform`);
  const newOwnerRef = newOwner ? rawDb.doc(`tenants/${input.tenantId}/members/${newOwner.uid}`) : undefined;
  const audit = auditRef();

  await rawDb.runTransaction(async (transaction) => {
    const [tenantSnapshot, privateSnapshot] = await Promise.all([transaction.get(tenantRef), transaction.get(privateRef)]);
    if (!tenantSnapshot.exists) throw new HttpsError('not-found', 'Estabelecimento não encontrado.');
    const previousOwnerId = privateSnapshot.data()?.ownerUserId as string | undefined;
    const [previousMembership, newOwnerIdentity] = await Promise.all([
      previousOwnerId ? transaction.get(rawDb.doc(`tenants/${input.tenantId}/members/${previousOwnerId}`)) : Promise.resolve(undefined),
      newOwner ? transaction.get(rawDb.doc(`users/${newOwner.uid}`)) : Promise.resolve(undefined),
    ]);
    if (newOwnerIdentity?.exists && newOwnerIdentity.data()?.active === false) throw new HttpsError('failed-precondition', 'A identidade global desse owner está desativada.');
    if (newOwner && newOwner.uid !== previousOwnerId && newOwnerRef) {
      const membership = await transaction.get(newOwnerRef);
      if (membership.exists && membership.data()?.status !== 'ACTIVE') throw new HttpsError('failed-precondition', 'A associação desse usuário está desativada.');
    }
    const updates = {
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.branding ? { branding: input.branding } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    };
    transaction.update(tenantRef, updates);
    if (input.displayName || input.timezone) transaction.set(rawDb.doc(`tenants/${input.tenantId}/settings/public`), {
      ...(input.displayName ? { storeName: input.displayName } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (newOwner && newOwner.uid !== previousOwnerId && newOwnerRef) {
      if (previousOwnerId && previousMembership?.exists) transaction.set(rawDb.doc(`tenants/${input.tenantId}/members/${previousOwnerId}`), {
        userId: previousOwnerId,
        tenantId: input.tenantId,
        role: 'admin',
        status: 'ACTIVE',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(newOwnerRef, {
        userId: newOwner.uid,
        tenantId: input.tenantId,
        role: 'tenant_owner',
        status: 'ACTIVE',
        updatedAt: FieldValue.serverTimestamp(),
        ...(newOwner.email ? { email: newOwner.email } : {}),
      }, { merge: true });
      transaction.set(privateRef, { ownerUserId: newOwner.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(rawDb.doc(`users/${newOwner.uid}`), {
        uid: newOwner.uid,
        email: newOwner.email ?? input.ownerEmail,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.create(audit, {
      action: input.status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : input.status === 'ACTIVE' ? 'TENANT_REACTIVATED' : 'TENANT_UPDATED',
      actorUid,
      tenantId: input.tenantId,
      ...(newOwner ? { affectedUserId: newOwner.uid } : {}),
      changes: { ...(input.displayName ? { displayName: input.displayName } : {}), ...(input.status ? { status: input.status } : {}), ...(input.timezone ? { timezone: input.timezone } : {}), ...(input.branding ? { branding: input.branding } : {}), ...(newOwner ? { ownerEmail: newOwner.email } : {}) },
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { tenantId: input.tenantId, updated: true };
});

export const platformStartTenantSupport = onCall({ region, timeoutSeconds: 15, memory: '256MiB', enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async (request) => {
  const actorUid = await requirePlatformOwner(request.auth?.uid);
  const parsed = supportSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Estabelecimento inválido.');
  const tenant = await rawDb.doc(`tenants/${parsed.data.tenantId}`).get();
  if (!tenant.exists) throw new HttpsError('not-found', 'Estabelecimento não encontrado.');
  const supportId = randomUUID();
  await auditRef().set({
    action: 'SUPPORT_CONTEXT_STARTED',
    actorUid,
    tenantId: parsed.data.tenantId,
    supportId,
    summary: 'Contexto de suporte somente leitura iniciado; nenhuma sessão de tenant foi assumida.',
    createdAt: FieldValue.serverTimestamp(),
  });
  return { supportId, tenantId: parsed.data.tenantId, slug: tenant.data()?.slug, mode: 'READ_ONLY' as const };
});
