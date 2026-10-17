# Trivia del Cosmere — Especificación (contrato del equipo)

Juego de preguntas tipo *Trivial* sobre el Cosmere de Brandon Sanderson.
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
   - En cada turno gira la **ruleta** de 7 sectores: las 6 categorías + *Comodín* (el jugador elige categoría). Si cae en una gema ya infundida, actúa como comodín entre las que faltan.
   - Pregunta de opción múltiple (4 opciones, 1 correcta) con temporizador opcional (30 s). El plazo se guarda con la pregunta pendiente: recargar, salir o pulsar Atrás no lo reinicia, y si vence mientras tanto cuenta como fallo por tiempo.
   - Acierto → +1 *carga* en esa categoría y **sigue tirando**. Fallo → pasa el turno.
   - **Máximo 3 aciertos seguidos por turno** (con 2 o más jugadores): tras el 3.º acierto el turno pasa igualmente y se avisa al jugador. En solitario no hay límite.
   - Al reanudar una partida guardada con varios jugadores se muestra primero la pantalla de «pasa el móvil» y luego la pregunta pendiente.
   - Con **2 cargas** la gema de esa categoría queda **infundida** (las cargas extra ya no suman).
   - Con las 6 gemas infundidas el jugador afronta la **pregunta final** (dificultad 3, categoría al azar; se prefieren preguntas que aún no hayan salido en la partida). Acierto → gana. Fallo → pasa el turno y lo intentará en su siguiente turno.
2. **Partida rápida** (solo): 15 preguntas de categorías mezcladas, puntuación por acierto y tiempo; récord guardado.
   Las 15 plazas se reparten entre mundos en proporción a las preguntas disponibles con el filtro de spoilers, y ninguna pregunta se repite en la partida (si hay menos de 15, la partida es más corta). La partida en curso se guarda y se puede continuar tras recargar.
3. **Práctica**: elige categoría y dificultad, sin puntuación, muestra la explicación de cada respuesta.

### Nivel de dificultad de la partida (v2)
Al empezar una partida clásica o rápida se elige un nivel (por defecto **Normal**):
| Nivel | Preguntas | Pregunta final (clásica) |
|---|---|---|
| Fácil | dificultad 1 (si se agota, 2) | dificultad 2 |
| Normal | 1, 2 y 3 (pesos 40/40/20) | dificultad 3 |
| Difícil | 2, 3 y 4 (pesos 20/40/40) | dificultad 4 |
| Experto | 3 y 4 (pesos 30/70) | dificultad 4 |
Si un nivel agota su pool en una categoría, se toma la dificultad más cercana disponible.
Práctica permite elegir cualquiera de las 4 dificultades.

### Comodines (v2)
Cada jugador tiene **1 de cada** por partida clásica; en partida rápida, 1 de cada por partida.
No se pueden usar en la pregunta final. En práctica no hay comodines.
**Atium y Luz tormentosa no se combinan** en la misma pregunta: usado uno, el otro queda desactivado en esa pregunta (con el motivo visible bajo la fila de comodines).
Si se usa **Aliento con la Luz tormentosa activada**, la protección pasa a la pregunta nueva.
| Comodín | Efecto |
|---|---|
| **Atium** | Elimina dos respuestas incorrectas. |
| **Luz tormentosa** | Se activa antes de responder: si fallas, la opción fallada se marca y vuelves a elegir (sin revelar la correcta). |
| **Aliento** | Cambia la pregunta por otra de la misma categoría y dificultad. |
Nombres oficiales: atium (igual en los 5 idiomas), Stormlight → luz tormentosa / Fulgiflamme / Sturmlicht / Folgoluce, Breath → Aliento / Souffle / Hauch / Soffio.

### Filtro de spoilers
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
