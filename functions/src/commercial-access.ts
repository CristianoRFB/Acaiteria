import { HttpsError } from 'firebase-functions/v2/https';
import { tenantOnCall, currentTenant, rawDb, requireTenantRole } from './tenant.js';
import { resolveEntitlements } from '../../shared/entitlements.js';

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
  const resolved = resolveEntitlements(subscription.data() ?? {});
  if (!resolved) {
    throw new HttpsError('failed-precondition', 'Plano comercial inválido. Contate a administração da plataforma.');
  }
  return {
    mode: 'ASSIGNED' as const,
    planId: resolved.planId,
    features: resolved.features,
    limits: resolved.limits,
  };
});
