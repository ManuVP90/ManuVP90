import { describe, expect, it } from 'vitest';
import { playBotTurn } from '../src/engine/bot.js';
import { createMatch, resolveRound, startRound, type Match } from '../src/engine/match.js';
import { content } from './helpers.js';

function botMatch(seed: number): Match {
  const players = Array.from({ length: 4 }, (_, i) => ({ id: `bot-${i}`, name: `Bot ${i}` }));
  const m = createMatch(content, players, seed);
  startRound(content, m);
  return m;
}

describe('bots', () => {
  it('un turno de bot compra y coloca piezas sin romper reglas', () => {
    const m = botMatch(3);
    const p = m.players[0]!;
    p.gold = 30;
    playBotTurn(content, m, p.id);
    const bought = [...p.board, ...p.bench].filter((u) => u !== null).length;
    expect(bought).toBeGreaterThan(0);
    expect(p.board.filter((u) => u !== null).length).toBeLessThanOrEqual(p.level);
  });

  it('una partida de bots llega a su fin sin errores', () => {
    const m = botMatch(11);
    for (let r = 0; r < 200 && m.phase === 'prep'; r++) {
      for (const p of m.players) if (p.alive) playBotTurn(content, m, p.id);
      resolveRound(content, m);
      if (m.phase === 'prep') startRound(content, m);
    }
    expect(m.phase).toBe('finished');
    expect(m.winnerId).not.toBeNull();
  });
});
