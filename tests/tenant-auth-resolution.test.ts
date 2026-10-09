// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authListeners: [] as Array<(user: { uid: string; email: string } | null) => void>,
  tenantState: { tenant: null as { id: string } | null, status: 'loading' },
  getDoc: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, listener: (user: { uid: string; email: string } | null) => void) => {
    mocks.authListeners.push(listener);
    listener({ uid: 'owner-qa', email: 'owner@acai.test' });
    return vi.fn();
  }),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: mocks.getDoc,
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

vi.mock('@/components/tenant-provider', () => ({
  TenantProvider: ({ children }: { children: ReactNode }) => children,
  useTenant: () => mocks.tenantState,
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseClient: () => ({ app: {}, auth: {}, db: {}, functions: {} }),
  hasFirebaseConfig: true,
  useDevelopmentSeed: false,
}));

import { AuthProvider, useAuth } from '@/components/providers';

function AuthStateProbe() {
  const state = useAuth();
  const value = `${state.loading ? 'loading' : 'ready'}:${state.user?.uid ?? 'anonymous'}:${state.role ?? 'no-role'}`;
  return createElement('div', { 'data-testid': 'auth-state' }, value);
}

describe('tenant auth resolution', () => {
  beforeEach(() => {
    mocks.authListeners = [];
    mocks.tenantState = { tenant: null, status: 'loading' };
    mocks.getDoc.mockImplementation(async (reference: { path: string }) => {
      if (reference.path === 'users/owner-qa') return { exists: () => true, data: () => ({ active: true }) };
      if (reference.path === 'tenants/acai-mais-sabor/members/owner-qa') {
        return { exists: () => true, data: () => ({ status: 'ACTIVE', tenantId: 'acai-mais-sabor', role: 'tenant_owner' }) };
      }
      throw new Error(`Unexpected auth lookup path: ${reference.path}`);
    });
  });

  it('keeps authorization pending until the resolved tenant membership can be checked', async () => {
    const view = render(createElement(AuthProvider, null, createElement(AuthStateProbe)));

    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('loading:owner-qa:no-role'));
    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(mocks.getDoc.mock.calls[0][0]).toMatchObject({ path: 'users/owner-qa' });

    mocks.tenantState = { tenant: { id: 'acai-mais-sabor' }, status: 'active' };
    view.rerender(createElement(AuthProvider, null, createElement(AuthStateProbe)));

    await waitFor(() => expect(screen.getByTestId('auth-state').textContent).toBe('ready:owner-qa:tenant_owner'));
    expect(mocks.getDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'tenants/acai-mais-sabor/members/owner-qa' }));
  });
});
