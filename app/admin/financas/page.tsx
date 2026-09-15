'use client';

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Pencil, Plus, Save, WalletCards, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { AdminField, AdminTextarea } from '@/components/admin-form';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';
import { formatBRL } from '@/shared/domain';
import {
  FINANCE_CATEGORIES,
  formatDateKey,
  parseBRLToCents,
  type FinanceEntry,
  type FinanceEntryKind,
  type FinanceEntryStatus,
} from '@/shared/finance';

const todayKey = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};
const currentMonth = () => todayKey().slice(0, 7);

function moneyInputValue(cents?: number) {
  return cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

export default function FinancesPage() {
  const { role } = useAuth();
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [kind, setKind] = useState<'ALL' | FinanceEntryKind>('ALL');
  const [editing, setEditing] = useState<FinanceEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (role !== 'admin') return undefined;
    return onSnapshot(
      collection(getFirebaseClient().db, 'financeEntries'),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as FinanceEntry);
        next.sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
        setEntries(next);
      },
      () => setError('Não foi possível carregar o caixa. Confira sua conexão e tente novamente.'),
    );
  }, [role]);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.date.startsWith(month) && (kind === 'ALL' || entry.kind === kind)),
    [entries, kind, month],
  );
  const summary = useMemo(() => {
    const income = visibleEntries.filter((entry) => entry.kind === 'INCOME').reduce((total, entry) => total + entry.amountCents, 0);
    const expense = visibleEntries.filter((entry) => entry.kind === 'EXPENSE').reduce((total, entry) => total + entry.amountCents, 0);
    const pending = visibleEntries.filter((entry) => entry.kind === 'INCOME' && entry.status === 'PENDING').reduce((total, entry) => total + entry.amountCents, 0);
    return { income, expense, balance: income - expense, pending };
  }, [visibleEntries]);

  function openNew() {
    setEditing(null);
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  function openEdit(entry: FinanceEntry) {
    setEditing(entry);
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description') ?? '').trim();
    const category = String(data.get('category') ?? '').trim();
    const date = String(data.get('date') ?? '').trim();
    const amountCents = parseBRLToCents(String(data.get('amount') ?? ''));
    if (!description || !category || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !amountCents) {
      setError('Preencha descrição, categoria, data e um valor em reais maior que zero.');
      return;
    }
    const payload = {
      kind: String(data.get('kind') ?? 'INCOME') as FinanceEntryKind,
      category,
      description,
      date,
      amountCents,
      status: String(data.get('status') ?? 'PAID') as FinanceEntryStatus,
      orderNumber: String(data.get('orderNumber') ?? '').trim() || null,
      notes: String(data.get('notes') ?? '').trim() || null,
      updatedAt: serverTimestamp(),
    };
    try {
      const db = getFirebaseClient().db;
      if (editing) await updateDoc(doc(db, 'financeEntries', editing.id), payload);
      else await addDoc(collection(db, 'financeEntries'), { ...payload, createdAt: serverTimestamp() });
      setFormOpen(false);
      setEditing(null);
      setNotice(editing ? 'Lançamento atualizado.' : 'Lançamento adicionado ao caixa.');
    } catch {
      setError('Não foi possível salvar o lançamento. Confira sua conexão e tente novamente.');
    }
  }

  async function toggleStatus(entry: FinanceEntry) {
    setError('');
    try {
      await updateDoc(doc(getFirebaseClient().db, 'financeEntries', entry.id), {
        status: entry.status === 'PAID' ? 'PENDING' : 'PAID',
        updatedAt: serverTimestamp(),
      });
      setNotice(entry.status === 'PAID' ? 'Lançamento marcado como pendente.' : 'Lançamento marcado como pago.');
    } catch {
      setError('Não foi possível atualizar o status do lançamento.');
    }
  }

  return (
    <AdminShell adminOnly>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">Gestão da loja</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Finanças</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#826a75]">Controle simples do dinheiro da açaíteria: vendas, delivery, insumos e despesas em um só lugar.</p>
        </div>
        <Button type="button" onClick={openNew} className="rounded-full bg-[#82204f] text-white"><Plus /> Novo lançamento</Button>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Receitas no mês" value={formatBRL(summary.income)} icon={<ArrowUpRight />} tone="text-emerald-700 bg-emerald-50" />
        <SummaryCard label="Despesas no mês" value={formatBRL(summary.expense)} icon={<ArrowDownLeft />} tone="text-red-700 bg-red-50" />
        <SummaryCard label="Saldo operacional" value={formatBRL(summary.balance)} icon={<WalletCards />} tone={summary.balance >= 0 ? 'text-[#82204f] bg-[#fff0f5]' : 'text-red-700 bg-red-50'} />
        <SummaryCard label="A receber" value={formatBRL(summary.pending)} icon={<CalendarDays />} tone="text-amber-700 bg-amber-50" />
      </section>

      {formOpen && <section className="mt-7 rounded-[26px] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">Caixa</p><h2 className="mt-1 text-2xl font-black">{editing ? 'Editar lançamento' : 'Adicionar ao caixa'}</h2></div><button type="button" onClick={() => setFormOpen(false)} className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]" aria-label="Fechar formulário"><X className="size-4" /></button></div>
        <form onSubmit={save} className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm font-bold">Tipo<select name="kind" defaultValue={editing?.kind ?? 'INCOME'} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"><option value="INCOME">Receita (entrada)</option><option value="EXPENSE">Despesa (saída)</option></select></label>
            <label className="block text-sm font-bold">Categoria<select name="category" defaultValue={editing?.category ?? FINANCE_CATEGORIES[0]} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal">{FINANCE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <AdminField label="Valor (R$)" name="amount" inputMode="decimal" required defaultValue={moneyInputValue(editing?.amountCents)} placeholder="Ex.: 39,90" />
            <AdminField label="Data" name="date" type="date" required defaultValue={editing?.date ?? todayKey()} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><AdminField label="Descrição" name="description" required defaultValue={editing?.description} placeholder="Ex.: Venda de 2 copos 500 ml" /><AdminField label="Pedido relacionado (opcional)" name="orderNumber" defaultValue={editing?.orderNumber} placeholder="Ex.: #A150926EA7C" /></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Situação<select name="status" defaultValue={editing?.status ?? 'PAID'} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"><option value="PAID">Pago / recebido</option><option value="PENDING">Pendente</option></select></label><AdminTextarea label="Observação (opcional)" name="notes" defaultValue={editing?.notes} placeholder="Ex.: pagamento em dinheiro, fornecedor ou conferência pendente." /></div>
          <Button type="submit" className="mt-5 h-11 rounded-full bg-[#82204f] font-black text-white"><Save /> Salvar lançamento</Button>
        </form>
      </section>}

      <section className="mt-7 rounded-[26px] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">Movimentações</p><h2 className="mt-1 text-2xl font-black">Caixa da açaíteria</h2><p className="mt-1 text-sm text-[#826a75]">Use os filtros para conferir um mês ou separar receitas e despesas.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="text-xs font-bold text-[#826a75]">Mês<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 text-sm font-bold" /></label><label className="text-xs font-bold text-[#826a75]">Exibir<select value={kind} onChange={(event) => setKind(event.target.value as 'ALL' | FinanceEntryKind)} className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 text-sm font-bold"><option value="ALL">Tudo</option><option value="INCOME">Receitas</option><option value="EXPENSE">Despesas</option></select></label></div></div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#82204f]/10"><div className="hidden grid-cols-[110px_1fr_150px_130px_110px] gap-4 bg-[#fffaf5] px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[#826a75] md:grid"><span>Data</span><span>Lançamento</span><span>Categoria</span><span>Situação</span><span className="text-right">Valor</span></div>{visibleEntries.map((entry) => <article key={entry.id} className="grid gap-3 border-b border-[#82204f]/8 px-4 py-4 last:border-0 md:grid-cols-[110px_1fr_150px_130px_110px] md:items-center md:gap-4"><span className="text-xs font-bold text-[#826a75]">{formatDateKey(entry.date)}</span><span><strong className="block text-sm">{entry.description}</strong><small className="mt-1 block text-xs text-[#826a75]">{entry.orderNumber ? `Pedido ${entry.orderNumber}` : entry.notes || 'Sem observações'}</small></span><span className="w-fit rounded-full bg-[#fff0f5] px-2.5 py-1 text-[11px] font-bold text-[#82204f]">{entry.category}</span><button type="button" onClick={() => void toggleStatus(entry)} className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-black ${entry.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{entry.status === 'PAID' ? 'Pago / recebido' : 'Pendente'}</button><div className="flex items-center justify-between gap-3 md:justify-end"><strong className={entry.kind === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}>{entry.kind === 'INCOME' ? '+' : '-'} {formatBRL(entry.amountCents)}</strong><button type="button" onClick={() => openEdit(entry)} className="grid size-8 place-items-center rounded-full bg-[#f8f1f4] text-[#82204f]" aria-label={`Editar ${entry.description}`}><Pencil className="size-3.5" /></button></div></article>)}{!visibleEntries.length && <div className="p-10 text-center"><WalletCards className="mx-auto size-8 text-[#a62c63]" /><h3 className="mt-3 font-black">Nenhum lançamento neste filtro</h3><p className="mt-1 text-sm text-[#826a75]">Adicione vendas, despesas ou altere o mês selecionado.</p></div>}</div>
      </section>
    </AdminShell>
  );
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return <article className="rounded-[22px] bg-white p-5 shadow-sm"><span className={`grid size-10 place-items-center rounded-2xl ${tone}`}>{icon}</span><p className="mt-4 text-xs font-bold text-[#826a75]">{label}</p><strong className="mt-1 block text-2xl font-black tracking-tight">{value}</strong></article>;
}
