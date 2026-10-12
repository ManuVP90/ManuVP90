import { describe, expect, it } from 'vitest';
import { Rng, mixSeed } from '../src/shared/rng.js';

describe('Rng', () => {
  it('produce la misma secuencia para la misma semilla', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 20 }, () => a.int(1000));
    const seqB = Array.from({ length: 20 }, () => b.int(1000));
    expect(seqA).toEqual(seqB);
  });

  it('produce valores en [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle conserva los elementos', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = new Rng(99).shuffle(items);
    expect([...shuffled].sort((x, y) => x - y)).toEqual(items);
  });

  it('mixSeed es determinista y sensible al orden', () => {
    expect(mixSeed(1, 2, 3)).toBe(mixSeed(1, 2, 3));
    expect(mixSeed(1, 2, 3)).not.toBe(mixSeed(3, 2, 1));
  });
});
