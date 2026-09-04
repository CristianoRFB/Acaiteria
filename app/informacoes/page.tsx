'use client';

import { AtSign, Bike, Clock3, Heart, Images, MapPin, Phone, ShieldCheck } from 'lucide-react';

import { PublicHeader } from '@/components/public-header';
import { useCatalog } from '@/components/providers';
import { formatBRL, getDeliveryEstimate } from '@/shared/domain';

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function InformationPage() {
  const { config, development } = useCatalog();
  const estimate = getDeliveryEstimate(new Date(), config);
  return <main className="min-h-screen bg-[#fffaf5] text-[#2b1722]">
    <PublicHeader />
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">A loja</p>
      <h1 className="mt-2 text-4xl font-black tracking-[-.05em]">Informações</h1>
      {development && <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">O cardápio e os horários já refletem as fotos enviadas. Endereço, telefone e WhatsApp ainda precisam ser confirmados antes do lançamento.</div>}

      <section className="mt-8 rounded-[28px] bg-[#351924] p-6 text-white shadow-sm sm:p-7">
        <p className="text-sm font-black text-[#ffcf3d]">Oiii ☺️</p>
        <h2 className="mt-2 text-2xl font-black">Como fazer seu pedido</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{config.orderInstructions}</p>
        <p className="mt-5 text-sm font-bold text-[#d7f04a]">{config.gratitudeMessage}</p>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InfoCard icon={MapPin} title="Endereço"><p>{config.address || 'A confirmar'}</p><p>{config.city}</p></InfoCard>
        <InfoCard icon={Phone} title="Contato"><p>{config.phoneDisplay || 'Telefone a confirmar'}</p>{config.whatsappEnabled && <p>WhatsApp habilitado para contato</p>}</InfoCard>
        <InfoCard icon={AtSign} title="Instagram"><p>{config.instagramHandle || 'A confirmar'}</p></InfoCard>
        <InfoCard icon={Bike} title="Entrega"><p>Taxa fixa: {formatBRL(config.deliveryConfig.fixedFeeCents ?? 0)}</p><p>Tempo estimado: {estimate.label}</p><p>{estimate.detail}</p></InfoCard>
      </div>

      <section className="mt-4 rounded-[28px] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#fff0f5] text-[#82204f]"><Clock3 className="size-5" /></span><div><h2 className="text-xl font-black">Horários</h2><p className="text-xs text-[#826a75]">{config.holidayHoursNote}</p></div></div>
        <div className="mt-5 divide-y divide-[#82204f]/8">{[...config.hours].sort((a, b) => a.day - b.day).map((day) => <div key={day.day} className="flex justify-between gap-4 py-3 text-sm"><strong>{dayNames[day.day]}</strong><span className="text-right text-[#826a75]">{day.closed ? 'Fechado' : day.windows.map((window) => `${window.open} às ${window.close}`).join(' / ')}</span></div>)}</div>
      </section>

      <section className="mt-4 rounded-[28px] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-[#fff0f5] text-[#82204f]"><Images className="size-5" /></span><div><h2 className="text-xl font-black">Cardápio original</h2><p className="text-xs text-[#826a75]">Consulte as imagens enviadas pela loja em tamanho completo.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <a href="/menu/combinados.jpg" target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[22px] border border-[#82204f]/10 bg-[#fff0f5]"><img loading="lazy" src="/menu/combinados.jpg" alt="Cardápio original de combinados" className="aspect-[4/3] w-full object-cover object-top transition group-hover:scale-[1.02]" /><strong className="block p-4 text-sm text-[#82204f]">Abrir combinados</strong></a>
          <a href="/menu/cardapio-completo.jpg" target="_blank" rel="noreferrer" className="group overflow-hidden rounded-[22px] border border-[#82204f]/10 bg-[#fff0f5]"><img loading="lazy" src="/menu/cardapio-completo.jpg" alt="Cardápio original de copos, acompanhamentos, milk-shakes, sorvetes, bebidas, shakes e salada de frutas" className="aspect-[4/3] w-full object-cover object-top transition group-hover:scale-[1.02]" /><strong className="block p-4 text-sm text-[#82204f]">Abrir cardápio completo</strong></a>
        </div>
      </section>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <InfoCard icon={ShieldCheck} title="Privacidade"><p>{config.privacyNotice || 'Política em revisão antes do lançamento.'}</p></InfoCard>
        <InfoCard icon={Heart} title="Agradecimento"><p>{config.gratitudeMessage}</p></InfoCard>
      </div>
    </div>
  </main>;
}

function InfoCard({ icon: Icon, title, children }: { icon: typeof MapPin; title: string; children: React.ReactNode }) {
  return <section className="rounded-[28px] bg-white p-6 shadow-sm"><span className="grid size-10 place-items-center rounded-full bg-[#fff0f5] text-[#82204f]"><Icon className="size-5" /></span><h2 className="mt-4 text-lg font-black">{title}</h2><div className="mt-2 space-y-1 text-sm leading-relaxed text-[#826a75]">{children}</div></section>;
}
