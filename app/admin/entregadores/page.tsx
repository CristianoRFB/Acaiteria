'use client';

import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Bike, KeyRound, Pencil, Phone, Plus, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import type { DeliveryDriverStatus } from '@/shared/delivery';

interface DriverRow {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  status?: DeliveryDriverStatus;
  enabled?: boolean;
  createdAt?: { toDate?: () => Date };
}
const statusLabel: Record<DeliveryDriverStatus, string> = {
  AVAILABLE: 'Disponível',
  BUSY: 'Em entrega',
  OFFLINE: 'Offline',
  INACTIVE: 'Inativo',
};
const statusTone: Record<DeliveryDriverStatus, string> = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  BUSY: 'bg-amber-100 text-amber-900',
  OFFLINE: 'bg-slate-100 text-slate-700',
  INACTIVE: 'bg-red-100 text-red-800',
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DriverRow | null>(null);
  useEffect(() => {
    if (!hasFirebaseConfig) return undefined;
    return onSnapshot(
      query(collection(getFirebaseClient().db, 'deliveryDrivers'), limit(200)),
      (snapshot) =>
        setDrivers(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as DriverRow,
          ),
        ),
      () => setError('Não foi possível carregar os entregadores.'),
    );
  }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const phone = String(data.get('phone') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (
      name.length < 2 ||
      phone.length < 8 ||
      !email.includes('@') ||
      password.length < 8
    ) {
      setError(
        'Preencha nome, telefone, e-mail e uma senha com pelo menos 8 caracteres.',
      );
      setBusy(false);
      return;
    }
    try {
      const result = await httpsCallable<
        { name: string; phone: string; email: string; password: string },
        { email: string }
      >(
        getFirebaseClient().functions,
        'createDeliveryDriver',
      )({ name, phone, email, password });
      setNotice(
        `Acesso criado para ${result.data.email}. O entregador já pode entrar pelo portal.`,
      );
      event.currentTarget.reset();
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível cadastrar o entregador.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(driver: DriverRow) {
    setToggleBusyId(driver.id);
    setError('');
    setNotice('');
    try {
      await httpsCallable(
        getFirebaseClient().functions,
        'setDeliveryDriverEnabled',
      )({ driverId: driver.id, enabled: driver.enabled === false });
      setNotice(
        driver.enabled === false ? 'Motoboy reativado.' : 'Motoboy desativado.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível atualizar o acesso.',
      );
    } finally {
      setToggleBusyId(null);
    }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true); setError(''); setNotice('');
    const data = new FormData(event.currentTarget);
    try {
      await httpsCallable(getFirebaseClient().functions, 'updateDeliveryDriver')({ driverId: editing.id, name: String(data.get('name') ?? '').trim(), phone: String(data.get('phone') ?? '').trim(), email: String(data.get('email') ?? '').trim() });
      setNotice('Cadastro do motoboy atualizado.'); setEditing(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o cadastro.');
    } finally { setBusy(false); }
  }
  return (
    <AdminShell adminOnly>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Operação</p>
          <h1 className="section-title">Entregadores</h1>
          <p className="mt-2 max-w-2xl text-sm text-text-muted">
            Cadastre o acesso do motoboy e acompanhe disponibilidade, entrega
            atual e segurança do recebimento.
          </p>
        </div>
        <Button
          onClick={() => {
            setOpen((value) => !value);
            setError('');
            setNotice('');
          }}
          className="min-h-11 rounded-full bg-brand text-white"
        >
          <Plus className="size-4" /> Novo entregador
        </Button>
      </div>
      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`mt-5 rounded-2xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
        >
          {error || notice}
        </p>
      )}
      {open && (
        <form
          onSubmit={create}
          className="surface mt-6 grid gap-4 rounded-3xl p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <h2 className="text-xl font-black text-brand-deep">Novo acesso</h2>
            <p className="mt-1 text-sm text-text-muted">
              A senha é entregue ao profissional com segurança. Ela não é
              exibida novamente no painel.
            </p>
          </div>
          <label className="text-sm font-bold">
            Nome
            <input
              name="name"
              required
              minLength={2}
              className="mt-2 h-11 w-full rounded-xl border border-border-soft bg-surface-warm px-3"
              placeholder="Ex.: João Silva"
            />
          </label>
          <label className="text-sm font-bold">
            Telefone
            <input
              name="phone"
              required
              minLength={8}
              className="mt-2 h-11 w-full rounded-xl border border-border-soft bg-surface-warm px-3"
              placeholder="(17) 99999-9999"
            />
          </label>
          <label className="text-sm font-bold">
            E-mail de acesso
            <input
              name="email"
              required
              type="email"
              className="mt-2 h-11 w-full rounded-xl border border-border-soft bg-surface-warm px-3"
              placeholder="motoboy@empresa.com"
            />
          </label>
          <label className="text-sm font-bold">
            Senha inicial
            <input
              name="password"
              required
              minLength={8}
              type="password"
              className="mt-2 h-11 w-full rounded-xl border border-border-soft bg-surface-warm px-3"
              placeholder="Mínimo de 8 caracteres"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              disabled={busy}
              type="submit"
              className="min-h-11 rounded-full bg-brand text-white"
            >
              {busy ? 'Criando…' : 'Criar acesso'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 rounded-full"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
      <section className="mt-6 grid gap-3">
        {!drivers.length && (
          <div className="surface rounded-3xl p-8 text-center text-sm text-text-muted">
            Nenhum entregador cadastrado ainda.
          </div>
        )}
        {drivers.map((driver) => (
          <article
            key={driver.id}
            className="surface flex flex-col gap-4 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fff0f5] text-brand">
                <Bike className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-black text-brand-deep">
                  {driver.name ?? 'Entregador sem nome'}
                </h2>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span>
                    <Phone className="mr-1 inline size-3" />
                    {driver.phone ?? 'Telefone não informado'}
                  </span>
                  <span>
                    <KeyRound className="mr-1 inline size-3" />
                    {driver.email ?? 'Sem e-mail'}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${statusTone[driver.status ?? 'OFFLINE']}`}
              >
                {statusLabel[driver.status ?? 'OFFLINE']}
                {driver.enabled === false ? ' · desativado' : ''}
              </span>
              <Button
                variant="outline"
                onClick={() => setEditing(editing?.id === driver.id ? null : driver)}
                className="min-h-9 rounded-full px-3 text-xs font-black"
              >
                <Pencil className="size-3.5" /> Editar
              </Button>
              <Button
                variant="outline"
                disabled={
                  toggleBusyId === driver.id || driver.status === 'BUSY'
                }
                onClick={() => void toggle(driver)}
                className="min-h-9 rounded-full px-3 text-xs font-black"
              >
                {toggleBusyId === driver.id
                  ? 'Salvando…'
                  : driver.enabled === false
                    ? 'Reativar'
                    : 'Desativar'}
              </Button>
            </div>
            {editing?.id === driver.id && (
              <form onSubmit={saveEdit} className="grid w-full gap-3 border-t border-border-soft pt-4 sm:grid-cols-3">
                <label className="text-xs font-bold">Nome<input name="name" required minLength={2} defaultValue={driver.name} className="mt-1 h-10 w-full rounded-xl border border-border-soft bg-surface-warm px-3 text-sm" /></label>
                <label className="text-xs font-bold">Telefone<input name="phone" required minLength={8} defaultValue={driver.phone} className="mt-1 h-10 w-full rounded-xl border border-border-soft bg-surface-warm px-3 text-sm" /></label>
                <label className="text-xs font-bold">E-mail de acesso<input name="email" type="email" required defaultValue={driver.email} className="mt-1 h-10 w-full rounded-xl border border-border-soft bg-surface-warm px-3 text-sm" /></label>
                <div className="flex gap-2 sm:col-span-3"><Button disabled={busy} className="min-h-10 rounded-full bg-brand text-white">{busy ? 'Salvando…' : 'Salvar alterações'}</Button><Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => setEditing(null)}>Cancelar</Button></div>
              </form>
            )}
          </article>
        ))}
      </section>
      <div className="mt-6 rounded-2xl bg-surface-warm p-4 text-sm leading-relaxed text-text-muted">
        <UserRound className="mr-2 inline size-4 text-brand" />
        Para preservar a segurança, o código de 4 dígitos aparece apenas para o
        cliente. O entregador só informa o código recebido e nunca consegue
        consultar o valor secreto.
      </div>
    </AdminShell>
  );
}
