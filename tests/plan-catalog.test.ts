import { describe, expect, it } from 'vitest';
import { ACAI_PLAN_CATALOG, getCommercialPlan, isPlanId, PLAN_IDS } from '../shared/plan-catalog';

describe('approved Açaí commercial catalog', () => {
  it('keeps exactly three approved local plans and highlights Pro', () => {
    expect(PLAN_IDS).toEqual(['ESSENTIAL', 'PRO', 'PREMIUM']);
    expect(Object.keys(ACAI_PLAN_CATALOG)).toEqual([...PLAN_IDS]);
    expect(PLAN_IDS.filter((id) => ACAI_PLAN_CATALOG[id].recommended)).toEqual(['PRO']);
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].name)).toEqual(['Essencial', 'Pro', 'Premium']);
  });

  it('stores approved monthly and yearly prices as BRL cents', () => {
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].monthlyPriceCents)).toEqual([7990, 14990, 22990]);
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].annualPriceCents)).toEqual([79900, 149900, 229900]);
    for (const id of PLAN_IDS) {
      const plan = ACAI_PLAN_CATALOG[id];
      expect(Number.isSafeInteger(plan.monthlyPriceCents)).toBe(true);
      expect(Number.isSafeInteger(plan.annualPriceCents)).toBe(true);
      expect(plan.annualPriceCents).toBeLessThan(plan.monthlyPriceCents * 12);
    }
  });

  it('records approved quotas without counting the primary owner', () => {
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].limits.internalUsers)).toEqual([2, 6, 20]);
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].limits.deliveryDrivers)).toEqual([0, 5, 20]);
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].limits.ordersPerMonth)).toEqual([300, 1500, 5000]);
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].limits.units)).toEqual([1, 1, 1]);
    expect(PLAN_IDS.map((id) => ACAI_PLAN_CATALOG[id].limits.reportLookbackDays)).toEqual([30, 365, null]);
  });

  it('keeps standard online ordering in every plan while Pro has real delivery and finance modules', () => {
    const essential = ACAI_PLAN_CATALOG.ESSENTIAL.includedFeatures;
    const pro = ACAI_PLAN_CATALOG.PRO.includedFeatures;
    const premium = ACAI_PLAN_CATALOG.PREMIUM.includedFeatures;
    expect(essential).toContain('CUSTOMIZABLE_PRODUCTS');
    expect(essential).toContain('ORDER_TRACKING');
    expect(essential).toContain('BASIC_WHITE_LABEL');
    expect(essential).not.toContain('DRIVER_APP');
    expect(essential).not.toContain('CASH_REGISTER');
    expect(pro).toEqual(expect.arrayContaining([
      'DRIVER_APP',
      'DRIVER_DISPATCH',
      'DELIVERY_CONFIRMATION_CODE',
      'DELIVERY_REASSIGNMENT',
      'CASH_REGISTER',
      'FINANCE',
      'FINANCE_INSIGHTS',
    ]));
    expect(premium).toEqual(pro);
  });

  it('never silently grants a plan to an invalid or unmigrated tenant', () => {
    expect(isPlanId('PRO')).toBe(true);
    expect(isPlanId('FREE')).toBe(false);
    expect(getCommercialPlan('PREMIUM')).toBe(ACAI_PLAN_CATALOG.PREMIUM);
    for (const missing of [undefined, null, '', 'FREE', 'premium', {}, 123]) {
      expect(getCommercialPlan(missing)).toBeNull();
    }
  });
});
