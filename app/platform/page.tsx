'use client';

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { Building2, ExternalLink, LoaderCircle, LogOut, Plus, ShieldCheck, Store } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import { platformCallable } from '@/lib/firebase/callable';
import { tenantPath, type TenantBranding, type TenantStatus } from '@/shared/tenancy';

interface PlatformTenant {
  id: string;
  slug: string;
  displayName: string;
  status: TenantStatus;
  branding: TenantBranding;
  timezone: string;
  createdAt?: { toDate?: () => Date };
}

const inputClass = 'mt-1 h-11 w-full rounded-xl border border-[#e5e1ed] bg-white px-3 text-sm outline-none focus:border-[#5634a5] focus:ring-2 focus:ring-[#5634a5]/10';

function explainError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível concluir. Verifique a conexão e tente novamente.';
}

export default function PlatformPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [supportTenant, setSupportTenant] = useState<PlatformTenant | null>(null);
  const [editingTenant, setEditingTenant] = useState<PlatformTenant | null>(null);
  const [editName, setEditName] = useState('');
  const [editOwnerEmail, setEditOwnerEmail] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('#5634A5');
  const [editSecondaryColor, setEditSecondaryColor] = useState('#FFB6C9');
  const [editTimezone, setEditTimezone] = useState('America/Sao_Paulo');
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#5634A5');
  const [secondaryColor, setSecondaryColor] = useState('#FFB6C9');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');

  useEffect(() => {
    if (!user || role !== 'platform_owner') { setTenants([]); setLoading(false); return undefined; }
    const { db } = getFirebaseClient();
    return onSnapshot(query(collection(db, 'tenants'), orderBy('createdAt', 'desc'), limit(100)), (snapshot) => {
      setTenants(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PlatformTenant));
      setLoading(false);
      setError('');
    }, (cause) => { setError(explainError(cause)); setLoading(false); });
  }, [role, user]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { await signInWithEmailAndPassword(getFirebaseClient().auth, email.trim(), password); setPassword(''); }
    catch { setError('E-mail ou senha inválidos, ou esta conta ainda não tem acesso de plataforma.'); }
    finally { setBusy(false); }
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const { functions } = getFirebaseClient();
      const create = platformCallable(functions, 'platformCreateTenant');
      await create({ displayName: displayName.trim(), slug: slug.trim().toLowerCase(), ownerEmail: ownerEmail.trim().toLowerCase(), branding: { primaryColor, secondaryColor }, timezone });
      setNotice(`${displayName.trim()} foi criado e o owner foi vinculado.`);
      setDisplayName(''); setSlug(''); setOwnerEmail('');
    } catch (cause) { setError(explainError(cause)); }
    finally { setBusy(false); }
  }

  async function changeStatus(tenant: PlatformTenant) {
    const status = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmation = status === 'SUSPENDED'
      ? `Suspender ${tenant.displayName}? Os dados permanecem salvos, mas as operações da loja serão bloqueadas.`
      : `Reativar ${tenant.displayName}?`;
    if (!window.confirm(confirmation)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const update = platformCallable(getFirebaseClient().functions, 'platformUpdateTenant');
      await update({ tenantId: tenant.id, status });
      setNotice(status === 'SUSPENDED' ? 'Estabelecimento suspenso. Nenhum dado foi apagado.' : 'Estabelecimento reativado.');
    } catch (cause) { setError(explainError(cause)); }
    finally { setBusy(false); }
  }

  async function startSupport(tenant: PlatformTenant) {
    setBusy(true); setError(''); setNotice('');
    try {
      const start = platformCallable(getFirebaseClient().functions, 'platformStartTenantSupport');
      await start({ tenantId: tenant.id });
      setSupportTenant(tenant);
      setNotice(`Contexto de suporte somente leitura aberto para ${tenant.displayName}.`);
    } catch (cause) { setError(explainError(cause)); }
    finally { setBusy(false); }
  }

  function beginEdit(tenant: PlatformTenant) {
    setEditingTenant(tenant);
    setEditName(tenant.displayName);
    setEditOwnerEmail('');
    setEditPrimaryColor(tenant.branding?.primaryColor ?? '#5634A5');
    setEditSecondaryColor(tenant.branding?.secondaryColor ?? '#FFB6C9');
    setEditTimezone(tenant.timezone || 'America/Sao_Paulo');
    setError(''); setNotice('');
  }

  async function saveTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTenant) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const update = platformCallable(getFirebaseClient().functions, 'platformUpdateTenant');
      await update({
        tenantId: editingTenant.id,
        displayName: editName.trim(),
        branding: { primaryColor: editPrimaryColor, secondaryColor: editSecondaryColor },
        timezone: editTimezone,
        ...(editOwnerEmail.trim() ? { ownerEmail: editOwnerEmail.trim().toLowerCase() } : {}),
      });
      setNotice(`Dados de ${editName.trim()} atualizados.`);
      setEditingTenant(null);
    } catch (cause) { setError(explainError(cause)); }
    finally { setBusy(false); }
  }

  if (!hasFirebaseConfig) return <main className="grid min-h-screen place-items-center bg-[#f7f5fb] p-5"><section className="max-w-md rounded-3xl bg-white p-8 text-center shadow-sm"><Building2 className="mx-auto size-9 text-[#5634a5]" /><h1 className="mt-4 text-2xl font-black">Plataforma ainda não conectada</h1><p className="mt-2 text-sm leading-6 text-[#6f6878]">Configure o Firebase para acessar a gestão de estabelecimentos.</p></section></main>;
  if (authLoading) return <main className="grid min-h-screen place-items-center bg-[#f7f5fb]"><LoaderCircle className="size-7 animate-spin text-[#5634a5]" /></main>;
  if (!user || role !== 'platform_owner') return <main className="grid min-h-screen place-items-center bg-[#f7f5fb] p-5"><section className="w-full max-w-md rounded-3xl border border-[#e9e4f1] bg-white p-7 shadow-sm"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#5634a5] text-white"><ShieldCheck /></div><h1 className="mt-5 text-center text-2xl font-black">Administração da plataforma</h1><p className="mt-2 text-center text-sm leading-6 text-[#6f6878]">Acesso exclusivo da pessoa responsável pela plataforma.</p>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}<form onSubmit={login} className="mt-5 space-y-4"><label className="block text-sm font-bold">E-mail<input className={inputClass} type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="block text-sm font-bold">Senha<input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><Button disabled={busy} className="min-h-11 w-full rounded-full bg-[#5634a5] text-white">{busy ? 'Entrando…' : 'Entrar'}</Button></form></section></main>;

  return <main className="min-h-screen bg-[#f7f5fb] text-[#271d36]"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-10"><header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#6846af]">Área global</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Estabelecimentos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f6878]">Cadastre lojas, acompanhe o estado básico e ajude com suporte sem assumir a identidade de ninguém.</p></div><Button variant="outline" className="rounded-full" onClick={() => void signOut(getFirebaseClient().auth)}><LogOut className="mr-2 size-4" /> Sair</Button></header>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`mt-5 rounded-2xl p-4 text-sm font-semibold ${error ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 rounded-3xl border border-[#e9e4f1] bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">Lojas cadastradas</h2><p className="mt-1 text-sm text-[#6f6878]">Mostrando até 100 estabelecimentos.</p></div><span className="rounded-full bg-[#f2eef8] px-3 py-1 text-sm font-black text-[#5634a5]">{tenants.length}</span></div>
        {loading ? <p className="py-12 text-center text-sm text-[#6f6878]">Carregando…</p> : tenants.length === 0 ? <div className="py-12 text-center"><Store className="mx-auto size-8 text-[#927eb4]" /><p className="mt-3 font-bold">Ainda não há estabelecimentos.</p><p className="mt-1 text-sm text-[#6f6878]">Use o formulário ao lado para iniciar o onboarding.</p></div> : <div className="mt-5 space-y-3">{tenants.map((tenant) => <article key={tenant.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-[#eeeaf3] p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: tenant.branding?.primaryColor ?? '#5634a5' }}><Store className="size-5 text-white" /></span><div className="min-w-0"><h3 className="truncate font-black">{tenant.displayName}</h3><p className="truncate text-xs text-[#6f6878]">/{tenant.slug} · {tenant.timezone}</p><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${tenant.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-800' : tenant.status === 'SUSPENDED' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{tenant.status === 'ACTIVE' ? 'Ativo' : tenant.status === 'SUSPENDED' ? 'Suspenso' : 'Arquivado'}</span></div></div><div className="flex flex-wrap gap-2"><Button disabled={busy} variant="outline" size="sm" onClick={() => beginEdit(tenant)}>Editar</Button><Button disabled={busy || tenant.status === 'ARCHIVED'} variant="outline" size="sm" onClick={() => void changeStatus(tenant)}>{tenant.status === 'ACTIVE' ? 'Suspender' : 'Reativar'}</Button><Button disabled={busy} variant="outline" size="sm" onClick={() => void startSupport(tenant)}>Suporte</Button></div></article>)}</div>}
        {supportTenant && <aside className="mt-5 rounded-2xl border border-[#d9cbed] bg-[#faf7ff] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[#6846af]">Suporte somente leitura</p><h3 className="mt-1 font-black">{supportTenant.displayName}</h3><p className="mt-1 text-sm text-[#6f6878]">Acesso registrado. Nenhuma sessão foi assumida e as permissões do tenant não foram alteradas.</p></div><button type="button" className="text-sm font-bold text-[#6846af]" onClick={() => setSupportTenant(null)}>Fechar</button></div><a className="mt-3 inline-flex items-center gap-2 text-sm font-black text-[#5634a5]" href={tenantPath(supportTenant.slug)} target="_blank" rel="noreferrer">Abrir cardápio público <ExternalLink className="size-4" /></a></aside>}
      </section>
      <section className="h-fit rounded-3xl border border-[#e9e4f1] bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#5634a5] text-white"><Plus className="size-5" /></span><div><h2 className="text-xl font-black">Cadastrar loja</h2><p className="text-sm text-[#6f6878]">Sem plano ou cobrança nesta etapa.</p></div></div>{editingTenant && <form onSubmit={(event) => void saveTenant(event)} className="mt-5 space-y-3 rounded-2xl border border-[#d9cbed] bg-[#faf7ff] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-black">Editar {editingTenant.displayName}</h3><button type="button" className="text-sm font-bold text-[#6846af]" onClick={() => setEditingTenant(null)}>Cancelar</button></div><label className="block text-sm font-bold">Nome da loja<input className={inputClass} value={editName} onChange={(event) => setEditName(event.target.value)} required minLength={2} maxLength={80} /></label><label className="block text-sm font-bold">Novo e-mail do owner (opcional)<input className={inputClass} type="email" value={editOwnerEmail} onChange={(event) => setEditOwnerEmail(event.target.value)} placeholder="Deixe vazio para manter o atual" /></label><label className="block text-sm font-bold">Fuso horário<select className={inputClass} value={editTimezone} onChange={(event) => setEditTimezone(event.target.value)}><option value="America/Sao_Paulo">Brasília</option><option value="America/Manaus">Manaus</option><option value="America/Belem">Belém</option><option value="America/Fortaleza">Fortaleza</option><option value="America/Recife">Recife</option><option value="America/Rio_Branco">Rio Branco</option></select></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">Cor principal<input className={`${inputClass} h-12 p-1.5`} type="color" value={editPrimaryColor} onChange={(event) => setEditPrimaryColor(event.target.value)} /></label><label className="block text-sm font-bold">Cor de apoio<input className={`${inputClass} h-12 p-1.5`} type="color" value={editSecondaryColor} onChange={(event) => setEditSecondaryColor(event.target.value)} /></label></div><Button disabled={busy} className="min-h-11 w-full rounded-full bg-[#5634a5] text-white">{busy ? 'Salvando…' : 'Salvar alterações'}</Button></form>}<form onSubmit={(event) => void createTenant(event)} className="mt-5 space-y-3"><label className="block text-sm font-bold">Nome da loja<input className={inputClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ex.: Amora Açaí" minLength={2} maxLength={80} required /></label><label className="block text-sm font-bold">Endereço curto (slug)<input className={inputClass} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="amora-acai" minLength={3} maxLength={50} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /><span className="mt-1 block text-xs font-normal text-[#6f6878]">O cardápio ficará em /{slug || 'nome-da-loja'}.</span></label><label className="block text-sm font-bold">E-mail do owner<input className={inputClass} type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="responsavel@loja.com" required /><span className="mt-1 block text-xs font-normal text-[#6f6878]">A conta precisa existir antes no Firebase Authentication.</span></label><label className="block text-sm font-bold">Fuso horário<select className={inputClass} value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/Sao_Paulo">Brasília (America/Sao_Paulo)</option><option value="America/Manaus">Manaus</option><option value="America/Belem">Belém</option><option value="America/Fortaleza">Fortaleza</option><option value="America/Recife">Recife</option><option value="America/Rio_Branco">Rio Branco</option></select></label><div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold">Cor principal<input className={`${inputClass} h-12 p-1.5`} type="color" value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} /></label><label className="block text-sm font-bold">Cor de apoio<input className={`${inputClass} h-12 p-1.5`} type="color" value={secondaryColor} onChange={(event) => setSecondaryColor(event.target.value)} /></label></div><Button disabled={busy} className="min-h-11 w-full rounded-full bg-[#5634a5] text-white">{busy ? 'Cadastrando…' : 'Criar estabelecimento'}</Button></form><p className="mt-4 text-xs leading-5 text-[#6f6878]">Criar/suspender uma loja gera registro de auditoria. Suspender não apaga dados.</p></section>
    </div></div></main>;
}
