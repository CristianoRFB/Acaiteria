import { resolveEntitlements, type ResolvedEntitlements } from './entitlements.js';

/**
 * Subscription lifecycle is distinct from tenant operational status.
 * Do not infer payment from a manual plan assignment.
 */
export type SubscriptionState = 'ACTIVE' | 'TRIALING' | 'BLOCKED' | 'UNASSIGNED';
export type SubscriptionAccess =
  | { state: 'UNASSIGNED'; entitlements: null; trialUntil: null }
  | { state: 'ACTIVE' | 'TRIALING'; entitlements: ResolvedEntitlements; trialUntil: number | null }
  | { state: 'BLOCKED'; entitlements: null; trialUntil: number | null; reason: 'INVALID_PLAN' | 'INVALID_STATUS' | 'EXPIRED_TRIAL' | 'INACTIVE_SUBSCRIPTION' };

export const PRO_TRIAL_DAYS = 14;

function toEpochMillis(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (value !== null && typeof value === 'object' && 'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const result: unknown = (value as { toMillis: () => unknown }).toMillis();
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  }
  return null;
}

/**
 * Pure and deterministic: all new server operations evaluate the same
 * subscription state using an explicitly supplied clock.
 *
 * A missing document preserves the existing migration tenant (no implicit
 * free plan). A present document is never treated as unassigned, and a
 * malformed status/plan cannot bypass commercial restrictions.
 *
 * Older manually assigned tenants with no status are interpreted as ACTIVE
 * until their subscription document is normalized.
 */
export function resolveSubscriptionAccess(
  document: Record<string, unknown> | undefined,
  nowMs: number,
): SubscriptionAccess {
  if (!document) return { state: 'UNASSIGNED', entitlements: null, trialUntil: null };
  const entitlements = resolveEntitlements(document);
  if (!entitlements) return { state: 'BLOCKED', entitlements: null, trialUntil: null, reason: 'INVALID_PLAN' };

  const status = document.subscriptionStatus ?? 'active';
  if (status === 'active') return { state: 'ACTIVE', entitlements, trialUntil: null };
  if (status === 'trialing') {
    const until = toEpochMillis(document.trialUntil);
    if (until === null) return { state: 'BLOCKED', entitlements: null, trialUntil: null, reason: 'INVALID_STATUS' };
    if (nowMs >= until) return { state: 'BLOCKED', entitlements: null, trialUntil: until, reason: 'EXPIRED_TRIAL' };
    // An explicit Pro trial must never silently grant a Premium trial.
    if (entitlements.planId !== 'PRO') return { state: 'BLOCKED', entitlements: null, trialUntil: until, reason: 'INVALID_STATUS' };
    return { state: 'TRIALING', entitlements, trialUntil: until };
  }
  if (status === 'expired' || status === 'canceled' || status === 'suspended' || status === 'past_due') {
    return { state: 'BLOCKED', entitlements: null, trialUntil: toEpochMillis(document.trialUntil), reason: 'INACTIVE_SUBSCRIPTION' };
  }
  return { state: 'BLOCKED', entitlements: null, trialUntil: null, reason: 'INVALID_STATUS' };
}
