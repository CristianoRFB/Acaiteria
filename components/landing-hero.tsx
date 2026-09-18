'use client';

import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

export type LandingHeroSlide = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  image: string;
  imageAlt: string;
  tag: string;
  accent: 'yellow' | 'lime' | 'pink';
};

type LandingHeroProps = {
  slides: LandingHeroSlide[];
  statusText: string;
  open: boolean;
  estimate: string;
  city: string;
};

const accentStyles = {
  yellow: { chip: 'bg-[#ffcf3d] text-[#351924]', glow: 'bg-[#ffcf3d]/45', dot: 'bg-[#ffcf3d]' },
  lime: { chip: 'bg-[#d7f04a] text-[#351924]', glow: 'bg-[#d7f04a]/35', dot: 'bg-[#d7f04a]' },
  pink: { chip: 'bg-[#ff9fc2] text-[#53142f]', glow: 'bg-[#ff9fc2]/40', dot: 'bg-[#ff9fc2]' },
} as const;

export function LandingHero({ slides, statusText, open, estimate, city }: LandingHeroProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const current = slides[slideIndex] ?? slides[0];

  useEffect(() => {
    if (slides.length < 2) return undefined;
    const timer = window.setInterval(() => setSlideIndex((index) => (index + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!current) return null;
  const accent = accentStyles[current.accent];

  return <section className="relative overflow-hidden bg-[#fff0e9] pb-8 pt-3 sm:pb-12 sm:pt-5" aria-label="Destaques da Açaí + Sabor">
    <div className={`pointer-events-none absolute -left-24 top-20 size-64 rounded-full blur-3xl ${accent.glow}`} />
    <div className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-[#7bb7ff]/20 blur-3xl" />
    <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-[11px] font-black uppercase tracking-[.17em] text-[#82204f]/70 sm:mb-6">
        <span>Feito na hora · Santa Fé do Sul</span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/75 px-3 py-1.5 tracking-[.1em] shadow-sm"><span className={`size-2 rounded-full ${open ? 'bg-emerald-500' : 'bg-amber-500'}`} /> {statusText}</span>
      </div>
      <div className="relative overflow-hidden rounded-[32px] bg-[#53142f] shadow-[0_24px_70px_rgba(83,20,47,.24)] sm:rounded-[42px]">
        <div className="grid min-h-[540px] lg:grid-cols-[.83fr_1.17fr]">
          <div className="relative z-10 flex flex-col justify-between p-6 text-white sm:p-10 lg:p-14">
            <div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[.13em] ${accent.chip}`}><Sparkles className="size-3.5" /> {current.eyebrow}</span>
              <p className="mt-7 max-w-[12ch] text-5xl font-black leading-[.9] tracking-[-.07em] sm:text-6xl">{current.title}</p>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/72 sm:text-base">{current.description}</p>
              <Button className="mt-7 h-12 rounded-full bg-white px-5 text-sm font-black text-[#53142f] shadow-xl hover:bg-[#fff7f3]" render={<a href={current.href}>{current.cta} <ArrowRight className="size-4" /></a>} />
            </div>
            <div className="mt-10 flex flex-wrap gap-2 text-xs font-bold text-white/75">
              <span className="rounded-full border border-white/20 px-3 py-2">Tempo estimado: {estimate}</span>
              <span className="rounded-full border border-white/20 px-3 py-2">Entrega em {city}</span>
            </div>
          </div>
          <div className="relative min-h-[330px] overflow-hidden bg-[#ffb6ce] lg:min-h-0">
            <img src={current.image} alt={current.imageAlt} className="absolute inset-0 size-full object-cover transition duration-700" fetchPriority={slideIndex === 0 ? 'high' : 'auto'} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#53142f]/30 via-transparent to-transparent lg:from-[#53142f]/55" />
            <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-2 text-xs font-black text-[#53142f] shadow-lg backdrop-blur sm:right-7 sm:top-7">{current.tag}</div>
            <div className="absolute bottom-5 left-5 max-w-[14rem] rounded-2xl bg-white/92 px-4 py-3 text-[#53142f] shadow-xl backdrop-blur sm:bottom-7 sm:left-7"><strong className="block text-sm">Seu próximo favorito</strong><span className="mt-1 block text-xs text-[#826a75]">Escolha, personalize e peça em poucos cliques.</span></div>
            {slides.length > 1 && <div className="absolute bottom-5 right-5 flex items-center gap-2 sm:bottom-7 sm:right-7"><button type="button" onClick={() => setSlideIndex((index) => (index - 1 + slides.length) % slides.length)} className="grid size-9 place-items-center rounded-full bg-white/85 text-[#53142f] shadow-lg backdrop-blur" aria-label="Destaque anterior"><ChevronLeft className="size-4" /></button><div className="flex gap-1.5" aria-label={`Destaque ${slideIndex + 1} de ${slides.length}`}>{slides.map((item, index) => <button key={item.title} type="button" onClick={() => setSlideIndex(index)} className={`h-2 rounded-full transition-all ${index === slideIndex ? 'w-7 bg-white' : 'w-2 bg-white/55'}`} aria-label={`Abrir destaque ${index + 1}`} />)}</div><button type="button" onClick={() => setSlideIndex((index) => (index + 1) % slides.length)} className="grid size-9 place-items-center rounded-full bg-white/85 text-[#53142f] shadow-lg backdrop-blur" aria-label="Próximo destaque"><ChevronRight className="size-4" /></button></div>}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {slides.map((slide, index) => <button key={slide.title} type="button" onClick={() => setSlideIndex(index)} className={`group rounded-2xl border px-4 py-3 text-left transition ${index === slideIndex ? 'border-[#82204f]/30 bg-white shadow-sm' : 'border-[#82204f]/10 bg-white/55 hover:bg-white'}`}><span className={`mb-2 block size-2 rounded-full ${accentStyles[slide.accent].dot}`} /><strong className="block text-sm text-[#53142f]">{slide.eyebrow}</strong><span className="mt-1 block text-xs text-[#826a75]">{slide.tag}</span></button>)}
      </div>
    </div>
  </section>;
}
