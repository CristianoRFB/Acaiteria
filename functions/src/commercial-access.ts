import { HttpsError } from 'firebase-functions/v2/https';
import { tenantOnCall, currentTenant, rawDb, requireTenantRole } from './tenant.js';
import { resolveSubscriptionAccess } from '../../shared/subscription-status.js';

/**
 * Authorized, read-only commercial snapshot for tenant administrators.
 * Private subscription documents stay inaccessible via Firestore client SDK.
 * Frontend hints are never authorization; sensitive operations use server gates.
 */
export const getTenantCommercialCapabilities = tenantOnCall({
  region: 'southamerica-east1',
  timeoutSeconds: 15,
  memory: '256MiB',
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  await requireTenantRole(request.auth?.uid, ['admin']);
  const { tenantId } = currentTenant();
  const subscription = await rawDb.doc(`tenants/${tenantId}/private/subscription`).get();
  if (!subscription.exists) {
    return { mode: 'UNASSIGNED' as const, planId: null, features: null, limits: null };
  }
  const access = resolveSubscriptionAccess(subscription.data(), Date.now());
  if (access.state === 'BLOCKED') {
    return { mode: 'BLOCKED' as const, planId: null, features: null, limits: null,
      accessState: access.reason, trialUntilMillis: access.trialUntil };
  }
  if (access.state === 'UNASSIGNED') {
    return { mode: 'UNASSIGNED' as const, planId: null, features: null, limits: null };
  }
  return {
    mode: 'ASSIGNED' as const,
    planId: access.entitlements.planId,
    features: access.entitlements.features,
    limits: access.entitlements.limits,
    accessState: access.state,
    trialUntilMillis: access.trialUntil,
  };
});
