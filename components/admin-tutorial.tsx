'use client';

import { ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/providers';
import {
  ADMIN_TUTORIAL_OPEN_EVENT,
  ADMIN_TUTORIALS,
  readAdminTutorialProgress,
  setAdminTutorialProgress,
  type AdminTutorialId,
} from '@/lib/admin-tutorials';

export function AdminTutorial() {
  const { role, user } = useAuth();
  const [activeId, setActiveId] = useState<AdminTutorialId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const active = useMemo(() => ADMIN_TUTORIALS.find((tutorial) => tutorial.id === activeId) ?? null, [activeId]);

  useEffect(() => {
    if (role !== 'admin' || !user?.uid) return undefined;
    const showFirstUse = () => {
      if (!readAdminTutorialProgress(user.uid)['admin-first-use']) {
        setActiveId('admin-first-use');
        setStepIndex(0);
      }
    };
    const openRequested = (event: Event) => {
      const id = (event as CustomEvent<{ id?: AdminTutorialId }>).detail?.id;
      if (!id || !ADMIN_TUTORIALS.some((tutorial) => tutorial.id === id)) return;
      setActiveId(id);
      setStepIndex(0);
    };
    showFirstUse();
    window.addEventListener(ADMIN_TUTORIAL_OPEN_EVENT, openRequested);
    return () => window.removeEventListener(ADMIN_TUTORIAL_OPEN_EVENT, openRequested);
  }, [role, user?.uid]);

  if (!active || !user?.uid || role !== 'admin') return null;
  const step = active.steps[stepIndex];
  const isLast = stepIndex === active.steps.length - 1;

  function finish(status: 'completed' | 'skipped') {
    setAdminTutorialProgress(user!.uid, active!.id, status);
    setActiveId(null);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#351924]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="admin-tutorial-title">
      <section className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="bg-[#351924] p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#d7f04a] text-[#351924]"><BookOpen className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-[.18em] text-[#d7f04a]">Tutorial do administrador</p><h2 id="admin-tutorial-title" className="mt-2 text-2xl font-black">{active.title}</h2></div></div>
            <button type="button" onClick={() => finish('skipped')} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fechar tutorial"><X className="size-4" /></button>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/75">{active.description}</p>
          <div className="mt-5 flex gap-1.5" aria-label={`Passo ${stepIndex + 1} de ${active.steps.length}`}>{active.steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-[#d7f04a]' : 'bg-white/20'}`} />)}</div>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#a62c63]">Passo {stepIndex + 1} de {active.steps.length}</p>
          <h3 className="mt-3 text-2xl font-black text-[#2b1722]">{step.title}</h3>
          <p className="mt-3 text-base leading-relaxed text-[#6f5360]">{step.text}</p>
          {step.image && <figure className="relative mt-6 overflow-hidden rounded-2xl border border-[#82204f]/10 bg-[#fffaf5] p-2">
            <img src={step.image} alt={step.imageAlt ?? ''} className="max-h-56 w-full rounded-xl object-contain object-top sm:max-h-64" loading="lazy" />
            <figcaption className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[#d7f04a] px-3 py-1.5 text-[11px] font-black text-[#351924] shadow-lg"><ArrowDownRight className="size-4" /> {step.hint ?? 'Veja aqui'}</figcaption>
          </figure>}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => finish('skipped')} className="text-sm font-black text-[#826a75] hover:text-[#82204f]">Pular tutorial</button>
            <div className="flex gap-2"><button type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => current - 1)} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#82204f]/15 px-4 text-sm font-black text-[#82204f] disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="size-4" /> Voltar</button><button type="button" onClick={() => isLast ? finish('completed') : setStepIndex((current) => current + 1)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#82204f] px-5 text-sm font-black text-white">{isLast ? <><CheckCircle2 className="size-4" /> Concluir</> : <>Próximo <ArrowRight className="size-4" /></>}</button></div>
          </div>
        </div>
      </section>
    </div>
  );
}
