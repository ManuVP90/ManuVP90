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
│   └── design/            ← documentos de diseño por sistema (economía, sinergias, rondas…)
├── data/                  ← fuente de verdad del contenido (JSON)
│   ├── characters/
│   ├── synergies/
│   ├── items/
│   └── economy.json
├── src/
│   ├── shared/            ← tipos y reglas puras compartidas cliente/servidor
│   ├── engine/            ← simulador de combate determinista (sin DOM ni red)
│   ├── server/            ← partidas, matchmaking, autoridad de estado
│   └── client/            ← UI web (tablero, tienda, banquillo)
├── tests/
└── .claude/agents/        ← definición de los agentes especializados
```

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

## Comandos previstos (se fijarán en el scaffold)

- `npm install`
- `npm run dev` — cliente y servidor en local
- `npm test` — tests del motor y de reglas
- `npm run validate:data` — valida el JSON de `data/` contra los esquemas
