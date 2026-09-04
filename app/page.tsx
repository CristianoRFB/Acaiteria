'use client';

import { ArrowRight, Clock3, MapPin, Timer, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PublicHeader } from '@/components/public-header';
import { useCatalog } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { formatBRL, formatNextOpening, getStoreAvailability, type Product, type ProductCategory } from '@/shared/domain';

export default function Home() {
  const { catalog, config, loading, error, development } = useCatalog();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const products = catalog.products.filter((product) => product.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const categories = catalog.categories.filter((category) => category.active && products.some((product) => product.categoryId === category.id)).sort((a, b) => a.displayOrder - b.displayOrder);
  const availability = getStoreAvailability(now, config);
  const open = availability.acceptingOrders;
  const primary = products.find((product) => product.id === 'acai-monte-seu') ?? products[0];
  const mondayHours = config.hours.find((day) => day.day === 1)?.windows.map((window) => `${window.open} às ${window.close}`).join(' / ') || 'A confirmar';
  const sundayHours = config.hours.find((day) => day.day === 0)?.windows.map((window) => `${window.open} às ${window.close}`).join(' / ') || 'A confirmar';

  return <main className="min-h-screen bg-[#fffaf5] text-[#2b1722]">
    <PublicHeader />
    <section className="relative overflow-hidden border-b border-[#82204f]/10">
      <div className="absolute -right-32 -top-28 size-80 rounded-full bg-[#ffcf3d]/25 blur-3xl" />
      <div className="absolute -bottom-44 left-1/3 size-80 rounded-full bg-[#d7f04a]/20 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-20">
        <div className="relative z-10">
          <div className={`mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${open ? 'border-emerald-700/15 bg-emerald-50 text-emerald-800' : 'border-amber-700/15 bg-amber-50 text-amber-900'}`}>
            <span className={`size-2 rounded-full ${open ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {open ? `ABERTO AGORA${availability.closesAt ? ` · até ${availability.closesAt}` : ''}` : `FECHADO NO MOMENTO · ${availability.reason === 'OUTSIDE_HOURS' ? formatNextOpening(availability.nextOpening) : config.pauseMessage || 'Pedidos indisponíveis'}`}
          </div>
          <h1 className="max-w-xl text-5xl font-black leading-[.94] tracking-[-0.06em] text-[#53142f] sm:text-6xl lg:text-7xl">Seu sabor, do seu jeito.</h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[#6f5360]">Monte seu copo ou escolha um dos nossos combinados. O cardápio completo está logo abaixo.</p>
          <p className="mt-3 text-sm font-bold text-[#82204f]">Tempo estimado: {availability.estimate.label}. <span className="font-normal text-[#826a75]">{availability.estimate.detail}</span></p>
          <Button disabled={!primary} className="mt-7 h-13 rounded-full bg-[#82204f] px-6 text-base font-bold text-white shadow-[0_14px_30px_rgba(130,32,79,.24)] hover:bg-[#6d183f]" render={<a href={primary ? `/montar/${primary.id}` : '#cardapio'} />}>
            Montar meu copo <ArrowRight className="size-5" />
          </Button>
        </div>
        <div className="relative mx-auto aspect-square w-full max-w-[430px]" aria-hidden="true">
          <div className="absolute inset-[6%] rotate-6 rounded-[38%_62%_52%_48%/47%_41%_59%_53%] bg-[#ffcf3d]" />
          <img src="/development-acai-placeholder.png" alt="" className="absolute inset-[13%] size-[74%] -rotate-3 rounded-[52%_48%_45%_55%/50%_47%_53%_50%] object-cover shadow-[0_30px_60px_rgba(83,20,47,.28)]" />
          <div className="absolute bottom-[7%] right-[2%] rounded-2xl bg-white px-4 py-3 shadow-xl"><strong className="block text-sm text-[#53142f]">Açaí + Sabor</strong><span className="text-xs text-[#826a75]">Santa Fé do Sul</span></div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
      <div className="grid overflow-hidden rounded-[30px] bg-[#351924] text-white shadow-[0_20px_55px_rgba(53,25,36,.14)] lg:grid-cols-[1.25fr_.75fr]">
        <div className="p-6 sm:p-8">
          <p className="text-sm font-black text-[#ffcf3d]">Oiii ☺️</p>
          <h2 className="mt-2 max-w-xl text-2xl font-black tracking-[-.035em] sm:text-3xl">Faça seu pedido com tudo o que precisamos para entregar direitinho.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">{config.orderInstructions}</p>
          <p className="mt-5 text-sm font-bold text-[#d7f04a]">{config.gratitudeMessage}</p>
        </div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-1">
          <div className="flex gap-3 bg-white/5 p-5"><Timer className="mt-0.5 size-5 shrink-0 text-[#ffcf3d]" /><div><strong className="text-sm">Tempo estimado: {availability.estimate.label}</strong><p className="mt-1 text-xs leading-relaxed text-white/60">{availability.estimate.detail}</p></div></div>
          <div className="flex gap-3 bg-white/5 p-5"><WalletCards className="mt-0.5 size-5 shrink-0 text-[#d7f04a]" /><div><strong className="text-sm">Entrega por {formatBRL(config.deliveryConfig.fixedFeeCents ?? 0)}</strong><p className="mt-1 text-xs leading-relaxed text-white/60">Informe a forma de pagamento e o troco no checkout.</p></div></div>
        </div>
      </div>
    </section>

    <section id="cardapio" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">Cardápio</p><h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[#351924]">Escolha o que vai pedir</h2></div>{development && <span className="hidden rounded-full bg-[#fff0f5] px-3 py-1.5 text-xs font-bold text-[#82204f] sm:block">Prévia do cardápio</span>}</div>
      <nav aria-label="Categorias do cardápio" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{categories.map((category) => <a key={category.id} href={`#categoria-${category.id}`} className="shrink-0 rounded-full border border-[#82204f]/12 bg-white px-4 py-2 text-sm font-bold text-[#6d183f] shadow-sm hover:border-[#82204f]/35">{category.name}</a>)}</nav>
      {loading && <div className="mt-7 grid gap-4 sm:grid-cols-2"><div className="h-52 animate-pulse rounded-[28px] bg-[#82204f]/8" /><div className="h-52 animate-pulse rounded-[28px] bg-[#82204f]/8" /></div>}
      {error && <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">Não foi possível carregar o cardápio: {error}</div>}
      {!loading && !products.length && <div className="mt-7 rounded-[28px] border border-dashed border-[#82204f]/25 bg-white p-8 text-center"><strong>Cardápio em configuração</strong><p className="mt-1 text-sm text-[#826a75]">A loja ainda não publicou produtos.</p></div>}
      {!loading && categories.map((category) => {
        const categoryProducts = products.filter((product) => product.categoryId === category.id);
        return <section key={category.id} id={`categoria-${category.id}`} className="scroll-mt-24 pt-11 first:pt-8">
          <div className="flex items-end justify-between gap-4 border-b border-[#82204f]/10 pb-4"><div><h3 className="text-2xl font-black tracking-[-.035em] text-[#351924]">{category.name}</h3><p className="mt-1 text-sm text-[#826a75]">{categoryProducts.length} {categoryProducts.length === 1 ? 'opção' : 'opções'}</p></div>{category.id === 'combinados' && <span className="text-xs font-bold text-[#a62c63]">Adicionais disponíveis</span>}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">{categoryProducts.map((product) => <ProductCard key={product.id} product={product} category={category} />)}</div>
        </section>;
      })}
      <div className="mt-12 grid gap-3 rounded-[28px] bg-[#351924] p-5 text-white sm:grid-cols-2 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-white/10"><Clock3 className="size-5 text-[#ffcf3d]" /></span><div><strong className="block text-sm">Segunda a sábado</strong><span className="text-xs text-white/60">{mondayHours}</span></div></div><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-white/10"><MapPin className="size-5 text-[#d7f04a]" /></span><div><strong className="block text-sm">Domingos e feriados</strong><span className="text-xs text-white/60">{sundayHours} • {config.city}</span></div></div></div>
    </section>
  </main>;
}

function ProductCard({ product, category }: { product: Product; category: ProductCategory }) {
  const activeSizes = product.sizes.filter((size) => size.active);
  const starting = activeSizes.length ? Math.min(...activeSizes.map((size) => size.basePriceCents)) : 0;
  return <a href={`/montar/${product.id}`} className="group grid min-h-48 grid-cols-[1fr_112px] overflow-hidden rounded-[28px] border border-[#82204f]/10 bg-white p-5 shadow-[0_12px_40px_rgba(88,32,58,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(88,32,58,.12)] sm:grid-cols-[1fr_150px]">
    <div className="flex flex-col"><span className="text-xs font-bold text-[#a62c63]">{category.name}</span><h4 className="mt-2 text-xl font-black tracking-[-0.03em] text-[#351924]">{product.name}</h4><p className="mt-2 text-sm leading-relaxed text-[#826a75]">{product.description}</p><span className="mt-auto pt-5 text-sm font-extrabold text-[#82204f]">A partir de {formatBRL(starting)}</span></div>
    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#74204c] via-[#a22862] to-[#d14e7e]">{product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover opacity-85 transition group-hover:scale-105" /> : <div className="grid size-full place-items-center p-3 text-center text-sm font-black leading-tight text-white/90">Açaí<br /><span className="text-[#ffcf3d]">+ Sabor</span></div>}<span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-[#d7f04a] text-[#351924]"><ArrowRight className="size-4" /></span></div>
  </a>;
}
