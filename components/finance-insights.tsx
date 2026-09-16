'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Crown, Lightbulb, ShoppingBag, TrendingUp } from 'lucide-react';

import { formatBRL, type PricedItem } from '@/shared/domain';
import type { FinanceEntry } from '@/shared/finance';
import { paymentMethodLabel, type CashPaymentMethod } from '@/shared/cash-register';

export interface FinanceInsightOrder {
  id: string;
  items?: PricedItem[];
  fulfillment?: { mode?: string };
  pricing?: { totalCents?: number };
}

export interface FinanceInsightsData {
  flow: Array<{ label: string; income: number; expense: number }>;
  payments: Array<{ name: string; value: number; paymentMethod: CashPaymentMethod }>;
  products: Array<{ name: string; quantity: number; revenue: number }>;
  channels: Array<{ name: string; orders: number; revenue: number }>;
  revenue: number;
  orders: number;
  averageTicket: number;
  units: number;
  bestDay: { label: string; revenue: number } | null;
}

const paymentMethods: CashPaymentMethod[] = ['CASH', 'PIX', 'CARD', 'OTHER'];
const chartColors = ['#82204f', '#d7a10b', '#3b82f6', '#7c3aed'];

function shortDate(value: string) {
  return value.length >= 10 ? value.slice(8, 10) : value;
}

function safeAmount(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function buildFinanceInsights(entries: FinanceEntry[], orders: FinanceInsightOrder[]): FinanceInsightsData {
  const paidEntries = entries.filter((entry) => entry.status === 'PAID');
  const saleEntries = paidEntries.filter((entry) => Boolean(entry.sourceOrderId || entry.sourceLocalSaleId || (entry.kind === 'INCOME' && ['Vendas de açaí', 'Delivery'].includes(entry.category))));
  const flowMap = new Map<string, { income: number; expense: number }>();
  const salesByDay = new Map<string, number>();
  const productMap = new Map<string, { quantity: number; revenue: number }>();
  const channelMap = new Map<string, { orders: number; revenue: number }>();
  let totalUnits = 0;

  for (const entry of paidEntries) {
    const current = flowMap.get(entry.date) ?? { income: 0, expense: 0 };
    if (entry.kind === 'INCOME') current.income += safeAmount(entry.amountCents);
    else current.expense += safeAmount(entry.amountCents);
    flowMap.set(entry.date, current);
  }

  for (const order of orders) {
    const fulfillment = order.fulfillment?.mode === 'DELIVERY' ? 'Entrega' : 'Retirada';
    const channel = channelMap.get(fulfillment) ?? { orders: 0, revenue: 0 };
    channel.orders += 1;
    channel.revenue += safeAmount(order.pricing?.totalCents) || (order.items ?? []).reduce((sum, item) => sum + safeAmount(item.totalPriceCents), 0);
    channelMap.set(fulfillment, channel);
    for (const item of order.items ?? []) {
      const name = String(item.productName || 'Produto sem nome');
      const current = productMap.get(name) ?? { quantity: 0, revenue: 0 };
      current.quantity += safeAmount(item.quantity);
      totalUnits += safeAmount(item.quantity);
      current.revenue += safeAmount(item.totalPriceCents);
      productMap.set(name, current);
    }
  }

  const localSales = saleEntries.filter((entry) => Boolean(entry.sourceLocalSaleId));
  if (localSales.length) channelMap.set('Balcão', { orders: localSales.length, revenue: localSales.reduce((sum, entry) => sum + safeAmount(entry.amountCents), 0) });
  for (const entry of saleEntries) salesByDay.set(entry.date, (salesByDay.get(entry.date) ?? 0) + safeAmount(entry.amountCents));

  const flow = [...flowMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ label: shortDate(date), ...values }));
  const payments = paymentMethods.map((paymentMethod) => ({
    name: paymentMethodLabel(paymentMethod),
    value: saleEntries.filter((entry) => (entry.paymentMethod ?? 'OTHER') === paymentMethod).reduce((sum, entry) => sum + safeAmount(entry.amountCents), 0),
    paymentMethod,
  }));
  const products = [...productMap.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 5);
  const channels = [...channelMap.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.revenue - a.revenue);
  const revenue = saleEntries.reduce((sum, entry) => sum + safeAmount(entry.amountCents), 0);
  const bestDay = [...salesByDay.entries()].reduce<{ date: string; revenue: number } | null>((best, [date, dayRevenue]) => {
    if (!best || dayRevenue > best.revenue) return { date, revenue: dayRevenue };
    return best;
  }, null);

  return {
    flow,
    payments,
    products,
    channels,
    revenue,
    orders: saleEntries.length,
    averageTicket: saleEntries.length ? Math.round(revenue / saleEntries.length) : 0,
    units: totalUnits,
    bestDay: bestDay ? { label: `${bestDay.date.slice(8, 10)}/${bestDay.date.slice(5, 7)}`, revenue: bestDay.revenue } : null,
  };
}

export function FinanceInsights({ entries, orders }: { entries: FinanceEntry[]; orders: FinanceInsightOrder[] }) {
  const data = buildFinanceInsights(entries, orders);
  const hasData = data.revenue > 0 || data.flow.length > 0;

  return (
    <div className="mt-7 space-y-5">
      <section className="rounded-[26px] bg-[#351924] p-5 text-white shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-[#d7f04a]">Inteligência de vendas</p>
            <h2 className="mt-1 text-2xl font-black">Decisões rápidas para vender mais</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">Use o que já foi vendido para escolher destaque do cardápio, horário de campanha e forma de pagamento mais forte.</p>
          </div>
          <TrendingUp className="hidden size-12 text-[#d7f04a] md:block" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InsightMetric label="Faturamento de vendas" value={formatBRL(data.revenue)} />
          <InsightMetric label="Vendas registradas" value={String(data.orders)} />
          <InsightMetric label="Ticket médio" value={formatBRL(data.averageTicket)} />
          <InsightMetric label="Unidades nos pedidos" value={String(data.units)} />
        </div>
        {!hasData && <p className="mt-5 rounded-2xl bg-white/10 p-4 text-sm text-white/75">Ainda não há vendas pagas neste mês para analisar. Registre uma venda ou conclua um pedido para começar.</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_.85fr]">
        <InsightCard title="Fluxo do mês" description="Receitas e despesas pagas por dia." icon={<BarChart3 className="size-5" />}>
          {data.flow.length ? <div className="h-[280px] w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.flow} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#eadde2" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => `R$${Math.round(Number(value) / 100)}`} /><Tooltip formatter={(value) => formatBRL(Number(value ?? 0))} labelFormatter={(label) => `Dia ${label}`} /><Bar dataKey="income" name="Receitas" fill="#82204f" radius={[5, 5, 0, 0]} /><Bar dataKey="expense" name="Despesas" fill="#e98a7a" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyInsight text="Sem movimentações pagas neste mês." />}
        </InsightCard>
        <InsightCard title="Mix de pagamentos" description="Quanto entrou por forma de pagamento." icon={<ShoppingBag className="size-5" />}>
          {data.payments.some((item) => item.value > 0) ? <><div className="h-[210px] w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.payments.filter((item) => item.value > 0)} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={3}>{data.payments.filter((item) => item.value > 0).map((item, index) => <Cell key={item.paymentMethod} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value) => formatBRL(Number(value ?? 0))} /></PieChart></ResponsiveContainer></div><div className="space-y-2">{data.payments.filter((item) => item.value > 0).map((item, index) => <div key={item.paymentMethod} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />{item.name}</span><strong>{formatBRL(item.value)}</strong></div>)}</div></> : <EmptyInsight text="Nenhuma venda com pagamento registrado." />}
        </InsightCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <InsightCard title="Ranking de produtos" description="Os itens que mais saíram nos pedidos concluídos." icon={<Crown className="size-5" />}>
          {data.products.length ? <div className="space-y-4">{data.products.map((product, index) => <div key={product.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-3"><b className="grid size-7 shrink-0 place-items-center rounded-full bg-[#fff0f5] text-[#82204f]">{index + 1}</b><strong className="truncate">{product.name}</strong></span><span className="shrink-0 text-right text-xs text-[#826a75]">{product.quantity} un. · {formatBRL(product.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f8f1f4]"><div className="h-full rounded-full bg-[#82204f]" style={{ width: `${Math.max(8, (product.quantity / data.products[0].quantity) * 100)}%` }} /></div></div>)}</div> : <EmptyInsight text="Os produtos aparecerão aqui quando houver pedidos concluídos." />}
          <p className="mt-5 text-xs leading-relaxed text-[#826a75]">Vendas locais entram no faturamento e no ticket médio. O ranking de produtos usa os itens detalhados dos pedidos online.</p>
        </InsightCard>
        <InsightCard title="Canais que trazem receita" description="Compare balcão, retirada e entrega." icon={<ShoppingBag className="size-5" />}>
          {data.channels.length ? <div className="space-y-3">{data.channels.map((channel) => <div key={channel.name} className="rounded-2xl bg-[#fffaf5] p-4"><div className="flex items-center justify-between gap-3"><strong>{channel.name}</strong><span className="text-xs font-bold text-[#826a75]">{channel.orders} venda{channel.orders === 1 ? '' : 's'}</span></div><p className="mt-1 text-lg font-black text-[#82204f]">{formatBRL(channel.revenue)}</p></div>)}</div> : <EmptyInsight text="Sem canais para comparar ainda." />}
          {data.bestDay && <p className="mt-4 rounded-2xl bg-[#fffde8] p-3 text-xs font-bold text-[#725d00]">Melhor dia de vendas: {data.bestDay.label}, com {formatBRL(data.bestDay.revenue)}.</p>}
        </InsightCard>
      </div>

      <section className="flex gap-3 rounded-[22px] border border-[#d7f04a]/70 bg-[#fffde8] p-4 text-sm text-[#5e4b00] sm:p-5">
        <Lightbulb className="mt-0.5 size-5 shrink-0 text-[#9a7900]" />
        <p><strong>Próxima ação de marketing:</strong> destaque o primeiro produto do ranking na home e teste uma oferta combinada com o segundo. Reavalie após uma semana de vendas.</p>
      </section>
    </div>
  );
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-bold text-white/60">{label}</p><strong className="mt-1 block text-xl font-black text-[#d7f04a]">{value}</strong></div>;
}

function InsightCard({ title, description, icon, children }: { title: string; description: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-[26px] bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#fff0f5] text-[#82204f]">{icon}</span><div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-[#826a75]">{description}</p></div></div><div className="mt-5">{children}</div></section>;
}

function EmptyInsight({ text }: { text: string }) {
  return <div className="grid min-h-44 place-items-center rounded-2xl bg-[#fffaf5] p-6 text-center text-sm text-[#826a75]">{text}</div>;
}
