import { HttpsError } from 'firebase-functions/v2/https';
import { canUseFeature, resolveEntitlements } from '../../shared/entitlements.js';
import type { CommercialFeature } from '../../shared/plan-catalog.js';
import { currentTenant, rawDb } from './tenant.js';

/**
 * Backend-only check after tenant-scoped membership/RBAC was authorized.
 * No subscription document = existing tenant awaiting migration: preserve
 * its current operations instead of assigning a restrictive plan implicitly.
 *
 * An explicit but malformed commercial assignment is never treated as free.
 * Rules prevent clients from modifying private/subscription directly.
 */
export async function requireCommercialFeature(feature: CommercialFeature): Promise<void> {
  const { tenantId } = currentTenant();
  const subscription = await rawDb.doc(`tenants/${tenantId}/private/subscription`).get();
  if (!subscription.exists) return;

  const resolved = resolveEntitlements(subscription.data() ?? {});
  if (!resolved) {
    throw new HttpsError('failed-precondition', 'Plano comercial inválido; contate a administração da plataforma.');
  }
  if (!canUseFeature(resolved, feature)) {
    throw new HttpsError('failed-precondition', 'Recurso indisponível no plano atual deste estabelecimento.');
  }
}
