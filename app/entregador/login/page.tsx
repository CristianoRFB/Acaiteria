'use client';

import { signInWithEmailAndPassword } from 'firebase/auth';
import { Bike, LockKeyhole, Mail } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';

export default function DriverLoginPage() {
  const { user, role, loading } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && user && role === 'driver') window.location.href = '/entregador'; }, [loading, role, user]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const data = new FormData(event.currentTarget);
    try { if (!hasFirebaseConfig) throw new Error('O ambiente ainda não está configurado para acesso de entregador.'); await signInWithEmailAndPassword(getFirebaseClient().auth, String(data.get('email') ?? '').trim(), String(data.get('password') ?? '')); window.location.href = '/entregador'; } catch { setError('E-mail ou senha inválidos. Confira os dados e tente novamente.'); } finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center bg-[#f8f7ff] p-5"><section className="w-full max-w-md rounded-[32px] border border-[#e5e1ed] bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-[#6f2bc5] text-white"><Bike className="size-6" /></span><div><p className="text-xs font-black uppercase tracking-widest text-[#6f2bc5]">Açaí Mais Sabor</p><h1 className="text-2xl font-black">Área do entregador</h1></div></div><p className="mt-5 text-sm leading-relaxed text-[#6f6878]">Use o acesso fornecido pela loja para aceitar corridas e confirmar entregas.</p><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-bold">E-mail<div className="relative mt-2"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6f2bc5]" /><input name="email" required type="email" autoComplete="email" className="h-12 w-full rounded-xl border border-[#e5e1ed] bg-[#f8f7ff] pl-10 pr-3 outline-none focus:border-[#6f2bc5]" placeholder="motoboy@empresa.com" /></div></label><label className="block text-sm font-bold">Senha<div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6f2bc5]" /><input name="password" required type="password" autoComplete="current-password" className="h-12 w-full rounded-xl border border-[#e5e1ed] bg-[#f8f7ff] pl-10 pr-3 outline-none focus:border-[#6f2bc5]" placeholder="Sua senha" /></div></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}<Button disabled={busy} type="submit" className="min-h-12 w-full rounded-full bg-[#6f2bc5] text-white">{busy ? 'Entrando…' : 'Entrar'}</Button></form><a href="/" className="mt-5 block text-center text-sm font-bold text-[#6f2bc5]">Voltar para o cardápio</a></section></main>;
}
