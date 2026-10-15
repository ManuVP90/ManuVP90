# Trivia del Cosmere

Juego de preguntas tipo *Trivial* sobre el Cosmere de Brandon Sanderson, para móvil,
con partidas locales (se pasa el móvil) y en 5 idiomas: español, inglés, francés, alemán e italiano.
Proyecto de fans, no oficial.

## Jugar

Es una PWA: no necesita tienda de apps ni conexión una vez cargada.

```bash
node tools/serve.mjs 8080        # o: python3 -m http.server -d app 8080
```

Abre `http://<tu-ip>:8080` en el móvil (misma red) y usa *Añadir a pantalla de inicio*.
Publicada en GitHub Pages: **https://manuvp90.github.io/ManuVP90/** (se despliega sola con
`.github/workflows/pages.yml` en cada cambio de `app/` en `main`; requiere *Settings → Pages →
Source: GitHub Actions*). Ábrela en el móvil y usa *Añadir a pantalla de inicio*.

### Modos
- **Nivel de dificultad** (partidas clásica y rápida): Fácil, Normal, Difícil o Experto.
- **Comodines** (uno de cada por jugador y partida, no válidos en la pregunta final):
  **Atium** elimina dos respuestas incorrectas; **Luz tormentosa**, activada antes de responder,
  permite reintentar si fallas; **Aliento** cambia la pregunta por otra de la misma categoría.
- **Partida clásica** (1–6 jugadores o equipos): ruleta con 6 mundos + comodín. Dos aciertos en un
  mundo infunden su gema; con las seis, pregunta final. Si la ruleta cae en una gema ya infundida,
  cuenta como comodín.
- **Partida rápida**: 15 preguntas contrarreloj, con récord.
- **Práctica**: eliges mundo y dificultad, con explicación de cada respuesta.
- **Filtro de spoilers** (Ajustes): marca solo los libros que has leído.

## Contenido

| Mundo | Preguntas |
|---|---|
| Roshar | 80 |
| Scadrial | 80 |
| Sel | 80 |
| Nalthis | 60 |
| Otros mundos | 80 |
| El Cosmere | 80 |

460 preguntas por idioma, 4 niveles de dificultad (fácil, media, difícil y experto), repartidas a partes iguales
(Nalthis: 16/16/16/12). Cada pregunta está etiquetada con el libro más tardío que hace falta para
conocer la respuesta. En los mundos-planeta, las cuatro opciones son siempre del mismo planeta.

**Nombres**: en cada idioma se usan los de la edición oficial publicada en ese idioma
(p. ej. *Hoja esquirlada* / *Lame d'éclat* / *Splitterklinge* / *Stratolama*; *Sagaz*, *Sondeluz*,
*Alezkar*; *Cosmère*, *Kosmeer*, *Cosmoverso*). El criterio y el estado de verificación de cada
término están en `content/glossary.json` (`official`, `community`, `unchanged`, `unpublished`,
`unverified`).

## Estructura

```
app/                PWA (HTML/CSS/JS sin dependencias) — ver docs/ENGINE.md
content/en/*.json   preguntas canónicas (inglés)
content/<lang>/     traducciones + revisión terminológica + títulos oficiales
content/glossary.json  glosario de ~1.100 términos en 5 idiomas
docs/SPEC.md        especificación y formato de datos
tools/build.mjs     valida el contenido y genera app/data/questions.<lang>.json
tools/terms.mjs     términos de las preguntas que faltan en el glosario
tools/check-terms.mjs  coherencia terminológica de las traducciones
tools/merge-glossary.mjs  integra las revisiones de cada idioma en el glosario
tools/changed-ids.mjs  ids nuevas o cambiadas desde una revisión (para traductores)
tools/smoke.mjs     prueba de extremo a extremo en móvil emulado (Playwright)
```

Flujo para cambiar preguntas: edita `content/en/<mundo>.json` y la misma `id` en cada
`content/<lang>/<mundo>.json`, luego `node tools/build.mjs` y `node tools/smoke.mjs`.
Si cambias archivos de `app/`, sube `CACHE_VERSION` en `app/sw.js`.

## Cómo se hizo

Equipo de agentes coordinado por un líder: 1 desarrollador, 6 redactores (uno por mundo),
2 verificadores de datos, 1 terminóloga y 4 traductores (uno por idioma, cada uno responsable
de verificar la terminología oficial de su idioma).

## Pendiente conocido

- Parte de la terminología está marcada `unverified`: no se pudo confirmar contra el texto de
  la edición publicada (sobre todo términos secundarios en francés y alemán, y algunos de
  *El aliento de los dioses*, *Trenza* y la era 2 de *Nacidos de la bruma*). Conviene que un
  lector de cada idioma con los libros a mano los revise; `node tools/check-terms.mjs` y el
  glosario indican cuáles.
- Libros sin edición en algún idioma (p. ej. *The Sunlit Man* en italiano) conservan los nombres
  en inglés, según la regla.
