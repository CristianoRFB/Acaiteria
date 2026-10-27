import { getCommercialPlan, type CommercialFeature, type PlanLimits } from './plan-catalog';

/**
 * Read-only commercial entitlement resolution. This does NOT authorize any
 * protected operation: Cloud Functions/Rules must verify tenant and membership
 * before enforcing a feature or quota.
 */
export interface TenantEntitlementInput {
  planId?: unknown;
  entitlementOverrides?: unknown;
  limitOverrides?: unknown;
}

export interface ResolvedEntitlements {
  planId: 'ESSENTIAL' | 'PRO' | 'PREMIUM';
  features: Readonly<Record<CommercialFeature, boolean>>;
  limits: Readonly<PlanLimits>;
}

const FEATURE_KEYS: readonly CommercialFeature[] = [
  'DIGITAL_MENU', 'CUSTOMIZABLE_PRODUCTS', 'CART_CHECKOUT', 'PICKUP',
  'BASIC_DELIVERY', 'ORDER_TRACKING', 'CATALOG_ADMIN', 'PROMOTIONS',
  'STORE_SETTINGS', 'BASIC_WHITE_LABEL', 'OPERATIONAL_NOTIFICATIONS',
  'DRIVER_APP', 'DRIVER_DISPATCH', 'DELIVERY_CONFIRMATION_CODE',
  'DELIVERY_REASSIGNMENT', 'CASH_REGISTER', 'FINANCE', 'FINANCE_INSIGHTS',
];

const LIMIT_KEYS = [
  'internalUsers', 'deliveryDrivers', 'ordersPerMonth', 'units', 'reportLookbackDays',
] as const satisfies readonly (keyof PlanLimits)[];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/**
 * No commercial plan is assigned by default. null is intentional: migration
 * tenants cannot be implicitly downgraded or blocked by missing metadata.
 */
export function resolveEntitlements(input: TenantEntitlementInput): ResolvedEntitlements | null {
  const plan = getCommercialPlan(input.planId);
  if (!plan) return null;

  const featureOverrides = asRecord(input.entitlementOverrides);
  const limitOverrides = asRecord(input.limitOverrides);
  const included = new Set<CommercialFeature>(plan.includedFeatures);
  const features = {} as Record<CommercialFeature, boolean>;
  for (const key of FEATURE_KEYS) {
    features[key] = typeof featureOverrides[key] === 'boolean'
      ? featureOverrides[key] : included.has(key);
  }

  const limits: PlanLimits = { ...plan.limits };
  for (const key of LIMIT_KEYS) {
    const override = limitOverrides[key];
    if (override === null && key === 'reportLookbackDays') {
      limits.reportLookbackDays = null;
    } else if (typeof override === 'number' && Number.isSafeInteger(override) && override >= 0) {
      // All quota values are nonnegative integers; reject malformed, negative,
      // fractional and non-finite overrides without coercion.
      if (key === 'reportLookbackDays') limits.reportLookbackDays = override;
      else limits[key] = override;
    }
  }

  return { planId: plan.id, features, limits };
}

export function canUseFeature(resolved: ResolvedEntitlements, feature: CommercialFeature): boolean {
  return resolved.features[feature] === true;
}

export function getPlanLimit<K extends keyof PlanLimits>(resolved: ResolvedEntitlements, key: K): PlanLimits[K] {
  return resolved.limits[key];
}
