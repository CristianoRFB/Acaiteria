'use client';

import { Info, ShoppingBag } from 'lucide-react';
import { useCart, useCatalog } from '@/components/providers';
import { BrandLogo } from '@/components/brand-logo';
import { useTenant } from '@/components/tenant-provider';
import { tenantPath } from '@/shared/tenancy';

export function PublicHeader() {
  const { items } = useCart();
  const { slug, tenant } = useTenant();
  const { config } = useCatalog();
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const href = (path: string) => slug ? tenantPath(slug, path) : '#';
  const brandName = tenant?.displayName || config.storeName || 'Estabelecimento';
  const primaryColor = tenant?.branding.primaryColor ?? '#82204f';
  const secondaryColor = tenant?.branding.secondaryColor ?? '#d7f04a';
  return <header className="sticky top-0 z-30 border-b bg-[#fffaf5]/92 backdrop-blur-xl" style={{ borderColor: `${primaryColor}22` }}><div className="mx-auto flex h-18 max-w-6xl items-center justify-between px-4 sm:px-6"><a className="flex min-w-0 items-center gap-2" href={href('/')} aria-label={`Início de ${brandName}`}><BrandLogo compact brandName={brandName} logoUrl={tenant?.branding.logoUrl ?? ''} primaryColor={primaryColor} /><span className="truncate text-base font-black tracking-[-0.03em]" style={{ color: primaryColor }}>{brandName}</span></a><nav className="flex shrink-0 items-center gap-1" aria-label="Navegação principal"><a className="grid size-10 place-items-center rounded-full text-[#6a4a5a] hover:bg-[#82204f]/8" href={href('/informacoes')} aria-label="Informações"><Info className="size-5" /></a><a className="relative grid size-11 place-items-center rounded-full bg-[#2b1722] text-white" href={href('/carrinho')} aria-label={`Carrinho com ${count} itens`}><ShoppingBag className="size-5" /><span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full text-[10px] font-black text-[#2b1722]" style={{ backgroundColor: secondaryColor }}>{count}</span></a></nav></div></header>;
}
