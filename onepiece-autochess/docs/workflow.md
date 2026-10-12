# Flujo de trabajo de los agentes

Cada agente tiene un rol acotado definido en `.claude/agents/`. El **game-director** coordina y reparte tareas;
los demás trabajan en su área y devuelven el resultado al director.

## Ciclo de una funcionalidad

1. **game-director** descompone la petición en tareas y decide qué agentes participan.
2. **game-designer** escribe o actualiza el documento de diseño en `docs/design/` (qué, por qué, reglas, casos límite).
3. **lore-keeper** revisa nombres, facciones y coherencia con One Piece.
4. **balance-designer** propone números (coste, daño, probabilidades) y los guarda en `data/`.
5. **engine-dev** implementa reglas y combate en `src/engine/` y `src/shared/`, con tests.
6. **server-dev** y **client-dev** integran la funcionalidad en servidor y UI.
7. **qa-tester** escribe o revisa tests de regresión y casos de partida real; reporta fallos con pasos reproducibles.
8. **game-director** verifica que se cumplen los criterios de aceptación y resume el resultado.

## Reglas de coordinación

- Un agente no cambia archivos de otra área sin pedirlo al director, salvo correcciones triviales.
- Los cambios de contenido (`data/`) siempre pasan por lore-keeper y balance-designer antes de fusionarse.
- Si una decisión de diseño cambia una regla del motor, se actualiza primero el documento de diseño.
- Los conflictos de criterio se resuelven en el documento de diseño, no en el chat.

## Agentes

| Agente | Responsabilidad principal | Escribe en |
|---|---|---|
| game-director | Coordinación, prioridades, criterios de aceptación | docs/ (planes) |
| game-designer | Reglas, rondas, economía, sinergias | docs/design/ |
| lore-keeper | Fidelidad al universo One Piece | data/ (revisión) |
| balance-designer | Números y curvas de progresión | data/, docs/design/ |
| engine-dev | Motor de combate y reglas puras | src/engine/, src/shared/ |
| server-dev | Partidas, matchmaking, estado autoritativo | src/server/ |
| client-dev | Interfaz web y experiencia de juego | src/client/ |
| qa-tester | Tests, regresión, partidas simuladas | tests/ |
