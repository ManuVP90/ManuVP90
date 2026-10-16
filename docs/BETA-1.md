# Beta 1 — informe de testers (16/10/2026)

Cuatro testers, de menos a más exigente, jugaron con la app real en móviles emulados.

| Tester | Perfil | Nota | En una frase |
|---|---|---|---|
| Lucía | Lectora ocasional (2 libros), Android | 7/10 | «Bonita y clara, y el filtro de spoilers funciona; pero me salió 5 veces la misma pregunta.» |
| Marc | Club de lectura, iPhone, 4–6 jugadores | 7/10 | «Para la mesa funciona; con 6 no veo de quién es el turno y quien empieza tiene ventaja.» |
| Hannah | Traductora alemana, lo ha leído todo en alemán | 7/10 | «El alemán es mejor de lo esperado, pero "Roshar" en la etiqueta y "Roschar" en la pregunta chirría.» |
| Ignacio | Dev + editor de la Coppermind, rompe cosas | 6/10 | «El contenido aguanta mi auditoría; la app, cuando te sales del camino feliz, no.» |

**Lo mejor según todos:** el filtro de spoilers no filtró nada indebido (Lucía comprobó 43 preguntas); el paso
del móvil está bien resuelto; los comodines se entienden; Ignacio verificó contra la Coppermind los datos más
rebuscados y todos eran correctos; el alemán coincide en general con Heyne y Piper; cero errores de consola en el uso normal.

## Hallazgos priorizados (sin duplicados)

### Grave — arreglar antes de difundir
1. **Un guardado corrupto deja la app inservible para siempre** (pantalla en inglés, ni siquiera se llega a Ajustes
   para borrar datos). Validar la partida guardada a fondo y, si falla, descartarla; pantalla de error traducida con
   botón «Borrar datos y reiniciar». *(Ignacio; `game.js` `isValidState`)*
2. **Recargar o pulsar Atrás a mitad de pregunta reinicia el temporizador a 30 s** → tiempo infinito en la clásica.
   Además, al reanudar se salta la pantalla «pasa el móvil». Guardar el instante de inicio y volver a la pantalla de
   paso. *(Ignacio, Marc; `question.js`)*
3. **Partida rápida: Atrás + Cancelar y otro Atrás sacan de la app**, y recargar pierde la partida sin aviso.
   *(Ignacio; `core.js` historial, `quick.js`)*
4. **Repeticiones con el filtro de spoilers estrecho**: en rápida, la única pregunta fácil de un mundo salió 5 de 15
   veces. Repartir por preguntas disponibles, no por mundos, y no repetir mientras queden otras. *(Lucía; `quick.js:26`,
   `data.js`)*
5. **Ventaja del primer jugador**: con un grupo experto, el 31 % de las partidas acaba sin que alguien juegue y el
   jugador 1 gana el 35 %. Sortear quién empieza y limitar los aciertos seguidos por turno (p. ej. 3). *(Marc; simulación)*

### Molesto
6. Con 5–6 jugadores el marcador no enseña al que tiene el turno (carrusel sin indicador). *(Marc)*
7. Nombres que empiezan por emoji muestran «�» como inicial. *(Marc)*
8. Móvil en catalán → la app sale en inglés. Para ca/gl/eu, caer a español. *(Marc)*
9. Alemán: etiqueta «Roshar» frente a «Roschar» en las preguntas; «{name} ist dran» se trunca justo en el verbo;
   errores puntuales (cosmere-051, cosmere-043, otros-026, sel-040, cosmere-021; «Sprengsel» das/der); nombres de
   *Das Herz der Sonne* en inglés aunque hay edición alemana (Nomade, etc.); sel-045 usa el título inglés. *(Hannah)*
10. El temporizador sigue corriendo detrás del diálogo de abandonar. *(Ignacio)*
11. Con un guardado de forma rara, «Continuar partida» no hace nada. *(Ignacio)*

### Menor / sugerencias
- El DOM delata la respuesta (`data-idx="0"` siempre es la correcta). *(Ignacio)*
- Armar Luz tormentosa y luego usar Aliento gasta la Luz sin efecto. *(Ignacio)*
- La pregunta final puede ser una ya acertada en la misma partida. *(Ignacio)*
- Atium + Luz tormentosa en la misma pregunta garantiza el acierto (¿prohibir combinarlos?). *(Ignacio)*
- Preguntas que regalan la respuesta de otra (cosmere-041/042, roshar-036, cosmere-046/055…). *(Ignacio)*
- Aliento desactivado sin explicar por qué en pantalla. *(Lucía)*
- Primera vez: preguntar «¿qué has leído?» en lugar de esconder el filtro en Ajustes. *(Lucía)*
- «Comodín» se usa para el sector de la ruleta y para las ayudas. *(Marc)*
- La regla «gema ya infundida = comodín» no está en «Acerca de» y el aviso dura 1 s. *(Marc)*
- Texto al 200 % en 320 px trunca la cabecera; «Luz tormentosa» se parte a mitad de palabra. *(Ignacio)*
- Idioma inválido guardado → inglés en vez del idioma del móvil. *(Ignacio)*
- FR: «Meilleur score: » sin espacio fino; IT cosmere-021 «detenuti»; DE apóstrofos rectos. *(Hannah)*
- Victoria: estadísticas por jugador; práctica con 0 preguntas debería explicar el motivo. *(Marc, Ignacio)*

Capturas, scripts y registros de cada tester: `/tmp/claude-0/-home-user-ManuVP90/e05cb330-3b92-587b-816a-ee3c94e47988/scratchpad/beta/<tester>/`
(local a esta sesión).
