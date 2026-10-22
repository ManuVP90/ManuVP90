# Kit de prensa: imágenes

> Proyecto de fans **no oficial**, gratuito y sin ánimo de lucro. No está afiliado ni respaldado por
> Brandon Sanderson ni por Dragonsteel. Todas las imágenes llevan la marca «Proyecto de fans · no
> oficial» / «Fan project · unofficial» y no usan logos, portadas ni arte oficial: solo capturas
> reales de la app, su icono, su paleta de gemas y su fondo azul marino.

Todas están en `docs/marketing/assets/` (PNG, 22 archivos, unos 5,9 MB en total). Hay una versión en español (`-es`) y otra en inglés (`-en`) de cada imagen.

> **Cambio de cumplimiento (22-10-2026):** `feature-graphic-es.png` y `social-card-es.png` decían
> «Trivial del Cosmere…» en el texto pequeño («Trivial» es la marca de Trivial Pursuit en España). Se han
> sustituido por versiones corregidas con el mismo nombre (mismo diseño; el texto
> dice «Juego de preguntas del Cosmere de Brandon Sanderson para jugar en grupo pasándote el móvil.
> Gratis, sin anuncios y sin conexión. 5 idiomas.»). Ver `COMPLIANCE.md`.

## Cómo se hicieron

- **App capturada:** commit `1838199` (v2.0.1), exportado con `git archive` y servido en local. En los
  textos de compartir se ve la dirección pública (`https://manuvp90.github.io/ManuVP90/`) porque las
  peticiones a esa dirección se sirvieron desde la copia local.
- **Dispositivo:** Pixel 7 emulado (Playwright, Chromium), tema oscuro, `es-ES` y `en-US`, y además
  `fr-FR`, `de-DE` e `it-IT` para la imagen de idiomas.
- **Datos:** partidas jugadas de verdad en la app (nada retocado a mano). El filtro de spoilers estaba
  limitado al primer libro de cada saga y a novelas independientes, así que todas las preguntas que se
  ven son de *El camino de los reyes* / *The Way of Kings*. La pregunta principal es `roshar-001`,
  la que propone `COPY.md` §6. Para que saliera esa pregunta se marcaron como vistas recientemente
  las demás de Roshar (mecanismo de la propia app para no repetir preguntas).
- **Estado de partida:** partida clásica de 3 jugadores en Fácil que acaba en victoria compartida;
  partida rápida y reto diario jugados (4 de 5); la racha del reto diario se precargó en 6 días para
  que se vea una racha realista (la app muestra 7 tras jugar hoy). Los nombres son genéricos
  (Ana, Javi, Marta / Sam, Alex, Jordan); no se usan los perfiles de la beta.
- **Composición:** Python + PIL. Tipos: Liberation Serif Bold (el serif con el que la app muestra sus
  títulos en este sistema) e Inter. Las imágenes con la ruleta van a todo color porque su sombreado
  se ve a bandas con 256 colores; el resto va en 256 colores.

## Capturas tipo tienda (1080 × 1920)

| Archivo | Texto de la banda (es / en) | Texto alternativo (es) | Alt text (en) |
|---|---|---|---|
| `store-es-01-wheel.png` · `store-en-01-wheel.png` | **Pásate el móvil, gira la ruleta e infunde las seis gemas.** Partida clásica de 1 a 6 jugadores o equipos con un solo móvil. / **Pass the phone, spin the wheel, infuse all six gems.** Classic game for 1–6 players or teams on a single phone. | Pantalla de la partida clásica con la ruleta de seis mundos (Roshar, Scadrial, Sel, Nalthis, Otros mundos y El Cosmere) y las gemas de cada jugador. | Classic game screen with the wheel of six worlds (Roshar, Scadrial, Sel, Nalthis, Other Worlds and The Cosmere) and each player's gems. |
| `store-es-02-spoiler-filter.png` · `store-en-02-spoiler-filter.png` | **Solo pregunta lo que ya has leído.** Filtro de spoilers: marca tus libros y solo te saldrán preguntas de esos. / **Only asks about what you've read.** Spoiler filter: tick your books and you'll only get questions about them. | Filtro de spoilers en la introducción («¿Qué has leído?»), con una lista de libros del Cosmere para marcar los que ya has leído. | Spoiler filter in the first-run introduction ("What have you read?"), with a list of Cosmere books to tick the ones you've already read. |
| `store-es-03-question.png` · `store-en-03-question.png` | **Casi 500 preguntas por idioma.** Cuatro niveles y tres ayudas: Atium, Luz tormentosa y Aliento. / **Almost 500 questions per language.** Four levels and three lifelines: Atium, Stormlight and Breath. | Pregunta de Roshar de nivel fácil: «¿Qué cuadrilla de puente dirige Kaladin en el ejército de Sadeas?», con cuatro respuestas y las ayudas Atium, Luz tormentosa y Aliento. | Easy Roshar question: "Which bridge crew does Kaladin lead in Sadeas's army?", with four answers and the Atium, Stormlight and Breath lifelines. |
| `store-es-04-shared-win.png` · `store-en-04-shared-win.png` | **Turnos justos, victoria compartida.** Si alguien acierta la final, el resto de la ronda juega su turno. / **Fair turns, shared victories.** If someone answers the final question, the rest of the round still plays. | Pantalla de victoria compartida entre dos jugadores, con el resumen de la partida: aciertos, precisión, ayudas usadas y gemas de cada uno. | Shared victory screen for two players, with the game summary: correct answers, accuracy, lifelines used and gems for each player. |
| `store-es-05-daily.png` · `store-en-05-daily.png` | **Un reto diario para no perder la racha.** 5 preguntas al día y un resultado para compartir sin spoilers. / **A daily challenge to keep your streak.** 5 questions a day and a spoiler-free result to share. | Resultado del reto diario: cinco marcas de acierto o fallo, la puntuación y la racha de días seguidos, con el botón «Compartir resultado». | Daily challenge result: five right-or-wrong marks, the score and the day streak, with the "Share result" button. |
| `store-es-06-achievements.png` · `store-en-06-achievements.png` | **19 logros para desbloquear.** Se guardan solo en tu móvil: sin cuentas y sin rastreo. / **19 achievements to unlock.** Stored only on your phone: no accounts, no tracking. | Pantalla de logros con 5 de 19 conseguidos, cada uno con su gema, su descripción y la fecha en que se consiguió. | Achievements screen with 5 of 19 unlocked, each with its gem, description and the date it was earned. |
| `store-es-07-languages.png` · `store-en-07-languages.png` | **Cinco idiomas, con los nombres de tu edición.** Español, inglés, francés, alemán e italiano. / **Five languages, in your edition's names.** English, Spanish, French, German and Italian. | La misma pregunta de Roshar en francés, alemán e italiano, y debajo el título publicado del primer libro en cada idioma: The Way of Kings, El camino de los reyes, La Voie des rois, Der Weg der Könige y La via dei re. | The same Roshar question in French, German and Italian, and below it the published title of book one in each language: The Way of Kings, El camino de los reyes, La Voie des rois, Der Weg der Könige and La via dei re. |
| `store-es-08-free-offline.png` · `store-en-08-free-offline.png` | **Gratis, sin anuncios y sin conexión.** Una web que se instala en el móvil. Código abierto en GitHub. / **Free, no ads, works offline.** A web app you install on your phone. Open source on GitHub. | Pantalla de inicio con los modos de juego: partida clásica, partida rápida, práctica y reto diario. | Home screen with the game modes: classic game, quick game, practice and daily challenge. |

Si solo hacen falta 6, recomiendo 01, 02, 03, 05, 07 y 04.

## Gráfico destacado (1024 × 500)

| Archivo | Texto | Texto alternativo |
|---|---|---|
| `feature-graphic-es.png` (sustituye a `feature-graphic-es.png`) | Icono de la app, «Trivia del Cosmere», «Seis mundos, un móvil y ningún spoiler.», presentación corta y la marca de proyecto no oficial. | es: Logotipo de Trivia del Cosmere junto a dos capturas de la app: la ruleta de seis mundos y una pregunta de Roshar con tres ayudas. |
| `feature-graphic-en.png` | Icono, «Trivia del Cosmere», «Six worlds, one phone, zero spoilers.», presentación corta y la marca. | en: Trivia del Cosmere logo next to two app screenshots: the wheel of six worlds and a Roshar question with three lifelines. |

## Tarjeta para redes (1200 × 630, Open Graph / X / Mastodon)

| Archivo | Texto alternativo |
|---|---|
| `social-card-es.png` (sustituye a `social-card-es.png`) | Trivia del Cosmere, «Seis mundos, un móvil y ningún spoiler.», con las capturas del filtro de spoilers y de una pregunta de Roshar, la dirección manuvp90.github.io/ManuVP90 y la marca «Proyecto de fans · no oficial». |
| `social-card-en.png` | Trivia del Cosmere, "Six worlds, one phone, zero spoilers.", with screenshots of the spoiler filter and a Roshar question, the address manuvp90.github.io/ManuVP90 and the "Fan project · unofficial" mark. |

## Cuadrada (1080 × 1080, Instagram / Discord)

| Archivo | Texto alternativo |
|---|---|
| `square-es.png` | Trivia del Cosmere, «Seis mundos, un móvil y ningún spoiler.», con tres capturas: el filtro de spoilers, la ruleta de seis mundos y el resultado del reto diario. |
| `square-en.png` | Trivia del Cosmere, "Six worlds, one phone, zero spoilers.", with three screenshots: the spoiler filter, the wheel of six worlds and the daily challenge result. |

## Comprobaciones y avisos

- **Spoilers:** solo se ve contenido de *El camino de los reyes* (pregunta `roshar-001` y, en ningún
  sitio visible, otras). La lista del filtro de spoilers muestra títulos de libros posteriores, pero
  solo los títulos. El repaso de fallos está cerrado en todas las capturas.
- **Reto diario:** dentro de la app las cinco marcas son gemas del color de cada mundo (rellena si
  aciertas, solo contorno si fallas); lo que se comparte es ✅/❌. La captura enseña las dos cosas y
  ningún texto habla de «cuadrados de colores».
- **Textos alternativos:** salen de `COPY.md` §6; el del filtro de spoilers se ha adaptado porque la
  captura es la pantalla de la introducción, no la de Ajustes (es el mismo selector).
- **Sin testers:** ninguna imagen cita a los perfiles de la beta.
- **Nombres por idioma:** la imagen de idiomas usa títulos de libro que `content/glossary.json`
  marca como `official` en es, fr, de e it. «Puente Cuatro» y «Ponte Quattro» están marcados como
  `community`, así que no se presentan como nombres oficiales (solo salen dentro de las capturas).
- **Número de preguntas:** la app capturada tiene 496 preguntas por idioma; las imágenes dicen «casi
  500», así que valen con 490 o con 496.
- **Título en inglés:** la app en inglés se llama «Cosmere Trivia» en su pantalla de inicio y en el
  texto de compartir; las imágenes usan «Trivia del Cosmere» como nombre del proyecto, como `COPY.md`.
- **Fecha:** las capturas del reto diario y de los logros muestran el 22 de octubre de 2026 (día en
  que se hicieron).
- **Si cambia la app:** si cambia la interfaz antes del lanzamiento, conviene repetir las capturas.
- **«Código abierto» / «Open source» (`store-*-08-free-offline.png`):** el repositorio no tiene
  licencia, así que en sentido estricto el código es público pero no «abierto». O añades una licencia
  antes del lanzamiento (decisión del dueño, ver `COMPLIANCE.md`) o no uses la captura 08 (la
  selección recomendada de 6 no la incluye).
- **Revisión de cumplimiento:** las 24 imágenes revisadas una a una: sin logos de Dragonsteel, sin
  portadas ni arte oficial (el icono es propio: un diamante con seis gemas), aviso de no oficial en
  todas, solo contenido de *El camino de los reyes* y sin testers.
