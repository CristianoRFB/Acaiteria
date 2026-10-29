'use client';

import { collection, limit, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { ShieldCheck, Users } from 'lucide-react';

import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { useTenant } from '@/components/tenant-provider';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { tenantCallable } from '@/lib/firebase/callable';

interface TeamMember {
  id: string;
  email?: string;
  role: 'tenant_owner' | 'admin' | 'staff' | 'driver';
  status: string;
}
const inputClass = 'mt-2 h-11 w-full rounded-xl border border-border-soft bg-white px-3 text-sm';

export default function TeamPage() {
  const { role } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'admin' | 'staff'>('staff');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasFirebaseConfig || !tenantId || role !== 'tenant_owner') {
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      query(collection(getFirebaseClient().db, 'tenants', tenantId, 'members'), limit(150)),
      (snapshot) => {
        setMembers(snapshot.docs.map((entry) => ({
          id: entry.id, role: 'staff', status: 'INACTIVE', ...entry.data(),
        } as TeamMember)));
        setLoading(false);
      },
      () => { setLoading(false); setError('Não foi possível carregar a equipe.'); },
    );
  }, [tenantId, role]);

  async function changeMembership(next: { email: string; role: 'admin' | 'staff'; enabled: boolean; reason: string }) {
    setBusy(true); setError(''); setNotice('');
    try {
      await tenantCallable(getFirebaseClient().functions, 'setTenantInternalMember')(next);
      setNotice(next.enabled ? 'Acesso à equipe autorizado.' : 'Acesso à equipe desativado.');
      setEmail(''); setReason('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a equipe.');
    } finally {
      setBusy(false);
    }
  }

  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void changeMembership({
      email: email.trim().toLowerCase(), role: memberRole, enabled: true, reason: reason.trim(),
    });
  }

  const internal = members.filter((member) => ['admin', 'staff'].includes(member.role));
  const activeCount = internal.filter((member) => member.status === 'ACTIVE').length;

  return <AdminShell adminOnly>
    <div className="flex items-center gap-3">
      <span className="grid size-12 place-items-center rounded-2xl bg-purple-50 text-brand"><Users /></span>
      <div>
        <h1 className="section-title">Equipe e acessos</h1>
        <p className="mt-1 text-sm text-text-muted">Gerencie quem pode operar este estabelecimento.</p>
      </div>
    </div>
    {role !== 'tenant_owner' ? (
      <p className="mt-6 rounded-2xl border bg-amber-50 p-4 text-sm text-amber-900">Somente o proprietário do estabelecimento pode alterar a equipe.</p>
    ) : <>
      <p className="mt-6 rounded-2xl border bg-white p-4 text-sm text-text-muted">
        <ShieldCheck className="mr-2 inline size-4 text-brand" />
        Usuários internos ativos: <strong>{activeCount}</strong>. O proprietário principal e os entregadores não contam neste limite.
        Os limites são validados no servidor, conforme o plano comercial atribuído.
      </p>
      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mt-4 rounded-2xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
      <form onSubmit={grant} className="surface mt-6 grid gap-4 rounded-3xl p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="text-lg font-black">Vincular usuário existente</h2>
          <p className="mt-1 text-sm text-text-muted">A conta já deve existir no Firebase Auth. Não são criadas senhas neste painel; para primeiro acesso, utilize convite ou recuperação oficial.</p>
        </div>
        <label className="text-sm font-bold">E-mail confirmado
          <input required type="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="equipe@empresa.com" />
        </label>
        <label className="text-sm font-bold">Permissão
          <select className={inputClass} value={memberRole} onChange={(event) => setMemberRole(event.target.value as 'admin' | 'staff')}>
            <option value="staff">Equipe operacional</option>
            <option value="admin">Administrador da loja</option>
          </select>
        </label>
        <label className="text-sm font-bold sm:col-span-2">Justificativa da alteração
          <textarea required minLength={8} maxLength={300} rows={2} className="mt-2 w-full rounded-xl border border-border-soft bg-white p-3 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <Button disabled={busy} className="min-h-11 rounded-full bg-brand text-white sm:col-span-2">{busy ? 'Salvando…' : 'Autorizar acesso'}</Button>
      </form>
      <section className="mt-6 space-y-3">
        <h2 className="text-xl font-black">Membros do estabelecimento</h2>
        {loading && <p className="text-sm text-text-muted">Carregando membros…</p>}
        {!loading && !members.length && <p className="text-sm text-text-muted">Nenhum membro encontrado.</p>}
        {members.filter((member) => member.role !== 'driver').map((member) => (
          <article key={member.id} className="surface flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{member.email || `Conta ${member.id.slice(0, 12)}…`}</p>
              <p className="mt-1 text-xs text-text-muted">{member.role === 'tenant_owner' ? 'Proprietário' : member.role === 'admin' ? 'Administrador' : 'Equipe'} · {member.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</p>
            </div>
            {member.role !== 'tenant_owner' && member.email && (
              <Button type="button" variant="outline" disabled={busy} className="rounded-full" onClick={() => {
                const enabled = member.status !== 'ACTIVE';
                const explanation = window.prompt('Justificativa da alteração (8 a 300 caracteres):');
                if (!explanation || explanation.trim().length < 8) return;
                void changeMembership({ email: member.email!, role: member.role as 'admin' | 'staff', enabled, reason: explanation });
              }}>{member.status === 'ACTIVE' ? 'Desativar' : 'Reativar'}</Button>
            )}
          </article>
        ))}
      </section>
    </>}
  </AdminShell>;
}
