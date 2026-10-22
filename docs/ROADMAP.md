# Hoja de ruta — reunión de equipo (15/10/2026)

Participantes: producto/diseño de juego, desarrollo, contenido, localización y QA/UX.
Cada uno revisó el proyecto real (código, datos, pruebas y la app en un móvil emulado).

## Diagnóstico común

- **La base es sólida.** 460 preguntas × 5 idiomas validadas, la prueba de extremo a extremo
  pasa, funciona sin conexión, el código es pequeño y sin dependencias.
- **El mayor riesgo es la credibilidad de los nombres.** Términos sin verificar en el glosario:
  es 246 · fr 378 · de 401 · it 297, y hay 202 términos italianos y 51 alemanes usados en preguntas
  que ni siquiera tienen entrada en el glosario. Entre la mitad y tres cuartas partes de las preguntas
  en fr/de/it contienen algún nombre no garantizado frente a la regla de ediciones oficiales.
- **Falta motivo para volver.** No hay progreso, logros ni repaso de fallos; las preguntas vistas se
  olvidan al cerrar la app y el récord de partida rápida es único para todos los niveles.
- **El contenido está desequilibrado por libro.** *Elantris* tiene ~50 preguntas, pero *Viento y verdad*
  6, *Sombras de identidad* 3, *Danzante del Filo* 3 e *Isles of the Emberdark* 0. Con un filtro de spoilers
  realista, «Otros mundos» puede quedarse vacío.
- **No hay red de seguridad en el despliegue.** No hay CI de pruebas: un cambio roto en `main` se publicaría
  y el service worker lo dejaría en caché en los móviles.

## Corregido durante la reunión

- QA encontró la palabra literal «null» visible tras responder en todos los modos.
  Corregido (`question.js`) y la prueba de extremo a extremo ahora falla si cualquier pantalla muestra
  `null`, `undefined`, `NaN` u `[object Object]`.

## Plan priorizado

### Fase 0 — antes de difundir el enlace
| # | Tarea | Área | Impacto | Esfuerzo |
|---|---|---|---|---|
| 1 | CI en cada PR (`build --check`, `check-terms`, smoke) y desplegar Pages solo si pasa | Desarrollo | Alto | Bajo |
| 2 | Comprobar en CI que cada módulo está en el service worker y que se sube `CACHE_VERSION` | Desarrollo | Alto | Bajo |
| 3 | Botón «Reportar esta pregunta» (issue o correo con id, idioma y texto prellenados) | QA/Producto | Alto | Bajo |
| 4 | Completar el glosario italiano/alemán con los términos usados y lista de verificación ordenada por frecuencia | Localización | Alto | Medio |
| 5 | Auditar etiquetas `work` dudosas (spoiler filter) | Contenido | Alto | Bajo |

### Fase 1 — corto plazo
| # | Tarea | Área | Impacto | Esfuerzo |
|---|---|---|---|---|
| 6 | No repetir preguntas entre sesiones + «X/460 preguntas descubiertas» | Producto | Alto | Bajo |
| 7 | Récord por nivel y «Repasar fallos» al acabar (+ práctica «Mis fallos») | Producto | Alto | Bajo |
| 8 | Pruebas con fans reales: 4–6 sesiones de 30 min, Android e iOS, antes de difundir | QA | Alto | Medio |
| 9 | Revisores nativos con los libros (lotes de 20 términos por idioma) | Localización | Alto | Medio |
| 10 | ~20 preguntas de *Viento y verdad* y reequilibrio de la era 2 de Mistborn y novelas cortas | Contenido | Alto | Medio |
| 11 | Accesibilidad: texto al 200 %, tema del sistema, marcador legible con 6 jugadores, axe en el smoke | QA/Desarrollo | Medio | Medio |

### Fase 2 — medio plazo
- Logros temáticos locales (con nombres que pasen por el glosario).
- Primera partida guiada: «¿qué has leído?» configura el filtro de spoilers + explicación de 20 s.
- Reto diario sin servidor (semilla por fecha) y resultado compartible al estilo Wordle.
- Aviso «Nueva versión disponible» en lugar de actualizar en silencio.
- Pruebas unitarias del motor (niveles, comodines, filtro, migraciones).
- Proceso de contribución de preguntas (plantilla de issue + revisión) y objetivo ~600 preguntas.
- Exportar/importar progreso (el almacenamiento local se puede perder).

### Fase 3 — largo plazo, solo si hay demanda
- Google Play mediante TWA (25 USD, 1–2 días). App Store: 99 USD/año y más trabajo.
- Idiomas nuevos solo cuando menos del 10 % de las preguntas tengan términos sin verificar.
- Multijugador en línea: **no recomendado** por ahora (servidor, costes y mantenimiento).
  Paso intermedio sin servidor: «reto entre amigos» por enlace con las mismas preguntas.

## Consenso y discrepancias

- **Consenso:** verificar antes de difundir. Un solo nombre que no coincida con la edición de un fan
  hará que desconfíe de todo el juego.
- **Discrepancia:** producto quiere ampliar contenido y funciones ya; localización pide no crecer
  (ni en idiomas ni en texto con nombres propios) hasta reducir lo pendiente de verificar.
  Propuesta del líder: hacer en paralelo las mejoras que **no añaden nombres** (fase 0 y puntos 6–7)
  y condicionar el contenido nuevo a que pase por el glosario.

## Decisiones que necesitamos del cliente

1. ¿Quién es el jugador principal: tu grupo en la misma mesa o fans que juegan solos?
2. ¿Difusión pública (comunidades de fans) o uso personal y de tu entorno?
3. ¿Publicar ya los 5 idiomas con un aviso «terminología en revisión», o primero es/en?
4. ¿Tienes los libros en español para revisar términos? ¿Conoces lectores nativos de fr/de/it?
5. *Viento y verdad* e *Isles of the Emberdark*: ¿preguntas ya o esperar a la edición española?
6. ¿Mismo número de preguntas por mundo o reparto proporcional al peso de cada saga?
7. ¿Tiendas de apps o basta con «Añadir a pantalla de inicio»?
8. ¿Cómo recibir los reportes de errores: issues públicos en tu GitHub o correo?
9. ¿Tema oscuro siempre o seguir el tema del móvil?
