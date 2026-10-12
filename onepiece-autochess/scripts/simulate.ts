// Simula partidas completas de 8 bots para comprobar que terminan y ver el reparto de victorias.
// Uso: npx tsx scripts/simulate.ts [partidas=200]
import { playBotTurn } from '../src/engine/bot.js';
import { createMatch, resolveRound, startRound, type Match } from '../src/engine/match.js';
import { activeSynergies } from '../src/engine/team.js';
import { loadContent } from '../src/shared/content.js';

const content = loadContent();
const games = Number(process.argv[2] ?? 200);
const MAX_ROUNDS = 80;

const rounds: number[] = [];
const winnerFactions = new Map<string, number>();
let unfinished = 0;

for (let g = 1; g <= games; g++) {
  const players = Array.from({ length: 8 }, (_, i) => ({ id: `bot-${i}`, name: `Bot ${i}` }));
  const match: Match = createMatch(content, players, g * 7919);
  startRound(content, match);
  while (match.phase === 'prep' && match.round < MAX_ROUNDS) {
    for (const p of match.players) if (p.alive) playBotTurn(content, match, p.id);
    resolveRound(content, match);
    if (match.phase === 'prep') startRound(content, match);
  }
  if (match.phase !== 'finished') {
    unfinished++;
    continue;
  }
  rounds.push(match.round);
  const winner = match.players.find((p) => p.id === match.winnerId);
  const factions = winner ? activeSynergies(content, winner.board.filter((u) => u !== null)) : [];
  const top = factions.sort((a, b) => b.count - a.count)[0]?.faction ?? 'ninguna';
  winnerFactions.set(top, (winnerFactions.get(top) ?? 0) + 1);
}

const avg = rounds.reduce((a, b) => a + b, 0) / Math.max(1, rounds.length);
console.log(`Partidas: ${games}  terminadas: ${rounds.length}  sin terminar: ${unfinished}`);
console.log(`Rondas por partida: media ${avg.toFixed(1)}, mín ${Math.min(...rounds)}, máx ${Math.max(...rounds)}`);
console.log('Facción dominante del ganador:');
for (const [f, n] of [...winnerFactions.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(14)} ${((n / rounds.length) * 100).toFixed(1)} %`);
}
