# Beta ronda 4: informe consolidado

**Notas:** Lucía 8, Marc 8, Hannah 8, Ignacio 7. **Media: 7,75/10.** El requisito para lanzar era que todas las pruebas superaran el 8/10, y no se cumple: Ignacio pone un 7 y responde «todavía no» por el fallo G1. Él mismo dice que subiría a 8 si se arregla el doble toque.

| Tester | Perfil | Nota | Recomendación | Lo que más pesa |
|---|---|---|---|---|
| Lucía | Lectora casual, Pixel 5, es-ES, juega sola | 8 | sí, con reservas | La clásica en Fácil repite la pregunta de «El Cosmere» |
| Marc | Club de lectura, iPhone 13, mesa de 2 a 6 jugadores | 8 | sí, con reservas | El progreso del grupo cuenta para el dueño del móvil; el orden de los asientos pesa |
| Hannah | Traductora, Galaxy S23, de-DE | 8 (DE 8,5 · FR 8 · ES 8 · IT 7,5) | sí, con reservas | Detalles de traducción; IT scadrial-084 ambigua |
| Ignacio | Dev senior y editor de la Coppermind, iPhone SE 320x568 | 7 | todavía no | Doble toque en «Siguiente» (grave) |

Comprobaciones comunes que no son fallos:
- No hubo ni un error de consola en ningún recorrido.
- El filtro de spoilers no deja escapar nada: 0 fugas en todos los recorridos.
- Las 30 preguntas nuevas tienen datos correctos según Marc e Ignacio. Hay dos dudas de procedencia, en M5 y M6.
- El temporizador cumple la regla del líder.
- La copia de seguridad funciona bien y rechaza códigos manipulados.
- La DE está a nivel editorial.

---

## Bloqueante
Ninguno.

## Grave

### G1. Un doble toque en «Siguiente» responde la pregunta siguiente
- **Afecta a:** partida rápida, reto diario y clásica.
- **Lo encontró:** Ignacio. Se reprodujo 6 de 6 veces: 4 en la rápida y 2 en el reto diario.
- **Qué pasa:** en 320x568, el segundo toque cae sobre la opción D de la pregunta nueva y la responde.
  - En el reto diario se pierde el único intento del día.
  - Ese toque cuenta como fallo y la pregunta entra en «Mis fallos».
- **Verificado en el código:** `/home/user/ManuVP90/app/js/components/question.js:65` guarda `shownAt`, pero solo lo usa para medir el tiempo de respuesta (`:217`). La función que responde (`:185`) solo comprueba `answered` y el diálogo abierto. No hay ninguna espera que ignore los toques justo después de pintar la pregunta.
- **Arreglo propuesto:**
  - Ignorar los toques que lleguen menos de unos 350 ms después de `shownAt`.
  - O desactivar «Siguiente» en cuanto se pulsa la primera vez.
- **Test de regresión:** en `/home/user/ManuVP90/tools/edge.mjs`.
- **Coste:** esfuerzo bajo, impacto alto. Hacerlo ya.

## Molesto

### M1. La clásica en Fácil con un filtro estrecho repite la misma pregunta de «El Cosmere» seguida
- **Lo encontró:** Lucía, en 2 de 2 partidas.
- **Qué pasa:** con solo «El imperio final» y «Elantris» marcados, El Cosmere tiene cosmere-016 (dificultad 1) y cosmere-063 (dificultad 4).
  - Fácil solo admite dificultades 1 y 2, así que cuando cosmere-016 ya ha salido se vuelve a sacar la misma.
  - La segunda vez el jugador se sabe la respuesta y la gema sale regalada.
- **Verificado en el código:**
  - `/home/user/ManuVP90/app/js/config.js:50`: Fácil tiene `easy: { weights: { 1: 100 } }`.
  - `/home/user/ManuVP90/app/js/data.js:48-51`: `levelRange` deja el rango en [0,2].
  - `/home/user/ManuVP90/app/js/data.js:183-191`: con rango [0,2] y cosmere-016 ya usada, `near` queda vacío, se usa `counts = all` y se recicla cosmere-016.
  - El comentario de `Pool` dice que la pregunta recién mostrada no vuelve enseguida, pero en este caso solo hay una candidata, así que vuelve.
- **Arreglo propuesto:** cuando no queda ninguna pregunta sin usar dentro del rango, ampliar a cualquier dificultad sin usar antes de reciclar.
- **Coste:** esfuerzo bajo-medio. Hacerlo ya.

### M2. La clásica en grupo se apunta entera al dueño del móvil
- **Lo encontró:** Marc.
- **Qué pasa:** las estadísticas, «Mis fallos» y los logros suman lo que hace todo el grupo. Por ejemplo, se desbloquean «Primera victoria» y «Seis gemas sin un fallo» aunque el dueño del móvil hizo 0 de 4.
- **Pendiente:** Marc lo trae como hallazgo propio de su prueba; en el código solo he revisado la lógica del diario y el sorteo de preguntas.
- **Arreglo propuesto:**
  - Paso mínimo ya: un aviso en Estadísticas y Logros («el progreso es del dispositivo»).
  - A corto plazo: en partidas de 2 o más jugadores, no meter fallos en «Mis fallos» y no dar logros individuales.
- **Coste:** esfuerzo bajo para el aviso, medio para separar el progreso.

### M3. El reto diario se puede repetir si el reloj del móvil va hacia atrás
- **Lo encontró:** Ignacio.
- **Verificado en el código:**
  - `/home/user/ManuVP90/app/js/daily.js:144`: cuando la fecha es anterior al último reto, `if (s.last && s.last > date) { s.played++; return s; }` solo suma `played` y no guarda el resultado.
  - `/home/user/ManuVP90/app/js/screens/daily.js:29,39`: el resultado solo se muestra si `d.last === day`, así que vuelve a salir la intro con «Empezar el reto».
- **A quién le pasa:** también sin hacer trampa, a quien viaja hacia el oeste.
- **Arreglo propuesto:** guardar las fechas jugadas (o el último resultado por fecha) y bloquear cualquier fecha menor o igual que `last`.
- **Coste:** esfuerzo bajo, con test en `/home/user/ManuVP90/tools/unit.mjs`. Corto plazo.

### M4. Estadísticas no cabe en pantalla con el texto al 200 %
- **Lo encontró:** Ignacio.
- **Qué pasa:** en 320 px, la página mide 537 de ancho (`scrollWidth`) y las tarjetas `.tile` se salen de la pantalla.
- **Arreglo propuesto:** pasar la cuadrícula de Estadísticas a una columna en anchos pequeños, en `/home/user/ManuVP90/app/css/app.css`.
- **Coste:** esfuerzo bajo. Corto plazo.

### M5. IT scadrial-084: el orden de palabras invierte quién mata a quién
- **Lo encontró:** Hannah.
- **Verificado en el contenido:** `/home/user/ManuVP90/content/it/scadrial.json:917` dice «quale governante ha ucciso in segreto Salassa». Se lee primero como «qué gobernante mató a Salassa».
- **Arreglo propuesto:** «…è stato ucciso in segreto da Salassa…».
- **Coste:** esfuerzo bajo. Hacerlo ya.

### M6. Orden de los asientos con grupos que aciertan mucho
- **Lo encontró:** Marc, con una simulación propia.
- **Datos:** con 6 jugadores y un 85 % de aciertos, el que empieza gana el 32 % de las partidas y el sexto el 6,5 %.
- **Arreglo propuesto:** una opción «terminar la ronda» para que todos tengan los mismos turnos. Es una decisión de diseño del dueño.
- **Coste:** esfuerzo medio. Medio plazo.

## Menor

| # | Hallazgo | Testers | Evidencia / archivo |
|---|---|---|---|
| m1 | Fácil dice «Solo preguntas fáciles» pero, a propósito, saca preguntas de dificultad 2 | Lucía | `/home/user/ManuVP90/app/i18n/es.json:73` (`easyDesc`); `data.js:183-186` |
| m2 | Textos que no se adaptan al filtro: «de todos los mundos» y «las seis gemas» | Lucía | `es.json:196` (intro de la rápida) y `:22` (`classicDesc`) |
| m3 | Al reanudar, la pantalla de pasar el móvil no avisa de que el reloj ya corre; «Continuar partida» no dice de quién es el turno | Marc, Ignacio | Capturas t-resume-handoff.png y 34-final-after-reload.png; en el caso de Ignacio se perdió la final por tiempo sin verla |
| m4 | En «Acerca de» faltan la regla del tiempo, qué pasa al fallar la final y que en solitario no hay tope de 3 aciertos | Marc | `es.json:306` (`rule5`) |
| m5 | scadrial-006 (work final-empire) usa «Hemalurgy»; el término probablemente no aparece hasta El Pozo de la Ascensión (a verificar) | Lucía | `/home/user/ManuVP90/content/en/scadrial.json:124` |
| m6 | scadrial-085: lo de que MeLaan dio el pendiente parece venir de una WoB, no del libro (¿`work` = wob?) | Marc (Ignacio lo da por correcto) | `content/en/scadrial.json`, scadrial-085 |
| m7 | roshar-087 (y la explicación de roshar-094) revela la respuesta de roshar-085 (Navani); la explicación de scadrial-085 casi resuelve scadrial-090 | Ignacio | `content/en/roshar.json`, `content/en/scadrial.json` |
| m8 | Glosario: «Rabeniel» (es) marcado `official` solo por es.coppermind, lo que incumple la regla de oro | Ignacio | `/home/user/ManuVP90/content/glossary.json`, término Raboniel |
| m9 | Glosario: notas triplicadas (Raboniel, crem, Sibling, Set, Bleeder, Nightwatcher); parece que la fusión de revisiones no es idempotente | Ignacio | Confirmado en Raboniel y crem; revisar `/home/user/ManuVP90/tools/merge-glossary.mjs` |
| m10 | FR «crème» por «crem», sin verificar | Hannah | `/home/user/ManuVP90/content/fr/roshar.json:98`; el glosario confirma «unverified» |
| m11 | DE: Dor con dos géneros («das Dor» en sel-049, «der/den Dor» en sel-050) | Hannah | `/home/user/ManuVP90/content/de/sel.json:50-51` (confirmado) |
| m12 | DE: Ba-Ado-Mishram en masculino (roshar-088, -092); fr, it y es también usan masculino genérico | Hannah | `/home/user/ManuVP90/content/de/roshar.json:89,93` |
| m13 | DE roshar-100: la explicación dice «fünfte Band» cuando para el lector alemán son los tomos 11 y 12 | Hannah | `content/de/roshar.json:101` |
| m14 | DE: registro de la interfaz poco uniforme («abhaken»/«anhaken», «Partie»/«Spiel»); «2000» frente a «2.168» | Hannah | `/home/user/ManuVP90/app/i18n/de.json:332, :261, :82`, `ach.quickScore.desc` |
| m15 | DE: nombres largos del marcador cortados sin guion | Hannah | `/home/user/ManuVP90/app/css/app.css:317` (`overflow-wrap: anywhere`; añadir `hyphens: auto`) |
| m16 | ES: apóstrofos rectos | Hannah | `content/es/nalthis.json` (5× «T'Telir» y 1× «T’Telir»), `content/es/sel.json` (4× «ulla'dil») — confirmado |
| m17 | Con el texto al 200 % se parten palabras en las opciones y el «30» del temporizador se sale del aro; a 320 px, la etiqueta «Luz tormentosa» se sale del botón | Ignacio | 61-quick-200.png, 23-stormlight-saved.png |
| m18 | El aviso «Marca al menos una obra» se pinta encima de la lista en la introducción | Marc | 01-onb-read.png |
| m19 | El botón «Acerca de» del inicio se parte en dos líneas en 393 px | Lucía | 05-home.png |

## Sugerencias

- **Compartir el reto diario.** Se entiende mal qué es acierto y qué es fallo (Lucía, Ignacio, Hannah): el 🟥 de Scadrial parece un fallo y el ⬜ de El Cosmere parece una casilla vacía. Hannah también pide la fecha en formato local en vez de ISO. Código: `/home/user/ManuVP90/app/js/daily.js:155-156`. Esfuerzo bajo.
- **«Reportar esta pregunta» exige una cuenta de GitHub** (Lucía, Marc). Alternativa sin servidor: un botón «Copiar informe», que ya existe sin conexión, o un `mailto:`. Hannah añade que la plantilla mezcla español e inglés (`/home/user/ManuVP90/app/js/report.js:22-40`). Lo decide el dueño.
- **Logros imposibles con el filtro activo**, como «Compendio» o «Medio Cosmere» (Lucía). Basta una nota como la de Colección.
- **Obras del filtro sin ninguna pregunta** (emberdark, mistborn-misc), según Marc. Marcarlas como «sin preguntas todavía».
- **Comodín con un solo mundo libre** (Hannah). Cambiar el texto o saltar directamente a ese mundo.
- **DE:** reformular la descripción del logro «Vom Sturmlicht gerettet» (Hannah).
- **Reto en curso:** el `order` guardado deja ver la respuesta (Ignacio). Riesgo bajo.
- **Importar progreso:** acotar `bestQuick` a 3000 en `sanitizeStats` (`/home/user/ManuVP90/app/js/progress.js`), según Ignacio.
- **«Reportar»** suena a anglicismo en español; alternativa: «Avisar de un error» (Hannah).

---

## Estado del lanzamiento

- **Condición del dueño, todas las notas por encima de 8: no se cumple.** Ignacio pone un 7 y la media es 7,75. No hay que preparar el lanzamiento en esta ronda.
- **Ruta más corta para lanzar.** Arreglar G1 (requisito de Ignacio) junto con M1, M5, m16, m11 y m8. Son cambios pequeños y cada uno lleva su test. Después, una ronda 5 corta solo con Ignacio y Lucía.
- **Riesgos:**
  - La espera tras pintar la pregunta, si es demasiado larga, puede molestar a quien responde rápido en la partida rápida. 300-400 ms es razonable.
  - Si se toca el contenido, hay que mantener los mismos ids en los 5 idiomas y regenerar `app/data/`.
- **No hay archivo de las rondas 2 a 4:** en `/home/user/ManuVP90/docs/` solo existe `BETA-1.md`.

**Preguntas que solo puede responder el dueño:**
1. Para «Fácil», ¿se cambia el texto («sobre todo fáciles») o se impide de verdad que salgan preguntas de dificultad 2?
2. ¿Las partidas multijugador deben contar en las estadísticas, los logros y «Mis fallos» del dueño del móvil?
3. ¿Se añade la opción «terminar la ronda» a la clásica?
4. ¿Se ofrece una forma de reportar sin GitHub (copiar el informe o correo)? ¿Con qué dirección?
5. En las preguntas que vienen de una WoB (scadrial-085), ¿se etiquetan como `wob` o se reformulan?
6. ¿Basta con que Ignacio vuelva a probar el arreglo de G1, o hace falta otra ronda completa con los cuatro testers?
## Decisiones del líder tras la ronda 4

1. **Fácil:** el texto pasa a «Sobre todo preguntas fáciles» (si se agotan, alguna media); y cuando no queda
   ninguna pregunta sin usar en el rango del nivel, se amplía a cualquier dificultad sin usar antes de repetir.
2. **Partidas en grupo (2+ jugadores):** no cuentan en las estadísticas personales, «Mis fallos» ni en los logros
   individuales; se registran aparte como partidas en grupo (los logros de grupo, como «Mesa completa», sí cuentan).
3. **Ronda completa:** nueva opción en la clásica (activada por defecto con 2+ jugadores): si alguien acierta la
   final, los jugadores que faltan en esa ronda juegan su turno; quien también acierte la final comparte la victoria.
4. **Avisar de un error:** el enlace se renombra y, además de abrir GitHub, ofrece «Copiar informe» para quien no
   tenga cuenta.
5. **Hechos que solo vienen de Palabras de Brandon:** se etiquetan `work: "wob"`.
6. **Validación:** ronda 5 completa con los cuatro testers; el lanzamiento se prepara solo si todas las notas
   superan el 8.
