import type { Content, Unit } from '../shared/types.js';
import { ActionError, buy, getPlayer, levelUp, move, reroll, type Match } from './match.js';
import { getCharacter } from './team.js';

/** Gasto mínimo de oro guardado para que el bot suba de nivel en vez de comprar sin cabeza. */
const LEVEL_UP_GOLD = 20;

/**
 * Turno de un bot en la fase de preparación. Heurística simple:
 * 1. compra las cartas de piezas que ya tiene (para fusionar estrellas), y después las baratas;
 * 2. sube de nivel si le sobra oro;
 * 3. llena el tablero con las piezas del banquillo hasta el límite de nivel.
 * Usa las mismas acciones que un jugador, así que nunca salta una regla.
 */
export function playBotTurn(content: Content, match: Match, botId: string): void {
  const p = getPlayer(match, botId);
  if (!p.alive || match.phase !== 'prep') return;
  /** Ejecuta una acción; si el motor la rechaza, el bot simplemente no la hace. */
  const attempt = (fn: () => void): boolean => {
    try {
      fn();
      return true;
    } catch (err) {
      if (!(err instanceof ActionError)) throw err;
      return false;
    }
  };

  const owned = new Set([...p.board, ...p.bench].filter((u): u is Unit => u !== null).map((u) => u.defId));
  const shopOrder = p.shop
    .map((defId, index) => ({ defId, index }))
    .filter((c): c is { defId: string; index: number } => c.defId !== null)
    .sort((a, b) => {
      const ownA = owned.has(a.defId) ? 0 : 1;
      const ownB = owned.has(b.defId) ? 0 : 1;
      if (ownA !== ownB) return ownA - ownB;
      return getCharacter(content, a.defId).cost - getCharacter(content, b.defId).cost;
    });
  for (const { index, defId } of shopOrder) {
    if (p.gold >= getCharacter(content, defId).cost) attempt(() => buy(content, match, botId, index));
  }

  if (p.gold >= LEVEL_UP_GOLD) attempt(() => levelUp(content, match, botId));

  const cap = Math.min(p.level, content.economy.boardSlots);
  let onBoard = p.board.filter((u) => u !== null).length;
  p.bench.forEach((u, benchIndex) => {
    if (!u || onBoard >= cap) return;
    const freeSlot = p.board.indexOf(null);
    if (freeSlot === -1) return;
    if (attempt(() => move(content, match, botId, { zone: 'bench', index: benchIndex }, { zone: 'board', index: freeSlot }))) {
      onBoard++;
    }
  });

  if (p.gold >= content.economy.rerollCost * 3 && p.shop.every((c) => !c || !owned.has(c))) {
    attempt(() => reroll(content, match, botId));
  }
}
