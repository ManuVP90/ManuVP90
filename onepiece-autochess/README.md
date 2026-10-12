# One Piece Autochess

Juego web de autobatallas por rondas (estilo Dota Autochess / Teamfight Tactics) ambientado en One Piece.

Este directorio contiene la **estructura de agentes** de desarrollo: contexto compartido, documentos de diseño
iniciales y la definición de ocho agentes especializados.

## Empezar

- Lee [`CLAUDE.md`](CLAUDE.md) para el contexto y las reglas del proyecto.
- Lee [`docs/vision.md`](docs/vision.md) para el alcance del MVP.
- Lee [`docs/workflow.md`](docs/workflow.md) para entender cómo colaboran los agentes.

## Agentes

Definidos en [`.claude/agents/`](.claude/agents/):

| Agente | Rol |
|---|---|
| `game-director` | Coordina y verifica criterios de aceptación |
| `game-designer` | Reglas y sistemas de juego |
| `lore-keeper` | Fidelidad al universo One Piece |
| `balance-designer` | Números, economía y probabilidades |
| `engine-dev` | Motor de combate y reglas puras |
| `server-dev` | Partidas multijugador y estado autoritativo |
| `client-dev` | Interfaz web |
| `qa-tester` | Tests, simulaciones y reportes de fallos |

## Estado

Fase de diseño y estructura. El scaffold de código (`src/`, `data/`, `tests/`) se añade a continuación.
