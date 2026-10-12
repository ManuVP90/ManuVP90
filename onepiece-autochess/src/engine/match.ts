import { Rng, mixSeed } from '../shared/rng.js';
import type { Content, Side, Star, Unit } from '../shared/types.js';
import { simulateCombat, type Board, type CombatEvent } from './combat.js';
import { copiesOf, getCharacter } from './team.js';

export interface PlayerState {
  id: string;
  name: string;
  hp: number;
  gold: number;
  level: number;
  board: Board;
  bench: (Unit | null)[];
  shop: (string | null)[];
  /** Racha: positiva = victorias seguidas, negativa = derrotas seguidas, 0 = ninguna. */
  streak: number;
  alive: boolean;
}

export interface Match {
  seed: number;
  round: number;
  phase: 'prep' | 'finished';
  players: PlayerState[];
  /** Copias restantes de cada personaje en el pool compartido. */
  pool: Record<string, number>;
  nextUid: number;
  /** Contador para que cada tirada de tienda use una semilla distinta. */
  draws: number;
  winnerId: string | null;
}

export interface PairReport {
  a: string;
  b: string;
  winner: string | null;
  damage: Record<string, number>;
  survivors: [number, number];
  events: CombatEvent[];
}

export interface RoundReport {
  round: number;
  pairs: PairReport[];
  byes: string[];
  eliminated: string[];
}

export class ActionError extends Error {}

function fail(msg: string): never {
  throw new ActionError(msg);
}

export function createMatch(content: Content, playerNames: { id: string; name: string }[], seed: number): Match {
  const { economy } = content;
  const pool: Record<string, number> = {};
  for (const c of content.characters) pool[c.id] = economy.copiesByCost[String(c.cost)] ?? 0;
  const empty = (n: number) => Array.from({ length: n }, () => null);
  const players: PlayerState[] = playerNames.map((p) => ({
    id: p.id,
    name: p.name,
    hp: economy.startHp,
    gold: 0,
    level: economy.startLevel,
    board: empty(economy.boardSlots),
    bench: empty(economy.benchSize),
    shop: empty(economy.shopSize),
    streak: 0,
    alive: true,
  }));
  return { seed, round: 0, phase: 'prep', players, pool, nextUid: 1, draws: 0, winnerId: null };
}

export function getPlayer(match: Match, pid: string): PlayerState {
  return match.players.find((p) => p.id === pid) ?? fail(`Jugador desconocido: ${pid}`);
}

function requirePrep(match: Match) {
  if (match.phase !== 'prep') fail('La partida ha terminado');
}

function boardCap(content: Content, p: PlayerState): number {
  return Math.min(p.level, content.economy.boardSlots);
}

/** Saca una tirada de la tienda según las probabilidades del nivel del jugador. */
function drawCard(content: Content, match: Match, p: PlayerState): string | null {
  const rng = new Rng(mixSeed(match.seed, match.round, match.draws++));
  const odds = content.economy.shopOdds[String(p.level)] ?? [100];
  let roll = rng.int(100);
  let cost = 1;
  for (let i = 0; i < odds.length; i++) {
    roll -= odds[i] ?? 0;
    if (roll < 0) {
      cost = i + 1;
      break;
    }
  }
  // Si no quedan copias de ese coste, baja al coste inferior disponible.
  for (let c = cost; c >= 1; c--) {
    const candidates = content.characters.filter((ch) => ch.cost === c && (match.pool[ch.id] ?? 0) > 0);
    if (candidates.length > 0) {
      const pick = rng.pick(candidates);
      match.pool[pick.id] = (match.pool[pick.id] ?? 0) - 1;
      return pick.id;
    }
  }
  return null;
}

function rollShop(content: Content, match: Match, p: PlayerState) {
  for (const card of p.shop) if (card) match.pool[card] = (match.pool[card] ?? 0) + 1;
  p.shop = p.shop.map(() => drawCard(content, match, p));
}

/** Empieza una ronda de preparación: ingresos y tienda nueva para cada jugador vivo. */
export function startRound(content: Content, match: Match): void {
  requirePrep(match);
  const { economy } = content;
  match.round++;
  for (const p of match.players) {
    if (!p.alive) continue;
    const interest = Math.min(economy.maxInterest, Math.floor(p.gold / 10)) * economy.interestPer10;
    const streakIdx = Math.min(Math.abs(p.streak), economy.winStreakBonus.length - 1);
    const streakGold = p.streak === 0 ? 0 : (economy.winStreakBonus[streakIdx] ?? 0);
    p.gold += economy.baseIncome + interest + streakGold;
    rollShop(content, match, p);
  }
}

export function buy(content: Content, match: Match, pid: string, shopIndex: number): void {
  requirePrep(match);
  const p = getPlayer(match, pid);
  const defId = p.shop[shopIndex];
  if (!defId) fail('No hay carta en esa posición de la tienda');
  const def = getCharacter(content, defId);
  if (p.gold < def.cost) fail('Oro insuficiente');
  const slot = p.bench.indexOf(null);
  if (slot === -1) fail('Banquillo lleno');
  p.gold -= def.cost;
  p.shop[shopIndex] = null;
  p.bench[slot] = { uid: match.nextUid++, defId, star: 1 };
  mergeCopies(p, defId);
}

/** Tres copias de la misma estrella se funden en una de estrella superior, hasta la estrella máxima. */
function mergeCopies(p: PlayerState, defId: string): void {
  for (let star = 1 as Star; star < 3; star = (star + 1) as Star) {
    for (;;) {
      const locs = locationsOf(p, defId, star);
      if (locs.length < 3) break;
      const [keep, ...others] = locs.slice(0, 3) as [Loc, Loc, Loc];
      setSlot(p, keep, { ...(getSlot(p, keep) as Unit), star: (star + 1) as Star });
      for (const o of others.slice(0, 2)) setSlot(p, o, null);
    }
  }
}

type Loc = { zone: 'board' | 'bench'; index: number };

function locationsOf(p: PlayerState, defId: string, star: Star): Loc[] {
  const out: Loc[] = [];
  p.board.forEach((u, index) => u && u.defId === defId && u.star === star && out.push({ zone: 'board', index }));
  p.bench.forEach((u, index) => u && u.defId === defId && u.star === star && out.push({ zone: 'bench', index }));
  return out;
}

function getSlot(p: PlayerState, loc: Loc): Unit | null {
  return (loc.zone === 'board' ? p.board : p.bench)[loc.index] ?? null;
}

function setSlot(p: PlayerState, loc: Loc, unit: Unit | null): void {
  if (loc.zone === 'board') p.board[loc.index] = unit;
  else p.bench[loc.index] = unit;
}

export function sell(content: Content, match: Match, pid: string, loc: Loc): void {
  requirePrep(match);
  const p = getPlayer(match, pid);
  const unit = validSlot(p, loc);
  const def = getCharacter(content, unit.defId);
  const copies = copiesOf(unit.star);
  match.pool[def.id] = (match.pool[def.id] ?? 0) + copies;
  p.gold += def.cost * copies;
  setSlot(p, loc, null);
}

export function reroll(content: Content, match: Match, pid: string): void {
  requirePrep(match);
  const p = getPlayer(match, pid);
  if (p.gold < content.economy.rerollCost) fail('Oro insuficiente para resetear la tienda');
  p.gold -= content.economy.rerollCost;
  rollShop(content, match, p);
}

export function levelUp(content: Content, match: Match, pid: string): void {
  requirePrep(match);
  const p = getPlayer(match, pid);
  const next = p.level + 1;
  if (next > content.economy.maxLevel) fail('Nivel máximo alcanzado');
  const cost = content.economy.levelUpCost[String(next)] ?? Infinity;
  if (p.gold < cost) fail('Oro insuficiente para subir de nivel');
  p.gold -= cost;
  p.level = next;
}

/** Mueve o intercambia piezas entre banquillo y tablero, respetando el límite de tablero por nivel. */
export function move(content: Content, match: Match, pid: string, from: Loc, to: Loc): void {
  requirePrep(match);
  const p = getPlayer(match, pid);
  validSlot(p, from);
  slotOrFail(p, to);
  const moving = getSlot(p, from);
  const displaced = getSlot(p, to);
  setSlot(p, to, moving);
  setSlot(p, from, displaced);
  const onBoard = p.board.filter((u) => u !== null).length;
  if (onBoard > boardCap(content, p)) {
    setSlot(p, from, moving);
    setSlot(p, to, displaced);
    fail(`Nivel ${p.level}: máximo ${boardCap(content, p)} piezas en el tablero`);
  }
}

function validSlot(p: PlayerState, loc: Loc): Unit {
  const unit = getSlot(p, slotOrFail(p, loc));
  if (!unit) fail('Casilla vacía');
  return unit;
}

function slotOrFail(p: PlayerState, loc: Loc): Loc {
  const list = loc.zone === 'board' ? p.board : p.bench;
  if (!Number.isInteger(loc.index) || loc.index < 0 || loc.index >= list.length) fail('Casilla fuera de rango');
  return loc;
}

/**
 * Resuelve el combate de la ronda: empareja jugadores vivos, simula cada batalla y aplica el daño.
 * Llamar después de la preparación de todos los jugadores.
 */
export function resolveRound(content: Content, match: Match): RoundReport {
  requirePrep(match);
  const alive = match.players.filter((p) => p.alive);
  const rng = new Rng(mixSeed(match.seed, match.round, 0xc0ffee));
  const order = rng.shuffle(alive);
  const byes: string[] = [];
  if (order.length % 2 === 1) byes.push((order.pop() as PlayerState).id);

  const pairs: PairReport[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const a = order[i] as PlayerState;
    const b = order[i + 1] as PlayerState;
    const sim = simulateCombat(content, [a.board, b.board]);
    const side = sim.winner;
    const winner = side === null ? null : side === 0 ? a : b;
    const loser = side === null ? null : side === 0 ? b : a;
    const damage: Record<string, number> = {};
    const survivors = sim.survivors;

    if (winner && loser) {
      const winnerSurvivors = winner === a ? survivors[0] : survivors[1];
      const dmg = 1 + winnerSurvivors;
      loser.hp -= dmg;
      damage[loser.id] = dmg;
      winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
      loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
    } else {
      a.streak = 0;
      b.streak = 0;
    }
    pairs.push({ a: a.id, b: b.id, winner: winner?.id ?? null, damage, survivors, events: sim.events });
  }

  const eliminated: string[] = [];
  for (const p of match.players) {
    if (p.alive && p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      eliminated.push(p.id);
    }
  }
  const remaining = match.players.filter((p) => p.alive);
  if (remaining.length <= 1) {
    match.phase = 'finished';
    match.winnerId = remaining[0]?.id ?? null;
  }
  return { round: match.round, pairs, byes, eliminated };
}
