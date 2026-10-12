# Reglas implementadas (v0.1)

Este documento describe lo que el motor hace hoy. Los números viven en `data/economy.json`; si cambian, actualiza
aquí y registra el cambio en `docs/design/balance-log.md`.

## Partida

- Jugadores vivos empiezan con **100 de vida**, **nivel 1**, **0 de oro**.
- Cada ronda tiene una fase de **preparación** y, cuando todos los vivos pulsan *Listo*, una fase de **combate**.
- Un jugador eliminado (vida ≤ 0) deja de actuar. La partida termina cuando queda uno.

## Economía

- **Ingreso por ronda** = 5 base + intereses + bonus de racha.
- **Intereses**: 1 de oro por cada 10 guardados, con máximo 5.
- **Racha**: 2 victorias o derrotas seguidas dan bonus de oro (tabla `winStreakBonus`, tope en la última posición).
- **Resetear tienda**: 2 de oro. Las cartas no compradas vuelven al pool.
- **Subir de nivel**: 4, 8, 16, 32 y 48 de oro para los niveles 2 a 6. El nivel limita las piezas en el tablero.
- **Vender**: devuelve el coste de la pieza multiplicado por el número de copias que contiene, y las copias al pool.

## Tienda y pool

- La tienda tiene **5 cartas**. Las probabilidades dependen del nivel (`shopOdds`).
- Cada personaje tiene un número limitado de copias según su coste (`copiesByCost`). Las copias son compartidas
  por todos los jugadores.
- Si no quedan copias del coste elegido, la tirada baja al coste inferior disponible.
- Cada tirada usa una semilla derivada de la semilla de la partida, la ronda y un contador: la partida es reproducible.

## Piezas y fusión

- Banquillo de **9** casillas. Tablero de **8** casillas (2 filas de 4). Piezas en tablero ≤ nivel.
- **Tres copias de la misma estrella se funden** en una pieza de estrella superior, hasta la estrella 3.
- Estrellas multiplican vida y ataque (`starMultiplier`: 1×, 1.8×, 3.2×).

## Sinergias

- Se cuentan las **unidades distintas de cada facción en el tablero** (no el banquillo).
- Se activa el tier más alto alcanzado (`synergies.json`). Un tier da bonus de vida, ataque, armadura o
  reducción de enfriamiento a las piezas de esa facción del jugador.

## Combate

- Tablero de 4×4. El jugador 0 ocupa la mitad inferior y el jugador 1 la superior, con las filas de delante enfrentadas.
- Cada tick actúa cada unidad viva, en orden de id: busca el enemigo más cercano (distancia Manhattan).
  1. Si tiene maná lleno, lanza su habilidad:
     - `bonus_damage`: daño directo, ignora armadura.
     - `heal_ally`: cura al aliado con menos porcentaje de vida (puede curarse a sí misma).
  2. Si el enemigo está a su alcance y su enfriamiento ha terminado, ataca.
     Daño = max(1, ataque − armadura del objetivo). Gana 10 de maná por ataque; el objetivo gana 5.
  3. Si no, avanza una casilla hacia el objetivo, esquivando las ocupadas.
- Límite de **120 ticks**. Gana el bando con más supervivientes; con igual número, empate.
- No hay aleatoriedad en el combate: el mismo tablero da siempre el mismo log.

## Daño entre jugadores

- Al perder un combate, el jugador pierde **1 + supervivientes del ganador** de vida.
- Empate: nadie recibe daño.
- En cada ronda los jugadores vivos se emparejan en orden aleatorio con semilla. Con número impar, uno descansa.
