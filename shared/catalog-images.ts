const productImages: Record<string, string> = {
  'acai-monte-seu': '/menu/products/acai-monte-seu-gold.webp',
  'milk-shake': '/menu/products/milk-shake-hq.webp',
  sorvete: '/menu/products/sorvete-hq.webp',
  'shake-acai-banana-whey': '/menu/generated/shake-acai-banana-whey.png',
  'shake-acai-morango': '/menu/generated/shake-acai-morango.png',
  'shake-acai-banana': '/menu/generated/shake-acai-banana.png',
  'salada-de-frutas': '/menu/products/salada-de-frutas-hq.webp',
  'agua-sem-gas': '/menu/generated/agua-sem-gas.png',
  'agua-com-gas': '/menu/generated/agua-com-gas.png',
  refrigerante: '/menu/generated/refri-coca-cola-hq.webp',
};

const comboIds = ['barbie', 'banana-ball', 'beijinho', 'bem-casado', 'chocomaster', 'dos-sonhos', 'favorito', 'power', 'raspas', 'saboroso', 'jade', 'pistache-berry', 'yogo-top', 'joaninha', 'kids-1', 'kids-2', 'mais-sabor', 'manila', 'moranguete', 'prestigio', 'supreme', 'tropical', '220-volts', 'santa-fe', 'explosao-de-oreo', 'nuvem'];
for (const id of comboIds) productImages[id] = `/menu/products/combo-${id}-hq.webp`;
productImages.barbie = '/menu/products/combo-barbie-hq.webp';
productImages.power = '/menu/products/combo-power-hq.webp';
productImages.tropical = '/menu/products/combo-tropical-hq.webp';

const modifierImages: Record<string, string> = {
  'base-acai': '/menu/ingredients/acai.jpg',
  'base-cupuacu': '/menu/ingredients/cupuacu.jpg',
  'base-iogurte': '/menu/ingredients/iogurte.jpg',
  'base-graviola': '/menu/ingredients/iogurte.jpg',
  'base-pitaya': '/menu/ingredients/pitaya.jpg',
  'base-acai-zero': '/menu/ingredients/acai.jpg',
  'mousse-morango': '/menu/ingredients/mousse-morango.jpg',
  'mousse-chocolate': '/menu/ingredients/mousse-chocolate.jpg',
  'mousse-maracuja': '/menu/ingredients/mousse-maracuja.jpg',
  'diverso-leite-condensado': '/menu/ingredients/leite-condensado.jpg',
  'fruta-banana': '/menu/ingredients/banana.jpg',
  'fruta-abacaxi': '/menu/ingredients/abacaxi.jpg',
  'fruta-cereja': '/menu/ingredients/cereja.jpg',
  'fruta-morango': '/menu/ingredients/morango.jpg',
  'fruta-kiwi': '/menu/ingredients/kiwi.jpg',
  'fruta-mamao': '/menu/ingredients/mamao.jpg',
  'fruta-manga': '/menu/ingredients/manga.jpg',
  'fruta-pessego': '/menu/ingredients/pessego.jpg',
  'fruta-uva': '/menu/ingredients/uva.jpg',
  'granola-tradicional': '/menu/ingredients/granola.jpg',
  'chocolate-granulado': '/menu/ingredients/granulado.jpg',
  'chocolate-oreo': '/menu/ingredients/oreo.jpg',
  'diverso-creme-pistache': '/menu/ingredients/pistache.jpg',
};

const generatedModifierImageIds = new Set([
  'base-graviola', 'base-acai-zero', 'mousse-limao', 'mousse-morango', 'mousse-ninho',
  'whey-protein', 'cobertura-caramelo', 'cobertura-chocolate', 'cobertura-frutas-vermelhas',
  'cobertura-maracuja', 'cobertura-menta', 'cobertura-morango', 'cobertura-fini',
  'sorvete-bombom-extra', 'sorvete-morango-extra', 'sorvete-ninho-trufado-extra',
  'granola-tradicional', 'chocolate-alpino', 'chocolate-bis-branco', 'chocolate-bis-preto',
  'chocolate-brigadeiro', 'chocolate-charge', 'chocolate-confete', 'chocolate-creme-avela',
  'chocolate-creme-oreo', 'chocolate-creme-ovomaltine', 'chocolate-gotas', 'chocolate-granulado',
  'chocolate-kinder-bueno-white', 'chocolate-kit-kat', 'chocolate-laka', 'chocolate-moranguete',
  'chocolate-nescau-ball', 'chocolate-nutella', 'chocolate-ouro-branco', 'chocolate-ovomaltine',
  'chocolate-power-ball-misto', 'chocolate-prestigio', 'chocolate-raspas', 'chocolate-sonho-de-valsa',
  'diverso-amendoim', 'diverso-beijinho', 'diverso-castanha-caju', 'diverso-chantilly',
  'diverso-creme-ninho', 'diverso-doce-leite', 'diverso-leite-condensado', 'diverso-leite-po',
  'diverso-mel', 'diverso-neston', 'diverso-pacoca', 'diverso-raspa-coco', 'diverso-sucrilhos',
  'diverso-xarope-guarana', 'embalagem-viagem', 'milk-acai', 'milk-beijinho', 'milk-brigadeiro',
  'milk-capuccino', 'milk-chocolate', 'milk-creme', 'milk-creme-avela', 'milk-cupuacu',
  'milk-doce-leite', 'milk-ferrero-rocher', 'milk-kinder-ovo', 'milk-maracuja', 'milk-morango',
  'milk-ninho', 'milk-ovomaltine', 'milk-pacoca', 'milk-prestigio', 'milk-sensacao', 'milk-pistache',
  'bola-maracuja', 'bola-milho', 'bola-cafe-chocolate', 'bola-chocolate-belga', 'bola-pistache',
  'bola-morango', 'bola-flocos', 'bola-unicornio', 'bola-nutellissimo', 'bola-ninho-trufado',
  'bola-iogurte-amarena', 'bola-prestigio', 'bola-bombom', 'refri-coca-cola', 'refri-guarana',
  'refri-fanta', 'refri-sprite', 'refri-pepsi', 'refri-sukita',
]);

/** Mantém fotos do cardápio leves para redes móveis, inclusive em catálogos já cadastrados. */
export function optimizedMenuImage(url?: string): string | undefined {
  if (!url?.startsWith('/menu/')) return url;
  const webp = url.replace(/\.(?:png|jpe?g)$/i, '.webp');
  if (webp.endsWith('-hq.webp')) return webp;
  if (webp.startsWith('/menu/ingredients/') || webp.startsWith('/menu/generated/') || webp.startsWith('/menu/products/')) return webp.replace(/\.webp$/i, '-hq.webp');
  return webp;
}

export function resolveProductImage(id: string, current?: string): string {
  return optimizedMenuImage(productImages[id] || current || '/menu/products/acai-monte-seu.jpg')!;
}

export function resolveModifierImage(id: string, current?: string): string {
  if (id === 'refri-coca-cola') return '/menu/generated/refri-coca-cola-hq.webp';
  if (generatedModifierImageIds.has(id)) return optimizedMenuImage(`/menu/generated/${id}.png`)!;
  if (modifierImages[id] && (!current || current === '/menu/ingredients/morango.jpg')) return optimizedMenuImage(modifierImages[id])!;
  if (current) return optimizedMenuImage(current)!;
  if (modifierImages[id]) return optimizedMenuImage(modifierImages[id])!;
  if (id.startsWith('base-')) return optimizedMenuImage('/menu/ingredients/acai.jpg')!;
  if (id.startsWith('mousse-')) return optimizedMenuImage('/menu/ingredients/mousse-morango.jpg')!;
  if (id.startsWith('fruta-')) return optimizedMenuImage('/menu/ingredients/morango.jpg')!;
  if (id.startsWith('cobertura-')) return optimizedMenuImage('/menu/ingredients/leite-condensado.jpg')!;
  if (id.startsWith('sorvete-') || id.startsWith('bola-')) return optimizedMenuImage('/menu/products/sorvete.jpg')!;
  if (id.startsWith('milk-')) return optimizedMenuImage('/menu/products/milk-shake.jpg')!;
  if (id.startsWith('chocolate-')) return optimizedMenuImage('/menu/ingredients/granulado.jpg')!;
  if (id.startsWith('diverso-')) return optimizedMenuImage('/menu/ingredients/granola.jpg')!;
  return optimizedMenuImage('/menu/ingredients/granola.jpg')!;
}
