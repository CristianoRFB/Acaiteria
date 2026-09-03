'use client';

import { ArrowLeft, Check, Minus, Plus, ShoppingBag, Sparkles } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useCart, useCatalog } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { calculateItemPrice, formatBRL, getEffectiveGroupRules, type GroupSelection } from '@/shared/domain';

export default function ConfiguratorPage() {
  const { productId } = useParams<{ productId: string }>();
  const search = useSearchParams();
  const editId = search.get('edit');
  const { catalog, loading, development } = useCatalog();
  const cart = useCart();
  const product = catalog.products.find((candidate) => candidate.id === productId);
  const editing = editId ? cart.items.find((item) => item.cartItemId === editId) : undefined;
  const [sizeId, setSizeId] = useState('');
  const [selections, setSelections] = useState<GroupSelection[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!product || sizeId) return;
    setSizeId(editing?.sizeId ?? product.sizes.filter((size) => size.active).sort((a, b) => a.displayOrder - b.displayOrder)[0]?.id ?? '');
    setSelections(editing?.selections ?? []);
    setNotes(editing?.notes ?? '');
  }, [product, editing, sizeId]);

  const size = product?.sizes.find((candidate) => candidate.id === sizeId);
  const groups = useMemo(() => product?.modifierGroupIds.map((id) => catalog.groups.find((group) => group.id === id)).filter((group) => group && getEffectiveGroupRules(group, sizeId)).sort((a, b) => (a?.displayOrder ?? 0) - (b?.displayOrder ?? 0)) ?? [], [product, catalog.groups, sizeId]);
  const preview = useMemo(() => {
    if (!product || !size) return size?.basePriceCents ?? 0;
    try { return calculateItemPrice({ cartItemId: 'preview', productId: product.id, sizeId, selections, quantity: 1 }, catalog).unitPriceCents; } catch {
      let total = size.basePriceCents;
      const modifierMap = new Map(catalog.modifiers.map((modifier) => [modifier.id, modifier]));
      for (const groupSelection of selections) for (const item of groupSelection.items) { const modifier = modifierMap.get(item.modifierId); if (modifier?.premium) total += modifier.priceCents * item.quantity; }
      return total;
    }
  }, [product, size, sizeId, selections, catalog]);
  const itemCount = selections.reduce((total, group) => total + group.items.reduce((sum, item) => sum + item.quantity, 0), 0);

  function quantityFor(groupId: string, modifierId: string) { return selections.find((group) => group.groupId === groupId)?.items.find((item) => item.modifierId === modifierId)?.quantity ?? 0; }
  function change(groupId: string, modifierId: string, delta: number, groupMax: number, maxPerModifier: number, allowDuplicate: boolean) {
    setError('');
    setSelections((old) => {
      const group = old.find((entry) => entry.groupId === groupId) ?? { groupId, items: [] };
      const current = group.items.find((entry) => entry.modifierId === modifierId)?.quantity ?? 0;
      const groupTotal = group.items.reduce((total, item) => total + item.quantity, 0);
      const max = allowDuplicate ? maxPerModifier : 1;
      const next = Math.max(0, Math.min(max, current + delta, current + Math.max(0, groupMax - groupTotal)));
      const items = [...group.items.filter((item) => item.modifierId !== modifierId), ...(next ? [{ modifierId, quantity: next }] : [])];
      return [...old.filter((entry) => entry.groupId !== groupId), { groupId, items }];
    });
  }
  function submit() {
    if (!product || !sizeId) return;
    const draft = { productId: product.id, sizeId, selections, quantity: editing?.quantity ?? 1, notes: notes.trim() || undefined };
    try {
      calculateItemPrice({ ...draft, cartItemId: editId ?? 'validate' }, catalog);
      if (editId) cart.update(editId, draft); else cart.add(draft);
      window.location.href = '/carrinho';
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Revise suas escolhas.'); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#fffaf5]"><p>Carregando cardápio…</p></main>;
  if (!product) return <main className="grid min-h-screen place-items-center bg-[#fffaf5] p-6 text-center"><div><h1 className="text-2xl font-black">Produto não encontrado</h1><a className="mt-4 inline-block text-[#82204f] underline" href="/">Voltar ao cardápio</a></div></main>;

  return <main className="min-h-screen bg-[#fffaf5] pb-28 text-[#2b1722] lg:pb-12">
    <header className="sticky top-0 z-30 border-b border-[#82204f]/10 bg-[#fffaf5]/94 backdrop-blur-xl"><div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6"><a className="grid size-10 place-items-center rounded-full bg-white shadow-sm" href="/" aria-label="Voltar"><ArrowLeft className="size-5" /></a><div className="text-center"><strong className="block text-sm">Monte seu pedido</strong><span className="text-xs text-[#826a75]">{product.name}</span></div><a className="relative grid size-10 place-items-center rounded-full bg-[#351924] text-white" href="/carrinho" aria-label="Ir para o carrinho"><ShoppingBag className="size-4" /></a></div></header>
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-10"><div>
      <div className="overflow-hidden rounded-[28px] bg-[#53142f] text-white"><div className="grid grid-cols-[1fr_120px] items-center gap-3 p-6 sm:grid-cols-[1fr_180px]"><div><span className="text-xs font-bold uppercase tracking-[.16em] text-[#ffcf3d]">Passo 1</span><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">{product.name}</h1><p className="mt-2 text-sm leading-relaxed text-white/70">{product.description}</p>{development && <span className="mt-3 inline-block rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold">DESENVOLVIMENTO</span>}</div>{product.imageUrl && <img className="aspect-square w-full rounded-[22px] object-cover" src={product.imageUrl} alt="Imagem ilustrativa de desenvolvimento" />}</div></div>
      <section className="mt-6"><div className="flex items-baseline justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#a62c63]">Tamanho</p><h2 className="mt-1 text-xl font-black">Qual vai ser?</h2></div><span className="text-xs font-bold text-[#826a75]">Obrigatório</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{product.sizes.filter((candidate) => candidate.active).sort((a, b) => a.displayOrder - b.displayOrder).map((candidate) => <button key={candidate.id} onClick={() => { setSizeId(candidate.id); setError(''); }} className={`min-h-24 rounded-[22px] border-2 p-4 text-left transition ${sizeId === candidate.id ? 'border-[#82204f] bg-[#fff0f5] shadow-[0_8px_20px_rgba(130,32,79,.12)]' : 'border-transparent bg-white shadow-sm'}`}><span className="block text-lg font-black">{candidate.label}</span><span className="mt-1 block text-sm font-bold text-[#82204f]">{formatBRL(candidate.basePriceCents)}</span>{candidate.includedModifiersCount !== undefined && <span className="mt-2 block text-[11px] text-[#826a75]">{candidate.includedModifiersCount} itens incluídos</span>}</button>)}</div></section>
      {groups.map((group, groupIndex) => { if (!group) return null; const groupTotal = selections.find((entry) => entry.groupId === group.id)?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0; return <section key={group.id} className="mt-9 border-t border-[#82204f]/10 pt-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#a62c63]">Passo {groupIndex + 2}</p><h2 className="mt-1 text-xl font-black">{group.name}</h2><p className="mt-1 text-sm text-[#826a75]">{group.description || (group.required ? `Escolha de ${group.minSelections} a ${group.maxSelections}` : `Escolha até ${group.maxSelections}`)}{group.freeIncludedCount !== undefined ? ` • ${group.freeIncludedCount} incluído(s)` : ''}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${groupTotal >= group.minSelections && groupTotal <= group.maxSelections ? 'bg-emerald-50 text-emerald-700' : 'bg-[#fff0f5] text-[#82204f]'}`}>{groupTotal}/{group.maxSelections}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{group.modifierIds.map((modifierId) => catalog.modifiers.find((candidate) => candidate.id === modifierId)).filter(Boolean).sort((a, b) => (a?.displayOrder ?? 0) - (b?.displayOrder ?? 0)).map((modifier) => { if (!modifier) return null; const quantity = quantityFor(group.id, modifier.id); const max = Math.min(group.maxPerModifier ?? 99, modifier.maxQuantity ?? 99); return <div key={modifier.id} className={`flex min-h-20 items-center gap-3 rounded-[20px] border p-3.5 ${quantity ? 'border-[#82204f]/40 bg-[#fff0f5]' : 'border-[#82204f]/8 bg-white'} ${!modifier.available ? 'opacity-55' : ''}`}><button disabled={!modifier.available} onClick={() => change(group.id, modifier.id, quantity ? -quantity : 1, group.maxSelections, max, group.allowDuplicate)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${quantity ? 'border-[#82204f] bg-[#82204f] text-white' : 'border-[#d9cbd1]'}`}>{quantity ? <Check className="size-4" /> : null}</span><span className="min-w-0"><strong className="block truncate text-sm">{modifier.name}</strong><span className="mt-0.5 block text-xs text-[#826a75]">{!modifier.available ? 'Indisponível hoje' : modifier.premium ? `Premium • +${formatBRL(modifier.priceCents)}` : modifier.priceCents ? `Até a cota; extra +${formatBRL(modifier.priceCents)}` : 'Sem acréscimo'}</span></span></button>{group.allowDuplicate && modifier.available && <div className="flex items-center rounded-full bg-white p-1 shadow-sm"><button className="grid size-8 place-items-center rounded-full disabled:opacity-30" disabled={!quantity} onClick={() => change(group.id, modifier.id, -1, group.maxSelections, max, true)} aria-label={`Remover ${modifier.name}`}><Minus className="size-3.5" /></button><span className="w-5 text-center text-sm font-black">{quantity}</span><button className="grid size-8 place-items-center rounded-full bg-[#351924] text-white disabled:opacity-30" disabled={quantity >= max || groupTotal >= group.maxSelections} onClick={() => change(group.id, modifier.id, 1, group.maxSelections, max, true)} aria-label={`Adicionar ${modifier.name}`}><Plus className="size-3.5" /></button></div>}</div>; })}</div></section>; })}
      <section className="mt-9 border-t border-[#82204f]/10 pt-7"><label htmlFor="notes" className="text-xl font-black">Alguma observação?</label><textarea id="notes" maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ex.: colocar a calda separada" className="mt-3 min-h-24 w-full rounded-[20px] border border-[#82204f]/15 bg-white p-4 text-sm outline-none focus:border-[#82204f]" /></section>
    </div><aside className="hidden lg:block"><div className="sticky top-26 rounded-[28px] bg-[#351924] p-6 text-white shadow-[0_24px_50px_rgba(53,25,36,.18)]"><Sparkles className="size-6 text-[#d7f04a]" /><h2 className="mt-4 text-2xl font-black">Seu açaí</h2><p className="mt-1 text-sm text-white/60">{size?.label ?? 'Escolha um tamanho'} • {itemCount} {itemCount === 1 ? 'item' : 'itens'}</p><strong className="mt-6 block text-3xl font-black text-[#ffcf3d]">{formatBRL(preview)}</strong>{error && <p role="alert" className="mt-4 rounded-xl bg-red-400/15 p-3 text-sm text-red-100">{error}</p>}<Button onClick={submit} className="mt-5 h-12 w-full rounded-full bg-[#d7f04a] font-black text-[#351924] hover:bg-[#c4dd36]">{editId ? 'Salvar alterações' : 'Adicionar ao carrinho'} <ArrowLeft className="rotate-180" /></Button></div></aside></div>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#82204f]/10 bg-white/95 p-3 shadow-[0_-12px_35px_rgba(53,25,36,.1)] backdrop-blur-xl lg:hidden"><div className="mx-auto flex max-w-lg items-center gap-3"><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{size?.label ?? 'Escolha um tamanho'} • {itemCount} itens</strong><span className="text-lg font-black text-[#82204f]">{formatBRL(preview)}</span></div><Button onClick={submit} className="h-12 rounded-full bg-[#82204f] px-5 font-black text-white">{editId ? 'Salvar' : 'Continuar'} <ArrowLeft className="rotate-180" /></Button></div>{error && <p role="alert" className="mx-auto mt-2 max-w-lg text-xs font-bold text-red-700">{error}</p>}</div>
  </main>;
}
