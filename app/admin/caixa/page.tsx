'use client';

import {
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  History,
  Info,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  QrCode,
  ReceiptText,
  WalletCards,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { AdminField, AdminTextarea } from '@/components/admin-form';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { useTenant } from '@/components/tenant-provider';
import { Button } from '@/components/ui/button';
import {
  openCashRegister,
  closeCashRegister,
  recordLocalSale,
  recordCashMovement,
  reconcileCashRegisterControl,
} from '@/lib/cash-register';
import { getFirebaseClient } from '@/lib/firebase/client';
import { tenantCollection, tenantDoc } from '@/lib/firebase/tenant';
import { formatBRL } from '@/shared/domain';
import { parseBRLToCents } from '@/shared/finance';
import { isTenantAdminRole, isTenantStaffRole } from '@/shared/tenancy';
import {
  movementLabel,
  paymentMethodLabel,
  summarizeCashMovements,
  type CashMovement,
  type CashPaymentMethod,
  type CashRegister,
} from '@/shared/cash-register';

const todayKey = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
};
function timestampDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  )
    return value.toDate();
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
function formatWhen(value: unknown) {
  const date = timestampDate(value);
  return date
    ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : 'agora';
}
function parseRequiredMoney(value: string, label: string) {
  const cents = parseBRLToCents(value);
  if (!cents)
    throw new Error(`Informe um valor maior que R$ 0,00 para ${label}.`);
  return cents;
}

export default function CashRegisterPage() {
  const { role } = useAuth();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [openRegisters, setOpenRegisters] = useState<CashRegister[]>([]);
  const [openRegisterId, setOpenRegisterId] = useState<string | null>(null);
  const [openRegistersLoaded, setOpenRegistersLoaded] = useState(false);
  const [cashControlLoaded, setCashControlLoaded] = useState(false);
  const [openRegistersLoadFailed, setOpenRegistersLoadFailed] = useState(false);
  const [cashControlLoadFailed, setCashControlLoadFailed] = useState(false);
  const [controlEvents, setControlEvents] = useState<Array<Record<string, unknown> & { id: string }>>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [action, setAction] = useState<'OPEN' | 'LOCAL_SALE' | 'WITHDRAWAL' | 'SUPPLY' | null>(
    null,
  );
  const [closeOpen, setCloseOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingNote, setOpeningNote] = useState('');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementNote, setMovementNote] = useState('');
  const [localSaleAmount, setLocalSaleAmount] = useState('');
  const [localSalePaymentMethod, setLocalSalePaymentMethod] = useState<CashPaymentMethod>('CASH');
  const [localSaleDescription, setLocalSaleDescription] = useState('');
  const [localSaleOrderNumber, setLocalSaleOrderNumber] = useState('');
  const [localSaleNote, setLocalSaleNote] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [reconciliationReason, setReconciliationReason] = useState('');
  const [reconciliationConfirmed, setReconciliationConfirmed] = useState(false);
  const [historyDate, setHistoryDate] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>(
    'ALL',
  );
  const pendingCashRequest = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const pendingReconciliation = useRef<{ fingerprint: string; id: string } | null>(null);

  function cashRequestId(operation: string, input: Record<string, unknown>) {
    const fingerprint = JSON.stringify({ operation, ...input });
    if (pendingCashRequest.current?.fingerprint === fingerprint)
      return pendingCashRequest.current.id;
    const id = crypto.randomUUID();
    pendingCashRequest.current = { fingerprint, id };
    return id;
  }

  useEffect(() => {
    if (!tenantId || !isTenantStaffRole(role)) return undefined;
    setLoading(true);
    setOpenRegistersLoaded(false);
    setCashControlLoaded(false);
    setOpenRegistersLoadFailed(false);
    setCashControlLoadFailed(false);
    const db = getFirebaseClient().db;
    const stopRegisters = onSnapshot(
      query(tenantCollection(db, tenantId, 'cashRegisters'), orderBy('openedAt', 'desc'), limit(100)),
      (snapshot) => {
        setRegisters(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as CashRegister,
          ),
        );
        setLoading(false);
      },
      () => {
        setError(
          'Não foi possível carregar os caixas. Confira sua conexão e tente novamente.',
        );
        setLoading(false);
      },
    );
    const stopMovements = onSnapshot(
      query(tenantCollection(db, tenantId, 'cashMovements'), orderBy('createdAt', 'desc'), limit(500)),
      (snapshot) =>
        setMovements(
          snapshot.docs.map(
            (item) => ({ id: item.id, ...item.data() }) as CashMovement,
          ),
        ),
      () => setError('Não foi possível carregar as movimentações do caixa.'),
    );
    const stopOpenRegisters = onSnapshot(
      query(tenantCollection(db, tenantId, 'cashRegisters'), where('status', '==', 'OPEN'), limit(2)),
      (snapshot) => {
        setOpenRegisters(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as CashRegister));
        setOpenRegistersLoaded(true);
      },
      () => {
        setOpenRegistersLoadFailed(true);
        setError('Não foi possível conferir se há outros caixas abertos. A abertura ficará bloqueada até atualizar a tela.');
        setOpenRegistersLoaded(true);
      },
    );
    const stopControl = onSnapshot(
      tenantDoc(db, tenantId, 'cashControl', 'main'),
      (snapshot) => {
        setOpenRegisterId(String(snapshot.data()?.openRegisterId ?? '') || null);
        setCashControlLoaded(true);
      },
      () => {
        setCashControlLoadFailed(true);
        setError('Não foi possível conferir o vínculo do caixa atual. Atualize a tela antes de operar.');
        setCashControlLoaded(true);
      },
    );
    const stopControlEvents = onSnapshot(
      query(tenantCollection(db, tenantId, 'cashControlEvents'), orderBy('createdAt', 'desc'), limit(10)),
      (snapshot) => setControlEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      () => setError('Não foi possível carregar as reconciliações auditáveis do Caixa.'),
    );
    return () => {
      stopRegisters();
      stopMovements();
      stopOpenRegisters();
      stopControl();
      stopControlEvents();
    };
  }, [role, tenantId]);

  const current = useMemo(
    () => openRegistersLoaded && cashControlLoaded && !openRegistersLoadFailed && !cashControlLoadFailed && openRegisters.length === 1 && openRegisters[0]?.id === openRegisterId
      ? openRegisters[0]
      : null,
    [cashControlLoaded, cashControlLoadFailed, openRegisterId, openRegisters, openRegistersLoadFailed, openRegistersLoaded],
  );
  const cashIntegrityIssue = openRegisters.length > 1
    || (openRegisters.length === 1 && openRegisters[0]?.id !== openRegisterId);
  const cashStateLoaded = openRegistersLoaded && cashControlLoaded;
  const cashStateError = openRegistersLoadFailed || cashControlLoadFailed;
  const currentMovements = useMemo(
    () =>
      current
        ? movements
            .filter((movement) => movement.registerId === current.id)
            .sort((a, b) =>
              formatWhen(b.createdAt).localeCompare(formatWhen(a.createdAt)),
            )
        : [],
    [current, movements],
  );
  const summary = useMemo(
    () =>
      summarizeCashMovements(
        current?.initialBalanceCents ?? 0,
        currentMovements,
      ),
    [current, currentMovements],
  );
  const expectedCashCents =
    current?.expectedCashCents ?? summary.expectedCashCents;
  const countedCashCents = parseBRLToCents(countedCash);
  const differenceCents = countedCash.trim()
    ? countedCashCents - expectedCashCents
    : 0;
  const filteredHistory = useMemo(
    () =>
      registers
        .filter(
          (register) =>
            (!historyDate || register.openingDate === historyDate) &&
            (historyStatus === 'ALL' || register.status === historyStatus),
        )
        .sort((a, b) =>
          formatWhen(b.openedAt).localeCompare(formatWhen(a.openedAt)),
        ),
    [historyDate, historyStatus, registers],
  );

  function resetFeedback() {
    setError('');
    setNotice('');
  }
  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    if (!cashStateLoaded || cashStateError || openRegisters.length > 0) {
      setError('O estado do Caixa mudou ou ainda não pôde ser conferido. Atualize a tela antes de abrir outro turno.');
      return;
    }
    setBusy(true);
    try {
      const amount = openingAmount.trim() ? parseBRLToCents(openingAmount) : -1;
      if (amount < 0)
        throw new Error('Informe o saldo inicial disponível para troco.');
      const input = {
        initialBalanceCents: amount,
        note: openingNote,
        openingDate: todayKey(),
      };
      await openCashRegister({
        ...input,
        clientRequestId: cashRequestId('OPEN', input),
      });
      pendingCashRequest.current = null;
      setAction(null);
      setOpeningAmount('');
      setOpeningNote('');
      setNotice('Caixa aberto com sucesso.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível abrir o caixa.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !action || action === 'OPEN' || action === 'LOCAL_SALE') return;
    resetFeedback();
    setBusy(true);
    try {
      const input = {
        registerId: current.id,
        type: action,
        amountCents: parseRequiredMoney(
          movementAmount,
          action === 'WITHDRAWAL' ? 'a sangria' : 'o suprimento',
        ),
        note: movementNote,
      };
      await recordCashMovement({
        ...input,
        clientRequestId: cashRequestId('MOVEMENT', input),
      });
      pendingCashRequest.current = null;
      setAction(null);
      setMovementAmount('');
      setMovementNote('');
      setNotice(
        action === 'WITHDRAWAL'
          ? 'Sangria registrada com sucesso.'
          : 'Suprimento registrado com sucesso.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar a movimentação.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleLocalSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    resetFeedback();
    setBusy(true);
    try {
      const input = {
        registerId: current.id,
        amountCents: parseRequiredMoney(localSaleAmount, 'a venda'),
        paymentMethod: localSalePaymentMethod,
        description: localSaleDescription,
        orderNumber: localSaleOrderNumber,
        note: localSaleNote,
      };
      await recordLocalSale({
        ...input,
        clientRequestId: cashRequestId('LOCAL_SALE', input),
      });
      pendingCashRequest.current = null;
      setAction(null);
      setLocalSaleAmount('');
      setLocalSaleDescription('');
      setLocalSaleOrderNumber('');
      setLocalSaleNote('');
      setNotice('Venda local registrada no Caixa e no Financeiro.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível registrar a venda local.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    resetFeedback();
    setBusy(true);
    try {
      if (!countedCash.trim())
        throw new Error('Informe o valor contado em dinheiro.');
      await closeCashRegister({
        registerId: current.id,
        countedCashCents,
        note: closingNote,
      });
      setCloseOpen(false);
      setCountedCash('');
      setClosingNote('');
      setNotice(
        'Caixa fechado com sucesso. O resumo ficou salvo no histórico.',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível fechar o caixa.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function handleReconcile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    if (!isTenantAdminRole(role)) {
      setError('Somente um administrador pode restaurar o vínculo do Caixa.');
      return;
    }
    if (openRegisters.length !== 1) {
      setError('A reconciliação exige exatamente um caixa aberto.');
      return;
    }
    if (!reconciliationConfirmed || reconciliationReason.trim().length < 10) {
      setError('Confira o saldo físico com a gerência e informe um motivo com pelo menos 10 caracteres.');
      return;
    }
    setBusy(true);
    try {
      const input = { registerId: openRegisters[0].id, reason: reconciliationReason.trim() };
      const fingerprint = JSON.stringify(input);
      if (pendingReconciliation.current?.fingerprint !== fingerprint) {
        pendingReconciliation.current = { fingerprint, id: crypto.randomUUID() };
      }
      await reconcileCashRegisterControl({
        ...input,
        clientRequestId: pendingReconciliation.current.id,
        physicalCashConfirmed: true,
        managerAuthorized: true,
      });
      pendingReconciliation.current = null;
      setReconciliationReason('');
      setReconciliationConfirmed(false);
      setNotice('Vínculo do caixa restaurado. O histórico da reconciliação foi registrado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reconciliar o vínculo do Caixa.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">
            Operação da loja
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-[-.04em]">
            <CircleDollarSign className="size-8 text-[#82204f]" /> Caixa
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#826a75]">
            Abra o turno, acompanhe as vendas e confira o dinheiro antes de
            fechar.
          </p>
        </div>
        {cashStateError || !cashStateLoaded ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">
            <Info className="size-4" /> Caixa não conferido
          </span>
        ) : cashIntegrityIssue ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">
            <Info className="size-4" /> Caixa requer conferência
          </span>
        ) : current ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
            <CheckCircle2 className="size-4" /> Caixa aberto
          </span>
        ) : (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f8f1f4] px-4 py-2 text-sm font-black text-[#826a75]">
            <LockKeyhole className="size-4" /> Caixa fechado
          </span>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700"
        >
          {notice}
        </p>
      )}
      {cashStateError && (
        <section className="mt-6 rounded-[26px] border border-amber-300 bg-amber-50 p-5 text-sm font-semibold leading-relaxed text-amber-950" role="alert">
          Não foi possível validar o estado atual do Caixa. Abertura, movimentações e reconciliação ficam indisponíveis até recuperar essa leitura. Verifique a conexão e atualize a tela.
        </section>
      )}
      {!cashStateError && cashIntegrityIssue && (
        <section className="mt-6 rounded-[26px] border border-amber-300 bg-amber-50 p-5 shadow-sm sm:p-7" role="alert">
          <p className="text-xs font-black uppercase tracking-wider text-amber-900">Operação bloqueada por segurança</p>
          <h2 className="mt-1 text-xl font-black text-[#241329]">Há caixa aberto sem vínculo único</h2>
          {openRegisters.length > 1 ? (
            <p className="mt-2 text-sm leading-relaxed text-amber-950">
              Foram encontrados pelo menos dois caixas abertos. Não escolha um automaticamente: interrompa as operações, confira os valores físicos e peça à gerência para decidir manualmente qual turno deve permanecer aberto.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-amber-950">
                Caixa {openRegisters[0]?.id} · saldo esperado {formatBRL(openRegisters[0]?.expectedCashCents ?? openRegisters[0]?.initialBalanceCents ?? 0)}. Antes de restaurar o vínculo, confirme o saldo físico e obtenha autorização da gerência. A reconciliação não altera saldo nem lançamentos.
              </p>
              {isTenantAdminRole(role) ? (
                <form onSubmit={handleReconcile} className="mt-4 grid gap-3">
                  <AdminTextarea
                    label="Motivo registrado no histórico"
                    name="reconciliationReason"
                    value={reconciliationReason}
                    onChange={(event) => setReconciliationReason(event.target.value)}
                    placeholder="Ex.: conferência física de R$ 120,00 e autorização da gerência no turno da manhã."
                    required
                  />
                  <label className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-white p-4 text-sm font-semibold text-[#442c13]">
                    <input type="checkbox" checked={reconciliationConfirmed} onChange={(event) => setReconciliationConfirmed(event.target.checked)} className="mt-1 size-4 accent-[#82204f]" />
                    <span>Confirmo que conferi o valor físico e tenho autorização da gerência para restaurar somente o vínculo deste caixa.</span>
                  </label>
                  <Button type="submit" disabled={busy || !reconciliationConfirmed || reconciliationReason.trim().length < 10} className="min-h-11 w-full rounded-full bg-[#82204f] font-black text-white sm:w-fit sm:px-6">
                    {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Restaurar vínculo com auditoria
                  </Button>
                </form>
              ) : (
                <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold text-amber-950">Peça a um administrador para revisar o caixa. Nenhuma movimentação pode ser feita enquanto o vínculo estiver inconsistente.</p>
              )}
            </>
          )}
        </section>
      )}
      {!cashStateLoaded && (
        <p className="mt-7 rounded-2xl bg-white p-5 text-sm font-semibold text-[#826a75]">Conferindo o vínculo e os caixas abertos…</p>
      )}
      {cashStateLoaded && !cashStateError && !cashIntegrityIssue && openRegisters.length === 0 && (
        <section className="mt-7 rounded-[26px] bg-[#351924] p-6 text-white shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#d7f04a] text-[#351924]">
              <Banknote className="size-6" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#d7f04a]">
                Comece por aqui
              </p>
              <h2 className="mt-1 text-2xl font-black">
                Abra o caixa do turno
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70">
                Informe quanto há disponível para troco. As vendas concluídas
                entram automaticamente quando o caixa está aberto.
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => {
              resetFeedback();
              setAction('OPEN');
            }}
            className="mt-6 h-11 rounded-full bg-[#d7f04a] font-black text-[#351924] hover:bg-[#c4dd36]"
          >
            <Plus /> Abrir caixa
          </Button>
        </section>
      )}
      {current && (
        <>
          <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard
              label="Vendas do turno"
              value={formatBRL(summary.totalSalesCents)}
              icon={<ReceiptText />}
              tone="text-[#82204f] bg-[#fff0f5]"
            />
            <SummaryCard
              label="Dinheiro"
              value={formatBRL(summary.cashSalesCents)}
              icon={<Banknote />}
              tone="text-emerald-700 bg-emerald-50"
            />
            <SummaryCard
              label="Pix"
              value={formatBRL(summary.pixSalesCents)}
              icon={<QrCode />}
              tone="text-blue-700 bg-blue-50"
            />
            <SummaryCard
              label="Cartão"
              value={formatBRL(summary.cardSalesCents)}
              icon={<CreditCard />}
              tone="text-violet-700 bg-violet-50"
            />
            <SummaryCard
              label="Dinheiro esperado"
              value={formatBRL(expectedCashCents)}
              icon={<WalletCards />}
              tone={
                expectedCashCents >= 0
                  ? 'text-[#82204f] bg-[#fff8df]'
                  : 'text-red-700 bg-red-50'
              }
            />
          </section>
          <section className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                resetFeedback();
                setAction('LOCAL_SALE');
              }}
              className="h-11 rounded-full bg-[#d7f04a] font-black text-[#351924] hover:bg-[#c4dd36]"
            >
              <ReceiptText /> Registrar venda local
            </Button>
            <Button
              type="button"
              onClick={() => {
                resetFeedback();
                setAction('WITHDRAWAL');
              }}
              variant="outline"
              className="h-11 rounded-full"
            >
              <Minus /> Registrar sangria
            </Button>
            <Button
              type="button"
              onClick={() => {
                resetFeedback();
                setAction('SUPPLY');
              }}
              variant="outline"
              className="h-11 rounded-full"
            >
              <Plus /> Registrar suprimento
            </Button>
            <Button
              type="button"
              onClick={() => {
                resetFeedback();
                setCloseOpen(true);
              }}
              className="h-11 rounded-full bg-[#82204f] font-black text-white"
            >
              <LockKeyhole /> Fechar caixa
            </Button>
          </section>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoCard
              label="Operador"
              value={current.operatorEmail || 'Equipe da loja'}
            />
            <InfoCard label="Aberto em" value={formatWhen(current.openedAt)} />
            <InfoCard
              label="Saldo inicial"
              value={formatBRL(current.initialBalanceCents)}
            />
          </div>
        </>
      )}
      {action === 'OPEN' && (
        <FormCard
          title="Abrir caixa"
          description="Confira o valor disponível para troco antes de começar."
          onSubmit={handleOpen}
          onCancel={() => setAction(null)}
          busy={busy}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField
              label="Saldo inicial (R$)"
              name="openingAmount"
              value={openingAmount}
              onChange={(event) => setOpeningAmount(event.target.value)}
              inputMode="decimal"
              required
              placeholder="Ex.: 100,00"
            />
            <AdminTextarea
              label="Observação (opcional)"
              name="openingNote"
              value={openingNote}
              onChange={(event) => setOpeningNote(event.target.value)}
              placeholder="Ex.: troco conferido no início do turno."
            />
          </div>
        </FormCard>
      )}
      {action && action !== 'OPEN' && action !== 'LOCAL_SALE' && current && (
        <FormCard
          title={
            action === 'WITHDRAWAL'
              ? 'Registrar sangria'
              : 'Registrar suprimento'
          }
          description={
            action === 'WITHDRAWAL'
              ? 'Retirada de dinheiro durante o turno. Informe o motivo.'
              : 'Entrada de dinheiro, geralmente para reforçar o troco.'
          }
          onSubmit={handleMovement}
          onCancel={() => setAction(null)}
          busy={busy}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField
              label="Valor (R$)"
              name="movementAmount"
              value={movementAmount}
              onChange={(event) => setMovementAmount(event.target.value)}
              inputMode="decimal"
              required
              placeholder="Ex.: 50,00"
            />
            <AdminTextarea
              label="Motivo"
              name="movementNote"
              value={movementNote}
              onChange={(event) => setMovementNote(event.target.value)}
              required
              placeholder={
                action === 'WITHDRAWAL'
                  ? 'Ex.: retirada para depósito.'
                  : 'Ex.: reforço de troco.'
              }
            />
          </div>
        </FormCard>
      )}
      {action === 'LOCAL_SALE' && current && (
        <FormCard
          title="Registrar venda local"
          description="Use para vendas feitas no balcão ou fora do fluxo de pedido online. O registro entra no Caixa e no Financeiro ao mesmo tempo."
          onSubmit={handleLocalSale}
          onCancel={() => setAction(null)}
          busy={busy}
          submitLabel="Registrar venda"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField
              label="Valor da venda (R$)"
              name="localSaleAmount"
              value={localSaleAmount}
              onChange={(event) => setLocalSaleAmount(event.target.value)}
              inputMode="decimal"
              required
              placeholder="Ex.: 25,00"
            />
            <label className="block text-sm font-bold">
              Forma de pagamento
              <select
                name="localSalePaymentMethod"
                value={localSalePaymentMethod}
                onChange={(event) => setLocalSalePaymentMethod(event.target.value as CashPaymentMethod)}
                className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"
              >
                <option value="CASH">Dinheiro</option>
                <option value="PIX">Pix</option>
                <option value="CARD">Cartão</option>
                <option value="OTHER">Outra forma</option>
              </select>
            </label>
            <AdminField
              label="Descrição"
              name="localSaleDescription"
              value={localSaleDescription}
              onChange={(event) => setLocalSaleDescription(event.target.value)}
              required
              placeholder="Ex.: 1 copo de açaí 500 ml"
            />
            <AdminField
              label="Pedido ou comanda (opcional)"
              name="localSaleOrderNumber"
              value={localSaleOrderNumber}
              onChange={(event) => setLocalSaleOrderNumber(event.target.value)}
              placeholder="Ex.: balcão 12"
            />
            <div className="sm:col-span-2">
              <AdminTextarea
                label="Observação (opcional)"
                name="localSaleNote"
                value={localSaleNote}
                onChange={(event) => setLocalSaleNote(event.target.value)}
                placeholder="Ex.: pagamento conferido no balcão."
              />
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-[#fffaf5] p-3 text-xs leading-relaxed text-[#826a75]">
            Dinheiro aumenta o valor esperado no caixa. Pix e cartão entram nas vendas, mas não alteram o dinheiro físico.
          </p>
        </FormCard>
      )}
      {closeOpen && current && (
        <section className="mt-7 rounded-[26px] border-2 border-[#82204f]/15 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">
                Conferência final
              </p>
              <h2 className="mt-1 text-2xl font-black">Fechar caixa</h2>
              <p className="mt-2 text-sm text-[#826a75]">
                Confira o resumo, conte o dinheiro e confirme o encerramento do
                turno.
              </p>
            </div>
            <LockKeyhole className="size-6 text-[#82204f]" />
          </div>
          <div className="mt-5 grid gap-2 rounded-2xl bg-[#fffaf5] p-4 text-sm">
            <Line
              label="Saldo inicial"
              value={formatBRL(current.initialBalanceCents)}
            />
            <Line
              label="Vendas em dinheiro"
              value={formatBRL(summary.cashSalesCents)}
            />
            <Line
              label="Sangrias"
              value={`- ${formatBRL(summary.withdrawalsCents)}`}
            />
            <Line
              label="Suprimentos"
              value={`+ ${formatBRL(summary.suppliesCents)}`}
            />
            <div className="mt-2 border-t border-[#82204f]/10 pt-3">
              <Line
                label="Dinheiro esperado"
                value={formatBRL(expectedCashCents)}
                strong
              />
            </div>
          </div>
          <form
            onSubmit={handleClose}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <div>
              <AdminField
                label="Valor contado em dinheiro (R$)"
                name="countedCash"
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
                inputMode="decimal"
                required
                placeholder="Ex.: 320,00"
              />
              {countedCash.trim() && (
                <p
                  className={`mt-2 text-sm font-black ${differenceCents === 0 ? 'text-emerald-700' : 'text-red-700'}`}
                >
                  {differenceCents === 0
                    ? 'Caixa conferido sem diferença.'
                    : `Diferença de caixa: ${differenceCents > 0 ? '+' : ''}${formatBRL(differenceCents)}`}
                </p>
              )}
            </div>
            <AdminTextarea
              label={
                differenceCents
                  ? 'Observação da diferença (obrigatória)'
                  : 'Observação (opcional)'
              }
              name="closingNote"
              value={closingNote}
              onChange={(event) => setClosingNote(event.target.value)}
              required={differenceCents !== 0}
              placeholder="Ex.: valor separado para depósito ou diferença conferida."
            />
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseOpen(false)}
                className="h-11 flex-1 rounded-full"
              >
                Voltar
              </Button>
              <Button
                type="submit"
                disabled={busy}
                className="h-11 flex-1 rounded-full bg-[#82204f] font-black text-white"
              >
                {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}{' '}
                Confirmar fechamento
              </Button>
            </div>
          </form>
        </section>
      )}
      <section className="mt-7 rounded-[26px] bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-start gap-3">
          <History className="mt-1 size-5 text-[#82204f]" />
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">
              Consulta
            </p>
            <h2 className="mt-1 text-2xl font-black">Histórico de caixas</h2>
            <p className="mt-1 text-sm text-[#826a75]">
              Consulte abertura, fechamento, operador e diferenças dos turnos
              anteriores.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label className="text-xs font-bold text-[#826a75]">
            Data
            <input
              type="date"
              value={historyDate}
              onChange={(event) => setHistoryDate(event.target.value)}
              className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 text-sm font-bold"
            />
          </label>
          <label className="text-xs font-bold text-[#826a75]">
            Status
            <select
              value={historyStatus}
              onChange={(event) =>
                setHistoryStatus(
                  event.target.value as 'ALL' | 'OPEN' | 'CLOSED',
                )
              }
              className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 text-sm font-bold"
            >
              <option value="ALL">Todos</option>
              <option value="OPEN">Abertos</option>
              <option value="CLOSED">Fechados</option>
            </select>
          </label>
        </div>
        <div className="mt-5 overflow-hidden rounded-2xl border border-[#82204f]/10">
          {loading ? (
            <p className="p-8 text-center text-sm text-[#826a75]">
              Carregando caixas…
            </p>
          ) : filteredHistory.length ? (
            filteredHistory.map((register) => (
              <article
                key={register.id}
                className="grid gap-3 border-b border-[#82204f]/8 px-4 py-4 last:border-0 md:grid-cols-[1fr_1fr_120px_140px] md:items-center"
              >
                <div>
                  <strong className="block text-sm">
                    {register.status === 'OPEN'
                      ? 'Caixa aberto'
                      : 'Caixa fechado'}
                  </strong>
                  <small className="text-xs text-[#826a75]">
                    {register.operatorEmail || 'Equipe da loja'} ·{' '}
                    {formatWhen(register.openedAt)}
                  </small>
                </div>
                <div className="text-sm">
                  <span className="block text-xs text-[#826a75]">
                    Saldo inicial
                  </span>
                  <strong>{formatBRL(register.initialBalanceCents)}</strong>
                  {register.closedAt != null && (
                    <span className="ml-2 text-xs text-[#826a75]">
                      até {formatWhen(register.closedAt)}
                    </span>
                  )}
                </div>
                <div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${register.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : 'bg-[#f8f1f4] text-[#826a75]'}`}
                  >
                    {register.status === 'OPEN' ? 'Em andamento' : 'Encerrado'}
                  </span>
                </div>
                <div className="text-left md:text-right">
                  {register.status === 'CLOSED' ? (
                    <>
                      <span className="block text-xs text-[#826a75]">
                        Diferença
                      </span>
                      <strong
                        className={
                          register.differenceCents === 0
                            ? 'text-emerald-700'
                            : 'text-red-700'
                        }
                      >
                        {register.differenceCents
                          ? formatBRL(register.differenceCents)
                          : 'R$ 0,00'}
                      </strong>
                    </>
                  ) : (
                    <span className="text-xs text-[#826a75]">
                      Último turno em aberto
                    </span>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="p-10 text-center">
              <History className="mx-auto size-8 text-[#a62c63]" />
              <h3 className="mt-3 font-black">Nenhum caixa encontrado</h3>
              <p className="mt-1 text-sm text-[#826a75]">
                Os fechamentos aparecerão aqui depois do primeiro turno.
              </p>
            </div>
          )}
        </div>
      </section>
      {current && (
        <section className="mt-7 rounded-[26px] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <ReceiptText className="size-5 text-[#82204f]" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">
                Auditoria do turno
              </p>
              <h2 className="mt-1 text-2xl font-black">
                Movimentações recentes
              </h2>
            </div>
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-[#82204f]/10">
            {currentMovements.length ? (
              currentMovements.slice(0, 30).map((movement) => (
                <div
                  key={movement.id}
                  className="grid gap-2 border-b border-[#82204f]/8 px-4 py-3 last:border-0 sm:grid-cols-[130px_1fr_130px_130px] sm:items-center"
                >
                  <span className="text-xs font-bold text-[#826a75]">
                    {formatWhen(movement.createdAt)}
                  </span>
                  <span>
                    <strong className="block text-sm">
                      {movementLabel(movement.type)}
                    </strong>
                    <small className="text-xs text-[#826a75]">
                      {movement.orderNumber
                        ? `Pedido ${movement.orderNumber} · `
                        : ''}
                      {movement.note ||
                        paymentMethodLabel(movement.paymentMethod)}
                    </small>
                  </span>
                  <span className="text-xs font-bold text-[#826a75]">
                    {movement.paymentMethod
                      ? paymentMethodLabel(movement.paymentMethod)
                      : 'Dinheiro'}
                  </span>
                  <strong
                    className={
                      movement.direction === 'OUT'
                        ? 'text-red-700 sm:text-right'
                        : 'text-emerald-700 sm:text-right'
                    }
                  >
                    {movement.direction === 'OUT' ? '- ' : '+ '}
                    {formatBRL(movement.amountCents)}
                  </strong>
                </div>
              ))
            ) : (
              <div className="p-10 text-center">
                <ReceiptText className="mx-auto size-8 text-[#a62c63]" />
                <h3 className="mt-3 font-black">
                  Nenhuma movimentação registrada neste caixa.
                </h3>
                <p className="mt-1 text-sm text-[#826a75]">
                  As vendas concluídas e suas ações aparecerão aqui.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
      {controlEvents.length > 0 && (
        <section className="mt-7 rounded-[26px] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-3">
            <History className="size-5 text-[#82204f]" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">Trilha imutável</p>
              <h2 className="mt-1 text-xl font-black">Reconciliações do Caixa</h2>
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-[#82204f]/10">
            {controlEvents.map((event) => (
              <article key={event.id} className="grid gap-1 border-b border-[#82204f]/8 px-4 py-3 last:border-0 sm:grid-cols-[1fr_180px] sm:items-start">
                <div>
                  <strong className="block text-sm">Vínculo restaurado · Caixa {String(event.registerId ?? '—')}</strong>
                  <span className="block text-sm text-[#826a75]">{String(event.reason ?? 'Motivo não informado')}</span>
                  <small className="text-xs text-[#826a75]">Vínculo anterior: {String(event.previousOpenRegisterId ?? 'nenhum')} · {String(event.actorEmail ?? event.actorUid ?? 'administrador')}</small>
                </div>
                <span className="text-xs font-semibold text-[#826a75] sm:text-right">{formatWhen(event.createdAt)}</span>
              </article>
            ))}
          </div>
        </section>
      )}
      <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-[#826a75]">
        <Info className="mt-0.5 size-4 shrink-0" /> Sangria é uma retirada de
        dinheiro durante o turno. Suprimento é uma entrada para reforçar o
        troco. O caixa é encerrado de forma definitiva após a confirmação.
      </p>
    </AdminShell>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <article className="rounded-[22px] bg-white p-5 shadow-sm">
      <span className={`grid size-10 place-items-center rounded-2xl ${tone}`}>
        {icon}
      </span>
      <p className="mt-4 text-xs font-bold text-[#826a75]">{label}</p>
      <strong className="mt-1 block text-xl font-black tracking-tight">
        {value}
      </strong>
    </article>
  );
}
function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <span className="block text-xs font-bold text-[#826a75]">{label}</span>
      <strong className="mt-1 block truncate text-sm">{value}</strong>
    </div>
  );
}
function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <strong className={strong ? 'text-[#82204f]' : ''}>{value}</strong>
    </div>
  );
}
function FormCard({
  title,
  description,
  onSubmit,
  onCancel,
  busy,
  submitLabel = 'Salvar movimentação',
  children,
}: {
  title: string;
  description: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  busy: boolean;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 rounded-[26px] bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-2xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-[#826a75]">{description}</p>
      <form onSubmit={onSubmit} className="mt-5">
        {children}
        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 flex-1 rounded-full"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={busy}
            className="h-11 flex-1 rounded-full bg-[#82204f] font-black text-white"
          >
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}{' '}
            {submitLabel}
          </Button>
        </div>
      </form>
    </section>
  );
}
