'use client';

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { BookOpen, CircleHelp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { AdminField, AdminTextarea } from '@/components/admin-form';
import { AdminShell } from '@/components/admin-shell';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import {
  ADMIN_TUTORIAL_PROGRESS_EVENT,
  ADMIN_TUTORIALS,
  openAdminTutorial,
  readAdminTutorialProgress,
  resetAdminTutorial,
  type AdminTutorialProgress,
} from '@/lib/admin-tutorials';
import type { StoreDayHours, StoreHoursWindow, StorePublicConfig } from '@/shared/domain';
import { normalizeStoreConfig } from '@/shared/store-config';

const fallbackHours: StoreDayHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: true, windows: [] }));
const defaultHolidayHours: StoreHoursWindow[] = [{ open: '15:00', close: '21:50' }];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export default function SettingsPage() {
  const { role, user } = useAuth();
  const [config, setConfig] = useState<StorePublicConfig | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hoursDraft, setHoursDraft] = useState<StoreDayHours[]>(fallbackHours);
  const [holidayDatesDraft, setHolidayDatesDraft] = useState<string[]>([]);
  const [holidayHoursDraft, setHolidayHoursDraft] = useState<StoreHoursWindow[]>(defaultHolidayHours);
  const [holidayDateInput, setHolidayDateInput] = useState('');
  const [tutorialProgress, setTutorialProgress] = useState<AdminTutorialProgress>({});

  useEffect(() => {
    if (!hasFirebaseConfig || role !== 'admin') return;
    return onSnapshot(
      doc(getFirebaseClient().db, 'storePublicConfig', 'main'),
      (snapshot) => setConfig(normalizeStoreConfig(snapshot.exists() ? snapshot.data() : undefined)),
      (_cause) => { setConfig(normalizeStoreConfig(undefined)); setError('Não foi possível carregar as configurações da loja. Os valores padrão estão disponíveis para revisão.'); },
    );
  }, [role]);
  useEffect(() => {
    if (role !== 'admin' || !user?.uid) return undefined;
    const sync = () => setTutorialProgress(readAdminTutorialProgress(user.uid));
    sync();
    window.addEventListener(ADMIN_TUTORIAL_PROGRESS_EVENT, sync);
    return () => window.removeEventListener(ADMIN_TUTORIAL_PROGRESS_EVENT, sync);
  }, [role, user?.uid]);
  useEffect(() => {
    if (!config) return;
    setHoursDraft((config.hours?.length === 7 ? config.hours : fallbackHours).map((day) => ({ ...day, windows: day.windows.map((window) => ({ ...window })) })));
    setHolidayDatesDraft([...(config.holidayDates ?? [])]);
    setHolidayHoursDraft(config.holidayHours?.length ? config.holidayHours.map((window) => ({ ...window })) : defaultHolidayHours);
  }, [config]);

  function updateDay(day: number, value: Partial<StoreDayHours>) { setHoursDraft((old) => old.map((item) => item.day === day ? { ...item, ...value } : item)); }
  function updateWindow(day: number, index: number, value: Partial<StoreHoursWindow>) { setHoursDraft((old) => old.map((item) => item.day === day ? { ...item, windows: item.windows.map((window, windowIndex) => windowIndex === index ? { ...window, ...value } : window) } : item)); }
  function addWindow(day: number) { setHoursDraft((old) => old.map((item) => item.day === day ? { ...item, closed: false, windows: [...item.windows, { open: '14:00', close: '21:50' }] } : item)); }
  function removeWindow(day: number, index: number) { setHoursDraft((old) => old.map((item) => item.day === day ? { ...item, windows: item.windows.filter((_, windowIndex) => windowIndex !== index) } : item)); }
  function addHolidayDate() { if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDateInput) || holidayDatesDraft.includes(holidayDateInput)) return; setHolidayDatesDraft((old) => [...old, holidayDateInput].sort()); setHolidayDateInput(''); }
  function updateHolidayWindow(index: number, value: Partial<StoreHoursWindow>) { setHolidayHoursDraft((old) => old.map((window, windowIndex) => windowIndex === index ? { ...window, ...value } : window)); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);

    try {
      const hours = JSON.parse(String(data.get('hours') || '[]')) as StoreDayHours[];
      const holidayDates = JSON.parse(String(data.get('holidayDates') || '[]')) as string[];
      const holidayHours = JSON.parse(String(data.get('holidayHours') || '[]')) as StoreHoursWindow[];
      const zones = JSON.parse(String(data.get('zones') || '[]'));
      if (!Array.isArray(hours) || hours.length !== 7) throw new Error('Horários devem conter os 7 dias.');
      if (!Array.isArray(holidayDates) || holidayDates.some((date) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('Feriados devem usar datas no formato AAAA-MM-DD.');
      if (!Array.isArray(holidayHours) || !holidayHours.length || holidayHours.some((window) => !timePattern.test(window.open) || !timePattern.test(window.close))) throw new Error('Janelas dos feriados inválidas. Use HH:mm.');
      const deliveryMode = String(data.get('deliveryMode')) as StorePublicConfig['deliveryConfig']['mode'];
      const fixedFeeCents = parseCurrencyToCents(String(data.get('fixedFee') ?? ''));
      if (deliveryMode === 'FIXED' && fixedFeeCents === null) throw new Error('Informe uma taxa válida em reais.');
      const orderEstimateMinutes = Number(data.get('orderEstimateMinutes'));
      if (!Number.isSafeInteger(orderEstimateMinutes) || orderEstimateMinutes < 5 || orderEstimateMinutes > 240) throw new Error('A previsão padrão deve ficar entre 5 e 240 minutos.');

      const payload: StorePublicConfig & { updatedAt: unknown } = {
        storeName: String(data.get('storeName')).trim(),
        instagramHandle: String(data.get('instagramHandle')).trim(),
        address: String(data.get('address')).trim(),
        city: String(data.get('city')).trim(),
        phoneDisplay: String(data.get('phoneDisplay')).trim(),
        whatsappNumber: String(data.get('whatsappNumber')).replace(/\D/g, ''),
        whatsappEnabled: data.get('whatsappEnabled') === 'on',
        orderingEnabled: data.get('orderingEnabled') === 'on',
        pauseMessage: String(data.get('pauseMessage')).trim(),
        enforceHours: data.get('enforceHours') === 'on',
        timezone: 'America/Sao_Paulo',
        hours,
        holidayDates: [...new Set(holidayDates)].sort(),
        holidayHours,
        fulfillmentModes: [data.get('pickup') === 'on' ? 'PICKUP' : null, data.get('delivery') === 'on' ? 'DELIVERY' : null].filter(Boolean) as StorePublicConfig['fulfillmentModes'],
        paymentMethods: [data.get('pix') === 'on' ? 'PIX' : null, data.get('card') === 'on' ? 'CARD' : null, data.get('cash') === 'on' ? 'CASH' : null].filter(Boolean) as StorePublicConfig['paymentMethods'],
        deliveryConfig: {
          mode: deliveryMode,
          ...(deliveryMode === 'FIXED' && fixedFeeCents !== null ? { fixedFeeCents } : {}),
          ...(deliveryMode === 'ZONES' ? { zones } : {}),
        },
        orderInstructions: String(data.get('orderInstructions')).trim(),
        deliveryEstimate: String(data.get('deliveryEstimate')).trim(),
        busyDeliveryEstimate: String(data.get('busyDeliveryEstimate')).trim(),
        orderEstimateMinutes,
        holidayHoursNote: String(data.get('holidayHoursNote')).trim(),
        gratitudeMessage: String(data.get('gratitudeMessage')).trim(),
        privacyNotice: String(data.get('privacyNotice')).trim(),
        status: 'ACTIVE',
        updatedAt: serverTimestamp(),
      };

      if (!payload.storeName || !payload.fulfillmentModes.length || !payload.paymentMethods.length) throw new Error('Informe o nome e ao menos uma opção de recebimento e pagamento.');
      await setDoc(doc(getFirebaseClient().db, 'storePublicConfig', 'main'), payload);
      setMessage('Configurações salvas e publicadas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as configurações da loja. As alterações não foram aplicadas. Tente novamente.');
    }
  }

  if (!config) return <AdminShell adminOnly><p>Carregando configurações…</p></AdminShell>;

  return <AdminShell adminOnly>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">Loja</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Configurações</h1><p className="mt-2 max-w-2xl text-sm text-[#826a75]">Deixe a loja pronta para receber pedidos. Você pode salvar uma seção por vez; nada aqui apaga pedidos, Caixa ou Finanças.</p></div><Button type="button" onClick={() => openAdminTutorial('admin-first-use')} className="rounded-full bg-[#82204f] text-white"><BookOpen /> Mostrar tutorial</Button></div>
    <section className="mt-7 rounded-[26px] border border-[#82204f]/10 bg-[#fffaf5] p-5 sm:p-6"><div className="flex items-start gap-3"><CircleHelp className="mt-0.5 size-5 shrink-0 text-[#82204f]" /><div><h2 className="text-lg font-black">Comece por aqui</h2><p className="mt-1 text-sm leading-relaxed text-[#6f5360]">Confira nesta ordem: nome e contato, pedidos e pagamentos, entrega, horários e mensagem ao cliente. Se precisar, use o botão Mostrar tutorial.</p></div></div></section>
    <section className="mt-5 rounded-[26px] bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><BookOpen className="mt-0.5 size-5 shrink-0 text-[#82204f]" /><div><h2 className="text-xl font-black">Tutoriais</h2><p className="mt-1 text-sm leading-relaxed text-[#6f5360]">Os tutoriais são somente para administradores. Reiniciar um tutorial apenas mostra as explicações novamente; não redefine nenhum dado da loja.</p></div></div><div className="mt-5 grid gap-3 lg:grid-cols-2">{ADMIN_TUTORIALS.map((tutorial) => { const progress = tutorialProgress[tutorial.id]; return <article key={tutorial.id} className="rounded-2xl border border-[#82204f]/10 bg-[#fffaf5] p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h3 className="font-black">{tutorial.title}</h3><p className="mt-1 text-sm leading-relaxed text-[#6f5360]">{tutorial.description}</p><span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${progress?.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : progress?.status === 'skipped' ? 'bg-amber-50 text-amber-700' : 'bg-white text-[#826a75]'}`}>{progress?.status === 'completed' ? 'Concluído' : progress?.status === 'skipped' ? 'Pulado' : 'Ainda não visto'}</span></div><div className="flex shrink-0 gap-2"><Button type="button" onClick={() => openAdminTutorial(tutorial.id)} className="h-10 rounded-full bg-[#82204f] px-4 text-xs font-black text-white">Mostrar</Button><Button type="button" onClick={() => { if (!user?.uid) return; resetAdminTutorial(user.uid, tutorial.id); openAdminTutorial(tutorial.id); }} className="h-10 rounded-full border border-[#82204f]/15 bg-white px-4 text-xs font-black text-[#82204f]">Reiniciar</Button></div></div></article>; })}</div></section>
    <form onSubmit={save} className="mt-7 max-w-4xl space-y-5">
      <SettingsSection title="Identificação" description="Como o cliente encontra e reconhece sua loja.">
        <div className="grid gap-4 sm:grid-cols-2"><AdminField label="Nome da loja" name="storeName" required defaultValue={config.storeName} /><AdminField label="Instagram" name="instagramHandle" defaultValue={config.instagramHandle} /><AdminField label="Endereço" name="address" defaultValue={config.address} /><AdminField label="Cidade/UF" name="city" defaultValue={config.city} /><AdminField label="Telefone exibido" name="phoneDisplay" defaultValue={config.phoneDisplay} /><AdminField label="WhatsApp (55 + DDD + número)" name="whatsappNumber" defaultValue={config.whatsappNumber} /></div>
        <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="whatsappEnabled" defaultChecked={config.whatsappEnabled} /> Exibir botão de WhatsApp após o pedido salvo</label>
      </SettingsSection>

      <SettingsSection title="Pedidos" description="Escolha como a loja recebe pedidos e quais pagamentos aparecem no checkout.">
        <div className="flex flex-wrap gap-5 text-sm font-bold"><label><input type="checkbox" name="orderingEnabled" defaultChecked={config.orderingEnabled} /> Pedidos habilitados</label><label><input type="checkbox" name="enforceHours" defaultChecked={config.enforceHours} /> Bloquear fora do horário</label></div>
        <div className="mt-4"><AdminField label="Mensagem quando pausado" name="pauseMessage" defaultValue={config.pauseMessage} /></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><h3 className="text-sm font-black">Recebimento</h3><div className="mt-3 space-y-2 text-sm"><label className="block"><input type="checkbox" name="pickup" defaultChecked={config.fulfillmentModes.includes('PICKUP')} /> Retirada</label><label className="block"><input type="checkbox" name="delivery" defaultChecked={config.fulfillmentModes.includes('DELIVERY')} /> Delivery</label></div></div><div><h3 className="text-sm font-black">Pagamento informado</h3><div className="mt-3 space-y-2 text-sm"><label className="block"><input type="checkbox" name="pix" defaultChecked={config.paymentMethods.includes('PIX')} /> Pix</label><label className="block"><input type="checkbox" name="card" defaultChecked={config.paymentMethods.includes('CARD')} /> Cartão</label><label className="block"><input type="checkbox" name="cash" defaultChecked={config.paymentMethods.includes('CASH')} /> Dinheiro</label></div></div></div>
      </SettingsSection>

      <SettingsSection title="Mensagem ao cliente" description="Textos simples que aparecem no pedido e ajudam o cliente a saber o que esperar.">
        <div className="space-y-4"><AdminTextarea label="Instruções do pedido" name="orderInstructions" defaultValue={config.orderInstructions} /><div className="grid gap-4 sm:grid-cols-2"><AdminField label="Tempo padrão para ficar pronto (minutos)" name="orderEstimateMinutes" type="number" min="5" max="240" defaultValue={config.orderEstimateMinutes ?? 15} /><AdminField label="Prazo de entrega" name="deliveryEstimate" defaultValue={config.deliveryEstimate} /></div><AdminField label="Prazo em dias movimentados" name="busyDeliveryEstimate" defaultValue={config.busyDeliveryEstimate} /><AdminField label="Horário em feriados" name="holidayHoursNote" defaultValue={config.holidayHoursNote} /><AdminTextarea label="Mensagem de agradecimento" name="gratitudeMessage" defaultValue={config.gratitudeMessage} /><p className="text-xs text-[#826a75]">O cliente verá esta previsão no acompanhamento. Use uma estimativa realista; não exibimos contagem regressiva falsa.</p></div>
      </SettingsSection>

      <SettingsSection title="Delivery" description="Se você não entrega, escolha Sem delivery. Caso entregue, selecione como a taxa será combinada.">
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Estratégia<select name="deliveryMode" defaultValue={config.deliveryConfig.mode} className="mt-2 h-11 w-full rounded-xl border bg-[#fffaf5] px-3 font-normal"><option value="NONE">Sem delivery</option><option value="CONFIRM">Taxa confirmada depois</option><option value="FIXED">Taxa fixa</option><option value="ZONES">Por bairro/zona</option></select></label><AdminField label="Taxa fixa (R$)" name="fixedFee" type="text" inputMode="decimal" placeholder="Ex.: 4,00" defaultValue={((config.deliveryConfig.fixedFeeCents ?? 0) / 100).toFixed(2).replace('.', ',')} /></div>
        <details className="mt-4 rounded-2xl border border-[#82204f]/10 bg-[#fffaf5] p-4"><summary className="cursor-pointer text-sm font-black text-[#82204f]">Configuração avançada por bairro ou zona</summary><p className="mt-2 text-xs leading-relaxed text-[#826a75]">Use somente se a taxa mudar por bairro. Este campo mantém o formato técnico atual para configurações já existentes.</p><div className="mt-3"><AdminTextarea label="Bairros e taxas (configuração avançada)" name="zones" defaultValue={JSON.stringify(config.deliveryConfig.zones ?? [], null, 2)} rows={7} /></div></details>
      </SettingsSection>

      <SettingsSection title="Horários" description="Defina quando os pedidos podem ser recebidos e o horário especial dos feriados.">
        <p className="text-sm leading-relaxed text-[#6f5360]">Escolha os dias e informe os horários de abertura e fechamento. Não é necessário editar códigos. Às 21:50 a loja já aparece fechada.</p>
        <input type="hidden" name="hours" value={JSON.stringify(hoursDraft)} readOnly />
        <div className="mt-4 space-y-3">{[...hoursDraft].sort((a, b) => a.day - b.day).map((day) => <div key={day.day} className="rounded-2xl border border-[#82204f]/12 bg-[#fffaf5] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><strong>{dayNames[day.day]}</strong><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={day.closed} onChange={(event) => updateDay(day.day, { closed: event.target.checked, windows: event.target.checked ? [] : (day.windows.length ? day.windows : [{ open: '14:00', close: '21:50' }]) })} /> Loja fechada</label></div>{!day.closed && <div className="mt-3 space-y-2">{day.windows.map((window, index) => <div key={`${day.day}-${index}`} className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold">Abre<input aria-label={`${dayNames[day.day]} abre ${index + 1}`} type="time" value={window.open} onChange={(event) => updateWindow(day.day, index, { open: event.target.value })} className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-white px-3 text-sm" /></label><label className="text-xs font-bold">Fecha<input aria-label={`${dayNames[day.day]} fecha ${index + 1}`} type="time" value={window.close} onChange={(event) => updateWindow(day.day, index, { close: event.target.value })} className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-white px-3 text-sm" /></label>{day.windows.length > 1 && <button type="button" onClick={() => removeWindow(day.day, index)} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-black text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" /> Remover</button>}</div>)}<button type="button" onClick={() => addWindow(day.day)} className="mt-1 inline-flex items-center gap-1 text-xs font-black text-[#82204f]"><Plus className="size-3.5" /> Adicionar outro horário</button></div>}</div>)}</div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2"><div className="rounded-2xl border border-[#82204f]/12 bg-[#fffaf5] p-4"><h3 className="text-sm font-black">Feriados</h3><p className="mt-1 text-xs leading-relaxed text-[#826a75]">Adicione as datas em que a loja seguirá o horário especial.</p><div className="mt-3 flex gap-2"><input aria-label="Data do feriado" type="date" value={holidayDateInput} onChange={(event) => setHolidayDateInput(event.target.value)} className="h-10 min-w-0 flex-1 rounded-xl border border-[#82204f]/15 bg-white px-3 text-sm" /><button type="button" onClick={addHolidayDate} className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#82204f] px-3 text-xs font-black text-white"><Plus className="size-3.5" /> Adicionar</button></div><div className="mt-3 flex flex-wrap gap-2">{holidayDatesDraft.map((date) => <span key={date} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold">{date}<button type="button" aria-label={`Remover feriado ${date}`} onClick={() => setHolidayDatesDraft((old) => old.filter((item) => item !== date))} className="text-red-700">×</button></span>)}{!holidayDatesDraft.length && <span className="text-xs text-[#826a75]">Nenhum feriado cadastrado.</span>}</div><input type="hidden" name="holidayDates" value={JSON.stringify(holidayDatesDraft)} readOnly /></div><div className="rounded-2xl border border-[#82204f]/12 bg-[#fffaf5] p-4"><h3 className="text-sm font-black">Horário de feriados</h3><p className="mt-1 text-xs leading-relaxed text-[#826a75]">Esse horário será aplicado nas datas adicionadas ao lado.</p><input type="hidden" name="holidayHours" value={JSON.stringify(holidayHoursDraft)} readOnly /><div className="mt-3 space-y-2">{holidayHoursDraft.map((window, index) => <div key={index} className="flex flex-wrap items-end gap-2"><label className="text-xs font-bold">Abre<input aria-label={`Feriado abre ${index + 1}`} type="time" value={window.open} onChange={(event) => updateHolidayWindow(index, { open: event.target.value })} className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-white px-3 text-sm" /></label><label className="text-xs font-bold">Fecha<input aria-label={`Feriado fecha ${index + 1}`} type="time" value={window.close} onChange={(event) => updateHolidayWindow(index, { close: event.target.value })} className="mt-1 h-10 rounded-xl border border-[#82204f]/15 bg-white px-3 text-sm" /></label>{holidayHoursDraft.length > 1 && <button type="button" onClick={() => setHolidayHoursDraft((old) => old.filter((_, windowIndex) => windowIndex !== index))} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-black text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" /> Remover</button>}</div>)}<button type="button" onClick={() => setHolidayHoursDraft((old) => [...old, { open: '15:00', close: '21:50' }])} className="mt-1 inline-flex items-center gap-1 text-xs font-black text-[#82204f]"><Plus className="size-3.5" /> Adicionar outro horário</button></div></div></div>
      </SettingsSection>

      <SettingsSection title="Privacidade" description="Aviso que o cliente pode consultar sobre o uso das informações do pedido."><AdminTextarea label="Aviso de privacidade" name="privacyNotice" defaultValue={config.privacyNotice} /></SettingsSection>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <Button type="submit" className="h-12 rounded-full bg-[#82204f] px-6 font-black text-white"><Save /> Salvar configurações</Button>
    </form>
  </AdminShell>;
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6"><h2 className="text-xl font-black">{title}</h2>{description && <p className="mt-1 mb-5 text-sm leading-relaxed text-[#826a75]">{description}</p>}{children}</section>;
}

function parseCurrencyToCents(value: string): number | null {
  const normalized = value.trim().replace(/[^\d,.]/g, '');
  if (!normalized) return null;
  const decimal = normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized;
  const amount = Number(decimal);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
