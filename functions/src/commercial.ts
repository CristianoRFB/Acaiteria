import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { canUseFeature, type ResolvedEntitlements } from '../../shared/entitlements.js';
import { resolveSubscriptionAccess } from '../../shared/subscription-status.js';
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
export function requireActiveCommercialEntitlements(
  subscription: Record<string, unknown> | undefined,
  nowMs = Date.now(),
): ResolvedEntitlements | null {
  const access = resolveSubscriptionAccess(subscription, nowMs);
  if (access.state === 'UNASSIGNED') return null;
  if (access.state === 'BLOCKED') {
    if (access.reason === 'EXPIRED_TRIAL') {
      throw new HttpsError('failed-precondition', 'O período de teste Pro terminou. Solicite um plano à administração da plataforma.');
    }
    throw new HttpsError('failed-precondition', 'Assinatura inativa ou inválida. Contate a administração da plataforma.');
  }
  return access.entitlements;
}

export async function requireCommercialFeature(feature: CommercialFeature): Promise<void> {
  const { tenantId } = currentTenant();
  const subscription = await rawDb.doc(`tenants/${tenantId}/private/subscription`).get();
  const resolved = requireActiveCommercialEntitlements(subscription.data());
  if (!resolved) return; // Migration tenant with no assigned plan.
  if (!canUseFeature(resolved, feature)) {
    throw new HttpsError('failed-precondition', 'Recurso indisponível no plano atual deste estabelecimento.');
  }
}

/**
 * Reserve a driver seat inside the same Firestore transaction that activates or
 * creates the driver. The shared lock document serializes competing additions,
 * while a query of actual enabled drivers protects migrated/preexisting tenants
 * against counters initialized at zero.
 *
 * Call ONLY when a driver goes from absent/disabled to enabled. The caller
 * must read its driver record before invoking this function, and perform its
 * writes afterward (Firestore transactions require reads before writes).
 */
export async function reserveDeliveryDriverSeat(transaction: Transaction): Promise<void> {
  const { tenantId } = currentTenant();
  const subscriptionRef = rawDb.doc(`tenants/${tenantId}/private/subscription`);
  const subscription = await transaction.get(subscriptionRef);
  if (!subscription.exists) return; // legacy tenant: no commercial assignment

  const resolved = requireActiveCommercialEntitlements(subscription.data());
  if (!resolved || !canUseFeature(resolved, 'DRIVER_APP') || resolved.limits.deliveryDrivers < 1) {
    throw new HttpsError('failed-precondition', 'Entregadores com acesso próprio não estão disponíveis no plano atual.');
  }

  const lockRef = rawDb.doc(`tenants/${tenantId}/commercialUsage/driverSeats`);
  // Always read the shared lock before any write, including when it does not exist.
  // Competing transactions cannot reserve the last seat without a retry.
  await transaction.get(lockRef);
  const activeDrivers = await transaction.get(
    rawDb.collection(`tenants/${tenantId}/deliveryDrivers`).where('enabled', '==', true),
  );
  if (activeDrivers.size >= resolved.limits.deliveryDrivers) {
    throw new HttpsError('resource-exhausted', 'Limite de entregadores ativos deste plano atingido.');
  }

  transaction.set(lockRef, {
    countAfterReservation: activeDrivers.size + 1,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
