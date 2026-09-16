const productImages: Record<string, string> = {
  'acai-monte-seu': '/menu/products/acai-monte-seu.jpg',
  'milk-shake': '/menu/products/milk-shake.jpg',
  sorvete: '/menu/products/sorvete.jpg',
  'shake-acai-banana-whey': '/menu/products/shake-acai.jpg',
  'shake-acai-morango': '/menu/products/shake-acai.jpg',
  'shake-acai-banana': '/menu/products/shake-acai.jpg',
  'salada-de-frutas': '/menu/products/salada-de-frutas.jpg',
  'agua-sem-gas': '/menu/products/bebida.jpg',
  'agua-com-gas': '/menu/products/bebida.jpg',
  refrigerante: '/menu/products/bebida.jpg',
};

const comboIds = ['barbie', 'banana-ball', 'beijinho', 'bem-casado', 'chocomaster', 'dos-sonhos', 'favorito', 'power', 'raspas', 'saboroso', 'jade', 'pistache-berry', 'yogo-top', 'joaninha', 'kids-1', 'kids-2', 'mais-sabor', 'manila', 'moranguete', 'prestigio', 'supreme', 'tropical', '220-volts', 'santa-fe', 'explosao-de-oreo', 'nuvem'];
for (const id of comboIds) productImages[id] = `/menu/products/combo-${id}.jpg`;

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

export function resolveProductImage(id: string, current?: string): string {
  return current || productImages[id] || '/menu/products/acai-monte-seu.jpg';
}

export function resolveModifierImage(id: string, current?: string): string {
  if (modifierImages[id] && (!current || current === '/menu/ingredients/morango.jpg')) return modifierImages[id];
  if (current) return current;
  if (modifierImages[id]) return modifierImages[id];
  if (id.startsWith('base-')) return '/menu/ingredients/acai.jpg';
  if (id.startsWith('mousse-')) return '/menu/ingredients/mousse-morango.jpg';
  if (id.startsWith('fruta-')) return '/menu/ingredients/morango.jpg';
  if (id.startsWith('cobertura-')) return '/menu/ingredients/leite-condensado.jpg';
  if (id.startsWith('sorvete-') || id.startsWith('bola-')) return '/menu/products/sorvete.jpg';
  if (id.startsWith('milk-')) return '/menu/products/milk-shake.jpg';
  if (id.startsWith('chocolate-')) return '/menu/ingredients/granulado.jpg';
  if (id.startsWith('diverso-')) return '/menu/ingredients/granola.jpg';
  return '/menu/ingredients/granola.jpg';
}
