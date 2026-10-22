# Trivia del Cosmere — Especificación (contrato del equipo)

Juego de preguntas (trivia) sobre el Cosmere de Brandon Sanderson.
Proyecto de fans, no oficial. Móvil primero, **solo partidas locales** (un dispositivo,
se pasa el móvil entre jugadores). Funciona sin conexión.

## 1. Decisiones técnicas

| Decisión | Elección | Motivo |
|---|---|---|
| Plataforma | **PWA** (HTML + CSS + JS ES modules, sin framework, sin build) | Un solo código para Android e iOS, instalable desde el navegador, offline con *service worker*, sin tiendas ni toolchains. |
| Persistencia | `localStorage` (ajustes, estadísticas, partida en curso) | Solo sesiones locales. |
| Idiomas | `es`, `en`, `fr`, `de`, `it` | Los cinco tienen traducción oficial de las sagas principales y wiki Coppermind localizada para verificar nombres. |
| Datos | Un JSON por idioma generado: `app/data/questions.<lang>.json` | Solo se descarga el idioma activo. |

## 2. Diseño de juego

### Categorías (6, cada una con su gema)
| id | Nombre (es) | Gema / color | Contenido |
|---|---|---|---|
| `roshar` | Roshar | Zafiro `#2f6fd6` | The Stormlight Archive, Edgedancer, Dawnshard |
| `scadrial` | Scadrial | Granate/rubí `#c0392b` | Mistborn eras 1 y 2, Secret History, Allomancer Jak, The Eleventh Metal |
| `sel` | Sel | Esmeralda `#1e9e5a` | Elantris, The Emperor's Soul, The Hope of Elantris |
| `nalthis` | Nalthis | Heliodoro `#e0a526` | Warbreaker (BioChroma, Awakening, Returned) |
| `otros` | Otros mundos | Amatista `#8e44ad` | Taldain (White Sand), Threnody (Shadows for Silence), First of the Sun (Sixth of the Dusk), Lumar (Tress), Komashi (Yumi), Canticle (The Sunlit Man), Isles of the Emberdark |
| `cosmere` | El Cosmere | Diamante `#9aa7b8` | Adonalsium, Shards, Investiture, Realms, Hoid, worldhoppers, Ghostbloods, Seventeenth Shard, Shadesmar/Cognitive Realm |

### Modos
1. **Partida clásica** (1–6 jugadores o equipos, pasar el móvil).
   - **Quién empieza se sortea** al crear la partida; la primera pantalla de «pasa el móvil» lo anuncia («Empieza: {nombre}»).
   - En cada turno gira la **ruleta** de 7 sectores: las 6 categorías + *Comodín* (el jugador elige categoría). Si cae en una gema ya infundida, el jugador elige otro mundo entre los que faltan (el aviso se mantiene ~2,5 s o hasta tocarlo, y la regla figura en «Acerca de»).
   - Pregunta de opción múltiple (4 opciones, 1 correcta) con temporizador opcional (30 s). **Decisión (1.4.0): una vez mostrada la pregunta, su tiempo corre en tiempo real aunque el jugador salga** (Inicio, otra app, pantalla bloqueada, recarga): salir no da tiempo para pensar. Se guarda el tiempo restante con la hora en que se midió y, al volver, se descuenta el tiempo transcurrido (dentro de la misma sesión de la página se mide con un reloj monótono, así que atrasar el reloj del sistema no devuelve tiempo —beta 6—; tras una recarga se usa la hora del sistema y, si retrocede o no se puede leer, no se descuenta nada; nunca baja de 0). Si al volver ya no queda tiempo, cuenta como fallo por tiempo en cuanto se muestra. La **única pausa** es antes de revelarla: en «pasa el móvil» de una partida reanudada, una pregunta que aún no se había mostrado no descuenta; si ya se había mostrado antes de salir, el tiempo fuera sí cuenta. El botón Inicio (y Atrás) durante una pregunta clásica con tiempo pide confirmación: «Si sales, el tiempo de la pregunta sigue corriendo». En la partida rápida, el diálogo de abandonar pausa el tiempo (y difumina la pregunta) mientras está en pantalla. Quien quiera pausar libremente puede jugar sin temporizador (se indica bajo el interruptor). Cambiar el filtro de spoilers o los ajustes no cambia una pregunta ya mostrada ni reinicia su tiempo.
   - Acierto → +1 *carga* en esa categoría y **sigue tirando**. Fallo → pasa el turno.
   - **Máximo 3 aciertos seguidos por turno** (con 2 o más jugadores): tras el 3.º acierto el turno pasa igualmente y se avisa al jugador (si ese acierto infunde la última gema, se avisan ambas cosas y la pregunta final llega en su siguiente turno). En solitario no hay límite.
   - **Protección contra el doble toque (beta 4):** durante 350 ms después de pintar una pregunta se ignoran los toques en sus opciones y ayudas (un segundo toque en «Siguiente» caía sobre la opción D de la pregunta nueva), y «Siguiente»/«Continuar» solo responde al primer toque. Vale en la clásica, la rápida, el reto diario y la práctica. **Ampliación (beta 5):** lo mismo vale para las acciones principales de toda pantalla a la que se llega con un toque: «Empezar mi turno» (pasa el móvil), la elección de mundo, «¡Estoy listo!» de la final, «Jugar otra vez»/«Inicio» de la victoria y de los resultados de la rápida, el resultado del reto diario, «Empezar» de la configuración, de la rápida, del reto y de la práctica, y «Terminar» de la práctica: ignoran los toques durante 350 ms y los botones que cambian de pantalla solo actúan una vez. Así un doble toque en «Ver resultados» no arranca otra partida y uno en «Continuar» no se salta «Pasa el móvil».
   - Un jugador que deja vacío su nombre se llama «Jugador n» en el idioma actual: la partida guarda que es un nombre por defecto (no el texto), así que cambiar de idioma lo traduce (beta 6).
   - Al reanudar una partida guardada con varios jugadores se muestra primero la pantalla de «pasa el móvil» y luego la pregunta pendiente.
   - Con **2 cargas** la gema de esa categoría queda **infundida** (las cargas extra ya no suman).
   - Con las 6 gemas infundidas el jugador afronta la **pregunta final** (dificultad 3, categoría al azar; se prefieren preguntas que aún no hayan salido en la partida). Acierto → gana. Fallo → pasa el turno y lo intentará en su siguiente turno, con otra pregunta.
   - **Ronda completa (decisión 2.0.0):** opción de la configuración, activada por defecto con 2 o más jugadores (oculta en solitario; «Jugar otra vez» la conserva). Una ronda va del jugador que empezó (el del sorteo) al anterior a él. Si alguien acierta la final, los jugadores que faltan en esa ronda juegan su turno completo con las reglas normales (pueden infundir y, si completan las gemas en ese turno, responder la final); quien también acierte la final **comparte la victoria**. Si el que acierta es el último de la ronda, gana en el acto. La pantalla de «pasa el móvil» de esos turnos avisa («Última ronda…») y el marcador muestra un trofeo junto a quien ya acertó la final. Con la opción desactivada, el primer acierto de la final gana. Las partidas guardadas de versiones anteriores siguen con la regla antigua.
   - **Comodín con un solo mundo libre:** si la ruleta cae en el comodín o en una gema ya infundida y solo queda un mundo por infundir, se va directo a ese mundo (el aviso lo dice) sin pantalla de elección.
   - **Partidas en grupo (decisión 2.0.0):** las clásicas de 2 o más jugadores no cuentan en las estadísticas personales (aciertos por mundo, ayudas, victorias), ni en «Mis fallos», ni en los logros individuales; se cuentan aparte como «Partidas en grupo» (Estadísticas) y sí cuentan los logros de grupo («Mesa completa»). La partida conserva su propia lista de fallos para «Repasar fallos» en la victoria. Las clásicas en solitario cuentan como siempre. **Decisión (beta 5):** la colección («preguntas descubiertas») es personal: las partidas en grupo no la suman, ni a los logros que dependen de ella («Compendio», «Medio Cosmere»). El registro de vistas recientes sí es del dispositivo (cuenta todo lo que ha salido en pantalla, también en grupo) para no repetir preguntas.
   - Al reanudar una pregunta que ya se había mostrado, la pantalla de «pasa el móvil» avisa de que su tiempo sigue corriendo (segundos restantes en vivo) o de que se acabó; «Continuar partida» en Inicio dice de quién es el turno.
   - La **pantalla de victoria** (uno o varios ganadores: «¡Victoria compartida: Ana y Bea!», nombres unidos según el idioma) muestra la duración de la partida y, por jugador, aciertos/preguntas respondidas, % de acierto, ayudas usadas y gemas infundidas. «Jugar otra vez» abre la configuración con los mismos jugadores, colores, temporizador y nivel.
2. **Partida rápida** (solo): 15 preguntas de categorías mezcladas, puntuación por acierto y tiempo; récord guardado.
   Las 15 plazas se reparten entre mundos en proporción a las preguntas disponibles con el filtro de spoilers, y ninguna pregunta se repite en la partida (si hay menos de 15, la partida es más corta). La partida en curso se guarda y se puede continuar tras recargar; al terminar, recargar en la pantalla de resultados los vuelve a mostrar una vez.
3. **Práctica**: elige categoría y dificultad, sin puntuación, muestra la explicación de cada respuesta. Cuando ya se han visto todas las preguntas disponibles en la sesión se avisa: «Has visto todas las preguntas disponibles; empiezan a repetirse».
4. **Reto diario**: 5 preguntas al día, iguales para todos con la misma fecha, idioma y filtro; un solo intento. **Decisión (beta 4):** no se puede jugar el reto de una fecha igual o anterior a la del último reto terminado (reloj del móvil atrasado, viaje hacia el oeste): se muestra el último resultado con un aviso y la fecha del próximo reto, y la racha no se rompe. El texto para compartir lleva el título, la fecha en el formato del idioma (p. ej. «21 de octubre de 2026»), un ✅ por acierto y un ❌ por fallo, la puntuación, la racha y el enlace; nunca preguntas ni respuestas.

**Avisar de un error (decisión 2.0.0):** tras responder (todos los modos) y en cada fallo repasado hay dos acciones discretas: «Avisar de un error» (abre en GitHub una incidencia rellenada; sin conexión copia el informe) y «Copiar informe» (copia el mismo texto al portapapeles, para quien no tiene cuenta de GitHub). **Decisión (beta 5):** no hay correo público; el resultado de copiar se muestra en una línea bajo las dos acciones (no en un aviso flotante que tape la explicación) y dice que se puede pegar en GitHub o enviar a quien mantiene el juego. El informe está entero en el idioma de la interfaz (nombres de campo, mundo y modo).

**Textos que siguen al filtro de spoilers:** con menos de 6 mundos disponibles, Inicio dice «infunde todas tus gemas» y la partida rápida «preguntas de tus mundos». En el filtro, las obras sin ninguna pregunta llevan «sin preguntas todavía». Los logros que el filtro actual hace imposibles («Compendio», «Medio Cosmere», «De mundo en mundo», «Seis gemas sin un fallo», «Partida perfecta») muestran una nota.

**Repeticiones entre partidas**: la app recuerda por idioma las últimas 150 preguntas vistas (en cualquier modo y entre sesiones) y en todos los sorteos (rápida, práctica, clásica) prefiere las no vistas recientemente y, si no hay, las vistas hace más tiempo.

### Nivel de dificultad de la partida (v2)
Al empezar una partida clásica o rápida se elige un nivel (por defecto **Normal**):
| Nivel | Preguntas | Pregunta final (clásica) |
|---|---|---|
| Fácil | dificultad 1 (si se agota, 2; luego más difíciles) | dificultad 2 |
| Normal | 1, 2 y 3 (pesos 40/40/20) | dificultad 3 |
| Difícil | 2, 3 y 4 (pesos 20/40/40) | dificultad 4 |
| Experto | 3 y 4 (pesos 30/70) | dificultad 4 |
Si un nivel agota su pool en una categoría, se toma la dificultad más cercana disponible. **Decisión (beta 4):** mientras quede en la categoría alguna pregunta sin usar, aunque sea de una dificultad fuera del rango del nivel (p. ej. una de dificultad 4 en Fácil con un filtro estrecho), sale antes de repetir ninguna; solo cuando se han usado todas se reciclan, y nunca la que acaba de salir si existe otra. Por eso la descripción de Fácil dice «Sobre todo preguntas fáciles». **Decisión (beta 5):** fuera del rango del nivel sale primero la dificultad más cercana y, a igual distancia, la más difícil (Fácil: 2, luego 3, luego 4); el texto de Fácil lo dice («si se agotan, alguna más difícil»).
Práctica permite elegir cualquiera de las 4 dificultades.

### Ayudas (v2)
En la interfaz en español el grupo se llama **«Ayudas»** (en la ruleta, «Comodín» es solo el sector que deja elegir mundo).
Cada jugador tiene **1 de cada** por partida clásica; en partida rápida, 1 de cada por partida.
No se pueden usar en la pregunta final. En práctica no hay ayudas.
**Atium y Luz tormentosa no se combinan** en la misma pregunta: usado uno, el otro queda desactivado en esa pregunta (con el motivo visible bajo la fila de ayudas).
Si se usa **Aliento con la Luz tormentosa activada**, la protección pasa a la pregunta nueva.
| Ayuda | Efecto |
|---|---|
| **Atium** | Elimina dos respuestas incorrectas. |
| **Luz tormentosa** | Se activa antes de responder: si fallas, la opción fallada se marca y vuelves a elegir (sin revelar la correcta). |
| **Aliento** | Cambia la pregunta por otra de la misma categoría y dificultad. |
Nombres oficiales: atium (igual en los 5 idiomas), Stormlight → luz tormentosa / Fulgiflamme / Sturmlicht / Folgoluce, Breath → Aliento / Souffle / Hauch / Soffio.

### Filtro de spoilers
En el **primer arranque** una introducción de 3 pasos pregunta «¿Qué has leído?» (obras agrupadas por mundo con sus títulos oficiales, atajos «Todo»/«Nada»), resume las reglas y empieza; se puede saltar, no vuelve a salir y está en «Acerca de» → «Ver introducción». Es primer arranque mientras los ajustes (ya saneados) no digan `onboarded: true`: ajustes ausentes, corruptos o nulos la muestran, y recargar a mitad vuelve al mismo paso conservando lo marcado. Quien ya tiene estadísticas o una partida guardada sin esa marca no la ve (se marca en silencio). El paso 1 empieza **sin nada marcado**, con un botón destacado «Lo he leído todo»; «Siguiente» está desactivado (con el motivo visible) hasta marcar al menos una obra. Saltar sin marcar nada deja el filtro sin restricciones.
Si el filtro deja **0 preguntas**, Inicio muestra un aviso con botón a Ajustes; empezar o continuar una partida sin categorías disponibles muestra un mensaje claro (la partida sigue guardada) en vez de quedarse esperando.
En ajustes el jugador marca qué obras ha leído. Solo salen preguntas cuyo `work` esté marcado
(por defecto: todas). Si el pool de una categoría queda vacío, la ruleta la sustituye por otra
y el juego exige infundir solo las categorías disponibles.

## 3. Formato de contenido (contrato entre redactores, traductores y motor)

### 3.1 Pregunta canónica (inglés) — `content/en/<categoria>.json`
```json
[
  {
    "id": "roshar-001",
    "category": "roshar",
    "difficulty": 1,
    "work": "way-of-kings",
    "q": "What is the name of Kaladin's spren?",
    "a": "Syl",
    "wrong": ["Pattern", "Wyndle", "Ivory"],
    "explain": "Syl is an honorspren bonded to Kaladin.",
    "terms": ["Kaladin", "spren", "Syl", "Pattern", "Wyndle", "Ivory", "honorspren"],
    "source": "The Way of Kings, ch. 1-"
  }
]
```
- `difficulty`: 1 fácil (lectores casuales), 2 media (lectores atentos), 3 difícil (fans que releen), 4 experto (detalles rebuscados: epígrafes, Ars Arcanum, interludios, nombres secundarios, cifras exactas, detalles de las novelas cortas; siempre comprobables en el texto publicado).
- `a`: respuesta correcta; `wrong`: exactamente 3 distractores plausibles, del mismo tipo que la respuesta y únicos.
- `explain`: 1 frase, se muestra tras responder.
- **Coherencia de mundo (v2)**: en las categorías de planeta (`roshar`, `scadrial`, `sel`, `nalthis`), la respuesta y los 3 distractores pertenecen al **mismo planeta** que la pregunta. En `otros`, al mismo mundo/obra de la pregunta (no mezclar Lumar con Komashi). En `cosmere`, que trata lo transversal, se permite mezclar mundos, pero las 4 opciones deben ser del mismo tipo.
- `terms`: **todos** los nombres propios y términos acuñados que aparecen en `q`, `a`, `wrong` o `explain`, escritos tal cual en inglés. Sirve para el glosario.
- `work`: id de la obra **más tardía** necesaria para conocer la respuesta (para el filtro de spoilers). Ver §4.
- Prohibido: preguntas que dependan del idioma (número de letras, juegos de palabras, iniciales, rimas), respuestas tipo "todas las anteriores", hechos no canónicos o discutidos, fechas de publicación de ediciones de un país concreto.

### 3.2 Traducción — `content/<lang>/<categoria>.json`
Mismo array, mismos `id` y mismo orden, solo con los campos traducidos:
```json
[{ "id": "roshar-001", "q": "...", "a": "...", "wrong": ["...","...","..."], "explain": "..." }]
```
El orden de `wrong` se conserva.

### 3.3 Glosario — `content/glossary.json`
```json
{
  "Shardblade": {
    "es": "Hoja Esquirlada", "fr": "...", "de": "Splitterklinge", "it": "...",
    "status": { "es": "official", "fr": "official", "de": "official", "it": "community" },
    "notes": "Opcional: género gramatical, plural, variantes, matices.",
    "sources": ["url o referencia"]
  }
}
```
`status`: `official` (traducción publicada), `community` (no hay traducción oficial; uso de la Coppermind local/comunidad), `unchanged` (el nombre no se traduce en ese idioma), `unpublished` (la obra no está publicada en ese idioma), `unverified` (pendiente de verificar por QA).

**Regla de oro de los nombres**: en cada idioma se usa el nombre de la **edición oficial publicada en ese idioma** (Nova/B de Bolsillo en español; Le Livre de Poche/Orbit en francés; Piper/Heyne en alemán; Mondadori/Fanucci en italiano). Si no existe traducción oficial, el término que use la Coppermind de ese idioma; si tampoco, el inglés.

## 4. Ids de obras (`work`)
`elantris`, `hope-of-elantris`, `emperors-soul`,
`final-empire`, `well-of-ascension`, `hero-of-ages`, `eleventh-metal`, `allomancer-jak`,
`alloy-of-law`, `shadows-of-self`, `bands-of-mourning`, `lost-metal`, `secret-history`, `mistborn-misc`,
`way-of-kings`, `words-of-radiance`, `edgedancer`, `oathbringer`, `dawnshard`, `rhythm-of-war`, `wind-and-truth`,
`warbreaker`, `white-sand`, `shadows-for-silence`, `sixth-of-the-dusk`,
`tress`, `yumi`, `sunlit-man`, `emberdark`, `arcanum` (ensayos de Arcanum Unbounded), `wob` (Palabras de Brandon / entrevistas).

## 5. Pipeline
1. Redactores (1 por categoría) → `content/en/<cat>.json`.
2. Terminóloga → `content/glossary.json`.
3. Traductores (1 por idioma) → `content/<lang>/<cat>.json`, usando el glosario.
4. `node tools/build.mjs` valida todo y genera `app/data/questions.<lang>.json`.
5. QA: verificación factual, consistencia de nombres, prueba del juego en navegador móvil.
