'use client';

import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Megaphone, Plus, Save, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { AdminShell } from '@/components/admin-shell';
import { AdminField, AdminTextarea } from '@/components/admin-form';
import { useAuth, useCatalog } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import type { Promotion } from '@/shared/domain';

export default function PromotionsPage() {
  const { role } = useAuth();
  const { catalog } = useCatalog();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasFirebaseConfig || role !== 'admin') return;
    const unsubscribe = onSnapshot(
      collection(getFirebaseClient().db, 'promotions'),
      (snap) => setPromotions(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as Promotion).sort((a, b) => a.displayOrder - b.displayOrder)),
      () => setError('Não foi possível carregar as promoções. Recarregue a página para tentar novamente.'),
    );
    return unsubscribe;
  }, [role]);

  function openNew() {
    setEditing(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(promotion: Promotion) {
    setEditing(promotion);
    setError('');
    setShowForm(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const productId = String(data.get('productId') ?? '').trim();
    const displayOrder = Number(data.get('displayOrder') ?? promotions.length + 1);
    if (!title || !description) {
      setError('Informe um título e uma descrição para a promoção.');
      return;
    }
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 1) {
      setError('A ordem deve ser um número inteiro maior que zero.');
      return;
    }
    const payload = {
      title,
      description,
      badge: String(data.get('badge') ?? '').trim(),
      priceLabel: String(data.get('priceLabel') ?? '').trim(),
      imageUrl: String(data.get('imageUrl') ?? '').trim(),
      productId: productId || null,
      active: data.get('active') === 'on',
      displayOrder,
      updatedAt: serverTimestamp(),
    };
    try {
      const db = getFirebaseClient().db;
      if (editing) await updateDoc(doc(db, 'promotions', editing.id), payload);
      else await addDoc(collection(db, 'promotions'), payload);
      setShowForm(false);
      setEditing(null);
    } catch {
      setError('Não foi possível salvar. Confira sua conexão e tente novamente.');
    }
  }

  async function toggle(promotion: Promotion) {
    try {
      await updateDoc(doc(getFirebaseClient().db, 'promotions', promotion.id), { active: !promotion.active, updatedAt: serverTimestamp() });
    } catch {
      setError('Não foi possível alterar o status da promoção.');
    }
  }

  return <AdminShell adminOnly>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">Cardápio</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Promoções</h1><p className="mt-2 text-sm text-[#826a75]">Crie ofertas e destaque-as na página dos clientes.</p></div>
      <Button type="button" onClick={openNew} className="rounded-full bg-[#82204f] text-white"><Plus /> Nova promoção</Button>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!promotions.length && <div className="mt-8 rounded-[26px] border border-dashed border-[#82204f]/20 bg-white p-10 text-center"><Megaphone className="mx-auto size-8 text-[#a62c63]" /><h2 className="mt-4 text-xl font-black">Nenhuma promoção cadastrada</h2><p className="mt-2 text-sm text-[#826a75]">Crie a primeira oferta para ela aparecer no cardápio público.</p><Button type="button" onClick={openNew} className="mt-5 rounded-full bg-[#82204f] text-white">Criar promoção</Button></div>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {promotions.map((promotion) => {
        const product = catalog.products.find((candidate) => candidate.id === promotion.productId);
        const image = promotion.imageUrl || product?.imageUrl;
        return <article key={promotion.id} className="overflow-hidden rounded-[24px] bg-white shadow-sm">
          {image && <img src={image} alt="" className="h-36 w-full object-cover" />}
          <div className="p-5"><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-black uppercase tracking-wider text-[#a62c63]">{promotion.badge || 'Oferta'}</span><h2 className="mt-1 text-xl font-black">{promotion.title}</h2></div><button type="button" onClick={() => void toggle(promotion)} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${promotion.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{promotion.active ? 'PUBLICADA' : 'PAUSADA'}</button></div><p className="mt-3 text-sm leading-relaxed text-[#826a75]">{promotion.description}</p>{promotion.priceLabel && <p className="mt-3 font-black text-[#82204f]">{promotion.priceLabel}</p>}{product && <p className="mt-2 text-xs text-[#826a75]">Link: {product.name}</p>}<button type="button" onClick={() => openEdit(promotion)} className="mt-5 text-sm font-black text-[#82204f]">Editar promoção</button></div>
        </article>;
      })}
    </div>
    {showForm && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2b1722]/50 p-4 backdrop-blur-sm"><form onSubmit={save} className="mx-auto my-4 max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[#a62c63]">Cardápio</p><h2 className="mt-1 text-2xl font-black">{editing ? 'Editar promoção' : 'Nova promoção'}</h2></div><button type="button" onClick={() => setShowForm(false)} className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]" aria-label="Fechar"><X className="size-4" /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><AdminField label="Título da oferta" name="title" required defaultValue={editing?.title} placeholder="Ex.: Combo da semana" /><AdminField label="Chamada curta" name="badge" defaultValue={editing?.badge} placeholder="Oferta da semana" /><AdminField label="Preço ou benefício (opcional)" name="priceLabel" defaultValue={editing?.priceLabel} placeholder="Ex.: 500 ml por R$ 19,90" /><AdminField label="Ordem de exibição" name="displayOrder" type="number" min="1" required defaultValue={editing?.displayOrder ?? promotions.length + 1} /><label className="block text-sm font-bold">Produto para abrir ao clicar<select name="productId" defaultValue={editing?.productId ?? ''} className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"><option value="">Nenhum produto específico</option>{catalog.products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><AdminField label="URL da imagem (opcional)" name="imageUrl" defaultValue={editing?.imageUrl} placeholder="/menu/products/combo-barbie.jpg" /></div><div className="mt-4"><AdminTextarea label="Descrição" name="description" required defaultValue={editing?.description} placeholder="Explique o que a oferta inclui e por que vale a pena." /></div><label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Publicar no cardápio agora</label>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<Button type="submit" className="mt-6 h-11 w-full rounded-full bg-[#82204f] font-black text-white"><Save /> Salvar promoção</Button></form></div>}
  </AdminShell>;
}
