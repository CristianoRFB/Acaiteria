'use client';

import { signInWithEmailAndPassword } from 'firebase/auth';
import { Bike, LockKeyhole, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/components/providers';
import { useTenant } from '@/components/tenant-provider';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { tenantPath } from '@/shared/tenancy';

export default function DriverLoginPage() {
  const { user, role, loading } = useAuth();
  const { tenant } = useTenant();
  const tenantSlug = tenant?.slug;
  const path = (destination: string) => tenant ? tenantPath(tenant.slug, destination) : '#';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && user && role === 'driver' && tenantSlug) window.location.href = tenantPath(tenantSlug, '/entregador'); }, [loading, role, tenantSlug, user]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try { if (!hasFirebaseConfig) throw new Error('O ambiente ainda não está configurado para acesso de entregador.'); await signInWithEmailAndPassword(getFirebaseClient().auth, String(data.get('email') ?? '').trim(), String(data.get('password') ?? '')); window.location.href = path('/entregador'); } catch { setError('E-mail ou senha inválidos. Confira os dados e tente novamente.'); } finally { setBusy(false); }
  }
  return <main className="grid min-h-screen w-full min-w-0 grid-cols-[minmax(0,1fr)] place-items-center bg-[#f8f7ff] p-5"><section className="w-full min-w-0 max-w-md rounded-[32px] border border-[#e5e1ed] bg-white p-6 shadow-sm sm:p-8"><div className="flex min-w-0 items-center gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#6f2bc5] text-white"><Bike className="size-6" /></span><div className="min-w-0"><p className="text-xs font-black uppercase tracking-widest text-[#6f2bc5]">{tenant?.displayName ?? 'Loja'}</p><h1 className="text-xl leading-tight font-black sm:text-2xl">Área do entregador</h1></div></div><p className="mt-5 text-sm leading-relaxed text-[#6f6878]">Use o acesso fornecido pela loja para aceitar corridas e confirmar entregas.</p><form onSubmit={submit} className="mt-7 min-w-0 space-y-4"><label className="block text-sm font-bold">E-mail<div className="relative mt-2"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6f2bc5]" /><input name="email" required type="email" autoComplete="email" className="h-12 w-full min-w-0 rounded-xl border border-[#e5e1ed] bg-[#f8f7ff] pl-10 pr-3 outline-none focus:border-[#6f2bc5]" placeholder="motoboy@empresa.com" /></div></label><label className="block text-sm font-bold">Senha<div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6f2bc5]" /><input name="password" required type="password" autoComplete="current-password" className="h-12 w-full min-w-0 rounded-xl border border-[#e5e1ed] bg-[#f8f7ff] pl-10 pr-3 outline-none focus:border-[#6f2bc5]" placeholder="Sua senha" /></div></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}<Button disabled={busy} type="submit" className="min-h-12 w-full rounded-full bg-[#6f2bc5] text-white">{busy ? 'Entrando…' : 'Entrar'}</Button></form><a href={path('/')} className="mt-5 block text-center text-sm font-bold text-[#6f2bc5]">Voltar para o cardápio</a></section></main>;
}
