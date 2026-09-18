'use client';

import { ArrowRight, Clock3, MapPin, Timer, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';

import { LandingHero } from '@/components/landing-hero';
import { PublicHeader } from '@/components/public-header';
import { OrderLookup } from '@/components/order-lookup';
import { useCatalog } from '@/components/providers';
import { formatBRL, formatNextOpening, getStoreAvailability, type Product, type ProductCategory, type Promotion } from '@/shared/domain';
import { resolveProductImage } from '@/shared/catalog-images';

export default function Home() {
  const { catalog, config, promotions, loading, error, development } = useCatalog();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const products = catalog.products.filter((product) => product.active).sort((a, b) => a.displayOrder - b.displayOrder);
  const categories = catalog.categories.filter((category) => category.active && products.some((product) => product.categoryId === category.id)).sort((a, b) => a.displayOrder - b.displayOrder);
  const availability = getStoreAvailability(now, config);
  const open = availability.acceptingOrders;
  const primary = products.find((product) => product.id === 'acai-monte-seu') ?? products[0];
  const mondayHours = config.hours.find((day) => day.day === 1)?.windows.map((window) => `${window.open} às ${window.close}`).join(' / ') || 'A confirmar';
  const sundayHours = config.hours.find((day) => day.day === 0)?.windows.map((window) => `${window.open} às ${window.close}`).join(' / ') || 'A confirmar';

  const heroImage = resolveProductImage(primary?.id ?? 'acai-monte-seu', primary?.imageUrl);
  const combo = products.find((product) => product.categoryId === 'combinados') ?? products.find((product) => product.id === 'barbie');
  const drink = products.find((product) => product.id === 'refrigerante') ?? products.find((product) => product.categoryId === 'bebidas');
  const heroSlides = [
    { eyebrow: 'Açaí do seu jeito', title: 'Seu sabor, do seu jeito.', description: 'Monte seu copo com açaí cremoso, frutas frescas e os complementos que você mais gosta.', cta: 'Montar meu copo', href: primary ? `/montar/${primary.id}` : '#cardapio', image: '/landing/acai-society-hero.webp', imageAlt: 'Três opções coloridas de açaí com frutas e granola', tag: 'Mais pedido', accent: 'yellow' as const },
    { eyebrow: 'Combinados da casa', title: 'Uma combinação que vira memória.', description: combo?.description || 'Escolha uma combinação pronta e personalize do seu jeito antes de finalizar.', cta: 'Ver combinados', href: '#categoria-combinados', image: combo ? resolveProductImage(combo.id, combo.imageUrl) : heroImage, imageAlt: combo?.name || 'Açaí combinado com frutas e complementos', tag: 'Feitos na hora', accent: 'lime' as const },
    { eyebrow: 'Peça sem complicação', title: 'Do primeiro clique ao pedido.', description: 'Cardápio completo, pagamento simples e acompanhamento do pedido em tempo real.', cta: 'Ver cardápio', href: '#cardapio', image: drink ? resolveProductImage(drink.id, drink.imageUrl) : heroImage, imageAlt: drink?.name || 'Bebida gelada da Açaí + Sabor', tag: 'Tudo fresquinho', accent: 'pink' as const },
  ];
  return <main className="page-shell">
    <PublicHeader />
    <LandingHero slides={heroSlides} open={open} statusText={open ? `Aberto agora${availability.closesAt ? ` · até ${availability.closesAt}` : ''}` : `Fechado · ${availability.reason === 'OUTSIDE_HOURS' ? formatNextOpening(availability.nextOpening) : config.pauseMessage || 'Pedidos indisponíveis'}`} estimate={availability.estimate.label} city={config.city ?? 'Santa Fé do Sul'} />

    <OrderLookup />

    {promotions.length > 0 && <section aria-labelledby="promocoes" className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Ofertas da loja</p><h2 id="promocoes" className="section-title">Promoções especiais</h2></div><span className="rounded-full bg-accent px-3 py-1.5 text-xs font-black text-brand-deep">Por tempo limitado</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{promotions.map((promotion) => <PromotionCard key={promotion.id} promotion={promotion} products={catalog.products} />)}</div></section>}

    <section className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-10">
      <div className="grid overflow-hidden rounded-[30px] bg-brand-deep text-white shadow-[0_20px_55px_rgba(53,25,36,.14)] lg:grid-cols-[1.25fr_.75fr]">
        <div className="p-6 sm:p-8">
          <p className="text-sm font-black text-secondary">Oiii ☺️</p>
          <h2 className="mt-2 max-w-xl text-2xl font-black tracking-[-.035em] sm:text-3xl">Faça seu pedido com tudo o que precisamos para entregar direitinho.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">{config.orderInstructions}</p>
          <p className="mt-5 text-sm font-bold text-accent">{config.gratitudeMessage}</p>
        </div>
        <div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-1">
          <div className="flex gap-3 bg-white/5 p-5"><Timer className="mt-0.5 size-5 shrink-0 text-secondary" /><div><strong className="text-sm">Tempo estimado: {availability.estimate.label}</strong><p className="mt-1 text-xs leading-relaxed text-white/60">{availability.estimate.detail}</p></div></div>
          <div className="flex gap-3 bg-white/5 p-5"><WalletCards className="mt-0.5 size-5 shrink-0 text-accent" /><div><strong className="text-sm">Entrega por {formatBRL(config.deliveryConfig.fixedFeeCents ?? 0)}</strong><p className="mt-1 text-xs leading-relaxed text-white/60">Informe a forma de pagamento e o troco no checkout.</p></div></div>
        </div>
      </div>
    </section>

    <section id="cardapio" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Cardápio</p><h2 className="section-title">Escolha o que vai pedir</h2></div>{development && <span className="hidden rounded-full bg-surface-warm px-3 py-1.5 text-xs font-bold text-brand sm:block">Prévia do cardápio</span>}</div>
      <nav aria-label="Categorias do cardápio" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">{categories.map((category) => <a key={category.id} href={`#categoria-${category.id}`} className="shrink-0 rounded-full border border-[#82204f]/12 bg-white px-4 py-2 text-sm font-bold text-[#6d183f] shadow-sm hover:border-[#82204f]/35">{category.name}</a>)}</nav>
      {loading && <div className="mt-7 grid gap-4 sm:grid-cols-2"><div className="h-52 animate-pulse rounded-[28px] bg-[#82204f]/8" /><div className="h-52 animate-pulse rounded-[28px] bg-[#82204f]/8" /></div>}
      {error && <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-800">Não foi possível carregar o cardápio: {error}</div>}
      {!loading && !products.length && <div className="mt-7 rounded-[28px] border border-dashed border-[#82204f]/25 bg-white p-8 text-center"><strong>Cardápio em configuração</strong><p className="mt-1 text-sm text-[#826a75]">A loja ainda não publicou produtos.</p></div>}
      {!loading && categories.map((category) => {
        const categoryProducts = products.filter((product) => product.categoryId === category.id);
        return <section key={category.id} id={`categoria-${category.id}`} className="scroll-mt-24 pt-11 first:pt-8">
          <div className="flex items-end justify-between gap-4 border-b border-brand/10 pb-4"><div><h3 className="text-2xl font-black tracking-[-.035em] text-brand-deep">{category.name}</h3><p className="mt-1 text-sm text-text-muted">{categoryProducts.length} {categoryProducts.length === 1 ? 'opção' : 'opções'}</p></div>{category.id === 'combinados' && <span className="text-xs font-bold text-brand">Adicionais disponíveis</span>}</div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">{categoryProducts.map((product) => <ProductCard key={product.id} product={product} category={category} />)}</div>
        </section>;
      })}
      <div className="mt-12 grid gap-3 rounded-[28px] bg-brand-deep p-5 text-white sm:grid-cols-2 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-white/10"><Clock3 className="size-5 text-secondary" /></span><div><strong className="block text-sm">Segunda a sábado</strong><span className="text-xs text-white/60">{mondayHours}</span></div></div><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-white/10"><MapPin className="size-5 text-accent" /></span><div><strong className="block text-sm">Domingos e feriados</strong><span className="text-xs text-white/60">{sundayHours} • {config.city}</span></div></div></div>
    </section>
  </main>;
}

function ProductCard({ product, category }: { product: Product; category: ProductCategory }) {
  const activeSizes = product.sizes.filter((size) => size.active);
  const starting = activeSizes.length ? Math.min(...activeSizes.map((size) => size.basePriceCents)) : 0;
  return <a href={`/montar/${product.id}`} className="surface group grid min-h-48 min-w-0 grid-cols-[minmax(0,1fr)_88px] overflow-hidden rounded-[28px] p-4 transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(88,32,58,.12)] min-[420px]:grid-cols-[minmax(0,1fr)_112px] sm:grid-cols-[minmax(0,1fr)_150px] sm:p-5">
    <div className="flex flex-col"><span className="text-xs font-bold text-brand">{category.name}</span><h4 className="mt-2 text-xl font-black tracking-[-0.03em] text-brand-deep">{product.name}</h4><p className="mt-2 text-sm leading-relaxed text-text-muted">{product.description}</p><span className="mt-auto pt-5 text-sm font-extrabold text-brand">A partir de {formatBRL(starting)}</span></div>
    <div className="relative overflow-hidden rounded-[22px] bg-brand"><img src={product.imageUrl} alt="" loading="lazy" className="size-full object-cover opacity-90 transition group-hover:scale-105" /><span className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-accent text-brand-deep"><ArrowRight className="size-4" /></span></div>
  </a>;
}

function PromotionCard({ promotion, products }: { promotion: Promotion; products: Product[] }) {
  const product = products.find((candidate) => candidate.id === promotion.productId);
  const href = promotion.productId ? `/montar/${promotion.productId}` : '#cardapio';
  const image = promotion.imageUrl || product?.imageUrl;
  return <a href={href} className="surface group overflow-hidden rounded-[26px] transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(88,32,58,.12)]">{image && <img src={image} alt="" loading="lazy" className="h-40 w-full object-cover transition group-hover:scale-[1.02]" />}<div className="p-5"><span className="text-xs font-black uppercase tracking-[.16em] text-brand">{promotion.badge || 'Oferta especial'}</span><h3 className="mt-2 text-xl font-black text-brand-deep">{promotion.title}</h3><p className="mt-2 text-sm leading-relaxed text-text-muted">{promotion.description}</p>{promotion.priceLabel && <strong className="mt-4 block text-lg font-black text-brand">{promotion.priceLabel}</strong>}<span className="mt-4 inline-flex text-sm font-black text-brand">{product ? 'Montar este pedido →' : 'Ver cardápio →'}</span></div></a>;
}
