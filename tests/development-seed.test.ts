import { describe, expect, it } from 'vitest';

import { developmentStoreConfig, developmentTenantBConfig } from '../lib/development-seed';

describe('Tenant B development fixtures', () => {
  it('uses fictional contact and operational settings instead of Tenant A store data', () => {
    expect(developmentTenantBConfig.storeName).toBe('Amora Açaí — Demonstração');
    expect(developmentTenantBConfig.address).not.toBe(developmentStoreConfig.address);
    expect(developmentTenantBConfig.city).not.toBe(developmentStoreConfig.city);
    expect(developmentTenantBConfig.phoneDisplay).toBe('');
    expect(developmentTenantBConfig.whatsappNumber).toBe('');
    expect(developmentTenantBConfig.whatsappEnabled).toBe(false);
    expect(developmentTenantBConfig.deliveryConfig).toEqual({ mode: 'FIXED', fixedFeeCents: 500 });
  });
});
