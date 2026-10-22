# Plan de lanzamiento: Trivia del Cosmere v2.0.x

> Proyecto de fans **no oficial**, gratuito y sin ánimo de lucro. No está afiliado ni respaldado por
> Brandon Sanderson ni por Dragonsteel. Este plan lo ejecuta una sola persona (ManuVP90) en unas
> **dos semanas**. Los agentes solo redactan; **todo lo publica el dueño**.

- **Enlace previsto:** https://manuvp90.github.io/ManuVP90/ (aún no está activo, ver la lista de
  comprobación).
- **Día L (lanzamiento):** la fecha la fija el dueño cuando se cumpla la lista de comprobación. Todas
  las fechas de abajo son relativas (L-7 … L+14).
- **Tiempo estimado:** unas 10–12 h en total, repartidas en sesiones de 30–60 min.

---

## 1. Posicionamiento

**Frase corta (es):** El juego de preguntas del Cosmere para jugar con tu grupo pasándote el móvil, sin
spoilers de los libros que aún no has leído.

**One-liner (en):** A pass-the-phone Cosmere trivia game for your book club, with a spoiler filter
for the books you haven't read yet.

**Presentación de 30 segundos (es):**
Trivia del Cosmere es un juego de preguntas sobre el Cosmere de Brandon Sanderson, hecho por un fan
con ayuda de agentes de IA. Se juega en un solo móvil: de 1 a 6 jugadores o equipos se lo van pasando, giran
la ruleta de los seis mundos e intentan infundir las seis gemas. Marcas los libros que has leído y
solo te salen preguntas de esos. Tiene casi 500 preguntas, cuatro niveles de dificultad, reto
diario, partida rápida y modo práctica con explicaciones. Está en español, inglés, francés, alemán e
italiano, y busca usar los nombres de la edición publicada en cada idioma (en español, los de Nova;
parte de la terminología aún está en revisión). Es
gratis, sin anuncios, sin cuentas y sin rastreo, y funciona sin conexión. Es un proyecto no oficial.

**Elevator pitch (en):**
Trivia del Cosmere is a fan-made trivia game about Brandon Sanderson's Cosmere, built with the help
of AI agents. You play on one
phone: 1–6 players or teams pass it around, spin the wheel of six worlds and try to infuse all six
gems. Tick the books you've read and you'll only get questions from those. Almost 500 questions,
four difficulty levels, a daily challenge, a quick mode and a practice mode with explanations. It
comes in English, Spanish, French, German and Italian, aiming for each language's published-edition
names (some terms are still under review). Free, no ads, no accounts, no tracking, works offline. Unofficial fan project.

**Qué no somos (para no prometer de más):** no hay juego en línea ni clasificaciones, no es una app
de tienda (es una web que se instala en la pantalla de inicio) y no es oficial.

## 2. Audiencias

| Prioridad | Audiencia | Qué les importa | Cómo llegar |
|---|---|---|---|
| Principal | **Clubes de lectura y grupos de amigos hispanohablantes** que leen el Cosmere | Algo para la quedada, que nadie se coma un spoiler, nombres de Nova | Grupos y comunidades en español (ver §4), contacto directo con 3–5 clubes |
| Principal | **Fans hispanohablantes que juegan solos** | Ponerse a prueba, reto diario, racha | Redes en español, resultado compartible del reto diario |
| Secundaria | **Comunidades en inglés** (las más grandes) | Curiosidad, nivel Experto, que sea gratis y sin anuncios | Foros y subreddits del Cosmere, **solo si sus reglas lo permiten** |
| Secundaria | **Fans franceses, alemanes e italianos** | Jugar en su idioma con los nombres de su edición (Le Livre de Poche, Heyne/Piper, Mondadori) | Un único mensaje por idioma en su comunidad principal, con aviso de terminología en revisión |

Para fr/de/it el objetivo no es volumen, sino **conseguir lectores nativos que revisen nombres**:
el glosario aún tiene muchos términos `unverified` (es 281 · fr 429 · de 437 · it 509 de 1.127, a
22-10-2026).

## 3. Mensajes clave y pruebas

| Mensaje | Prueba (solo datos comprobables de la app) |
|---|---|
| Para jugar en grupo con un solo móvil | Partida clásica de 1 a 6 jugadores o equipos, con turnos justos y victoria compartida |
| Sin spoilers | Cada pregunta lleva internamente el libro más tardío necesario; el filtro de spoilers solo saca preguntas de lo que has marcado |
| Los nombres de tu edición | Glosario de ~1.100 términos en 5 idiomas con el estado de cada uno; se dice siempre que parte está en revisión |
| Contenido cuidado y corregible | 496 preguntas por idioma, con los datos contrastados por agentes de IA con la Coppermind; botón «Avisar de un error» en cada pregunta |
| Gratis y respetuoso | Sin anuncios, sin cuentas, sin rastreo, sin compras; funciona sin conexión |
| Hecho por un fan, con IA y sin esconderlo | Lo dirige una persona que está aprendiendo a programar; el código, las preguntas y las traducciones los han escrito agentes de IA; el código está en GitHub |

**Nada de testers como prueba social.** Lucía, Marc, Hannah e Ignacio son perfiles de prueba
**simulados por agentes de IA**, no lectores reales. Sus notas, frases y perfiles (incluido «editor de
la Coppermind») **no se citan nunca en público**, ni como «pruebas con 4 lectores» ni de ninguna otra
forma: sería engañoso y, en el caso de Ignacio, insinuaría un aval de la Coppermind que no existe. Las
rondas de beta son control de calidad interno. Si se quiere prueba social, que sea real: comentarios
de quien juegue tras el lanzamiento suave (L-3), citados solo con su permiso.

**Prohibido en el texto público:** spoilers más allá del primer libro de cada saga (ni siquiera
los giros del propio primer libro, y nada de *Palabras radiantes* ni de *El Pozo de la Ascensión*
en adelante; ojo con los ejemplos de preguntas), logos o portadas, palabras como «oficial» o
«aprobado» (salvo en «no oficial»), testers de la beta como prueba, la palabra «Trivial» y promesas
de funciones que no existen.

## 4. Calendario de canales (una persona, ~2 semanas)

Regla general: **antes de publicar en cualquier comunidad, leer sus normas**. Si prohíben la
autopromoción o piden permiso, escribir antes a la moderación (plantilla en §6) o no publicar.
Un mensaje por comunidad, nunca el mismo texto pegado en diez sitios el mismo día. Responder a
todos los comentarios de las primeras 48 h.

| Día | Acción | Canal / idioma | Responsable | Tiempo |
|---|---|---|---|---|
| L-7 | Fusionar el PR #1 y activar *Settings → Pages → Source: GitHub Actions*; comprobar el enlace en Android e iPhone (instalar, jugar sin conexión) | GitHub | ManuVP90 | 45 min |
| L-7 | Elegir 5–8 comunidades (2–3 en español, 1–2 en inglés, 1 por fr/de/it) y anotar sus normas de autopromoción en una tabla | Todas | ManuVP90 (agentes ayudan a resumir normas) | 1 h |
| L-6 | Revisar los textos ya redactados (`COPY*.md`, `posts/`, `COMMUNITIES.md`) y reescribirlos con tus palabras | — | ManuVP90 | 30 min de revisión |
| L-5 | Elegir capturas del kit (`ASSETS.md`, ya hechas sin portadas ni arte oficial) o rehacerlas si cambió la interfaz | — | ManuVP90 | 15 min |
| L-5 | Revisar que las preguntas visibles en las capturas no revelan nada más allá del primer libro | — | ManuVP90 (agente de cumplimiento revisa) | 15 min |
| L-4 | Escribir a la moderación de las comunidades que lo pidan | Según la tabla | ManuVP90 | 30 min |
| L-3 | «Lanzamiento suave»: enviar el enlace a 3–5 conocidos o a un club de lectura hispanohablante para una partida real | Mensaje directo, es | ManuVP90 | 20 min |
| L-1 | Comprobar que «Reportar esta pregunta» abre la plantilla de issue y que el enlace funciona; preparar las publicaciones como borradores | GitHub | ManuVP90 | 30 min |
| **L** | Publicación principal en **español** en la comunidad más activa (mañana o primera hora de la tarde en España) | es | ManuVP90 | 30 min + respuestas |
| L | Mensaje en redes personales (si las tiene) con una captura y el enlace | es | ManuVP90 | 10 min |
| L+1 | Segunda comunidad en español (otra plataforma o grupo) | es | ManuVP90 | 20 min |
| L+2 | Publicación en **inglés** en la comunidad que lo permita (si hay hilo semanal de autopromoción o de fan works, usarlo) | en | ManuVP90 | 30 min + respuestas |
| L+3 | Revisar issues y comentarios; anotar errores de nombres o preguntas | GitHub | ManuVP90 (agentes clasifican) | 30 min |
| L+4 | Mensaje en **francés** en su comunidad principal, con aviso «terminología en revisión, se agradece ayuda» | fr | ManuVP90 | 20 min |
| L+5 | Igual en **alemán** | de | ManuVP90 | 20 min |
| L+6 | Igual en **italiano** | it | ManuVP90 | 20 min |
| L+7 | Arreglar lo urgente que haya salido (versión 2.0.x+1) y agradecer en los hilos con lo corregido | GitHub + hilos | ManuVP90 + agentes de desarrollo | 1–2 h |
| L+8 | Invitar al reto diario: compartir un resultado propio (✅/❌, sin spoilers) | es / en | ManuVP90 | 10 min |
| L+10 | Pedir revisores nativos con los libros (lotes de 20 términos de `docs/verification/`) a quien haya mostrado interés | fr / de / it / es | ManuVP90 | 30 min |
| L+14 | Balance con las métricas de §5 y decisión: seguir, pausar o preparar una segunda ola | — | ManuVP90 (agentes resumen) | 30 min |

Si un día no da tiempo, **se mueve la acción, no se acumula**: es mejor una publicación bien atendida
que tres sin responder.

## 5. Cómo medir el éxito (sin rastreo en la app)

La app no tiene analítica y no la va a tener. Todo se mide desde fuera:

| Medida | Dónde | Objetivo a L+14 (orientativo) |
|---|---|---|
| Votos y comentarios de cada publicación | Cada comunidad | La publicación en español con ≥ 20 votos/reacciones y ≥ 10 comentarios |
| Estrellas del repositorio | GitHub | ≥ 15 |
| Issues de «Reportar esta pregunta» | GitHub | Cualquier número es bueno; objetivo: responder todos en ≤ 3 días |
| Errores de la app reportados | GitHub e hilos | 0 bloqueantes sin arreglar a L+7 |
| Quejas sobre nombres | Comentarios e issues | Cada una registrada y resuelta o explicada (con fuente) |
| Clubes o grupos que dicen haberlo jugado | Comentarios y mensajes | ≥ 3 |
| Revisores nativos voluntarios | Mensajes | ≥ 1 por fr, de e it |
| Resultados del reto diario compartidos | Hilos y redes | ≥ 5 |

Formulario de opinión (opcional, solo si el dueño quiere): uno sin login con 3 preguntas (nota 1–10,
qué mejorarías, idioma). Si no, basta con las issues de GitHub.

## 6. Riesgos y cómo reducirlos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Spoilers** en el texto, en las capturas o en las preguntas de ejemplo | Media | Solo ejemplos del primer libro de cada saga; revisión de cumplimiento antes de publicar; recordar en cada mensaje que el filtro de spoilers se configura al empezar |
| **Prohibición de autopromoción** o mensaje borrado | Alta en las comunidades grandes | Leer normas antes; preguntar a moderación; usar los hilos de autopromoción o de fan works; presentarlo como «proyecto de fan, gratis, busco opiniones»; no repetir si lo borran |
| **Queja de marca o de derechos** | Baja | Aviso de no oficial visible en la app y en cada mensaje; sin logos, portadas ni arte; sin dinero. Si llega una petición de Dragonsteel o de una editorial, se atiende enseguida y se retira lo que pidan |
| **Rechazo por estar hecho con IA** (normas que lo prohíben o comentarios negativos) | Media-alta | Decirlo claro desde el primer mensaje, nunca esconderlo ni minimizarlo; leer la norma de IA de cada comunidad igual que la de autopromoción; en el 17th Shard (prohíbe contenido «generado o asistido» por IA) no publicar sin permiso escrito; no discutir si alguien lo critica |
| **Marca de terceros** («Trivial», Trivial Pursuit de Hasbro) | Baja | No usar «Trivial» en ningún texto ni imagen; describirlo como «juego de preguntas» |
| **Críticas a los nombres** («en mi edición se dice X») | Alta, sobre todo en fr/de/it | Avisar desde el primer mensaje de que parte de la terminología está en revisión; agradecer, pedir la fuente (edición y página) y corregir en la siguiente versión; nunca discutir |
| **Errores en preguntas** | Media | Botón «Reportar esta pregunta» con plantilla; responder en ≤ 3 días; agrupar arreglos en una versión semanal |
| **Fallo técnico en el lanzamiento** (Pages sin activar, caché antigua en el móvil) | Media | Probar el enlace en dos móviles en L-7 y L-1; no lanzar sin CI en verde |
| **Desgaste del dueño** (muchos comentarios de golpe) | Media | Escalonar un idioma por día; respuestas tipo preparadas; está bien contestar al día siguiente |
| **Expectativas de juego en línea o de tienda de apps** | Media | Decirlo claro en el texto largo: es local, en un solo móvil, se instala desde el navegador |

**Plantilla para moderadores (es, resumida):** «Hola, soy fan del Cosmere y he hecho un juego de
preguntas gratuito, sin anuncios y no oficial para jugar en grupo con un móvil. ¿Puedo compartirlo en
la comunidad o preferís que lo ponga en algún hilo concreto? Gracias.»

## 7. Lista de comprobación para lanzar (sí o no)

**Lanzar solo si todo está marcado.** Si falla algo de la parte A, no se lanza.

**A. Bloqueantes**
- [ ] Beta ronda 6 hecha y **todos los testers con nota mayor que 8/10** (umbral interno de calidad
      decidido por el líder tras la ronda 5; los testers son simulados y sus notas no se publican).
- [ ] Sin hallazgos bloqueantes ni graves abiertos en el informe de la ronda 6.
- [ ] Arreglos de la sección «ya» de la ronda 5 (doble toque, Ajustes al 200 %, test de la final
      fallada, sel-020 y «la Shaod») integrados y todas las comprobaciones de `CLAUDE.md` en verde.
- [ ] PR #1 fusionado en `main`, GitHub Pages activado y https://manuvp90.github.io/ManuVP90/
      funcionando en Android e iPhone (carga, se instala y funciona sin conexión).
- [ ] La app y cada texto público dicen que es un proyecto **no oficial** sin relación con Brandon
      Sanderson ni con Dragonsteel.
- [ ] Ningún texto ni captura con logos, portadas o arte oficial, ni con spoilers más allá del primer
      libro.
- [ ] Cada publicación dice que el juego se ha hecho con agentes de IA, y en las comunidades que
      prohíben el contenido hecho o asistido por IA (17th Shard) no se publica sin permiso escrito del
      staff.
- [ ] Ningún texto público usa «Trivial» ni «Trivial Pursuit» (marca de Hasbro).

**B. Recomendables (si faltan, se lanza igual pero se anota)**
- [x] Las 6 preguntas nuevas de El Cosmere para *El imperio final* y *Elantris* publicadas (496 por
      idioma en v2.0.1).
- [ ] Normas de autopromoción revisadas en todas las comunidades elegidas.
- [x] Textos revisados por el agente de cumplimiento (`COMPLIANCE.md`, 22-10-2026).
- [x] Capturas propias listas en es y en (`ASSETS.md`).
- [ ] Al menos una partida real con un grupo de conocidos (L-3) sin problemas graves.

## 8. Decisiones pendientes del dueño

1. **Fecha del día L** (una vez pasada la ronda 6). Recomendación: un día en que tengas 1–2 h libres
   esa tarde y la siguiente para responder.
2. **Qué comunidades concretas** usar en español (las que tú ya frecuentas funcionan mejor que las
   que no conoces).
3. **Si publicas desde una cuenta personal** o creas una del proyecto (recomendación: la personal; da
   más confianza en comunidades de fans).
4. **Si quieres un formulario de opinión** o solo issues de GitHub.
5. **Resto de decisiones abiertas** (licencia del código, cómo describir tu papel frente al de la IA,
   17th Shard, nombre en inglés): ver `COMPLIANCE.md` §5 y `README.md`.
