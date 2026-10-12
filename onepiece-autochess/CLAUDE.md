# One Piece Autochess — contexto del proyecto

Juego web de autobatallas por rondas (estilo Dota Autochess / Teamfight Tactics) ambientado en el universo One Piece.
El jugador recluta personajes, los coloca en un tablero hexagonal/cuadrado, los combina para activar sinergias y
pelea contra otros jugadores (o bots) hasta quedar como último pirata en pie.

## Pilares de diseño

1. **Respeto al universo**: tripulaciones, Frutas del Diablo, Haki, Mares y Logue Town/Isla Gyojin, etc. son
   identidad visual y mecánica. Las sinergias salen de facciones reales (Piratas de Sombrero de Paja, Marina,
   Yonko, Revolucionarios, Cazarrecompensas…).
2. **Decisiones rápidas, lecturas profundas**: cada ronda tiene una decisión clara (comprar, mover, mejorar) con
   suficiente profundidad estratégica.
3. **Web primero**: se juega en navegador, sin instalación. Cliente en TypeScript; servidor autoritativo para
   partidas multijugador.
4. **Datos, no código**: personajes, objetos y sinergias viven en `data/` (JSON validado), no hardcodeados.

## Estructura del repositorio

```
onepiece-autochess/
├── CLAUDE.md              ← este archivo (contexto compartido por todos los agentes)
├── README.md
├── docs/
│   ├── vision.md          ← visión, público y alcance del MVP
│   ├── workflow.md        ← cómo colaboran los agentes
│   └── design/reglas.md   ← reglas que el motor implementa hoy (fuente de verdad del diseño)
├── data/                  ← contenido (JSON validado al cargar)
│   ├── characters.json    ← personajes
│   ├── synergies.json     ← facciones y tiers
│   └── economy.json       ← economía, tienda, combate
├── src/
│   ├── shared/            ← tipos, RNG con semilla, carga de contenido, protocolo cliente-servidor
│   ├── engine/            ← tienda, economía, fusión, sinergias y simulador de combate (puro)
│   ├── server/            ← servidor WebSocket autoritativo (una sala, una partida)
│   └── client/            ← interfaz web en Vite + TypeScript
├── tests/                 ← Vitest: motor, contenido, RNG
├── scripts/validate-data.ts
└── .claude/agents/        ← definición de los agentes especializados
```

## Stack

TypeScript estricto en ESM, Node 22, `ws` para el servidor, Vite para el cliente, Vitest para los tests.
Decisiones de pila: el motor no depende de DOM ni de red; el servidor es la única fuente de verdad de la partida.

## Reglas para todos los agentes

- Antes de tocar contenido, lee `docs/design/` y los JSON de `data/` relacionados.
- El **lore-keeper** valida nombres, facciones y referencias a One Piece. Nada entra al juego sin su revisión.
- Los cambios de números (costes, daño, probabilidades) pasan por el **balance-designer** y se documentan en `docs/design/`.
- El motor de combate debe ser **determinista** a partir de una semilla; sin `Math.random()` directo.
- Tipos y reglas compartidos viven en `src/shared/`. No duplicar lógica entre cliente y servidor.
- Todo cambio de lógica incluye tests en `tests/`.
- No se publican imágenes ni textos con marca de terceros sin licencia; los assets de personajes son placeholders
  hasta acordar su origen.
- Commits pequeños en español o inglés, con prefijo por área: `engine:`, `client:`, `server:`, `data:`, `docs:`.

## Comandos

- `npm install`
- `npm run dev:server` — servidor en `ws://localhost:8080`
- `npm run dev:client` — cliente en `http://localhost:5173`
- `npm run typecheck` — comprobación de tipos
- `npm test` — tests del motor, contenido y RNG
- `npm run validate:data` — valida el JSON de `data/`
