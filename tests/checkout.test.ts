// @vitest-environment jsdom

import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ hydrated: false, items: [] as unknown[] }));

vi.mock('@/components/providers', () => ({
  useCart: () => ({ items: mocks.items, hydrated: mocks.hydrated, clear: vi.fn() }),
  useCatalog: () => ({
    catalog: { products: [], categories: [], groups: [], modifiers: [] },
    config: { fulfillmentModes: ['PICKUP'], paymentMethods: ['PIX'] },
    development: true,
  }),
}));

vi.mock('@/components/public-header', () => ({ PublicHeader: () => null }));
vi.mock('@/lib/firebase/client', () => ({ getFirebaseClient: vi.fn(), hasFirebaseConfig: false }));
vi.mock('@/lib/direct-orders', () => ({ createOrderDirect: vi.fn() }));
vi.mock('@/shared/domain', () => ({
  calculateCartPreview: () => ({ items: [], subtotalCents: 0 }),
  calculateDeliveryFee: () => 0,
  formatBRL: (amount: number) => `R$ ${amount}`,
  formatNextOpening: () => '',
  getStoreAvailability: () => ({ acceptingOrders: true, estimate: { label: '30–40 min', detail: '' } }),
}));

import CheckoutPage from '@/app/checkout/page';

describe('restauração do carrinho no checkout', () => {
  beforeEach(() => {
    mocks.hydrated = false;
    mocks.items = [];
  });

  it('não anuncia carrinho vazio antes de terminar a leitura do armazenamento local', () => {
    const view = render(createElement(CheckoutPage));

    expect(screen.getByRole('status').textContent).toContain('Restaurando seu carrinho');
    expect(screen.queryByRole('heading', { name: 'Carrinho vazio' })).toBeNull();

    mocks.hydrated = true;
    view.rerender(createElement(CheckoutPage));
    expect(screen.getByRole('heading', { name: 'Carrinho vazio' })).not.toBeNull();
  });
});
