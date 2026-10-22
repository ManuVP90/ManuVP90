# Beta ronda 5: triaje consolidado

**Nota sobre las versiones.** Las capturas de los testers son de las 08:42–08:48 del 22-10. El commit `60bfdbd` (HEAD, 14:30) toca `classic.js` y `content/*/sel.json` después de esa hora y ya corrige dos hallazgos de esta ronda: la final fallada en la última ronda y la respuesta de sel-020. Los marco abajo como «corregido en HEAD, falta cerrar». Comprobé el resto contra HEAD.

## Valoraciones

| Tester | Perfil | Nota | ¿Lo enseñaría? | Lo que pide para subir |
|---|---|---|---|---|
| Lucía | Lectora casual, Pixel 5, filtro estrecho | 9 | Sí | Más preguntas de El Cosmere para su filtro |
| Marc | Club de lectura, iPhone 13, 4–6 jugadores | 9 | Sí, con reservas | El texto de la final fallada en la última ronda |
| Hannah | Traductora, de/fr/it/es | 9 (DE 9 · FR 8,5 · IT 9 · ES 8,5) | Sí, con reservas | sel-020, el masculino en FR, el «%» y dos frases en DE |
| Ignacio | Dev senior, editor de la Coppermind, iPhone SE, nivel de exigencia 4/4 | 8 | Sí, con reservas | Doble toque en los botones de cambio de pantalla y Ajustes al 200 % |

**Media: 8,75.** No hay nada bloqueante ni grave. El umbral de lanzamiento es una nota mayor que 8 por tester, y solo Ignacio se queda en 8. Sus dos motivos son baratos de arreglar: un guard compartido y un `flex-wrap`.

**Recomendación:** hacer una ronda de arreglos corta con los ítems 1–4 y 6–9. Después, una ronda 6 de verificación con Ignacio y Hannah. El contenido nuevo de El Cosmere (ítem 5) va aparte y no bloquea.

**Arreglos verificados de la ronda 4:** G1, M1 (en parte), M2–M6, m1–m14, m16–m19 y las sugerencias del diario, del informe y de los logros con filtro. m15 está en parte.

## Bloqueante
Ninguno.

## Grave
Ninguno.

## Molesto

**1. El doble toque se cuela en los botones de cambio de pantalla** (Ignacio). Estado: abierto.
- **Qué pasa:** un doble toque en «Ver resultados» de la rápida cae en «Jugar otra vez» y arranca otra partida con el reloj en marcha; se pierde la pantalla de récord. Un doble toque en «Continuar» de la clásica cae en «Empezar mi turno» y se salta «Pasa el móvil» (4 de 4 veces). Con eso no se ve el aviso «Última ronda» ni el del reloj.
- **Comprobado:** el guard de 350 ms solo existe en `app/js/components/question.js:66-71,331`. Ninguna otra pantalla lo usa.
- **Dónde:** `app/js/screens/classic.js:320-324` (handoff), `app/js/screens/quick.js:297` (jugar otra vez) y es probable que también en la victoria de la clásica (`classic.js:585-596`).
- **Arreglo:** un helper compartido que ignore los toques durante `INPUT_GUARD_MS` en las acciones principales de una pantalla recién pintada, más un test en `tools/edge.mjs`.
- Impacto alto · esfuerzo bajo · ya.

**2. Ajustes y la preparación de la clásica se rompen con el texto al 200 %** (Ignacio). Estado: abierto.
- **Qué pasa:** en Ajustes, «Idioma» y «Tema» salen con una letra por línea y el selector se sale de la tarjeta (scrollWidth 364 con 320 px de ancho). En la preparación, «Jugadores» se parte en «Jug/ado/res».
- **Comprobado:** `app/css/app.css:368` tiene `.row-setting{display:flex;justify-content:space-between}` sin `flex-wrap`. Además, `.row-label` (`app.css:370`) tiene `min-width:0`, y eso permite que la etiqueta se encoja hasta una letra.
- **Arreglo:** `flex-wrap: wrap` y un `min-width` razonable en la etiqueta.
- Impacto medio (accesibilidad) · esfuerzo bajo · ya.

**3. En la última ronda, a quien falla la final se le promete un «próximo turno» que no existe** (Marc). Estado: corregido en HEAD, sin test.
- **Comprobado:** `classic.js:518` y `classic.js:521` usan ahora `isClosingRound(state)` con las cadenas `classic.finalFailLast` y `classic.lastChanceGone` (`app/i18n/es.json:186-187`).
- **Falta:** un grep de `finalFailLast|lastChanceGone` en `tools/*.mjs` no encuentra nada, así que no hay test de regresión. Lo exige la regla «cada arreglo lleva su test» y hay que añadirlo en `tools/edge.mjs` para los dos casos: fallar la final y el tercer acierto seguido que infunde la última gema.
- Impacto medio · esfuerzo bajo · ya.

**4. sel-020: la respuesta «poción que lo/la imita» no se entiende en es, de y fr** (Lucía, Hannah). Estado: respuesta corregida en HEAD, quedan dos flecos.
- **En HEAD:** es «Bebe una poción que imita el Shaod», de «…der den Shaod vortäuscht», fr «…qui imite le Shaod».
- **Fleco nuevo:** el glosario dice para es «LA Shaod (feminine)» (`content/glossary.json:7877`). Hoy `content/es/*.json` tiene 3 «el Shaod» + 1 «del Shaod» frente a 3 «la Shaod». Hay que unificar a femenino y pasar `node tools/check-terms.mjs es`.
- **Fleco de Lucía:** la explicación («Toma un antídoto…») sigue sin mencionar el veneno, así que no casa con la respuesta. Conviene una explicación del tipo «toma un brebaje que imita los síntomas y luego el antídoto».
- Impacto medio · esfuerzo bajo · ya.

**5. Con el filtro «El imperio final» + «Elantris», El Cosmere solo tiene 2 preguntas y una se repite dentro de la partida** (Lucía). Estado: es un problema de contenido, el motor está bien.
- **Comprobado:** `content/en/cosmere.json` tiene 2 preguntas con `work` final-empire o elantris (cosmere-016 d1 y cosmere-063 d4). `app/js/data.js:184-199` ya agota las preguntas sin usar antes de reciclar.
- **Arreglo:** escribir 4–6 preguntas de El Cosmere verificables en esos dos libros, a ser posible de dificultad 1–2, y revisar la misma cobertura para otros filtros típicos de lectores nuevos.
- Impacto medio · esfuerzo medio · corto plazo.

## Menor

**6. Las partidas en grupo suben Colección, «Compendio» y «Medio Cosmere»** (Lucía, Hannah).
- **Comprobado:** `app/js/core.js:154-161`: `getDiscovered()` no distingue el modo, y `achievements.js:40-41` se basa en ella.
- **Contradicción:** la nota de la app dice «Las partidas en grupo solo cuentan para los logros de grupo» (`es.json:511`).
- Decisión del dueño (ver preguntas). Impacto bajo · esfuerzo bajo · ya.

**7. En Fácil sale una de experto y el texto promete «alguna media»** (Lucía).
- **Comprobado:** cuando se agota el rango del nivel, `data.js:191-193` acepta cualquier dificultad sin usar. La descripción está en `es.json:76`.
- **Arreglo:** cambiar el texto a «si se agotan, alguna más difícil» en los 5 idiomas, o mejor, traer primero la dificultad más cercana. Bajo · bajo · ya.

**8. El «%» de la colección queda solo en otra línea y no respeta la tipografía de cada idioma** (Hannah).
- **Comprobado:** `app/js/screens/stats.js:77` lleva `` ` · ${pct(...)} %` `` a mano. Ya existe la cadena `victory.percent` (fr `{n} %`, it `{n}%`, `fr.json:197`).
- **Arreglo:** usar esa cadena. Bajo · bajo · ya.

**9. FR: la interfaz da por hecho que el jugador es un hombre** (Hannah).
- **Comprobado:** `app/i18n/fr.json:289` («Êtes-vous sûr ?») y `:380` («une fois connecté»).
- **Arreglo:** «Voulez-vous vraiment tout effacer ?» y «…quand vous serez en ligne.». Bajo · bajo · ya.

**10. ES roshar-074 y roshar-075: «la honorspren» descarta a Notum por el género** (Ignacio).
- **Comprobado:** en `content/es/roshar.json` los dos enunciados dicen «la honorspren de…» y Notum, que es masculino, está entre las opciones. Esto incumple la regla «sin pistas de género».
- **Arreglo:** un enunciado neutro, por ejemplo «¿Qué honorspren está vinculado a…?». Hay que revisar también la forma de Nova (¿«spren del honor»?), sin marcarla `official` mientras no haya fuente. Bajo · bajo · ya.

**11. DE: dos frases torpes** (Hannah).
- **Comprobado:** nalthis-017 «Rotweberin ist in Hallandren die Göttin wovon?» y roshar-070 «Welchen Beruf…» con la respuesta en plural «Bauern» (`content/de/nalthis.json`, `content/de/roshar.json`).
- Bajo · bajo · ya.

**12. El campo de nombre corta el emoji antes de los 24 caracteres** (Marc).
- **Comprobado:** `classic.js:110` (`maxlength:'24'` cuenta unidades UTF-16) frente a `app/js/text.js:20` (`cleanName` cuenta grafemas).
- **Arreglo:** quitar o subir el `maxlength` y dejar que `cleanName` recorte, con un test en `unit.mjs`. Bajo · bajo · corto plazo.

**13. Con el reloj atrasado, el inicio dice «Hecho hoy» de un reto que es de mañana** (Ignacio).
- **Comprobado:** `app/js/screens/daily.js:29-33` devuelve `'done'` sin mirar el caso `clockBack`, mientras que dentro del reto (`:54`, `:201`) el aviso sí es correcto.
- Bajo · bajo · corto plazo.

**14. DE: los nombres largos del marcador se cortan sin guion** (Hannah; viene de m15, arreglado en parte).
- `hyphens:auto` ya está en `app/css/app.css:320`. En Chromium headless no se puede confirmar si el guion aparece. Pendiente de verlo en un Android real. Bajo · bajo · corto plazo.

## Sugerencias
- **«Copiar informe» no dice a dónde enviarlo** (Lucía). Además, el aviso tapa la explicación durante unos segundos (`es.json:382`). Hace falta un destino que no exija cuenta; decisión del dueño.
- **Gemas del resultado del diario** (Lucía): un rubí rojo de acierto se lee como fallo. Se puede añadir una marca de acierto o fallo encima del color del mundo.
- **Victorias compartidas muy frecuentes en grupos fuertes** (Marc): 44–58 % de las partidas con un 85 % de aciertos. Opciones: un desempate opcional o recomendar Difícil para esos grupos. Medio plazo.
- **DE «Fehler» con dos sentidos** (Hannah): «Fehler melden» junto a «Meine Fehler». Propone «Frage melden» o «Problem melden» (`de.json:375`, `:394`).
- **El aviso de logro tapa el botón Atrás** (Ignacio): que no tape la navegación o que se cierre al tocarlo.
- **`order` guardado en localStorage** (Ignacio, no arreglado): la posición 0 es la respuesta correcta (`app/js/daily.js:72-75`, `classic.pending`). El riesgo es bajo porque `app/data` es público; largo plazo o no se hace.
- **Proceso de la beta** (Ignacio): `/tmp/cosmere-beta-round-5/ignacio/` tiene archivos de otro proceso. Conviene que cada tester use una carpeta propia y única.

## Preguntas para el dueño
1. **Colección y partidas en grupo:** ¿la colección es del dispositivo, y entonces se cambia la nota, o es personal, y entonces se excluyen las partidas en grupo de Compendio y Medio Cosmere?
2. **«Copiar informe»:** ¿a dónde lo envía quien no tiene GitHub? ¿Un correo público del proyecto o nada?
3. **Victorias compartidas:** ¿se aceptan como están o queréis un desempate opcional?
4. **Lanzamiento:** ¿mantenéis el umbral «más de 8 por tester», que obliga a otra ronda por el 8 de Ignacio, o lanzáis tras los arreglos de la sección «ya»?
5. **Contenido de El Cosmere:** ¿quién escribe y verifica las preguntas nuevas sobre «El imperio final» y «Elantris»?
## Decisiones del líder tras la ronda 5
1. **Colección:** es personal; las partidas en grupo tampoco cuentan para la colección ni para «Compendio»/«Medio Cosmere».
2. **«Copiar informe»:** sin correo público; el aviso explica que se puede pegar en GitHub o enviarlo a quien mantiene el juego.
3. **Victorias compartidas:** se aceptan como están (es el objetivo de la ronda completa).
4. **Lanzamiento:** se mantiene el umbral (más de 8 por tester): ronda 6 con Ignacio y Hannah tras los arreglos.
5. **Contenido de El Cosmere para lectores nuevos:** el equipo escribe 6 preguntas (dificultad 1–2) verificables con *El imperio final* y *Elantris*.
