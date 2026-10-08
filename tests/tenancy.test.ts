import { describe, expect, it } from 'vitest';

import {
  TENANT_A,
  resolveTenantRoute,
  tenantCollectionPath,
  tenantDocumentPath,
  tenantPath,
  tenantStorageKey,
} from '../shared/tenancy';

describe('tenant route resolution', () => {
  it('maps the historic root to an explicit Tenant A URL', () => {
    expect(resolveTenantRoute('/')).toEqual({
      kind: 'legacy',
      slug: TENANT_A.slug,
      destination: '/acai-mais-sabor',
    });
  });

  it('preserves historic operational URLs as explicit Tenant A redirects', () => {
    expect(resolveTenantRoute('/admin/pedidos/abc')).toEqual({
      kind: 'legacy',
      slug: TENANT_A.slug,
      destination: '/acai-mais-sabor/admin/pedidos/abc',
    });
  });

  it('strips the slug only for the internal route while retaining a tenant identity', () => {
    expect(resolveTenantRoute('/amora-acai-demo/entregador/entrega/delivery-1')).toEqual({
      kind: 'tenant',
      slug: 'amora-acai-demo',
      internalPath: '/entregador/entrega/delivery-1',
    });
  });

  it('resolves a tenant storefront to the existing home route', () => {
    expect(resolveTenantRoute('/acai-mais-sabor')).toEqual({
      kind: 'tenant',
      slug: TENANT_A.slug,
      internalPath: '/',
    });
  });

  it('does not silently assign platform, asset, or malformed paths to a tenant', () => {
    expect(resolveTenantRoute('/platform/tenants')).toEqual({ kind: 'platform' });
    expect(resolveTenantRoute('/menu/combinados.webp')).toEqual({ kind: 'asset' });
    expect(resolveTenantRoute('/Bad Slug/admin')).toEqual({ kind: 'invalid' });
  });

  it('builds tenant URLs without changing query strings', () => {
    expect(tenantPath('acai-mais-sabor', '/pedido/abc?novo=1')).toBe('/acai-mais-sabor/pedido/abc?novo=1');
  });
});

describe('tenant data boundaries', () => {
  it('builds a structural subcollection boundary', () => {
    expect(tenantCollectionPath('amora-acai-demo', 'orders')).toBe('tenants/amora-acai-demo/orders');
    expect(tenantDocumentPath('acai-mais-sabor', 'orders', 'order-1')).toBe('tenants/acai-mais-sabor/orders/order-1');
  });

  it('namespaces browser persistence and rejects unsafe path segments', () => {
    expect(tenantStorageKey('acai-mais-sabor', 'cart-v2')).toBe('tenant:acai-mais-sabor:cart-v2');
    expect(() => tenantDocumentPath('acai-mais-sabor', 'orders', 'a/b')).toThrow('documentId inválido');
    expect(() => tenantCollectionPath('../other', 'orders')).toThrow('tenantId inválido');
  });
});
