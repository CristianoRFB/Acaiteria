import { describe, expect, it } from 'vitest';

import { resolveModifierImage, resolveProductImage } from '@/shared/catalog-images';

describe('imagens dos complementos', () => {
  it('usa uma imagem própria para cada fruta do cardápio', () => {
    expect(resolveModifierImage('fruta-abacaxi')).toBe('/menu/ingredients/abacaxi-hq.webp');
    expect(resolveModifierImage('fruta-cereja')).toBe('/menu/ingredients/cereja-hq.webp');
    expect(resolveModifierImage('fruta-mamao')).toBe('/menu/ingredients/mamao-hq.webp');
    expect(resolveModifierImage('fruta-pessego')).toBe('/menu/ingredients/pessego-hq.webp');
    expect(resolveModifierImage('fruta-uva')).toBe('/menu/ingredients/uva-hq.webp');
  });

  it('corrige o fallback antigo de morango sem sobrescrever uma imagem personalizada', () => {
    expect(resolveModifierImage('fruta-mamao', '/menu/ingredients/morango.jpg')).toBe('/menu/ingredients/mamao-hq.webp');
    expect(resolveModifierImage('fruta-mamao', '/uploads/mamao-da-loja.jpg')).toBe('/uploads/mamao-da-loja.jpg');
  });

  it('preserva a imagem personalizada informada no painel do produto', () => {
    expect(resolveProductImage('kids-2', 'https://cdn.exemplo.com/kids-2.webp')).toBe('https://cdn.exemplo.com/kids-2.webp');
    expect(resolveProductImage('kids-2', '/menu/products/combo-kids-2.webp')).toBe('/menu/products/combo-kids-2-hq.webp');
  });

  it('troca placeholders do seed pela foto padrão de alta qualidade', () => {
    expect(resolveProductImage('acai-monte-seu', '/development-acai-placeholder.png')).toBe('/menu/products/acai-monte-seu-gold-hq.webp');
    expect(resolveProductImage('refrigerante', '/menu/generated/refrigerante.webp')).toBe('/menu/generated/refri-coca-cola-hq.webp');
  });
});
