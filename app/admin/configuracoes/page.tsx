'use client';

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Save } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import { AdminField, AdminTextarea } from '@/components/admin-form';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { getFirebaseClient } from '@/lib/firebase/client';
import type { StoreDayHours, StoreHoursWindow, StorePublicConfig } from '@/shared/domain';

const fallbackHours: StoreDayHours[] = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: true, windows: [] }));
const defaultHolidayHours: StoreHoursWindow[] = [{ open: '15:00', close: '21:50' }];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SettingsPage() {
  const [config, setConfig] = useState<StorePublicConfig | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => onSnapshot(
    doc(getFirebaseClient().db, 'storePublicConfig', 'main'),
    (snapshot) => setConfig(snapshot.exists() ? snapshot.data() as StorePublicConfig : null),
    (cause) => setError(cause.message),
  ), []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);

    try {
      const hours = JSON.parse(String(data.get('hours'))) as StoreDayHours[];
      const holidayDates = JSON.parse(String(data.get('holidayDates') || '[]')) as string[];
      const holidayHours = JSON.parse(String(data.get('holidayHours') || '[]')) as StoreHoursWindow[];
      const zones = JSON.parse(String(data.get('zones') || '[]'));
      if (!Array.isArray(hours) || hours.length !== 7) throw new Error('Horários devem conter os 7 dias.');
      if (!Array.isArray(holidayDates) || holidayDates.some((date) => typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('Feriados devem usar datas no formato AAAA-MM-DD.');
      if (!Array.isArray(holidayHours) || !holidayHours.length || holidayHours.some((window) => !timePattern.test(window.open) || !timePattern.test(window.close))) throw new Error('Janelas dos feriados inválidas. Use HH:mm.');
      const deliveryMode = String(data.get('deliveryMode')) as StorePublicConfig['deliveryConfig']['mode'];
      const fixedFeeCents = Number(data.get('fixedFeeCents'));
      if (deliveryMode === 'FIXED' && (!Number.isSafeInteger(fixedFeeCents) || fixedFeeCents < 0)) throw new Error('Taxa fixa inválida.');

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
          ...(deliveryMode === 'FIXED' ? { fixedFeeCents } : {}),
          ...(deliveryMode === 'ZONES' ? { zones } : {}),
        },
        orderInstructions: String(data.get('orderInstructions')).trim(),
        deliveryEstimate: String(data.get('deliveryEstimate')).trim(),
        busyDeliveryEstimate: String(data.get('busyDeliveryEstimate')).trim(),
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
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    }
  }

  if (!config) return <AdminShell adminOnly><p>Carregando configurações…</p></AdminShell>;

  return <AdminShell adminOnly>
    <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">Loja</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Configurações</h1><p className="mt-2 text-sm text-[#826a75]">Dados públicos, recebimento, pagamento e horário.</p></div>
    <form onSubmit={save} className="mt-7 max-w-4xl space-y-5">
      <SettingsSection title="Identificação">
        <div className="grid gap-4 sm:grid-cols-2"><AdminField label="Nome da loja" name="storeName" required defaultValue={config.storeName} /><AdminField label="Instagram" name="instagramHandle" defaultValue={config.instagramHandle} /><AdminField label="Endereço" name="address" defaultValue={config.address} /><AdminField label="Cidade/UF" name="city" defaultValue={config.city} /><AdminField label="Telefone exibido" name="phoneDisplay" defaultValue={config.phoneDisplay} /><AdminField label="WhatsApp (55 + DDD + número)" name="whatsappNumber" defaultValue={config.whatsappNumber} /></div>
        <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="whatsappEnabled" defaultChecked={config.whatsappEnabled} /> Exibir botão de WhatsApp após o pedido salvo</label>
      </SettingsSection>

      <SettingsSection title="Pedidos">
        <div className="flex flex-wrap gap-5 text-sm font-bold"><label><input type="checkbox" name="orderingEnabled" defaultChecked={config.orderingEnabled} /> Pedidos habilitados</label><label><input type="checkbox" name="enforceHours" defaultChecked={config.enforceHours} /> Bloquear fora do horário</label></div>
        <div className="mt-4"><AdminField label="Mensagem quando pausado" name="pauseMessage" defaultValue={config.pauseMessage} /></div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><div><h3 className="text-sm font-black">Recebimento</h3><div className="mt-3 space-y-2 text-sm"><label className="block"><input type="checkbox" name="pickup" defaultChecked={config.fulfillmentModes.includes('PICKUP')} /> Retirada</label><label className="block"><input type="checkbox" name="delivery" defaultChecked={config.fulfillmentModes.includes('DELIVERY')} /> Delivery</label></div></div><div><h3 className="text-sm font-black">Pagamento informado</h3><div className="mt-3 space-y-2 text-sm"><label className="block"><input type="checkbox" name="pix" defaultChecked={config.paymentMethods.includes('PIX')} /> Pix</label><label className="block"><input type="checkbox" name="card" defaultChecked={config.paymentMethods.includes('CARD')} /> Cartão</label><label className="block"><input type="checkbox" name="cash" defaultChecked={config.paymentMethods.includes('CASH')} /> Dinheiro</label></div></div></div>
      </SettingsSection>

      <SettingsSection title="Mensagem ao cliente">
        <div className="space-y-4"><AdminTextarea label="Instruções do pedido" name="orderInstructions" defaultValue={config.orderInstructions} /><AdminField label="Prazo normal" name="deliveryEstimate" defaultValue={config.deliveryEstimate} /><AdminField label="Prazo em dias movimentados" name="busyDeliveryEstimate" defaultValue={config.busyDeliveryEstimate} /><AdminField label="Horário em feriados" name="holidayHoursNote" defaultValue={config.holidayHoursNote} /><AdminTextarea label="Mensagem de agradecimento" name="gratitudeMessage" defaultValue={config.gratitudeMessage} /></div>
      </SettingsSection>

      <SettingsSection title="Delivery">
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">Estratégia<select name="deliveryMode" defaultValue={config.deliveryConfig.mode} className="mt-2 h-11 w-full rounded-xl border bg-[#fffaf5] px-3 font-normal"><option value="NONE">Sem delivery</option><option value="CONFIRM">Taxa confirmada depois</option><option value="FIXED">Taxa fixa</option><option value="ZONES">Por bairro/zona</option></select></label><AdminField label="Taxa fixa (centavos)" name="fixedFeeCents" type="number" min="0" defaultValue={config.deliveryConfig.fixedFeeCents ?? 0} /></div>
        <div className="mt-4"><AdminTextarea label="Zonas (JSON; usado no modo ZONES)" name="zones" defaultValue={JSON.stringify(config.deliveryConfig.zones ?? [], null, 2)} rows={7} /></div>
      </SettingsSection>

      <SettingsSection title="Horários">
        <p className="text-xs text-[#826a75]">Timezone fixa: America/Sao_Paulo. O fechamento é exclusivo: às 21:50 a loja já aparece fechada.</p>
        <div className="mt-4"><AdminTextarea label="7 dias em JSON (0=domingo, 6=sábado)" name="hours" defaultValue={JSON.stringify(config.hours ?? fallbackHours, null, 2)} rows={15} /></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><AdminTextarea label="Feriados em JSON (AAAA-MM-DD)" name="holidayDates" defaultValue={JSON.stringify(config.holidayDates ?? [], null, 2)} rows={8} /><AdminTextarea label="Janelas dos feriados em JSON" name="holidayHours" defaultValue={JSON.stringify(config.holidayHours ?? defaultHolidayHours, null, 2)} rows={8} /></div>
      </SettingsSection>

      <SettingsSection title="Privacidade"><AdminTextarea label="Aviso operacional (revisar juridicamente antes do lançamento)" name="privacyNotice" defaultValue={config.privacyNotice} /></SettingsSection>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <Button type="submit" className="h-12 rounded-full bg-[#82204f] px-6 font-black text-white"><Save /> Salvar configurações</Button>
    </form>
  </AdminShell>;
}

function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-[26px] bg-white p-5 shadow-sm sm:p-6"><h2 className="mb-5 text-xl font-black">{title}</h2>{children}</section>;
}
