# Revisión de cumplimiento del kit de lanzamiento (Trivia del Cosmere v2.0.1)

> Revisión del agente de cumplimiento, 22-10-2026. Alcance: todo `docs/marketing/` (PLAN, COPY y sus
> versiones fr/de/it, COMMUNITIES, `posts/*`, ASSETS y las 24 imágenes de `assets/`, vistas una a una).
> Comprobado contra la app real (`app/`, v2.0.1, 496 preguntas por idioma) y `content/glossary.json`.
> Proyecto de fans **no oficial**, gratuito y sin ánimo de lucro, sin relación con Brandon Sanderson ni
> con Dragonsteel, y no respaldado por ellos.

## 1. Veredicto: **listo con cambios**

Los textos y las imágenes cumplen las normas de marca después de los arreglos de esta revisión (§4).
Solo se puede lanzar si el dueño hace además lo siguiente (todo está explicado en §6):

1. Usar **solo** `assets/feature-graphic-es.png` y `assets/social-card-es.png`, no las versiones
   antiguas (decían «Trivial del Cosmere»). No he podido sobrescribir los originales; bórralos tú.
2. **No publicar en el 17th Shard** sin un «sí» por escrito del staff (su norma prohíbe el contenido
   «generado o asistido» por IA).
3. Mantener en cada publicación la frase sobre la IA y el aviso de no oficial, y reescribir los
   borradores con tus palabras.
4. Leer las normas de cada comunidad (autopromoción **y** IA) el mismo día de publicar.
5. Decidir lo de la licencia antes de usar la captura 08 («Código abierto en GitHub»).

Los bloqueantes de producto del plan (beta ronda 6, PR #1 fusionado, GitHub Pages activo) no forman
parte de esta revisión y siguen pendientes.

## 2. Política de Dragonsteel para obras de fans (resumen)

Fuentes, consultadas el 22-10-2026: [Fan Art Policy](https://www.brandonsanderson.com/pages/fan-art-policy)
y la [FAQ «Can I make fan art or write fan fiction?»](https://faq.brandonsanderson.com/knowledge-base/can-i-make-fan-art-or-write-fan-fiction).
No he podido abrir las páginas directamente: el resumen sale de fragmentos de búsqueda.

- **Permitido:** fan art y fan fiction **solo para uso personal y no comercial**, incluido publicarlos
  en Reddit o Instagram, siempre que no se gane dinero con ellos **ni directa ni indirectamente**.
- **Etiquetado:** la obra tiene que quedar claramente marcada como no oficial (sugieren algo como
  «fan-created, inspired by Brandon Sanderson»). No se puede usar su texto ni su arte para dar a
  entender que un negocio, un blog o una cuenta es oficial o tiene su respaldo.
- **Nombres:** en obras comerciales no se pueden usar términos de Dragonsteel en el título ni en el
  nombre de una tienda (ponen como ejemplos de lo prohibido «Cosmere Art» y «Mistborn Illustrations»).
  Para obras gratuitas la política no dice nada de los nombres.
- **Símbolos y texto de los libros:** no se pueden vender copias de los símbolos y glifos ni frases
  memorables de los libros en productos a la venta.
- **Dinero:** no se permite financiar obras de fans con Kickstarter, IndieGoGo o Patreon (salvo algún
  encargo suelto). Las obras escritas, cómics incluidos, no pueden generar ningún ingreso.
- **IA:** el arte de fans hecho con IA, o con su ayuda, no se permite para **ningún uso comercial**.
  Para el uso no comercial no dice nada.
- **Por defecto:** todos los derechos son de Dragonsteel y Brandon Sanderson. Lo que la política no
  autoriza expresamente no está permitido. Cualquier licencia necesita permiso firmado por escrito,
  y un «adelante» de palabra en una convención no cuenta como permiso.
- **Juegos y apps:** la política **no menciona** juegos, apps ni trivias. Este proyecto encaja en el
  espíritu de lo que se tolera (gratis, sin anuncios, sin donaciones, etiquetado como no oficial, sin
  arte oficial), pero **no tiene permiso expreso**. Si Dragonsteel o una editorial piden cambios o
  la retirada, se atienden enseguida (como ya dice el plan, §6).

**Cómo encaja el kit:** gratis y sin donaciones (cumple). Aviso de no oficial en todos los textos y en
las 24 imágenes (cumple). Ni logos ni portadas ni arte oficial: el icono es propio, un diamante con
seis gemas, y no es el símbolo del Cosmere (cumple). Sin frases de los libros (cumple). El nombre
«Trivia del Cosmere» lleva un término de Dragonsteel, pero la restricción de nombres solo se aplica a
obras comerciales (riesgo bajo; ver decisión D6).

## 3. Revisión por criterio

| Criterio | Estado | Notas |
|---|---|---|
| **Privacidad** («sin cuentas, sin rastreo, tus datos se quedan en el móvil») | Cierto | El código de `app/js` solo hace peticiones a sus propios archivos (`i18n/`, `data/`), guarda en `localStorage` y abre un enlace a GitHub Issues solo si el jugador toca «Avisar de un error». Se ha añadido en las FAQ (5 idiomas) que GitHub Pages, como cualquier servidor, puede registrar datos técnicos de la visita (como la IP). |
| **Sin conexión** | Cierto | Hay service worker con caché de la app (`app/sw.js`). Hace falta conexión para la primera carga y las actualizaciones, y así lo dicen los textos. |
| **Sin anuncios ni compras; gratis** | Cierto | No hay anuncios, pagos ni donaciones en la app ni en los textos. «Y lo seguirá siendo» se acepta porque es un compromiso de no cobrar, no una función prometida. |
| **Cifras** | Corregido | 496 preguntas por idioma (desglose con 86 de El Cosmere), 19 logros, 15 preguntas en la partida rápida, 5 en el reto diario y temporizador de 30 s: todo coincide con la app. La cabecera de `COPY.md` decía «80 El Cosmere» (sumaba 490). |
| **Reto diario** | Corregido | La app comparte ✅/❌. Quedaban «cuadrados de colores» en el plan (L+8) y en `posts/reddit-en.md` §B. |
| **«Cada pregunta indica su libro»** | Corregido | La app no muestra el libro (la etiqueta `work` es interna). Ahora los textos dicen «está etiquetada con». |
| **«Código abierto» / «open source»** | Corregido en textos; queda la imagen 08 | El repositorio **no tiene licencia**: el código es público, pero no «abierto». Los textos dicen ahora «código publicado» (o «public»). La captura 08 sigue diciendo «Código abierto»/«Open source» (decisión D3). |
| **Aviso de no oficial** | Cumple | Está en todos los archivos y en las 24 imágenes («No afiliado ni respaldado por…» / «Not affiliated with or endorsed by…»). |
| **Logos, portadas, arte oficial** | Cumple | Revisadas las 24 imágenes: solo capturas de la app, su icono propio, la paleta de gemas y el fondo azul marino. Sin símbolo del Cosmere, sin glifos y sin portadas. |
| **Spoilers** | Cumple | La única pregunta visible es `roshar-001` (Kaladin y el Puente Cuatro en el ejército de Sadeas), del principio de *El camino de los reyes*. También salen la primera mitad alemana (*Der Weg der Könige*) y términos de primeros libros o novelas independientes (atium, Luz tormentosa, Aliento, Pozos de Hathsin, Sondeluz, Corte de los Dioses). El filtro de spoilers enseña títulos posteriores, pero solo los títulos. |
| **Testers como prueba social** | Corregido | `PLAN.md` §3 usaba notas y frases de Lucía, Marc, Hannah e Ignacio, que son perfiles **simulados por IA**. Lo de Ignacio, presentado como «editor de la Coppermind», además insinuaba un aval que no existe. Se ha quitado todo. Ningún texto público ni imagen los cita. |
| **Transparencia sobre la IA** | Corregido | Antes la IA era una FAQ opcional. Además, varios textos decían que las preguntas se habían «comprobado con los libros», y no es así: la verificación la hicieron agentes de IA con fragmentos de la Coppermind. Ahora la descripción larga, la nota de prensa, las FAQ y todos los borradores lo dicen, con una fórmula exacta (ver §5.2). |
| **Normas de comunidades** | Cumple, con avisos | Un mensaje por comunidad y por día, pregunta previa a la moderación, uso de hilos de autopromoción y nada de donaciones. Las normas de autopromoción **no se han podido leer en su fuente actual** (`COMMUNITIES.md`). Las comunidades fr/de/it no están investigadas. El 17th Shard queda vetado por defecto (§5.2). |
| **Nombres oficiales por idioma** | Corregido | El español ponía como «nombres de Nova» *Hoja esquirlada*, *Luz tormentosa* y *Sagaz*, y el glosario marca los tres como `community`. Se han cambiado por formas `official` (*Pozos de Hathsin*, *Sondeluz*, *Corte de los Dioses*). Francés (Fulgiflamme, Souffle, sprène, Pont Quatre, Cosmère) y alemán (Kosmeer, Allomantie, Hauch) usan formas `official`. En italiano, *Folgoluce* es `community`, pero sale en el título oficial de la saga y se acepta. «Puente Cuatro» y «Ponte Quattro» (`community`) solo aparecen dentro de capturas. Además, el español también tiene términos sin verificar (281), y ahora los textos lo dicen. |
| **Promesas de futuro** | Cumple | No se promete ninguna función. «Las correcciones llegan en las siguientes versiones» y «podría estudiar Google Play» son prudentes y se aceptan. |
| **Marca de terceros («Trivial»)** | Corregido en el kit | Ver §5.3. |

## 4. Cambios hechos en `docs/marketing/`

- **`PLAN.md`:** tabla de pruebas (§3) rehecha solo con datos de la app y sin testers, con una regla
  explícita de no citarlos. Se quita «tipo *Trivial*» y «El trivial del Cosmere». Se añade la IA al
  posicionamiento y la advertencia de terminología en revisión. Recuentos del glosario actualizados.
  L+8 con ✅/❌. L-6 y L-5 adaptados al kit ya hecho. Prohibiciones de texto público más claras.
  Nuevos riesgos (IA y marca de terceros). Nuevos puntos A en la lista de comprobación (IA y
  «Trivial»). Marcados como hechos los puntos B ya cumplidos.
- **`COPY.md`:** fuera «Trivial» (lema 2, descripción corta, descripción larga y nota de prensa).
  Ejemplos de Nova con formas `official`. Aviso de terminología que incluye el español. Párrafo «Cómo
  se ha hecho» en la descripción larga (es/en) y en la nota de prensa. La FAQ de la IA pasa de
  opcional a obligatoria y deja de decir «comprobado con los libros». Aviso de GitHub Pages en la FAQ
  de datos. «Código abierto» pasa a «código publicado». «Indica su libro» pasa a «está etiquetada».
  Cifras y notas §8 al día, y longitudes recalculadas (la descripción corta tiene 70 caracteres).
- **`COPY.fr.md`, `COPY.de.md`, `COPY.it.md`:** los mismos arreglos (párrafo de IA, FAQ de IA
  obligatoria y exacta, añadido para moderación exacto, frase de IA en el post genérico, aviso de
  GitHub Pages, «code public», «öffentlich» y «codice pubblico», «associée à», «verknüpft» y «legata
  a»). Se respeta la tipografía (espacio fino de no separación en francés). Longitudes recalculadas.
- **`COMMUNITIES.md`:** el 17th Shard pasa a «por defecto, no publicar». El aviso sobre IA se ha
  reescrito. El añadido para moderación es ahora exacto. R9 deja de decir «se comprueban con los
  libros». La regla general obliga a declarar la IA. Se cita la norma literal del 17th Shard.
- **`posts/17thshard-en.md`:** notas y cuerpo al día. La frase de IA ya no dice «checked against the
  books» y no se puede quitar.
- **`posts/discord-es.md`, `posts/mensajeria-es.md`:** fuera «tipo *Trivial*» y los títulos con
  «trivial». «Usa los nombres de Nova» pasa a «busca usar… (algunos aún en revisión)». Añadida la
  frase de IA.
- **`posts/reddit-en.md`:** «colored squares» pasa a ✅/❌. Frase de IA en los tres cuerpos. Aviso
  de mirar la norma de IA de cada subreddit.
- **`ASSETS.md`:** aviso de las imágenes `-v2`, aviso de la captura 08 y resultado de la revisión de
  imágenes.
- **`assets/feature-graphic-es.png`, `assets/social-card-es.png` (nuevas):** copias de las
  originales con el texto pequeño cambiado de «Trivial del Cosmere de Brandon Sanderson…» a «Juego de
  preguntas del Cosmere de Brandon Sanderson para jugar en grupo pasándote el móvil. Gratis, sin
  anuncios y sin conexión. 5 idiomas.» Misma fuente (Inter Regular), color y posición. Fondo
  reconstruido y comprobado a la vista. Las originales siguen ahí porque no tuve permiso para
  sobrescribirlas.

## 5. Dictamen sobre los cuatro puntos pedidos

### 5.1 Testers simulados como prueba social
**No se pueden usar, y ya está corregido.** Los cuatro testers son personas simuladas por agentes de
IA. Publicar sus notas («ronda 5 = 8,75»), sus frases («El contenido aguanta mi auditoría») o sus
perfiles sería una reseña inventada. Aunque se presentara como «pruebas con 4 lectores» seguiría
siendo engañoso. Lo de «editor de la Coppermind», además, haría pensar en un aval de la Coppermind o
del 17th Shard. Las rondas de beta quedan como control de calidad interno. La única prueba social
admisible es la de jugadores reales tras el lanzamiento suave, citada con su permiso.

### 5.2 Hecho con IA y comunidades que lo prohíben
**La declaración no era clara, y en parte era inexacta.** Estaba como FAQ opcional, y varios textos
(R9, el añadido para el 17th Shard y los textos fr/de/it) decían que las preguntas eran borradores
«revisados y comprobados con los libros». Según `CLAUDE.md` y `docs/README.md`, el código, las
preguntas, las traducciones y la verificación los han hecho agentes de IA, y la verificación se hizo
con fragmentos de la Coppermind. Ahora todos los textos usan la misma fórmula:

> «Lo dirige un fan que está aprendiendo a programar; el código, las preguntas y las traducciones los
> han escrito agentes de IA, y los datos se han contrastado con la Coppermind.»

**17th Shard:** su página de políticas dice «AI-generated or assisted content is not allowed anywhere
on the forums or discord» ([17S Forum and Discord Policies](https://www.17thshard.com/topic/89569-17s-forum-and-discord-policies/)).
El juego cae de lleno en esa norma, así que **por defecto no se publica allí**. Solo se publica si el
staff, tras leer el añadido de `COMMUNITIES.md` §2.2, dice por escrito que sí. La Coppermind tiene
una norma parecida para su propio contenido. Eso no prohíbe que el juego haya usado la Coppermind
como fuente de datos, pero conviene no presentarlo como «verificado por la Coppermind».
**Resto de comunidades:** la frase va en el propio mensaje, no solo si alguien pregunta, y hay que
leer su norma de IA igual que la de autopromoción. Los borradores también los ha escrito una IA, así
que hay que reescribirlos con tus palabras.

### 5.3 «Trivial del Cosmere» y la marca Trivial Pursuit
**Riesgo bajo pero evitable, y ya está corregido en el kit.** «Trivial Pursuit» es una marca
registrada de Hasbro, y en España el juego se vende como «Trivial» (por ejemplo, «Trivial clásico»).
Hasbro también reclama como marca el diseño del tablero y los «quesitos» de puntuación (fuentes al
final). Escribir «Trivial del Cosmere» o «tipo *Trivial*», en cursiva y con mayúscula, es usar el
nombre comercial de un tercero para describir y promocionar un producto. Eso puede sugerir una
relación que no existe, y además la mecánica (seis categorías de colores que hay que completar)
recuerda a la suya. No hace falta: «juego de preguntas» dice lo mismo. Se ha quitado de todos los
textos (8 apariciones en PLAN, COPY y posts) y de las dos imágenes en español (versiones `-v2`).
**Sigue apareciendo fuera del kit** (§7): en la pantalla «Acerca de» de la app en los 5 idiomas
(«al estilo Trivial», «Trivial-style», «im Stil von Trivial Pursuit», «façon Trivial Pursuit», «in stile
Trivial Pursuit») y en `docs/README.md` («tipo *Trivial*»). Recomiendo que el líder lo cambie antes del
lanzamiento.

### 5.4 «Lame d'éclat» en `docs/README.md`
**Se informa, no se edita (fuera de mi alcance).** `docs/README.md` («Nombres») pone como ejemplo de
nombres «de la edición oficial publicada» *Hoja esquirlada* / *Lame d'éclat* / *Splitterklinge* /
*Stratolama* y *Sagaz*. En `content/glossary.json` **las cinco formas están como `community`**
(Shardblade: es, fr, de e it `community`; Wit: es `community`). Para *Lame d'éclat* la nota dice «fan
reports… QA confirm». El README las presenta como oficiales sin fuente, y eso va contra la regla de
oro. Propuesta para el líder: cambiar los ejemplos por formas `official` (*Fulgiflamme*, *Souffle*,
*Allomantie*, *Hauch*, *Soffio*, *Cosmoverso*, *Sondeluz*) o decir «nombres de la edición publicada o,
si no hay fuente, de la comunidad». Ningún texto del kit usa *Lame d'éclat*.

## 6. Decisiones del dueño

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Borrar `feature-graphic-es.png` y `social-card-es.png` (con «Trivial») y quedarte con las `-v2` | Hecho por el líder: las corregidas sustituyen a las originales con el mismo nombre. |
| D2 | 17th Shard: pedir permiso al staff o descartarlo | Descartarlo para este lanzamiento. Si preguntas, publica solo con un «sí» por escrito. |
| D3 | Licencia del código (no hay `LICENSE`) | Si quieres decir «código abierto», añade una licencia (p. ej. MIT para el código; el contenido de las preguntas es otra cuestión, porque es obra derivada de fans). Si no, no uses la captura 08 (la selección recomendada de 6 no la incluye). |
| D4 | Cómo describir tu papel frente al de la IA | La fórmula de §5.2 es exacta según la documentación del proyecto. Si tú has revisado o escrito parte de las preguntas, se puede decir, pero solo si es verdad. No la quites ni la suavices. |
| D5 | Quitar «Trivial»/«Trivial Pursuit» de la pantalla «Acerca de» de la app y de `docs/README.md` | Sí, antes del lanzamiento (lo hace el líder: `app/` y `docs/README.md` quedan fuera de mi alcance). |
| D6 | Nombre del proyecto | «Trivia del Cosmere» usa un término de Dragonsteel. Para un proyecto gratuito el riesgo es bajo (la restricción de nombres de la política es para obras comerciales). Mantenerlo, con el aviso de no oficial siempre al lado. En inglés la app se llama «Cosmere Trivia»: elegir un solo nombre público sería más claro. |
| D7 | Fecha del día L, comunidades concretas, cuenta personal o del proyecto, formulario de opinión | Las del plan (`PLAN.md` §8). |

## 7. Fuera de `docs/marketing/` (para el líder; no lo he tocado)

1. `docs/README.md`, «Nombres»: ejemplos `community` presentados como oficiales (§5.4).
2. `docs/README.md`, primera línea: «Juego de preguntas tipo *Trivial*» (§5.3).
3. `app/i18n/*.json`, `about.body`: «Trivial»/«Trivial Pursuit» en los 5 idiomas (§5.3).
4. `app/i18n/*.json`, `about.disclaimer`: dice «sin relación con» pero no «ni respaldado por».
   Recomendable añadirlo para que coincida con las imágenes y con la política de Dragonsteel.
5. Repositorio sin `LICENSE` (D3).
6. En el árbol de trabajo hay cambios sin confirmar en `app/` (`app.css`, `core.js`, `main.js`) que no
   son de esta revisión. Si cambian la interfaz, hay que repetir las capturas (`ASSETS.md`).

## 8. Fuentes

- Dragonsteel / Brandon Sanderson, Fan Art Policy: https://www.brandonsanderson.com/pages/fan-art-policy
- Brandon Sanderson FAQ, «Can I make fan art or write fan fiction?»: https://faq.brandonsanderson.com/knowledge-base/can-i-make-fan-art-or-write-fan-fiction
- Brandon Sanderson FAQ, licencias: https://faq.brandonsanderson.com/article-categories/licensing/
- 17th Shard, «17S Forum and Discord Policies»: https://www.17thshard.com/topic/89569-17s-forum-and-discord-policies/
- 17th Shard, «Policy on self promotion» (2018): https://www.17thshard.com/forums/topic/66820-policy-on-self-promotion/
- Hasbro compra la propiedad intelectual de Trivial Pursuit: https://www.licenseglobal.com/archive/hasbro-acquires-intellectual-property-trivial-pursuit
- Registro de la marca TRIVIAL PURSUIT (EE. UU.): https://trademark.justia.com/735/56/trivial-73556457.html
- Ficha de producto con el aviso de marcas de Hasbro (tablero, tarjetas, quesitos): https://www.boots.ie/trivial-pursuit-10305240
- «Trivial clásico» a la venta en España: https://www.elcorteingles.es/juguetes/A23555728-trivial-clasico
