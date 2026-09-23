// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type DriverSnapshot = {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
};

const mocks = vi.hoisted(() => ({
  driverSnapshot: null as ((snapshot: DriverSnapshot) => void) | null,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  limit: vi.fn(),
  onSnapshot: vi.fn((_query: unknown, listener: (snapshot: DriverSnapshot) => void) => {
    mocks.driverSnapshot = listener;
    listener({ docs: [] });
    return vi.fn();
  }),
  query: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) =>
    vi.fn(async (payload: Record<string, string>) => {
      if (name === 'createDeliveryDriver') {
        mocks.driverSnapshot?.({
          docs: [
            {
              id: 'driver-qa',
              data: () => ({
                name: payload.name,
                phone: payload.phone,
                email: payload.email,
                status: 'OFFLINE',
                enabled: true,
              }),
            },
          ],
        });
        return { data: { email: payload.email } };
      }
      return { data: {} };
    }),
  ),
}));

vi.mock('@/components/admin-shell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseClient: () => ({ db: {}, functions: {} }),
  hasFirebaseConfig: true,
}));

import DriversPage from '@/app/admin/entregadores/page';

describe('cadastro administrativo de entregadores', () => {
  beforeEach(() => {
    mocks.driverSnapshot = null;
  });

  it('encerra o formulário sem erro depois de criar o acesso', async () => {
    render(createElement(DriversPage));
    fireEvent.click(screen.getByRole('button', { name: /Novo entregador/ }));

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Motoboy QA Local' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Telefone' }), {
      target: { value: '17999990001' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de acesso' }), {
      target: { value: 'qa.driver@acai.test' },
    });
    fireEvent.change(screen.getByLabelText('Senha inicial'), {
      target: { value: 'QA-Driver-Only-2026!' },
    });

    const form = screen.getByLabelText('Senha inicial').closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Acesso criado para qa.driver@acai.test',
      );
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText('Senha inicial')).toBeNull();
    expect(screen.getByText('qa.driver@acai.test')).not.toBeNull();
  });
});
