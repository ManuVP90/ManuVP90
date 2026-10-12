# One Piece Autochess

Juego web de autobatallas por rondas (estilo Dota Autochess / Teamfight Tactics) ambientado en One Piece.
Reclutas personajes, los colocas en tu tablero, los combinas para activar sinergias de tripulación y
peleas contra otros jugadores hasta quedar como Rey de los Piratas.

## Stack

- **TypeScript** estricto sobre **Node 22**, ESM en todo el proyecto.
- **Motor compartido** (`src/engine/`): reglas puras y deterministas, sin DOM ni red. Cliente y servidor usan el mismo código.
- **Servidor** (`src/server/`): Node + `ws` (WebSocket). Es la autoridad del estado de la partida.
- **Cliente** (`src/client/`): Vite con TypeScript vanilla, sin framework.
- **Contenido** en `data/*.json`, validado al cargarse.
- **Tests**: Vitest.

## Puesta en marcha

```bash
npm install
npm test                # tests del motor, reglas y contenido
npm run validate:data   # valida el JSON de data/
npm run dev:server      # servidor en ws://localhost:8080
npm run dev:client      # cliente en http://localhost:5173
```

Para jugar: abre el cliente en dos pestañas, escribe un nombre en cada una, pulsa *Unirse* y, cuando haya
al menos dos jugadores, *Zarpar* en una de ellas. Compra, mueve piezas al tablero (selecciona una pieza y luego
una casilla) y pulsa *Listo*.

## Estructura

```
data/            contenido: personajes, sinergias y economía (JSON)
src/shared/      tipos, RNG con semilla, carga del contenido y protocolo
src/engine/      tienda, economía, fusión, sinergias y simulador de combate
src/server/      servidor WebSocket, una sala con una partida
src/client/      interfaz web
tests/           tests de motor, contenido y RNG
scripts/         validación de datos
docs/            visión, flujo de trabajo y reglas implementadas
.claude/agents/  definiciones de los agentes de desarrollo
```

Las reglas están en [`docs/design/reglas.md`](docs/design/reglas.md). La visión y el alcance del MVP
están en [`docs/vision.md`](docs/vision.md).

## Agentes de desarrollo

Definidos en [`.claude/agents/`](.claude/agents/) y descritos en [`docs/workflow.md`](docs/workflow.md):
`game-director`, `game-designer`, `lore-keeper`, `balance-designer`, `engine-dev`, `server-dev`, `client-dev`, `qa-tester`.

## Estado

MVP en construcción. Hecho: motor completo de una ronda y de la partida, servidor con partida
en tiempo real, interfaz mínima jugable y 29 tests. Pendiente: ampliar a 30 personajes, mejorar la interfaz
(arrastrar y soltar, animaciones del combate), bots y reconexión de jugadores.
