import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  ActionError,
  buy,
  createMatch,
  levelUp,
  move,
  reroll,
  resolveRound,
  sell,
  startRound,
  type Match,
} from '../engine/match.js';
import { playBotTurn } from '../engine/bot.js';
import { loadContent } from '../shared/content.js';
import type { ClientMsg, ServerMsg } from '../shared/protocol.js';

const PORT = Number(process.env.PORT ?? 8080);
/** Un solo humano basta: los bots completan la partida hasta MATCH_SIZE. */
const MIN_HUMANS = 1;
const MATCH_SIZE = 8;
const BOT_NAMES = ['Barbanegra', 'Kuro', 'Hody', 'Buggy', 'Crocodile', 'Doflamingo', 'Enel', 'Foxy'];

const content = loadContent();

/** Estado de la sala única del MVP: lobby de espera, después una partida. */
interface Seat {
  id: string;
  name: string;
  ws: WebSocket;
}

const seats = new Map<string, Seat>();
const ready = new Set<string>();
let match: Match | null = null;

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMsg) {
  for (const s of seats.values()) send(s.ws, msg);
}

function broadcastState() {
  if (!match) {
    broadcast({ type: 'lobby', players: [...seats.values()].map((s) => ({ id: s.id, name: s.name })) });
    return;
  }
  broadcast({ type: 'state', match, ready: [...ready] });
}

/** Los bots juegan su turno de preparación y quedan listos. */
function playBots() {
  if (!match) return;
  for (const p of match.players) {
    if (!p.id.startsWith('bot-') || !p.alive) continue;
    playBotTurn(content, match, p.id);
    ready.add(p.id);
  }
}

/** Cuando todos los jugadores vivos están listos, se resuelve el combate y empieza la siguiente ronda. */
function maybeResolve() {
  if (!match || match.phase !== 'prep') return;
  const alive = match.players.filter((p) => p.alive).map((p) => p.id);
  if (alive.length === 0 || !alive.every((id) => ready.has(id))) return;

  const report = resolveRound(content, match);
  ready.clear();
  broadcast({ type: 'round', report });
  if (match.phase === 'prep') {
    startRound(content, match);
    playBots();
    // Si no quedan humanos vivos, nadie más pulsará "Listo": la partida avanza sola.
    maybeResolve();
  }
  broadcastState();
}

function handle(seat: Seat, msg: ClientMsg) {
  if (msg.type === 'join') {
    if (match) throw new ActionError('La partida ya ha empezado');
    seat.name = msg.name.trim().slice(0, 20) || 'Pirata';
    broadcastState();
    return;
  }
  if (msg.type === 'start') {
    if (match) throw new ActionError('La partida ya ha empezado');
    if (seats.size < MIN_HUMANS) throw new ActionError('Hace falta al menos un jugador');
    const humans = [...seats.values()].map((s) => ({ id: s.id, name: s.name }));
    const bots = Array.from({ length: Math.max(0, MATCH_SIZE - humans.length) }, (_, i) => ({
      id: `bot-${i}`,
      name: `🤖 ${BOT_NAMES[i % BOT_NAMES.length]}`,
    }));
    // La semilla se fija aquí, en el servidor; el motor es determinista a partir de ella.
    match = createMatch(content, [...humans, ...bots], Math.floor(Math.random() * 0xffffffff));
    startRound(content, match);
    playBots();
    broadcastState();
    return;
  }
  if (!match) throw new ActionError('Aún no hay partida');
  const m = match;
  const pid = seat.id;
  if (!m.players.find((p) => p.id === pid)?.alive) throw new ActionError('Estás eliminado');
  switch (msg.type) {
    case 'buy':
      buy(content, m, pid, msg.shopIndex);
      break;
    case 'sell':
      sell(content, m, pid, msg.loc);
      break;
    case 'move':
      move(content, m, pid, msg.from, msg.to);
      break;
    case 'reroll':
      reroll(content, m, pid);
      break;
    case 'levelUp':
      levelUp(content, m, pid);
      break;
    case 'ready':
      ready.add(pid);
      broadcastState();
      maybeResolve();
      return;
  }
  broadcastState();
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  const seat: Seat = { id: randomUUID(), name: 'Pirata', ws };
  seats.set(seat.id, seat);
  send(ws, { type: 'joined', playerId: seat.id });
  broadcastState();

  ws.on('message', (raw) => {
    try {
      handle(seat, JSON.parse(raw.toString()) as ClientMsg);
    } catch (err) {
      if (err instanceof ActionError || err instanceof SyntaxError) {
        send(ws, { type: 'error', message: err.message });
      } else {
        console.error(err);
        send(ws, { type: 'error', message: 'Error interno' });
      }
    }
  });

  ws.on('close', () => {
    seats.delete(seat.id);
    ready.delete(seat.id);
    if (match) {
      const p = match.players.find((x) => x.id === seat.id);
      if (p && p.alive) p.alive = false;
      maybeResolve();
    }
    broadcastState();
  });
});

console.log(`Servidor One Piece Autochess escuchando en ws://localhost:${PORT}`);
