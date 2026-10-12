import type { Content, Side, Unit } from '../shared/types.js';
import { getCharacter, unitStats } from './team.js';

/** Tablero de un jugador: `boardSlots` casillas, fila 0 = atrás, fila 1 = delante. */
export type Board = (Unit | null)[];

export type CombatEvent =
  | { t: number; type: 'move'; id: number; x: number; y: number }
  | { t: number; type: 'attack'; id: number; target: number; damage: number; targetHp: number }
  | { t: number; type: 'ability'; id: number; name: string; target: number; amount: number; kind: 'bonus_damage' | 'heal_ally' }
  | { t: number; type: 'death'; id: number; side: Side };

export interface CombatUnit {
  id: number;
  side: Side;
  defId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  armor: number;
  range: number;
  cooldown: number;
  mana: number;
  maxMana: number;
  nextAttack: number;
  alive: boolean;
}

export interface CombatResult {
  /** Lado ganador, o null si empate. */
  winner: Side | null;
  ticks: number;
  survivors: [number, number];
  units: CombatUnit[];
  events: CombatEvent[];
}

const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Simula una batalla entre dos tableros. Es una función pura: el mismo input produce siempre el mismo log.
 * Jugador 0 ocupa la mitad inferior de la rejilla y jugador 1 la superior, con las filas de delante enfrentadas.
 */
export function simulateCombat(content: Content, boards: [Board, Board]): CombatResult {
  const { gridRows, tickLimit, manaPerAttack, manaPerHit } = content.economy.combat;
  const cols = content.economy.boardColumns;
  const units: CombatUnit[] = [];
  const events: CombatEvent[] = [];

  for (const side of [0, 1] as const) {
    const board = boards[side];
    const present = board.filter((u): u is Unit => u !== null);
    board.forEach((unit, slot) => {
      if (!unit) return;
      const row = Math.floor(slot / cols);
      const col = slot % cols;
      const y = side === 0 ? gridRows - 1 - row : row;
      const stats = unitStats(content, unit, present);
      units.push({
        id: units.length,
        side,
        defId: unit.defId,
        x: col,
        y,
        hp: stats.hp,
        maxHp: stats.hp,
        attack: stats.attack,
        armor: stats.armor,
        range: stats.range,
        cooldown: stats.cooldown,
        mana: 0,
        maxMana: stats.maxMana,
        nextAttack: 1,
        alive: true,
      });
    });
  }

  const occupied = () => new Set(units.filter((u) => u.alive).map((u) => `${u.x},${u.y}`));
  const aliveOf = (side: Side) => units.filter((u) => u.alive && u.side === side);
  const kill = (u: CombatUnit, t: number) => {
    u.alive = false;
    events.push({ t, type: 'death', id: u.id, side: u.side });
  };

  let t = 0;
  while (t < tickLimit && aliveOf(0).length > 0 && aliveOf(1).length > 0) {
    t++;
    for (const u of units) {
      if (!u.alive) continue;
      const enemies = aliveOf(u.side === 0 ? 1 : 0);
      if (enemies.length === 0) break;

      const target = enemies.reduce((best, e) => (manhattan(u, e) < manhattan(u, best) ? e : best));
      const ability = getCharacter(content, u.defId).ability;

      if (u.mana >= u.maxMana) {
        if (ability.kind === 'bonus_damage') {
          target.hp -= ability.amount;
          u.mana = 0;
          events.push({ t, type: 'ability', id: u.id, name: ability.name, target: target.id, amount: ability.amount, kind: ability.kind });
          if (target.hp <= 0) kill(target, t);
          continue;
        }
        const allies = aliveOf(u.side).filter((a) => a.hp < a.maxHp);
        if (allies.length > 0) {
          const ally = allies.reduce((low, a) => (a.hp / a.maxHp < low.hp / low.maxHp ? a : low));
          const healed = Math.min(ability.amount, ally.maxHp - ally.hp);
          ally.hp += healed;
          u.mana = 0;
          events.push({ t, type: 'ability', id: u.id, name: ability.name, target: ally.id, amount: healed, kind: ability.kind });
          continue;
        }
      }

      const dist = manhattan(u, target);
      if (dist <= u.range) {
        if (t >= u.nextAttack) {
          const damage = Math.max(1, u.attack - target.armor);
          target.hp -= damage;
          u.mana = Math.min(u.maxMana, u.mana + manaPerAttack);
          target.mana = Math.min(target.maxMana, target.mana + manaPerHit);
          u.nextAttack = t + u.cooldown;
          events.push({ t, type: 'attack', id: u.id, target: target.id, damage, targetHp: Math.max(0, target.hp) });
          if (target.hp <= 0) kill(target, t);
        }
        continue;
      }

      // Avanzar un paso hacia el objetivo, esquivando las casillas ocupadas.
      const taken = occupied();
      const dx = Math.sign(target.x - u.x);
      const dy = Math.sign(target.y - u.y);
      const steps: [number, number][] = [];
      if (dx !== 0) steps.push([u.x + dx, u.y]);
      if (dy !== 0) steps.push([u.x, u.y + dy]);
      if (dx !== 0 && dy !== 0) steps.push([u.x, u.y + dy], [u.x + dx, u.y]);
      const free = steps.find(([x, y]) => x >= 0 && x < cols && y >= 0 && y < gridRows && !taken.has(`${x},${y}`));
      if (free) {
        [u.x, u.y] = free;
        events.push({ t, type: 'move', id: u.id, x: u.x, y: u.y });
      }
    }
  }

  const a0 = aliveOf(0).length;
  const a1 = aliveOf(1).length;
  let winner: Side | null = null;
  if (a0 > a1) winner = 0;
  else if (a1 > a0) winner = 1;

  return { winner, ticks: t, survivors: [a0, a1], units, events };
}
