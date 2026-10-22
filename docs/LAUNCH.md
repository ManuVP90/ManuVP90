# Lanzamiento de la 2.0.2

Estado: **listo para publicar** a falta de los pasos del dueño. Condición de lanzamiento cumplida
en la beta 6 (todas las notas > 8, sin hallazgos bloqueantes ni graves; ver `docs/BETA-6.md`).

## 1. Publicar la app (dueño, ~10 min)
1. En GitHub, **Settings → Pages → Source: GitHub Actions**.
2. Fusionar el PR #1 (`claude/cosmere-trivia` → `main`). La CI pasa las pruebas y el flujo
   `pages.yml` despliega la app en https://manuvp90.github.io/ManuVP90/.
3. Comprobar en la pestaña *Actions* que «Deploy to GitHub Pages» termina en verde.

## 2. Comprobar en móviles reales (dueño, ~20 min)
- [ ] Android (Chrome) e iPhone (Safari): abre la URL, *Añadir a pantalla de inicio*, ábrela desde
      el icono en modo avión: debe funcionar sin conexión.
- [ ] Una partida clásica de 2 jugadores, una rápida y el reto diario.
- [ ] Alemán con texto grande en Android: las palabras largas se parten con guion (pendiente de la
      beta 6; no se puede comprobar en el navegador de pruebas).
- [ ] «Avisar de un error» abre la issue de GitHub con los datos rellenados.

## 3. Difundir (dueño, según `docs/marketing/README.md`)
El kit está en `docs/marketing/`: plan, textos en 5 idiomas, borradores por comunidad, respuestas
tipo e imágenes. Decisiones abiertas antes de publicar: 17th Shard (prohíbe contenido con IA),
licencia del código, nombre público en inglés y fecha/comunidades.

## Reglas que no cambian
- Proyecto de fans no oficial, sin afiliación ni respaldo de Brandon Sanderson o Dragonsteel, gratis,
  sin anuncios ni donaciones.
- Decir siempre que lo han hecho agentes de IA dirigidos por un fan.
- No citar a los testers de la beta como opiniones reales: son personas simuladas.

## Después del lanzamiento
- Errores reportados → arreglo con prueba de regresión, versión 2.0.x.
- Terminología `unverified`: buscar lectores nativos con los libros (`docs/verification/`).
