import { describe, expect, it } from 'vitest';
import { ActionError, buy, createMatch, levelUp, move, reroll, resolveRound, sell, startRound, type Match } from '../src/engine/match.js';
import { content, unit } from './helpers.js';
import type { Unit } from '../src/shared/types.js';

function newMatch(seed = 1): Match {
  const match = createMatch(content, [
    { id: 'a', name: 'Luffy' },
    { id: 'b', name: 'Zoro' },
  ], seed);
  startRound(content, match);
  return match;
}

const player = (m: Match, id: string) => m.players.find((p) => p.id === id)!;

describe('partida', () => {
  it('startRound da oro base y rellena la tienda', () => {
    const m = newMatch();
    for (const p of m.players) {
      expect(p.gold).toBe(content.economy.baseIncome);
      expect(p.shop.every((c) => c !== null)).toBe(true);
    }
  });

  it('la misma semilla produce la misma tienda', () => {
    expect(newMatch(5).players[0]!.shop).toEqual(newMatch(5).players[0]!.shop);
  });

  it('comprar descuenta oro, libera la tienda y ocupa el banquillo', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.gold = 10;
    p.shop[0] = 'luffy';
    buy(content, m, 'a', 0);
    expect(p.gold).toBe(10 - 1);
    expect(p.shop[0]).toBeNull();
    expect(p.bench[0]?.defId).toBe('luffy');
  });

  it('no permite comprar sin oro', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.gold = 0;
    p.shop[0] = 'kaido';
    expect(() => buy(content, m, 'a', 0)).toThrow(ActionError);
  });

  it('tres copias de estrella 1 se funden en una de estrella 2', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.gold = 100;
    p.bench = [unit('luffy'), unit('luffy'), null, null, null, null, null, null, null];
    p.shop[0] = 'luffy';
    buy(content, m, 'a', 0);
    const stars = p.bench.filter((u): u is Unit => u !== null).map((u) => u.star);
    expect(stars).toEqual([2]);
  });

  it('vender devuelve las copias al pool', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.bench[0] = unit('zoro');
    const before = m.pool['zoro']!;
    sell(content, m, 'a', { zone: 'bench', index: 0 });
    expect(m.pool['zoro']).toBe(before + 1);
    expect(p.bench[0]).toBeNull();
  });

  it('no se puede tener más piezas en tablero que el nivel', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.bench[0] = unit('zoro');
    p.bench[1] = unit('nami');
    // Nivel 1: solo una pieza en tablero.
    move(content, m, 'a', { zone: 'bench', index: 0 }, { zone: 'board', index: 0 });
    expect(() => move(content, m, 'a', { zone: 'bench', index: 1 }, { zone: 'board', index: 1 })).toThrow(/máximo/);
  });

  it('subir de nivel cuesta oro y amplía el tablero', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.gold = 10;
    levelUp(content, m, 'a');
    expect(p.level).toBe(2);
    expect(p.gold).toBe(10 - content.economy.levelUpCost['2']!);
  });

  it('resetear la tienda devuelve las cartas al pool', () => {
    const m = newMatch();
    const p = player(m, 'a');
    p.gold = 10;
    const shopBefore = [...p.shop];
    reroll(content, m, 'a');
    expect(p.gold).toBe(10 - content.economy.rerollCost);
    expect(p.shop).not.toEqual(shopBefore);
  });

  it('el perdedor de un combate recibe daño y el empate no daña a nadie', () => {
    const m = newMatch();
    const a = player(m, 'a');
    const b = player(m, 'b');
    a.board[4] = unit('kaido');
    a.board[5] = unit('bigmom');
    b.board[4] = unit('koby');
    const report = resolveRound(content, m);
    const pair = report.pairs[0]!;
    expect(pair.winner).toBe('a');
    expect(b.hp).toBeLessThan(content.economy.startHp);
    expect(a.hp).toBe(content.economy.startHp);
    expect(pair.damage['b']).toBeGreaterThanOrEqual(1);
  });

  it('la partida termina cuando queda un jugador', () => {
    const m = newMatch();
    const a = player(m, 'a');
    const b = player(m, 'b');
    a.board[4] = unit('kaido');
    b.hp = 1;
    b.board[4] = unit('koby');
    resolveRound(content, m);
    expect(b.alive).toBe(false);
    expect(m.phase).toBe('finished');
    expect(m.winnerId).toBe('a');
  });

  it('no se puede actuar cuando la partida ha terminado', () => {
    const m = newMatch();
    m.phase = 'finished';
    expect(() => reroll(content, m, 'a')).toThrow(/terminado/);
  });
});
