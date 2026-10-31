import type { Metadata } from 'next';
import { ArrowDown, ArrowRight, Check, Clock3, CreditCard, ShieldCheck, Sparkles } from 'lucide-react';

import { ACAI_PLAN_CATALOG, PLAN_IDS, type PlanId } from '@/shared/plan-catalog';

export const metadata: Metadata = {
  title: 'SaaS para açaiterias | Planos Essencial, Pro e Premium',
  description: 'Cardápio online, pedidos, delivery e gestão de açaiterias. Compare preços e recursos aprovados dos planos Essencial, Pro e Premium.',
};

const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
});

const features: Record<PlanId, string[]> = {
  ESSENTIAL: [
    'Cardápio digital e montagem personalizada de açaí',
    'Carrinho e checkout com retirada e entrega básica',
    'Administração de pedidos, produtos e promoções',
    'Até 2 usuários internos (owner não incluído)',
  ],
  PRO: [
    'Tudo do Essencial',
    'Central de entregas e painel de entregadores',
    'Código de confirmação, falhas e reatribuição',
    'Caixa, gestão financeira e relatórios avançados',
    'Até 6 usuários internos e 5 entregadores',
  ],
  PREMIUM: [
    'Tudo do Pro, com maior capacidade',
    'Até 20 usuários internos e 20 entregadores',
    'Maior volume mensal de pedidos',
    'Onboarding e suporte prioritários',
    'Histórico comercial completo',
  ],
};

export default function SaasOverviewPage() {
  return <main className="min-h-screen bg-[#fffaf5] text-[#321a29]">
    <header className="sticky top-0 z-20 border-b border-[#82204f]/10 bg-[#fffaf5]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <a className="flex items-center gap-2 font-black tracking-tight" href="/saas" aria-label="Início do SaaS para açaiterias"><span className="grid size-9 place-items-center rounded-xl bg-[#82204f] text-white">A+</span><span>Operação para açaiterias</span></a>
        <a className="rounded-full border border-[#82204f]/20 px-4 py-2 text-sm font-bold text-[#82204f] hover:bg-[#fff0f5]" href="#planos">Comparar planos</a>
      </div>
    </header>

    <section className="mx-auto grid max-w-6xl items-center gap-9 px-5 pb-16 pt-14 lg:grid-cols-[1.2fr_.8fr] lg:pt-24">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#fff0f5] px-4 py-2 text-xs font-black uppercase tracking-[.14em] text-[#82204f]"><Sparkles className="size-4"/> SaaS especializado em açaí</span>
        <h1 className="mt-6 max-w-3xl text-4xl font-black leading-tight tracking-[-.055em] sm:text-6xl">Seu cardápio, seus pedidos e sua operação em um só lugar.</h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-[#755c6b]">Do cliente que monta o próprio copo ao acompanhamento da entrega, com gestão da loja e recursos conforme o plano escolhido. A experiência de cada açaiteria fica separada por estabelecimento.</p>
        <a href="#planos" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#82204f] px-6 text-sm font-black text-white transition hover:bg-[#68153d]">Conheça os planos <ArrowDown className="size-4"/></a>
        <p className="mt-4 text-xs text-[#826a75]">Sem plano gratuito permanente. Teste Pro de 14 dias sem cartão inicial para proprietários de lojas cadastradas. O cadastro inicial da loja é assistido.</p>
      </div>
      <div className="rounded-[32px] bg-[#351924] p-6 text-white shadow-2xl sm:p-8">
        <span className="text-xs font-black uppercase tracking-[.2em] text-[#d7f04a]">Fluxo da loja</span>
        <div className="mt-6 space-y-3">
          {[
            ['01', 'Cliente monta o pedido', 'Tamanhos, adicionais e carrinho'],
            ['02', 'Pedido chega à operação', 'Painel da loja e acompanhamento'],
            ['03', 'Retirada ou entrega', 'Expedição e confirmação, conforme o plano'],
            ['04', 'Gestão do negócio', 'Caixa e finanças nos planos Pro e Premium'],
          ].map(([num, title, detail]) => <div key={num} className="flex items-start gap-4 rounded-2xl bg-white/8 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d7f04a] font-black text-[#351924]">{num}</span><div><strong className="block text-sm">{title}</strong><p className="mt-1 text-xs leading-5 text-white/65">{detail}</p></div></div>)}
        </div>
      </div>
    </section>

    <section id="planos" className="scroll-mt-24 border-t border-[#82204f]/10 bg-white px-5 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="text-center"><p className="text-xs font-black uppercase tracking-[.2em] text-[#82204f]">Planos aprovados</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Escolha o tamanho certo para sua operação</h2><p className="mt-3 text-sm text-[#826a75]">O Pro é o plano recomendado. Todos os planos contemplam uma unidade até a implantação de multiunidade real.</p></div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const plan = ACAI_PLAN_CATALOG[id];
            return <article key={id} className={`relative flex flex-col rounded-[30px] border p-6 shadow-sm sm:p-7 ${plan.recommended ? 'border-[#82204f] bg-[#fff9fb] shadow-[0_16px_45px_rgba(130,32,79,.12)]' : 'border-[#82204f]/10 bg-white'}`}>
              {plan.recommended && <span className="absolute -top-4 left-6 rounded-full bg-[#82204f] px-4 py-2 text-xs font-black text-white">Recomendado</span>}
              <h3 className="text-2xl font-black">{plan.name}</h3>
              <p className="mt-4 text-4xl font-black tracking-tight text-[#82204f]">{formatBRL(plan.monthlyPriceCents)}<span className="text-sm font-semibold text-[#826a75]">/mês</span></p>
              <p className="mt-2 text-sm text-[#826a75]">ou {formatBRL(plan.annualPriceCents)} por ano</p>
              <div className="mt-6 border-t border-[#82204f]/10 pt-6"><p className="text-sm font-black">Inclui:</p><ul className="mt-4 space-y-3">{features[id].map((item) => <li key={item} className="flex gap-3 text-sm leading-6 text-[#634855]"><Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-[#82204f]"/>{item}</li>)}</ul></div>
              <div className="mt-auto pt-8 text-xs leading-6 text-[#826a75]"><strong className="text-[#321a29]">Capacidade:</strong> {plan.limits.ordersPerMonth.toLocaleString('pt-BR')} pedidos/mês · {plan.limits.units} unidade · {plan.limits.reportLookbackDays === null ? 'histórico completo' : plan.limits.reportLookbackDays === 365 ? '12 meses de histórico comercial' : '30 dias de histórico comercial'}</div>
            </article>;
          })}
        </div>
        <p className="mt-7 text-center text-sm text-[#826a75]">Implantação autônoma sem custo. Configuração assistida opcional por R$ 149; migrações complexas a partir de R$ 299, conforme escopo. Os valores de assinatura não incluem cobrança automática neste estágio.</p>
      </div>
    </section>

    <section className="mx-auto grid max-w-6xl gap-6 px-5 py-16 sm:grid-cols-3">
      <div className="rounded-3xl border border-[#82204f]/10 bg-white p-6"><Clock3 className="size-7 text-[#82204f]"/><h3 className="mt-5 font-black">14 dias para experimentar</h3><p className="mt-2 text-sm leading-6 text-[#826a75]">Teste das capacidades Pro, sem solicitar cartão inicial. O proprietário pode iniciar o teste uma única vez pelo painel. O cadastro inicial é assistido; não há checkout online.</p></div>
      <div className="rounded-3xl border border-[#82204f]/10 bg-white p-6"><ShieldCheck className="size-7 text-[#82204f]"/><h3 className="mt-5 font-black">Dados preservados</h3><p className="mt-2 text-sm leading-6 text-[#826a75]">Alterações de plano não excluem pedidos, lançamentos ou cadastros existentes. Segurança e isolamento não são extras Premium.</p></div>
      <div className="rounded-3xl border border-[#82204f]/10 bg-white p-6"><CreditCard className="size-7 text-[#82204f]"/><h3 className="mt-5 font-black">Ativação transparente</h3><p className="mt-2 text-sm leading-6 text-[#826a75]">Planos pagos atribuídos manualmente pela plataforma; trial ativável pelo proprietário. Gateway, renovação e checkout automático ainda não estão disponíveis.</p></div>
    </section>
    <footer className="border-t border-[#82204f]/10 px-5 py-7 text-center text-xs text-[#826a75]">Açaí SaaS — apresentação comercial. Recursos e limites conforme planos aprovados. <ArrowRight className="ml-1 inline size-3" aria-hidden="true"/></footer>
  </main>;
}
