import { loadContent } from '../src/shared/content.js';
import type { Content, Star, Unit } from '../src/shared/types.js';
import type { Board } from '../src/engine/combat.js';

export const content: Content = loadContent();

let uid = 1000;

/** Crea una pieza. */
export function unit(defId: string, star: Star = 1): Unit {
  return { uid: uid++, defId, star };
}

/** Tablero vacío del tamaño definido en economy.json. */
export function emptyBoard(): Board {
  return Array.from({ length: content.economy.boardSlots }, () => null);
}

/** Coloca piezas en las casillas indicadas (índice de casilla = fila * columnas + columna). */
export function boardWith(entries: [number, string, Star?][]): Board {
  const board = emptyBoard();
  for (const [slot, defId, star] of entries) board[slot] = unit(defId, star ?? 1);
  return board;
}
