# Visión del juego

## Concepto

Un autochess para navegador ambientado en One Piece. Cada jugador es capitán de una tripulación en el Grand Line.
En cada ronda gana oro, compra personajes de una tienda compartida, los coloca en su tablero y se enfrenta a otro
jugador en una batalla automática. El que conserva la tripulación más fuerte al final gana el título de Rey de los Piratas.

## Público

- Fans de One Piece que conocen a los personajes y quieren una estrategia de tablero.
- Jugadores de autochess (Dota Underlords, TFT) que buscan una temática nueva.

## MVP (primera versión jugable)

- 8 jugadores por partida (o 1 contra bots para pruebas).
- 30 personajes en 6 facciones y 4 Frutas del Diablo como objetos.
- Tienda de 5 cartas por ronda, banquillo de 9 y tablero de 8 casillas en 2 filas.
- Combate automático determinista, con registro de la batalla reproducible.
- Sinergias por facción (2/4/6 miembros) y mejoras de estrella al combinar tres copias.
- Economía: ingresos por ronda, intereses por oro guardado y racha de victorias.

## Fuera de alcance del MVP

- Cuentas persistentes y progresión entre partidas.
- Tienda de cosméticos.
- Más de 30 personajes o modos de juego alternativos.
- Versiones móviles nativas.

## Métricas de éxito

- Una partida completa de 8 jugadores se juega sin errores de sincronización.
- El 100% de las batallas puede repetirse a partir de su semilla.
- Ningún personaje queda fuera de su rol o facción sin una razón documentada.
