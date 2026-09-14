'use client';
import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { IntegrationMappings } from '@/shared/integration';

interface Readiness { mode: string; status: string; message: string; revision: number; missingCount: number; mappings: IntegrationMappings; rows: Array<{ kind: keyof IntegrationMappings; key: string; label: string }> }
export default function IntegrationPage() {
  const { role } = useAuth();
  const [data, setData] = useState<Readiness | null>(null);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function load() {
    try { setData((await httpsCallable<unknown, Readiness>(getFirebaseClient().functions, 'getIntegrationReadiness')({})).data); }
    catch { setMessage('Não foi possível consultar a integração. Confira a implantação das Functions.'); }
  }
  useEffect(() => { if (role === 'admin') void load(); }, [role]);
  async function save() {
    if (!data || !window.confirm('Salvar estes códigos de integração? Pedidos anteriores manterão seu histórico.')) return;
    setBusy(true); setMessage('');
    try { await httpsCallable(getFirebaseClient().functions, 'saveIntegrationMappings')({ mappings: data.mappings, revision: data.revision }); await load(); setMessage('Códigos salvos. Isso não habilita a conexão Saipos.'); }
    catch { setMessage('Não foi possível salvar. Recarregue para verificar alterações de outro administrador.'); }
    finally { setBusy(false); }
  }
  return <AdminShell adminOnly><div className="mx-auto max-w-5xl"><h1 className="text-3xl font-black">Integração Saipos</h1><p className="mt-2 text-sm">Mapeie os identificadores oficiais. Produtos e opcionais não são identificados pelo nome.</p>{message && <p role="status" className="my-4 rounded-xl bg-amber-50 p-4">{message}</p>}{data && <><section className="my-6 rounded-2xl border bg-white p-5"><strong>{data.status} · {data.mode}</strong><p className="mt-2">{data.message}</p><p className="mt-2 font-bold">{data.rows.filter((row) => !data.mappings[row.kind][row.key]).length} códigos ausentes no catálogo ativo</p><p className="mt-2 text-sm text-gray-600">Saipos permanece responsável por caixa, produção, fiscal e impressão. Credenciais são configuradas somente no servidor.</p></section><div className="mb-4 flex flex-wrap items-center gap-3"><input aria-label="Buscar produto ou código" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto, tamanho ou código" className="min-w-0 flex-1 rounded-xl border p-3" /><label className="flex gap-2 text-sm"><input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} /> Apenas ausentes</label></div><div className="space-y-2">{data.rows.filter((row) => (!missingOnly || !data.mappings[row.kind][row.key]) && `${row.label} ${row.key}`.toLowerCase().includes(search.toLowerCase())).map((row) => <label key={`${row.kind}:${row.key}`} className="grid gap-2 rounded-xl bg-white p-4 sm:grid-cols-2"><span><strong>{row.label}</strong><small className="block break-all text-gray-500">{row.kind} · {row.key}</small></span><input aria-label={`Código ${row.label} ${row.kind}`} maxLength={120} value={data.mappings[row.kind][row.key] ?? ''} placeholder="Código oficial pendente" className="min-w-0 rounded-lg border p-3" onChange={(event) => { const mappings = { ...data.mappings, [row.kind]: { ...data.mappings[row.kind] } }; const value = event.target.value; if (value.trim()) mappings[row.kind][row.key] = value; else delete mappings[row.kind][row.key]; setData({ ...data, mappings }); }} /></label>)}</div><Button disabled={busy} onClick={save} className="sticky bottom-4 mt-5 bg-[#82204f] text-white">{busy ? 'Salvando…' : 'Salvar códigos'}</Button></>}</div></AdminShell>;
}
