import { describe, expect, it } from 'vitest';
import { PRO_TRIAL_DAYS, resolveSubscriptionAccess } from '../shared/subscription-status';

describe('subscription lifecycle for Açaí SaaS', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');

  it('preserves unassigned legacy tenants without implicitly creating a free plan', () => {
    expect(resolveSubscriptionAccess(undefined, now)).toMatchObject({
      state: 'UNASSIGNED', entitlements: null,
    });
  });

  it('honors an explicitly assigned manual plan without inventing payment verification', () => {
    const state = resolveSubscriptionAccess({ planId: 'ESSENTIAL', subscriptionStatus: 'active', paymentVerified: false }, now);
    expect(state.state).toBe('ACTIVE');
    if (state.state === 'ACTIVE') {
      expect(state.entitlements.limits.ordersPerMonth).toBe(300);
      expect(state.entitlements.features.CASH_REGISTER).toBe(false);
    }
    // Backward compatibility for assignments created before lifecycle support.
    expect(resolveSubscriptionAccess({ planId: 'PRO' }, now).state).toBe('ACTIVE');
  });

  it('enables exactly the approved Pro capabilities before trial expiration', () => {
    const until = now + PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const state = resolveSubscriptionAccess({
      planId: 'PRO', subscriptionStatus: 'trialing', trialUntil: { toMillis: () => until },
    }, now);
    expect(state.state).toBe('TRIALING');
    if (state.state === 'TRIALING') {
      expect(state.entitlements.planId).toBe('PRO');
      expect(state.entitlements.features.DRIVER_DISPATCH).toBe(true);
      expect(state.trialUntil).toBe(until);
    }
  });

  it('expires at the exact server deadline and never deletes historic data', () => {
    const until = now + 1000;
    const data = { planId: 'PRO', subscriptionStatus: 'trialing', trialUntil: new Date(until) };
    expect(resolveSubscriptionAccess(data, until - 1).state).toBe('TRIALING');
    expect(resolveSubscriptionAccess(data, until)).toMatchObject({
      state: 'BLOCKED', reason: 'EXPIRED_TRIAL', entitlements: null,
    });
    expect(resolveSubscriptionAccess(data, until + 1).state).toBe('BLOCKED');
  });

  it('fails closed for suspended, canceled, expired, past-due, invalid or malformed assignments', () => {
    for (const status of ['suspended', 'canceled', 'expired', 'past_due']) {
      expect(resolveSubscriptionAccess({ planId: 'PRO', subscriptionStatus: status }, now))
        .toMatchObject({ state: 'BLOCKED', reason: 'INACTIVE_SUBSCRIPTION' });
    }
    expect(resolveSubscriptionAccess({ planId: 'PRO', subscriptionStatus: 'trialing' }, now))
      .toMatchObject({ state: 'BLOCKED', reason: 'INVALID_STATUS' });
    expect(resolveSubscriptionAccess({ planId: 'PREMIUM', subscriptionStatus: 'trialing', trialUntil: new Date(now + 1000) }, now))
      .toMatchObject({ state: 'BLOCKED', reason: 'INVALID_STATUS' });
    expect(resolveSubscriptionAccess({ planId: 'FREE', subscriptionStatus: 'active' }, now))
      .toMatchObject({ state: 'BLOCKED', reason: 'INVALID_PLAN' });
    expect(resolveSubscriptionAccess({ planId: 'PRO', subscriptionStatus: 'unknown' }, now))
      .toMatchObject({ state: 'BLOCKED', reason: 'INVALID_STATUS' });
  });
});
