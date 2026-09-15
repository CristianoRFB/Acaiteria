'use client';

import { signInWithEmailAndPassword } from 'firebase/auth';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';

export default function AdminLoginPage() {
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!hasFirebaseConfig) { setError('Firebase não configurado.'); return; }
    const data = new FormData(event.currentTarget);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getFirebaseClient().auth, String(data.get('email')), String(data.get('password')));
      window.location.assign('/admin');
    } catch (cause) {
      const code = cause instanceof Error && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
      setError(code === 'auth/unauthorized-domain'
        ? 'Este endereço ainda não está autorizado no Firebase.'
        : code === 'auth/network-request-failed'
          ? 'Não foi possível conectar ao Firebase. Tente novamente.'
          : 'E-mail, senha ou permissão inválidos.');
      setLoading(false);
    }
  }
  return <main className="grid min-h-screen place-items-center bg-[#351924] p-4"><div className="w-full max-w-md rounded-[32px] bg-[#fffaf5] p-6 shadow-2xl sm:p-8"><span className="grid size-12 place-items-center rounded-full bg-[#82204f] font-black text-white">A+</span><h1 className="mt-6 text-3xl font-black tracking-[-.04em]">Entrar no painel</h1><p className="mt-2 text-sm text-[#826a75]">Acesso exclusivo da equipe autorizada.</p><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm font-bold">E-mail<input name="email" type="email" required autoComplete="username" className="mt-2 h-12 w-full rounded-2xl border border-[#82204f]/15 bg-white px-4 font-normal outline-none focus:border-[#82204f]" /></label><label className="block text-sm font-bold">Senha<input name="password" type="password" required autoComplete="current-password" className="mt-2 h-12 w-full rounded-2xl border border-[#82204f]/15 bg-white px-4 font-normal outline-none focus:border-[#82204f]" /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" disabled={loading} className="h-12 w-full rounded-full bg-[#82204f] font-black text-white">{loading ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Entrar</Button></form><p className="mt-5 text-center text-xs text-[#826a75]">Usuários e roles são gerenciados pelo Firebase; nenhuma senha fica no código.</p></div></main>;
}
