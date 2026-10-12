import type { Match, PlayerState, RoundReport } from '../engine/match.js';
import { activeSynergies, getCharacter } from '../engine/team.js';
import { loadContent } from '../shared/content.js';
import type { ClientMsg, Loc, ServerMsg } from '../shared/protocol.js';
import type { CharacterDef, Unit } from '../shared/types.js';

const content = loadContent();

/** Iniciales para el placeholder de retrato: "Charlotte Linlin (Big Mom)" → "CL". */
function initials(name: string): string {
  return name
    .replace(/\(.*\)/, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** Contenido visual de una carta: retrato placeholder, nombre y datos. Todo con texto, sin imágenes de la serie. */
function cardArt(def: CharacterDef, star = 0): HTMLElement[] {
  const portrait = document.createElement('span');
  portrait.className = 'portrait';
  portrait.textContent = initials(def.name);
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = def.name;
  const meta = document.createElement('span');
  meta.className = 'meta';
  meta.textContent = `${def.cost} oro · ${def.faction}`;
  const stars = document.createElement('span');
  stars.className = 'stars';
  stars.textContent = star > 0 ? '★'.repeat(star) : '';
  return [portrait, name, meta, stars];
}
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const WS_URL = `ws://${location.hostname}:8080`;

let ws: WebSocket;
let playerId = '';
let match: Match | null = null;
let lobby: { id: string; name: string }[] = [];
let readyIds: string[] = [];
let selected: Loc | null = null;
let lastReport: RoundReport | null = null;

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => setStatus('Conectado');
  ws.onclose = () => {
    setStatus('Desconectado. Reconectando…');
    setTimeout(connect, 2000);
  };
  ws.onmessage = (ev) => onServer(JSON.parse(ev.data as string) as ServerMsg);
}

function send(msg: ClientMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function setStatus(text: string) {
  $('status').textContent = text;
}

function showError(text: string) {
  $('error').textContent = text;
  setTimeout(() => {
    if ($('error').textContent === text) $('error').textContent = '';
  }, 4000);
}

function onServer(msg: ServerMsg) {
  switch (msg.type) {
    case 'joined':
      playerId = msg.playerId;
      break;
    case 'lobby':
      match = null;
      lobby = msg.players;
      break;
    case 'state':
      match = msg.match;
      readyIds = msg.ready;
      break;
    case 'round':
      lastReport = msg.report;
      break;
    case 'error':
      showError(msg.message);
      break;
  }
  render();
}

const me = (): PlayerState | undefined => match?.players.find((p) => p.id === playerId);
const nameOf = (id: string) => match?.players.find((p) => p.id === id)?.name ?? id;

function unitName(u: Unit): string {
  return getCharacter(content, u.defId).name;
}

/** Crea el botón de una casilla de tablero o banquillo. */
function slotButton(unit: Unit | null, loc: Loc): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'card';
  btn.type = 'button';
  if (!unit) {
    btn.classList.add('empty');
    btn.textContent = '—';
  } else {
    const def = getCharacter(content, unit.defId);
    btn.dataset.faction = def.faction;
    btn.append(...cardArt(def, unit.star));
  }
  if (selected && selected.zone === loc.zone && selected.index === loc.index) btn.classList.add('selected');
  btn.addEventListener('click', () => onSlotClick(loc));
  return btn;
}

function onSlotClick(loc: Loc) {
  if (!selected) {
    selected = loc;
  } else if (selected.zone === loc.zone && selected.index === loc.index) {
    selected = null;
  } else {
    send({ type: 'move', from: selected, to: loc });
    selected = null;
  }
  render();
}

function shopButton(defId: string | null, index: number, gold: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'card';
  btn.type = 'button';
  if (!defId) {
    btn.classList.add('empty');
    btn.textContent = 'Vendida';
    btn.disabled = true;
    return btn;
  }
  const def = getCharacter(content, defId);
  btn.dataset.faction = def.faction;
  btn.append(...cardArt(def));
  btn.disabled = gold < def.cost;
  btn.addEventListener('click', () => send({ type: 'buy', shopIndex: index }));
  return btn;
}

function renderLobby() {
  $('lobby').hidden = false;
  $('game').hidden = true;
  const list = $('lobby-players');
  list.replaceChildren(...lobby.map((p) => {
    const li = document.createElement('div');
    li.textContent = `⚓ ${p.name}${p.id === playerId ? ' (tú)' : ''}`;
    return li;
  }));
}

function renderGame(m: Match) {
  $('lobby').hidden = true;
  $('game').hidden = false;
  const p = me();

  $('round').textContent = String(m.round);
  $('gold').textContent = String(p?.gold ?? 0);
  $('level').textContent = String(p?.level ?? 1);
  $('hp').textContent = String(p?.hp ?? 0);
  $('cap').textContent = String(Math.min(p?.level ?? 1, content.economy.boardSlots));

  const shop = $('shop');
  shop.replaceChildren(...(p?.shop ?? []).map((id, i) => shopButton(id, i, p?.gold ?? 0)));

  const board = $('board');
  board.replaceChildren(...(p?.board ?? []).map((u, i) => slotButton(u, { zone: 'board', index: i })));

  const bench = $('bench');
  bench.replaceChildren(...(p?.bench ?? []).map((u, i) => slotButton(u, { zone: 'bench', index: i })));

  const sellBtn = $('sell') as HTMLButtonElement;
  sellBtn.disabled = !selected;
  const isReady = readyIds.includes(playerId);
  ($('ready') as HTMLButtonElement).disabled = isReady || !p?.alive || m.phase !== 'prep';
  $('ready').textContent = isReady ? 'Esperando a los demás…' : 'Listo';

  const syn = $('synergies');
  const active = p ? activeSynergies(content, p.board.filter((u): u is Unit => u !== null)) : [];
  syn.replaceChildren(...active.map((s) => {
    const li = document.createElement('li');
    const tier = s.active ? `activo ×${s.active.count}` : 'sin activar';
    const next = s.next ? ` · siguiente en ${s.next.count}` : '';
    li.textContent = `${s.name}: ${s.count} (${tier}${next})`;
    return li;
  }));

  const log = $('log');
  if (!lastReport) {
    log.replaceChildren(textItem('Todavía no hay combates.'));
  } else {
    const items = lastReport.pairs.map((pair) => {
      const winner = pair.winner ? nameOf(pair.winner) : 'empate';
      const dmg = Object.entries(pair.damage).map(([id, d]) => `${nameOf(id)} −${d}`).join(', ');
      return textItem(`${nameOf(pair.a)} vs ${nameOf(pair.b)} → ${winner}${dmg ? ` (${dmg})` : ''}`);
    });
    if (lastReport.byes.length) items.push(textItem(`Descansa: ${lastReport.byes.map(nameOf).join(', ')}`));
    if (lastReport.eliminated.length) items.push(textItem(`Eliminados: ${lastReport.eliminated.map(nameOf).join(', ')}`));
    log.replaceChildren(...items);
  }

  $('players').replaceChildren(...m.players.map((pl) =>
    textItem(`${pl.name}: ${pl.hp} vida${pl.alive ? '' : ' (eliminado)'}${readyIds.includes(pl.id) && m.phase === 'prep' ? ' · listo' : ''}`),
  ));

  if (m.phase === 'finished') {
    setStatus(m.winnerId === playerId ? '¡Eres el Rey de los Piratas!' : `Partida terminada: gana ${nameOf(m.winnerId ?? '')}`);
  } else {
    setStatus(`Ronda ${m.round}`);
  }
}

function textItem(text: string): HTMLLIElement {
  const li = document.createElement('li');
  li.textContent = text;
  return li;
}

function render() {
  if (match) renderGame(match);
  else renderLobby();
}

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  send({ type: 'join', name: ($('name') as HTMLInputElement).value });
});
$('start').addEventListener('click', () => send({ type: 'start' }));
$('reroll').addEventListener('click', () => send({ type: 'reroll' }));
$('levelup').addEventListener('click', () => send({ type: 'levelUp' }));
$('ready').addEventListener('click', () => send({ type: 'ready' }));
$('sell').addEventListener('click', () => {
  if (selected) send({ type: 'sell', loc: selected });
  selected = null;
});

connect();
render();
