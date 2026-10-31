import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { requireActiveCommercialEntitlements } from './commercial.js';
import { currentTenant, rawDb } from './tenant.js';

/**
 * The quota follows the tenant's calendar month (not the server's UTC month).
 * Explicit formatToParts avoids locale-dependent ordering and handles year
 * rollover. A wider UTC query window includes all possible IANA offsets.
 */
export function tenantCalendarMonth(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit',
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Unable to determine tenant calendar month.');
  return `${year}-${month}`;
}

/**
 * Called strictly inside createOrder's idempotency transaction, after
 * checking orderRequests/{clientRequestId} and before creating the order.
 *
 * The monthly usage document serializes competing requests. On first use
 * of the quota it counts orders already in the tenant's collection (including
 * those created before plan assignment), using a projection to avoid loading
 * customer PII into the quota code. All reads precede all writes.
 *
 * No subscription document means an unassigned migration tenant: no gate.
 */
export async function reserveMonthlyOrder(transaction: Transaction, at: Date): Promise<void> {
  const { tenantId } = currentTenant();
  const subscriptionRef = rawDb.doc(`tenants/${tenantId}/private/subscription`);
  const subscription = await transaction.get(subscriptionRef);
  if (!subscription.exists) return;

  const entitlements = requireActiveCommercialEntitlements(subscription.data(), at.getTime());
  if (!entitlements) return;
  const tenantRef = rawDb.doc(`tenants/${tenantId}`);
  const tenant = await transaction.get(tenantRef);
  const timezone = tenant.data()?.timezone;
  if (!tenant.exists || typeof timezone !== 'string') {
    throw new HttpsError('failed-precondition', 'Fuso horário do estabelecimento não configurado.');
  }

  let monthKey: string;
  try { monthKey = tenantCalendarMonth(at, timezone); }
  catch { throw new HttpsError('failed-precondition', 'Fuso horário do estabelecimento inválido.'); }

  const usageRef = rawDb.doc(`tenants/${tenantId}/commercialUsage/orders-${monthKey}`);
  const usage = await transaction.get(usageRef);
  let used: number;
  if (usage.exists) {
    const stored = usage.data()?.count;
    if (!Number.isSafeInteger(stored) || stored < 0) {
      throw new HttpsError('failed-precondition', 'Contador mensal inconsistente. Solicite reconciliação à plataforma.');
    }
    used = stored as number;
  } else {
    // Bootstrap existing real orders when a plan is first assigned. UTC
    // boundaries extend 14 hours in both directions to capture every local
    // calendar boundary; the final count filters using the tenant timezone.
    const [year, month] = monthKey.split('-').map(Number);
    const start = Timestamp.fromMillis(Date.UTC(year, month - 1, 1) - 14 * 3600_000);
    const end = Timestamp.fromMillis(Date.UTC(year, month, 1) + 14 * 3600_000);
    const ordersQuery = rawDb.collection(`tenants/${tenantId}/orders`)
      .where('createdAt', '>=', start)
      .where('createdAt', '<', end)
      .select('createdAt');
    const existingOrders = await transaction.get(ordersQuery);
    used = existingOrders.docs.filter((order) => {
      const createdAt = order.data().createdAt as Timestamp | undefined;
      return createdAt instanceof Timestamp && tenantCalendarMonth(createdAt.toDate(), timezone) === monthKey;
    }).length;
  }

  if (used >= entitlements.limits.ordersPerMonth) {
    throw new HttpsError('resource-exhausted', 'Limite mensal de pedidos do plano atingido. Contate a loja.');
  }

  // A single usage document is the optimistic concurrency lock. Firestore
  // retries transactions that race for the final allowed order.
  transaction.set(usageRef, {
    monthKey,
    count: used + 1,
    updatedAt: FieldValue.serverTimestamp(),
    ...(usage.exists ? {} : { initializedAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
}
