/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 * Todo azar del juego pasa por aquí para que las partidas y batallas sean reproducibles.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Número en [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero en [0, max). */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() sobre lista vacía');
    return items[this.int(items.length)] as T;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

/** Combina números en una semilla de 32 bits (FNV-1a sobre los enteros). */
export function mixSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
