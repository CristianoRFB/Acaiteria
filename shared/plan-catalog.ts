/**
 * Açaí SaaS commercial plan catalog.
 *
 * Approved commercial data only. This module does NOT grant access, count
 * usage, or enforce entitlements. Never use its feature matrix as an auth gate:
 * protected operations require tenant-aware server-side enforcement.
 */
export const PLAN_IDS = ['ESSENTIAL', 'PRO', 'PREMIUM'] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type CommercialFeature =
  | 'DIGITAL_MENU'
  | 'CUSTOMIZABLE_PRODUCTS'
  | 'CART_CHECKOUT'
  | 'PICKUP'
  | 'BASIC_DELIVERY'
  | 'ORDER_TRACKING'
  | 'CATALOG_ADMIN'
  | 'PROMOTIONS'
  | 'STORE_SETTINGS'
  | 'BASIC_WHITE_LABEL'
  | 'OPERATIONAL_NOTIFICATIONS'
  | 'DRIVER_APP'
  | 'DRIVER_DISPATCH'
  | 'DELIVERY_CONFIRMATION_CODE'
  | 'DELIVERY_REASSIGNMENT'
  | 'CASH_REGISTER'
  | 'FINANCE'
  | 'FINANCE_INSIGHTS';

export interface PlanLimits {
  /** Internal team members only. The primary tenant owner is excluded. */
  internalUsers: number;
  /** Dedicated delivery driver accounts. Basic delivery has no driver app. */
  deliveryDrivers: number;
  ordersPerMonth: number;
  units: number;
  /** null means no commercial look-back restriction, NOT data deletion. */
  reportLookbackDays: number | null;
}

export interface CommercialPlan {
  id: PlanId;
  name: 'Essencial' | 'Pro' | 'Premium';
  /** BRL cents, not floating-point reais. */
  monthlyPriceCents: number;
  /** BRL cents, prepaid yearly price. */
  annualPriceCents: number;
  recommended: boolean;
  includedFeatures: readonly CommercialFeature[];
  limits: Readonly<PlanLimits>;
}

const essentialFeatures = [
  'DIGITAL_MENU',
  'CUSTOMIZABLE_PRODUCTS',
  'CART_CHECKOUT',
  'PICKUP',
  'BASIC_DELIVERY',
  'ORDER_TRACKING',
  'CATALOG_ADMIN',
  'PROMOTIONS',
  'STORE_SETTINGS',
  'BASIC_WHITE_LABEL',
] as const satisfies readonly CommercialFeature[];

const proFeatures = [
  ...essentialFeatures,
  'OPERATIONAL_NOTIFICATIONS',
  'DRIVER_APP',
  'DRIVER_DISPATCH',
  'DELIVERY_CONFIRMATION_CODE',
  'DELIVERY_REASSIGNMENT',
  'CASH_REGISTER',
  'FINANCE',
  'FINANCE_INSIGHTS',
] as const satisfies readonly CommercialFeature[];

export const ACAI_PLAN_CATALOG: Readonly<Record<PlanId, CommercialPlan>> = {
  ESSENTIAL: {
    id: 'ESSENTIAL',
    name: 'Essencial',
    monthlyPriceCents: 7990,
    annualPriceCents: 79900,
    recommended: false,
    includedFeatures: essentialFeatures,
    limits: { internalUsers: 2, deliveryDrivers: 0, ordersPerMonth: 300, units: 1, reportLookbackDays: 30 },
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    monthlyPriceCents: 14990,
    annualPriceCents: 149900,
    recommended: true,
    includedFeatures: proFeatures,
    limits: { internalUsers: 6, deliveryDrivers: 5, ordersPerMonth: 1500, units: 1, reportLookbackDays: 365 },
  },
  PREMIUM: {
    id: 'PREMIUM',
    name: 'Premium',
    monthlyPriceCents: 22990,
    annualPriceCents: 229900,
    recommended: false,
    // Premium initially differs through capacity and support, not fictitious modules.
    includedFeatures: proFeatures,
    limits: { internalUsers: 20, deliveryDrivers: 20, ordersPerMonth: 5000, units: 1, reportLookbackDays: null },
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as readonly string[]).includes(value);
}

/**
 * Explicitly return null for missing/invalid plan; migration tenants without a
 * plan must never be silently assigned a commercially restrictive plan.
 */
export function getCommercialPlan(value: unknown): CommercialPlan | null {
  return isPlanId(value) ? ACAI_PLAN_CATALOG[value] : null;
}
