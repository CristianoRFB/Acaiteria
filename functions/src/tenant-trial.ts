import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { PRO_TRIAL_DAYS } from '../../shared/subscription-status.js';
import { currentTenant, rawDb, requireTenantRole, tenantOnCall } from './tenant.js';

const schema = z.object({
  tenantSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();

/**
 * Self-service Pro trial for an existing tenant owner, only once per tenant.
 * Subscription metadata stays private; the transaction and authorization run
 * entirely server-side. No payment/card information is collected.
 */
export const tenantStartProTrial = tenantOnCall({
  region: 'southamerica-east1',
  timeoutSeconds: 20,
  memory: '256MiB',
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  const role = await requireTenantRole(request.auth?.uid, ['tenant_owner']);
  if (role !== 'tenant_owner') throw new HttpsError('permission-denied', 'Somente o proprietário pode iniciar o teste Pro.');
  if (!schema.safeParse(request.data).success) throw new HttpsError('invalid-argument', 'Dados inválidos para iniciar o teste.');
  const { tenantId } = currentTenant();
  const ref = rawDb.doc(`tenants/${tenantId}/private/subscription`);
  const audit = rawDb.collection('platformAuditLogs').doc(randomUUID());
  const started = Timestamp.now();
  const until = Timestamp.fromMillis(started.toMillis() + PRO_TRIAL_DAYS * 86_400_000);

  return rawDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) throw new HttpsError('failed-precondition', 'O estabelecimento já utilizou ou recebeu um plano. O teste não pode ser reiniciado.');
    transaction.create(ref, {
      planId: 'PRO', subscriptionStatus: 'trialing', assignmentMode: 'TRIAL',
      trialStartedAt: started, trialUsedAt: started, trialUntil: until,
      paymentVerified: false, createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth!.uid,
    });
    transaction.create(audit, {
      action: 'PRO_TRIAL_STARTED', actorUid: request.auth!.uid, tenantId,
      planId: 'PRO', trialUntil: until, source: 'TENANT_OWNER_CALLABLE',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { tenantId, planId: 'PRO' as const, subscriptionStatus: 'trialing' as const, trialUntilMillis: until.toMillis() };
  });
});
