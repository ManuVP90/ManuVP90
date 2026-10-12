import type { Match, RoundReport } from '../engine/match.js';

/** Ubicación de una pieza: banquillo o tablero, y su índice. */
export interface Loc {
  zone: 'board' | 'bench';
  index: number;
}

/** Mensajes del cliente al servidor. */
export type ClientMsg =
  | { type: 'join'; name: string }
  | { type: 'start' }
  | { type: 'buy'; shopIndex: number }
  | { type: 'sell'; loc: Loc }
  | { type: 'move'; from: Loc; to: Loc }
  | { type: 'reroll' }
  | { type: 'levelUp' }
  | { type: 'ready' };

/** Mensajes del servidor al cliente. */
export type ServerMsg =
  | { type: 'joined'; playerId: string }
  | { type: 'lobby'; players: { id: string; name: string }[] }
  | { type: 'state'; match: Match; ready: string[] }
  | { type: 'round'; report: RoundReport }
  | { type: 'error'; message: string };
