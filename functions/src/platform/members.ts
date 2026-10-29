import { randomUUID } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { resolveEntitlements } from '../../../shared/entitlements.js';
import { currentTenant, rawDb, requireTenantRole, tenantOnCall } from '../tenant.js';

/**
 * Reserve a commercial internal-user seat within the same transaction that
 * grants a tenant membership. Counts existing active staff/admin memberships
 * instead of relying on an uninitialized counter for migrated tenants.
 *
 * excludeUserId supports an owner transfer: an active internal member who
 * becomes tenant_owner stops consuming a seat within that same transaction.
 */
export async function assertInternalMemberSeat(
  transaction: Transaction,
  options: { tenantId?: string; excludeUserId?: string } = {},
): Promise<void> {
  // Platform Owner actions run outside the tenantOnCall AsyncLocalStorage
  // context, so the tenant must be passed explicitly for owner transfers.
  const tenantId = options.tenantId ?? currentTenant().tenantId;
  const { excludeUserId } = options;
  const subscription = await transaction.get(rawDb.doc(`tenants/${tenantId}/private/subscription`));
  if (!subscription.exists) return; // tenants not yet assigned a commercial plan
  const resolved = resolveEntitlements(subscription.data() ?? {});
  if (!resolved) throw new HttpsError('failed-precondition', 'Plano do estabelecimento inválido.');

  const lockRef = rawDb.doc(`tenants/${tenantId}/commercialUsage/memberSeats`);
  await transaction.get(lockRef);
  const memberships = await transaction.get(
    rawDb.collection(`tenants/${tenantId}/members`).where('status', '==', 'ACTIVE'),
  );
  const used = memberships.docs.filter((member) =>
    member.id !== excludeUserId && ['admin', 'staff'].includes(String(member.data().role)),
  ).length;
  if (used >= resolved.limits.internalUsers) {
    throw new HttpsError('resource-exhausted', 'Limite de usuários internos do plano atingido.');
  }
  // Serialize concurrent additions/re-activations through one document.
  transaction.set(lockRef, {
    countAfterReservation: used + 1,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

const memberSchema = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(['admin', 'staff']),
  enabled: z.boolean(),
  reason: z.string().trim().min(8).max(300),
  // tenantOnCall requires this field to resolve the scoped tenant securely.
  tenantSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

/**
 * Tenant owner grants or revokes a membership for a pre-existing Firebase Auth
 * account. Never creates an account, sends or stores passwords, edits the
 * platform owner, edits tenant owners, or converts delivery-driver memberships.
 */
export const setTenantInternalMember = tenantOnCall({
  region: 'southamerica-east1',
  timeoutSeconds: 20,
  memory: '256MiB',
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  const actorRole = await requireTenantRole(request.auth?.uid, ['tenant_owner']);
  if (actorRole !== 'tenant_owner') throw new HttpsError('permission-denied', 'Somente o proprietário do estabelecimento pode gerenciar a equipe.');

  const parsed = memberSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Revise e-mail, papel e justificativa.');
  const { email, role, enabled, reason } = parsed.data;
  const { tenantId } = currentTenant();

  let account: Awaited<ReturnType<ReturnType<typeof getAuth>['getUserByEmail']>>;
  try { account = await getAuth().getUserByEmail(email); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Esta conta não existe no Firebase Authentication. Faça o convite/primeiro acesso antes.');
    }
    throw error;
  }
  if (account.disabled) throw new HttpsError('failed-precondition', 'Conta desativada no Firebase Authentication.');
  if (account.uid === request.auth!.uid) throw new HttpsError('failed-precondition', 'Não é possível alterar seu próprio acesso por este fluxo.');

  const ref = rawDb.doc(`tenants/${tenantId}/members/${account.uid}`);
  const identityRef = rawDb.doc(`users/${account.uid}`);
  const ownerRef = rawDb.doc(`tenants/${tenantId}/private/platform`);
  const audit = rawDb.collection(`tenants/${tenantId}/auditLogs`).doc(randomUUID());

  return rawDb.runTransaction(async (transaction) => {
    const [owner, membership, identity] = await Promise.all([
      transaction.get(ownerRef), transaction.get(ref), transaction.get(identityRef),
    ]);
    if (owner.data()?.ownerUserId === account.uid || membership.data()?.role === 'tenant_owner') {
      throw new HttpsError('permission-denied', 'O acesso do proprietário deve ser alterado pelo Platform Owner.');
    }
    if (membership.exists && membership.data()?.role === 'driver') {
      throw new HttpsError('failed-precondition', 'O acesso de entregador é gerenciado separadamente.');
    }
    if (identity.exists && identity.data()?.active === false) {
      throw new HttpsError('failed-precondition', 'Identidade global desativada.');
    }
    const nextStatus = enabled ? 'ACTIVE' : 'INACTIVE';
    if (membership.exists && membership.data()?.role === role && membership.data()?.status === nextStatus) {
      return { userId: account.uid, role, enabled, unchanged: true };
    }
    if (enabled && (!membership.exists || membership.data()?.status !== 'ACTIVE')) {
      await assertInternalMemberSeat(transaction);
    }

    const now = FieldValue.serverTimestamp();
    transaction.set(ref, {
      userId: account.uid, tenantId, email: account.email, role, status: nextStatus,
      updatedAt: now,
      ...(!membership.exists ? { createdAt: now } : {}),
    }, { merge: true });
    if (!identity.exists) {
      transaction.create(identityRef, { uid: account.uid, email: account.email, active: true, createdAt: now, updatedAt: now });
    }
    transaction.create(audit, {
      action: enabled ? 'INTERNAL_MEMBER_GRANTED' : 'INTERNAL_MEMBER_DISABLED',
      actorUid: request.auth!.uid, affectedUserId: account.uid,
      role, previousRole: membership.data()?.role ?? null,
      previousStatus: membership.data()?.status ?? null,
      reason, createdAt: now,
    });
    return { userId: account.uid, role, enabled, unchanged: false };
  });
});
