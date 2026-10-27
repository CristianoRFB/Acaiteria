import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { rawDb } from '../tenant.js';
import { requirePlatformOwner } from './admin.js';

/**
 * Manual assignment records commercially approved plan metadata only.
 * It does not collect payments, enforce entitlements or assign an implicit
 * plan to legacy tenants. All writes and audit records happen atomically.
 */
const assignSchema = z.object({
  tenantId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  planId: z.enum(['ESSENTIAL', 'PRO', 'PREMIUM']),
  /** Explicit optimistic precondition. null means no plan assigned yet. */
  expectedPlanId: z.enum(['ESSENTIAL', 'PRO', 'PREMIUM']).nullable(),
  reason: z.string().trim().min(8).max(300),
}).strict();

export const platformAssignTenantPlan = onCall({
  region: 'southamerica-east1',
  timeoutSeconds: 20,
  memory: '256MiB',
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  const actorUid = await requirePlatformOwner(request.auth?.uid);
  const parsed = assignSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', parsed.error.issues[0]?.message ?? 'Atribuição de plano inválida.');
  }
  const { tenantId, planId, expectedPlanId, reason } = parsed.data;
  const tenantRef = rawDb.doc(`tenants/${tenantId}`);
  // Never add planId to the public tenant document: Firestore Rules require
  // public metadata to have a fixed shape, and plan/subscription are private.
  const subscriptionRef = rawDb.doc(`tenants/${tenantId}/private/subscription`);
  const auditRef = rawDb.collection('platformAuditLogs').doc(randomUUID());

  return rawDb.runTransaction(async (transaction) => {
    const [tenant, subscription] = await Promise.all([
      transaction.get(tenantRef), transaction.get(subscriptionRef),
    ]);
    if (!tenant.exists) throw new HttpsError('not-found', 'Estabelecimento não encontrado.');
    const existingPlan = subscription.data()?.planId;
    const currentPlanId = existingPlan === 'ESSENTIAL' || existingPlan === 'PRO' || existingPlan === 'PREMIUM'
      ? existingPlan : null;
    // A replay that already reached the requested state is idempotent, even
    // when its original expectedPlanId was null. Different targets must still
    // satisfy the optimistic concurrency precondition.
    if (currentPlanId === planId) {
      return { tenantId, planId, unchanged: true };
    }
    if (currentPlanId !== expectedPlanId) {
      throw new HttpsError('aborted', 'O plano foi alterado por outra sessão. Atualize antes de salvar.');
    }

    transaction.set(subscriptionRef, {
      planId,
      subscriptionStatus: 'active',
      assignmentMode: 'MANUAL',
      paymentVerified: false,
      updatedBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
      ...(subscription.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    transaction.create(auditRef, {
      action: 'PLAN_ASSIGNED_MANUALLY',
      actorUid,
      tenantId,
      previousPlanId: currentPlanId,
      planId,
      reason,
      source: 'PLATFORM_CALLABLE',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { tenantId, planId, unchanged: false };
  });
});
