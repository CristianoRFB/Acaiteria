import { describe, expect, it } from 'vitest';

import { resolveModifierImage } from '@/shared/catalog-images';

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
});
