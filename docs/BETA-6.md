# Beta 6 — regresión de la 2.0.1 (commit 1838199)

Ronda de regresión con las dos personas más exigentes sobre los arreglos de la beta 5.
Lucía y Marc no repiten: su nota de la beta 5 (9 y 9) se mantiene porque ninguno de sus
hallazgos seguía abierto.

| Tester | Exigencia | Nota | Recomendación |
|---|---|---|---|
| Lucía (beta 5) | 1/4 | 9 | sí |
| Marc (beta 5) | 2/4 | 9 | sí |
| Hannah | 3/4 | 9 | sí |
| Ignacio | 4/4 | 9 | sí, con reservas |

**Condición de lanzamiento (todas las notas > 8): cumplida.** Sin hallazgos bloqueantes ni graves.

> Las cuatro personas son agentes de IA con un perfil definido (`.claude/agents/beta-*.md`), no
> lectores reales: sus notas sirven como control de calidad interno, nunca como reseñas públicas.

## Verificado como arreglado
Doble toque en botones que cambian de pantalla (sin saltarse «Pasa el móvil» ni perder récords),
Ajustes y preparación al 200 % en los cinco idiomas, partidas en grupo fuera de la colección,
Fácil con la dificultad más cercana, mensajes de la ronda de cierre, sel-020, roshar-074/075 neutros,
reloj atrasado en el reto diario, aviso de logro junto a Atrás, textos FR/IT neutros, «Problem melden».

## Hallazgos (todos menores o sugerencias)
App:
1. (Ignacio) El guard de doble toque es opcional: el segundo toque aún puede girar la ruleta
   (`classic.js` botón Girar, `wheel.js`) o abrir Práctica desde Inicio (`home.js`), y saltar un
   paso del onboarding. Propuesta: guard para todos los botones de una pantalla recién pintada.
2. (Ignacio) Atrasar el reloj del sistema con una pregunta revelada devuelve el tiempo
   (`game.js` `clockLeft`). Propuesta: `performance.now()` dentro de la sesión.
3. (Ignacio, Hannah) Al 200 %: «Herausforderung» se sale en Inicio (de), «Cosmoverso» se parte
   sin guion (it), partición alemana sin guion en headless (pendiente de Android real).
4. (Ignacio) El nombre por defecto «Jugador 1» no cambia al cambiar de idioma.
5. (Hannah) es «¿Seguro?» del borrado; de `finalRoundOn`/`lastChanceGone` mejorables;
   fr Estadísticas «· 3 %» empieza línea.

Contenido:
6. (Hannah) de: 7 preguntas con la interrogativa al final calcada del inglés (nalthis-004, 036,
   056, 057, roshar-046, scadrial-018…); roshar-070 cita solo «Der Weg der Könige».
7. (Hannah) it scadrial-063 «negli epigrafi»; es/it otros-022 opciones con géneros distintos;
   fr cosmere-083 falta artículo.
8. (Ignacio) es nalthis-012 «Mandatos sencillas» (resto del cambio Orden → Mandato).
9. (Ignacio) cosmere-083 y 085 con criterio de `work` distinto; cosmere-081/082 sobre el mismo
   cameo de Hoid y quizá d3.

## Decisiones del líder
- Se lanza la 2.0.x. Los hallazgos 1–9 se corrigen antes de publicar (2.0.2) porque son baratos;
  no requieren otra ronda completa: basta con las pruebas automáticas y una regresión de Ignacio.
- La partición con guion en alemán (3) se verificará en un Android real tras publicar.
