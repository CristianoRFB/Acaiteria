'use client';

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { AdminField, AdminTextarea } from '@/components/admin-form';
import { useAuth } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { getFirebaseClient, hasFirebaseConfig } from '@/lib/firebase/client';
import {
  formatBRL,
  type ModifierGroup,
  type Product,
  type ProductCategory,
  type ProductSize,
} from '@/shared/domain';
import { normalizeCatalogProduct } from '@/shared/catalog-normalization';

type SizeDraft = { id: string; label: string; price: string; active: boolean };
const defaultSizes: SizeDraft[] = [
  { id: 'unico', label: 'Tamanho único', price: '0,00', active: true },
];

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
function priceToCents(value: string) {
  const raw = value.trim().replace(/R\$\s?/gi, '');
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const parsed = Number(normalized);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    !Number.isSafeInteger(Math.round(parsed * 100))
  )
    throw new Error('Confira os preços dos tamanhos.');
  return Math.round(parsed * 100);
}
function toDraftSizes(sizes: ProductSize[] | undefined): SizeDraft[] {
  if (!sizes?.length) return defaultSizes;
  return [...sizes]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((size) => ({
      id: size.id,
      label: size.label,
      price: (size.basePriceCents / 100).toFixed(2).replace('.', ','),
      active: size.active,
    }));
}

export default function CatalogPage() {
  const { role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [error, setError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [sizes, setSizes] = useState<SizeDraft[]>(defaultSizes);
  useEffect(() => {
    if (!hasFirebaseConfig || role !== 'admin') return;
    const db = getFirebaseClient().db;
    const productsUnsubscribe = onSnapshot(
      query(collection(db, 'products'), orderBy('displayOrder')),
      (snap) =>
        setProducts(snap.docs.map((item) => normalizeCatalogProduct({ id: item.id, ...item.data() }))),
      (cause) => setError(`Não foi possível carregar os produtos: ${cause.message}`),
    );
    const categoriesUnsubscribe = onSnapshot(
      query(collection(db, 'categories'), orderBy('displayOrder')),
      (snap) =>
          setCategories(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ProductCategory)),
        (cause) => setError(`Não foi possível carregar as categorias: ${cause.message}`),
    );
    const groupsUnsubscribe = onSnapshot(
      query(collection(db, 'modifierGroups'), orderBy('displayOrder')),
      (snap) =>
        setGroups(snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ModifierGroup)),
        (cause) => setError(`Não foi possível carregar os adicionais: ${cause.message}`),
    );
    return () => {
      productsUnsubscribe();
      categoriesUnsubscribe();
      groupsUnsubscribe();
    };
  }, [role]);
  function openNew() {
    setEditing(null);
    setSizes(defaultSizes);
    setError('');
    setShowForm(true);
  }
  function openEdit(product: Product) {
    setEditing(product);
    setSizes(toDraftSizes(product.sizes));
    setError('');
    setShowForm(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const name = String(data.get('name') ?? '').trim();
      const slug = String(data.get('slug') ?? '').trim() || slugify(name);
      const categoryId = String(data.get('categoryId') ?? '');
      if (!name || !slug || !categoryId)
        throw new Error('Preencha o nome e a categoria.');
      const parsedSizes: ProductSize[] = sizes.map((size, index) => {
        const label = size.label.trim();
        if (!label) throw new Error(`Informe o nome do tamanho ${index + 1}.`);
        return {
          id: slugify(size.id || label) || `tamanho-${index + 1}`,
          label,
          active: size.active,
          basePriceCents: priceToCents(size.price),
          displayOrder: index + 1,
        };
      });
      if (!parsedSizes.length)
        throw new Error('Adicione pelo menos um tamanho.');
      const active = data.get('active') === 'on';
      if (active && parsedSizes.some((size) => size.active && size.basePriceCents <= 0))
        throw new Error('Informe um preço maior que R$ 0,00 para ativar este produto.');
      const selectedGroups = new Set(
        data.getAll('modifierGroupIds').map(String),
      );
      const payload = {
        name,
        slug,
        categoryId,
        description: String(data.get('description') ?? '').trim(),
        active,
        productType: String(data.get('productType') ?? 'CUSTOMIZABLE'),
        imageUrl: String(data.get('imageUrl') ?? '').trim(),
        displayOrder: Number(data.get('displayOrder') ?? products.length + 1),
        sizes: parsedSizes,
        modifierGroupIds: groups
          .filter((group) => selectedGroups.has(group.id))
          .map((group) => group.id),
        updatedAt: serverTimestamp(),
      };
      const db = getFirebaseClient().db;
      if (editing)
        await setDoc(doc(db, 'products', editing.id), payload, { merge: true });
      else await addDoc(collection(db, 'products'), payload);
      setShowForm(false);
      setEditing(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar o produto.',
      );
    }
  }
  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoryError('');
    const name = categoryName.trim();
    if (!name) {
      setCategoryError('Digite um nome para a categoria.');
      return;
    }
    try {
      await setDoc(doc(getFirebaseClient().db, 'categories', slugify(name)), {
        name,
        active: true,
        displayOrder: categories.length + 1,
        updatedAt: serverTimestamp(),
      });
      setCategoryName('');
      setShowCategoryForm(false);
    } catch {
      setCategoryError('Não foi possível criar a categoria.');
    }
  }
  return (
    <AdminShell adminOnly>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#a62c63]">
            Cardápio
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em]">
            Produtos
          </h1>
          <p className="mt-2 text-sm text-[#826a75]">
            Edite nomes, preços e opções sem precisar entender códigos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCategoryName('');
              setCategoryError('');
              setShowCategoryForm(true);
            }}
            className="rounded-full"
          >
            <Plus /> Categoria
          </Button>
          <Button
            type="button"
            onClick={openNew}
            className="rounded-full bg-[#82204f] text-white"
          >
            <Plus /> Novo produto
          </Button>
        </div>
      </div>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article
            key={product.id}
            className="rounded-[24px] bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-[#a62c63]">
                  {categories.find(
                    (category) => category.id === product.categoryId,
                  )?.name ?? 'Sem categoria'}
                </span>
                <h2 className="mt-1 text-lg font-black">{product.name}</h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateDoc(
                    doc(getFirebaseClient().db, 'products', product.id),
                    { active: !product.active, updatedAt: serverTimestamp() },
                  )
                }
                className={`rounded-full px-2.5 py-1 text-[10px] font-black ${product.active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}
              >
                {product.active ? 'ATIVO' : 'INATIVO'}
              </button>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-[#826a75]">
              {product.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {product.sizes.map((size) => (
                <span
                  key={size.id}
                  className="rounded-full bg-[#fff0f5] px-2.5 py-1 text-xs font-bold text-[#82204f]"
                >
                  {size.label} • {formatBRL(size.basePriceCents)}
                </span>
              ))}
              {!product.sizes.length && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                  Precisa de revisão: adicione tamanho e preço
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => openEdit(product)}
              className="mt-5 text-sm font-black text-[#82204f]"
            >
              Editar produto
            </button>
          </article>
        ))}
      </div>
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#2b1722]/50 p-3 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={save}
            className="mx-auto my-3 w-full max-w-2xl rounded-[28px] bg-white p-4 shadow-2xl sm:my-4 sm:p-7"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">
                  {editing ? 'Editar produto' : 'Novo produto'}
                </h2>
                <p className="mt-1 text-sm text-[#826a75]">
                  Preencha como você fala com seus clientes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <AdminField
                label="Nome que aparece no cardápio"
                name="name"
                required
                defaultValue={editing?.name}
                placeholder="Ex.: Açaí tradicional"
              />
              <label className="block text-sm font-bold">
                Categoria
                <select
                  name="categoryId"
                  required
                  defaultValue={editing?.categoryId ?? categories[0]?.id}
                  className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 rounded-2xl border border-[#82204f]/10 bg-[#fffaf5] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black">Tamanhos e preços</h3>
                  <p className="text-xs text-[#826a75]">
                    Digite o preço em reais, por exemplo: 14,00
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSizes([
                      ...sizes,
                      {
                        id: `tamanho-${sizes.length + 1}`,
                        label: '',
                        price: '0,00',
                        active: true,
                      },
                    ])
                  }
                  className="shrink-0 rounded-full"
                >
                  <Plus /> Tamanho
                </Button>
              </div>
              <div className="mt-4 space-y-3">
                {sizes.map((size, index) => (
                  <div
                    key={`${size.id}-${index}`}
                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-end"
                  >
                    <label className="block text-sm font-bold">
                      Nome do tamanho
                      <input
                        value={size.label}
                        onChange={(event) =>
                          setSizes(
                            sizes.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                        placeholder="300 ml"
                        className="mt-1 h-11 w-full rounded-xl border border-[#82204f]/15 bg-white px-3 font-normal"
                      />
                    </label>
                    <label className="block text-sm font-bold">
                      Preço (R$)
                      <input
                        value={size.price}
                        onChange={(event) =>
                          setSizes(
                            sizes.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, price: event.target.value }
                                : item,
                            ),
                          )
                        }
                        inputMode="decimal"
                        placeholder="14,00"
                        className="mt-1 h-11 w-full rounded-xl border border-[#82204f]/15 bg-white px-3 font-normal"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex h-11 items-center gap-2 rounded-xl px-2 text-xs font-bold">
                        <input
                          type="checkbox"
                          checked={size.active}
                          onChange={(event) =>
                            setSizes(
                              sizes.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, active: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />{' '}
                        Ativo
                      </label>
                      {sizes.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setSizes(
                              sizes.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                          className="grid size-10 place-items-center rounded-xl text-red-600 hover:bg-red-50"
                          aria-label={`Remover tamanho ${size.label || index + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                Como este item é vendido?
                <select
                  name="productType"
                  defaultValue={editing?.productType ?? 'CUSTOMIZABLE'}
                  className="mt-2 h-11 w-full rounded-xl border border-[#82204f]/15 bg-[#fffaf5] px-3 font-normal"
                >
                  <option value="CUSTOMIZABLE">
                    Cliente escolhe sabores e adicionais
                  </option>
                  <option value="SIMPLE">Produto pronto, sem montagem</option>
                </select>
                <span className="mt-1 block text-xs font-normal text-[#826a75]">Use a primeira opção para açaí, milk-shake e produtos que o cliente monta.</span>
              </label>
              <AdminField label="Foto do produto (opcional)" name="imageUrl" defaultValue={editing?.imageUrl} placeholder="Cole aqui o link de uma foto" />
            </div>
            <div className="mt-4">
              <AdminTextarea
                label="Descrição curta"
                name="description"
                required
                defaultValue={editing?.description}
                placeholder="Explique o que vem neste produto"
              />
            </div>
            {groups.length > 0 && (
              <fieldset className="mt-5 rounded-2xl border border-[#82204f]/10 bg-[#fffaf5] p-4">
                <legend className="px-1 text-sm font-black">
                  O que o cliente pode adicionar?
                </legend>
                <p className="mb-3 text-xs text-[#826a75]">
                  Marque as opções que aparecem na montagem.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {groups
                    .filter((group) => group.active)
                    .map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-bold"
                      >
                        <input
                          type="checkbox"
                          name="modifierGroupIds"
                          value={group.id}
                          defaultChecked={editing?.modifierGroupIds.includes(
                            group.id,
                          )}
                        />
                        {group.name}
                      </label>
                    ))}
                </div>
              </fieldset>
            )}
            <details className="mt-5 rounded-2xl border border-dashed border-[#82204f]/20 p-4">
              <summary className="cursor-pointer text-sm font-bold text-[#82204f]">
                Mais opções (normalmente não precisa mexer)
              </summary>
              <div className="mt-4 space-y-4">
                <AdminField
                  label="Posição no cardápio"
                  name="displayOrder"
                  type="number"
                  required
                  defaultValue={editing?.displayOrder ?? products.length + 1}
                />
                <input type="hidden" name="slug" defaultValue={editing?.slug} />
                <p className="text-xs text-[#826a75]">
                  A posição menor aparece primeiro. O link do produto é criado automaticamente.
                </p>
              </div>
            </details>
            <label className="mt-5 flex items-center gap-2 text-sm font-bold">
              <input
                type="checkbox"
                name="active"
                defaultChecked={editing?.active ?? true}
              />{' '}
              Mostrar este produto no cardápio
            </label>
            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="mt-6 h-12 w-full rounded-full bg-[#82204f] font-black text-white"
            >
              <Save /> Salvar produto
            </Button>
          </form>
        </div>
      )}
      {showCategoryForm && (
        <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[#2b1722]/50 p-3 backdrop-blur-sm sm:p-4">
          <form
            onSubmit={saveCategory}
            className="my-3 w-full max-w-md rounded-[28px] bg-white p-4 shadow-2xl sm:my-4 sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Nova categoria</h2>
                <p className="mt-1 text-sm text-[#826a75]">
                  Use um nome simples, como “Promoções” ou “Bebidas”.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryForm(false)}
                className="grid size-9 place-items-center rounded-full bg-[#f8f1f4]"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <AdminField
              label="Nome da categoria"
              name="categoryName"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="Ex.: Promoções"
            />
            {categoryError && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700"
              >
                {categoryError}
              </p>
            )}
            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCategoryForm(false)}
                className="h-11 flex-1 rounded-full"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-11 flex-1 rounded-full bg-[#82204f] font-black text-white"
              >
                <Save /> Criar categoria
              </Button>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
