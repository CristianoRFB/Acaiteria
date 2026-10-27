import { describe, expect, it } from 'vitest';
import { canUseFeature, getPlanLimit, resolveEntitlements } from '../shared/entitlements';

describe('tenant commercial entitlement resolution (not backend enforcement)', () => {
  it('keeps missing or unknown plan unassigned instead of silently blocking legacy tenants', () => {
    for (const planId of [undefined, null, '', 'TRIAL', 'premium']) {
      expect(resolveEntitlements({ planId })).toBeNull();
    }
  });

  it('resolves approved Essential and Pro features independently per tenant', () => {
    const essential = resolveEntitlements({ planId: 'ESSENTIAL' })!;
    const pro = resolveEntitlements({ planId: 'PRO' })!;
    expect(canUseFeature(essential, 'DIGITAL_MENU')).toBe(true);
    expect(canUseFeature(essential, 'DRIVER_APP')).toBe(false);
    expect(canUseFeature(essential, 'CASH_REGISTER')).toBe(false);
    expect(canUseFeature(pro, 'DRIVER_APP')).toBe(true);
    expect(canUseFeature(pro, 'CASH_REGISTER')).toBe(true);
    expect(getPlanLimit(essential, 'ordersPerMonth')).toBe(300);
    expect(getPlanLimit(pro, 'ordersPerMonth')).toBe(1500);
  });

  it('supports explicit boolean feature overrides but rejects coercible values or unknown fields', () => {
    const plan = resolveEntitlements({
      planId: 'ESSENTIAL',
      entitlementOverrides: {
        DRIVER_APP: true,
        DIGITAL_MENU: false,
        CASH_REGISTER: 'true',
        unknown: true,
      },
    })!;
    expect(canUseFeature(plan, 'DRIVER_APP')).toBe(true);
    expect(canUseFeature(plan, 'DIGITAL_MENU')).toBe(false);
    expect(canUseFeature(plan, 'CASH_REGISTER')).toBe(false);
    expect(Object.keys(plan.features)).not.toContain('unknown');
  });

  it('accepts nonnegative integer quota overrides and unlimited report window only when explicit', () => {
    const plan = resolveEntitlements({
      planId: 'PRO',
      limitOverrides: { ordersPerMonth: 2000, internalUsers: 0, reportLookbackDays: null },
    })!;
    expect(getPlanLimit(plan, 'ordersPerMonth')).toBe(2000);
    expect(getPlanLimit(plan, 'internalUsers')).toBe(0);
    expect(getPlanLimit(plan, 'reportLookbackDays')).toBeNull();
  });

  it('rejects unsafe, fractional, negative and string quota values', () => {
    const plan = resolveEntitlements({
      planId: 'PRO',
      limitOverrides: {
        ordersPerMonth: Number.MAX_SAFE_INTEGER + 1,
        internalUsers: -1,
        deliveryDrivers: 1.5,
        units: '2',
        reportLookbackDays: Infinity,
      },
    })!;
    expect(plan.limits).toEqual({
      internalUsers: 6,
      deliveryDrivers: 5,
      ordersPerMonth: 1500,
      units: 1,
      reportLookbackDays: 365,
    });
  });

  it('never mutates plan catalog or leaks overrides from tenant A into tenant B', () => {
    const a = resolveEntitlements({ planId: 'PRO', entitlementOverrides: { DRIVER_APP: false } })!;
    const b = resolveEntitlements({ planId: 'PRO' })!;
    expect(a.features.DRIVER_APP).toBe(false);
    expect(b.features.DRIVER_APP).toBe(true);
    expect(resolveEntitlements({ planId: 'PRO' })!.features.DRIVER_APP).toBe(true);
  });
});
