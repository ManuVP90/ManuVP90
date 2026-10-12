import { describe, expect, it } from 'vitest';
import { loadContent, validateContent } from '../src/shared/content.js';
import { content } from './helpers.js';

describe('contenido', () => {
  it('los datos de data/ son válidos', () => {
    expect(() => loadContent()).not.toThrow();
  });

  it('todos los personajes pertenecen a una facción definida', () => {
    for (const c of content.characters) {
      expect(content.synergies[c.faction], c.id).toBeDefined();
    }
  });

  it('rechaza una facción desconocida', () => {
    const broken = structuredClone(content);
    broken.characters[0]!.faction = 'inexistente';
    expect(() => validateContent(broken)).toThrow(/facción desconocida/);
  });

  it('rechaza probabilidades de tienda que no suman 100', () => {
    const broken = structuredClone(content);
    broken.economy.shopOdds['1'] = [50, 0, 0, 0, 0];
    expect(() => validateContent(broken)).toThrow(/suma 50/);
  });
});

describe('alcance del MVP', () => {
  it('hay 30 personajes', () => {
    expect(content.characters).toHaveLength(30);
  });
});
