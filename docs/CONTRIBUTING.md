# Cómo contribuir

*Trivia del Cosmere* es un proyecto de fans, no oficial. Hay tres formas de ayudar, de más fácil a
más técnica:

1. **[Reportar un error](#reportar-un-error-en-una-pregunta)** en una pregunta: desde el propio juego.
2. **[Revisar términos](#revisar-términos)** con tus libros en español, francés, alemán o italiano.
3. **[Proponer preguntas](#proponer-una-pregunta)** nuevas.

Si tocas archivos, mira también **[Herramientas](#herramientas)** y **[CI y despliegue](#ci-y-despliegue)**.

---

## Reportar un error en una pregunta

Tras responder una pregunta, pulsa **«Reportar esta pregunta»**. Se abre un *issue* de GitHub con la
plantilla [`error-en-pregunta.md`](../.github/ISSUE_TEMPLATE/error-en-pregunta.md), ya relleno con el
**id**, el **idioma**, el **texto** de la pregunta y sus opciones. Solo tienes que explicar **qué está
mal** (y, si puedes, la fuente: libro, capítulo o página, y edición). Sin conexión, el juego te deja
copiar el informe para enviarlo después.

También se puede abrir a mano: *Issues → New issue → Error en una pregunta*.

## Proponer una pregunta

Abre un *issue* con la plantilla [`pregunta.md`](../.github/ISSUE_TEMPLATE/pregunta.md)
(*Issues → New issue → Proponer una pregunta*). La pregunta se escribe en **inglés**, que es el texto
canónico; después se traduce a los otros cuatro idiomas.

### Campos (SPEC §3.1)

| Campo | Qué poner |
|---|---|
| `category` | Mundo: `roshar`, `scadrial`, `sel`, `nalthis`, `otros` o `cosmere`. |
| `difficulty` | `1` fácil (lectores casuales) · `2` media (lectores atentos) · `3` difícil (fans que releen) · `4` experto (epígrafes, Ars Arcanum, interludios, nombres secundarios, cifras exactas; siempre comprobable en el texto publicado). |
| `work` | La obra **más tardía** necesaria para conocer la respuesta (para el filtro de spoilers). Lista de ids en [SPEC.md §4](SPEC.md#4-ids-de-obras-work). |
| `q` | La pregunta. |
| `a` | La respuesta correcta. |
| `wrong` | Exactamente **3** respuestas incorrectas plausibles, del mismo tipo que la correcta y distintas entre sí. |
| `explain` | Una frase que se muestra tras responder. |
| `terms` | **Todos** los nombres propios y términos acuñados que aparecen en `q`, `a`, `wrong` o `explain`, en inglés. Sirve para el glosario. |
| `source` | Libro y capítulo (o página). |

El `id` (`<mundo>-NNN`) lo asigna quien integra la pregunta.

### Reglas

- **Mismo mundo**: en `roshar`, `scadrial`, `sel` y `nalthis`, la respuesta y los tres distractores son
  del **mismo planeta** que la pregunta. En `otros`, de la misma obra (no mezclar Lumar con Komashi). En
  `cosmere` se pueden mezclar mundos, pero las cuatro opciones deben ser del mismo tipo.
- **Prohibido**: preguntas que dependan del idioma (número de letras, juegos de palabras, iniciales,
  rimas), respuestas tipo «todas las anteriores», hechos no canónicos o discutidos, fechas de
  ediciones de un país concreto.
- **Nombres**: si añades un término nuevo, debe entrar en `content/glossary.json` con su forma en
  cada idioma según la **edición oficial publicada** en ese idioma (regla de oro en
  [SPEC.md §3.3](SPEC.md#33-glosario--contentglossaryjson)).

### Cómo se integra (quien tenga acceso al repositorio)

1. Añade el objeto a `content/en/<mundo>.json` con el siguiente `id` libre (formato en
   `content/en/_example.json`).
2. Añade la traducción (mismo `id`, mismo orden; solo `q`, `a`, `wrong`, `explain`) a
   `content/<lang>/<mundo>.json` en `es`, `fr`, `de` e `it`, usando el glosario.
3. `node tools/terms.mjs` (no debe listar términos nuevos sin glosario) y `node tools/build.mjs`.
4. Abre un *pull request*: la CI valida todo y ejecuta las pruebas.

## Revisar términos

El mayor riesgo del juego es un nombre que no coincida con el libro que tiene el lector. Para cada
idioma hay una **lista de verificación** generada:

- [`docs/verification/es.md`](verification/es.md) · [`fr.md`](verification/fr.md) ·
  [`de.md`](verification/de.md) · [`it.md`](verification/it.md)

Contiene los términos usados en las preguntas cuyo estado en ese idioma **no** es `official` ni
`unchanged` (o que faltan en el glosario), **ordenados por el número de preguntas que los usan** y en
**lotes de 20**: el lote 1 es el que más preguntas arregla.

### Qué hace el revisor o la revisora

1. Coge un lote (avisa en un *issue* «Revisión <idioma> lote N» para no duplicar trabajo).
2. Para cada fila, busca el término en **tu edición publicada** (no en wikis ni en traducciones
   de fans, salvo que el estado sea `community` porque no existe edición oficial):
   - si la *forma actual* es la del libro, marca **☐ confirmado**;
   - si no, escribe la forma correcta en **☐ corregir a: ___**, con el libro y el capítulo o la
     página, y anota el género o el plural si no son evidentes.
   - Las columnas *Ejemplos* y *Fuentes* ayudan a localizar el contexto (busca el id en
     `content/<lang>/<mundo>.json`).
3. Envía el lote revisado: copia la tabla en el *issue* o abre un *pull request* que edite
   `docs/verification/<lang>.md`.

### Qué hace quien integra la revisión

1. Pasa los resultados a `content/<lang>/glossary-review.json` (forma, `status: "official"` y la
   fuente: «edición X, libro, cap./pág.») y ejecuta `node tools/merge-glossary.mjs`.
2. Corrige las preguntas afectadas en `content/<lang>/*.json`; `node tools/check-terms.mjs <lang>`
   ayuda a encontrar las que aún usan la forma antigua.
3. `node tools/build.mjs` y vuelve a generar las listas con `node tools/verification-list.mjs`: los
   términos confirmados desaparecen de la lista.

Estados del glosario: `official` (traducción publicada) · `community` (sin traducción oficial; se usa
la de la Coppermind local o la comunidad) · `unchanged` (no se traduce) · `unpublished` (la obra no
está publicada en ese idioma) · `unverified` (pendiente de verificar).

## Herramientas

Todas son scripts de Node 22 sin dependencias, salvo las pruebas de navegador (Playwright).

| Orden | Qué hace |
|---|---|
| `node tools/build.mjs --check` | Valida `content/` sin escribir nada. |
| `node tools/build.mjs` | Valida y genera `app/data/questions.<lang>.json`. |
| `node tools/terms.mjs` | Términos de las preguntas que faltan en el glosario. |
| `node tools/check-terms.mjs [lang…]` | Informe de coherencia terminológica de las traducciones (heurístico, nunca falla). |
| `node tools/verification-list.mjs [lang…]` | Regenera `docs/verification/<lang>.md` (`--stdout` para imprimir). |
| `node tools/merge-glossary.mjs` | Integra `content/<lang>/glossary-review.json` en el glosario. |
| `node tools/changed-ids.mjs <rev>` | Ids nuevas o cambiadas desde una revisión de git (para traductores). |
| `node tools/check-app.mjs [--base <rev>]` | Comprobaciones rápidas de la app: cada módulo de `app/js` está en `SHELL` de `sw.js` y cada entrada existe; `CACHE_VERSION` presente (y, con `--base`, cambiado si cambió algún archivo de la app); los 5 `app/i18n/*.json` con las mismas claves y los mismos `{marcadores}`; iconos del manifiesto; títulos de todas las obras en todos los idiomas. |
| `node tools/unit.mjs` | Pruebas unitarias del motor (sorteos por nivel, filtro de spoilers, partida rápida, guardados, reglas de `applyAnswer`, ayudas). |
| `node tools/smoke.mjs` | Prueba de extremo a extremo en un móvil emulado (Playwright + Chromium). |
| `node tools/edge.mjs` | Casos límite (guardados corruptos, temporizador, repeticiones, maquetación…). `ONLY=<regex>` para un subconjunto. |
| `node tools/serve.mjs 8080` | Servidor local de `app/`. |

Playwright: los scripts usan una instalación local (`node_modules` en la raíz) y, si no la hay, la
global. Para instalarla localmente:

```sh
npm install --no-save playwright@1.56.1
npx playwright install chromium
```

Antes de enviar cambios en `app/`: sube `CACHE_VERSION` en `app/sw.js` (y `APP_VERSION` en
`app/js/config.js`), añade los módulos nuevos a `SHELL`, y ejecuta `check-app`, `unit`, `smoke` y `edge`.

## CI y despliegue

- **CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) se ejecuta en cada *push* y *pull
  request*: `build --check`, `check-terms` (solo informe, en el resumen de la ejecución), `check-app`
  (con la comprobación de `CACHE_VERSION` frente al commit anterior o la base del PR), `unit`, regenera
  `app/data` (avisa si lo commiteado está desactualizado) y ejecuta `smoke` y `edge` con Chromium. Las
  capturas se suben como artefacto `screenshots-<n>`.
- **Despliegue** ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml)): solo cuando la CI
  termina **con éxito** en un *push* a `main` (o a mano con *Run workflow*). Publica exactamente el
  commit probado y regenera `app/data` desde `content/` antes de subir `app/`, así que los datos
  publicados siempre coinciden con el contenido.
