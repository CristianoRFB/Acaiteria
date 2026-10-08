// @vitest-environment jsdom

import { createElement, useLayoutEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tenantState = vi.hoisted(() => ({ tenantId: 'acai-mais-sabor' }));

vi.mock('@/components/tenant-provider', () => ({
  useTenant: () => ({
    tenant: { id: tenantState.tenantId, slug: tenantState.tenantId },
    status: 'active',
  }),
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseClient: vi.fn(),
  hasFirebaseConfig: false,
  useDevelopmentSeed: false,
}));

import { CartProvider, useCart } from '@/components/providers';
import { tenantStorageKey } from '@/shared/tenancy';

const observations: Array<{ tenantId: string; productIds: string[]; hydrated: boolean }> = [];

function CartSnapshot() {
  const { items, hydrated } = useCart();
  const tenantId = tenantState.tenantId;

  useLayoutEffect(() => {
    observations.push({
      tenantId,
      productIds: items.map((item) => item.productId),
      hydrated,
    });
  }, [hydrated, items, tenantId]);

  return createElement('div', { 'data-testid': 'cart-state', 'data-hydrated': String(hydrated) },
    items.map((item) => item.productId).join(','),
  );
}

function savedCart(productId: string): string {
  return JSON.stringify([{
    cartItemId: `cart-${productId}`,
    productId,
    sizeId: 'large',
    selections: [],
    quantity: 1,
  }]);
}

function renderCart() {
  return render(createElement(CartProvider, null, createElement(CartSnapshot)));
}

describe('isolamento do carrinho entre tenants', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    observations.length = 0;
    tenantState.tenantId = 'acai-mais-sabor';
  });

  it('nunca expõe o carrinho de A durante a troca para B e restaura o cache próprio de B', async () => {
    window.localStorage.setItem(
      tenantStorageKey('acai-mais-sabor', 'acai-mais-sabor-cart-v2'),
      savedCart('tenant-a-only'),
    );
    window.localStorage.setItem(
      tenantStorageKey('amora-acai-demo', 'acai-mais-sabor-cart-v2'),
      savedCart('tenant-b-only'),
    );

    const view = renderCart();
    await waitFor(() => expect(screen.getByTestId('cart-state').textContent).toBe('tenant-a-only'));

    const beforeIntermediateState = observations.length;
    tenantState.tenantId = '';
    view.rerender(createElement(CartProvider, null, createElement(CartSnapshot)));
    const tenantlessFrame = observations.slice(beforeIntermediateState).find((item) => item.tenantId === '');
    expect(tenantlessFrame).toEqual({ tenantId: '', productIds: [], hydrated: false });
    await waitFor(() => expect(screen.getByTestId('cart-state').getAttribute('data-hydrated')).toBe('true'));

    const beforeSwitch = observations.length;
    tenantState.tenantId = 'amora-acai-demo';
    view.rerender(createElement(CartProvider, null, createElement(CartSnapshot)));

    const firstTenantBFrame = observations.slice(beforeSwitch).find((item) => item.tenantId === 'amora-acai-demo');
    expect(firstTenantBFrame).toEqual({ tenantId: 'amora-acai-demo', productIds: [], hydrated: false });
    await waitFor(() => expect(screen.getByTestId('cart-state').textContent).toBe('tenant-b-only'));
    expect(window.localStorage.getItem(
      tenantStorageKey('acai-mais-sabor', 'acai-mais-sabor-cart-v2'),
    )).toBe(savedCart('tenant-a-only'));
  });

  it('não importa o carrinho global legado de A quando B ainda não tem cache próprio', async () => {
    const legacyCart = savedCart('tenant-a-legacy-only');
    window.localStorage.setItem('acai-mais-sabor-cart-v2', legacyCart);
    tenantState.tenantId = 'amora-acai-demo';

    renderCart();
    await waitFor(() => expect(screen.getByTestId('cart-state').getAttribute('data-hydrated')).toBe('true'));

    expect(screen.getByTestId('cart-state').textContent).toBe('');
    expect(window.localStorage.getItem(
      tenantStorageKey('amora-acai-demo', 'acai-mais-sabor-cart-v2'),
    )).toBeNull();
    expect(window.localStorage.getItem('acai-mais-sabor-cart-v2')).toBe(legacyCart);
  });

  it('migra o carrinho histórico para o namespace de A e remove a chave legada só após copiar', async () => {
    const legacyCart = savedCart('tenant-a-legacy-only');
    window.localStorage.setItem('acai-mais-sabor-cart-v2', legacyCart);

    renderCart();
    await waitFor(() => expect(screen.getByTestId('cart-state').textContent).toBe('tenant-a-legacy-only'));

    expect(window.localStorage.getItem(
      tenantStorageKey('acai-mais-sabor', 'acai-mais-sabor-cart-v2'),
    )).toBe(legacyCart);
    expect(window.localStorage.getItem('acai-mais-sabor-cart-v2')).toBeNull();
  });
});
