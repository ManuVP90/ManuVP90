# Equipo de agentes

El proyecto se desarrolla con un equipo de agentes de Claude Code coordinado por un líder (la sesión
principal). Todo está versionado en `.claude/`, así que cualquier sesión nueva sobre este repositorio
dispone del mismo equipo, las mismas reglas y los mismos flujos.

```
.claude/
├── CLAUDE.md          memoria del proyecto: regla de oro, comandos, reglas de ingeniería y de contenido
├── settings.json      permisos: comandos de validación permitidos, operaciones peligrosas bloqueadas
├── agents/            un fichero por rol (prompt de sistema + herramientas permitidas)
├── workflows/         flujos guardados que encadenan a los agentes
└── skills/steward/    convenciones para llevar un PR a verde
```

## Roles

| Agente | Rol | Escribe en | Herramientas |
|---|---|---|---|
| `question-writer` | Redacta preguntas en inglés de un mundo, verificadas | `content/en/` | lectura, edición, terminal, búsqueda web |
| `fact-checker` | Verificador adversarial de preguntas nuevas o cambiadas | `content/en/` | ídem |
| `terminologist` | Dueña del glosario y de la regla de nombres oficiales | `content/glossary.json`, `docs/verification/` | ídem |
| `translator-es` / `-fr` / `-de` / `-it` | Traductor y responsable terminológico de su idioma | `content/<idioma>/` | ídem |
| `game-developer` | Desarrollador de la PWA | `app/`, `tools/smoke.mjs`, `tools/edge.mjs` | lectura, edición, terminal |
| `devops-engineer` | CI/CD, validadores y pruebas | `.github/`, `tools/`, `docs/CONTRIBUTING.md` | ídem |
| `qa-engineer` | Pasa todas las puertas de calidad y revisa capturas | — (solo lectura) | lectura, terminal |
| `release-manager` | Integra, regenera datos, documenta y hace commit | todo el repo | lectura, edición, terminal |
| `product-designer` | Producto y diseño de juego; prioriza y redacta actas | — (solo lectura) | lectura, terminal, búsqueda web |
| `beta-lucia` | Tester 1/4: lectora ocasional, Android | — (solo lectura) | lectura, terminal, búsqueda web |
| `beta-marc` | Tester 2/4: club de lectura, iPhone, 4–6 jugadores | — | ídem |
| `beta-hannah` | Tester 3/4: traductora alemana, calidad lingüística | — | ídem |
| `beta-ignacio` | Tester 4/4: editor de la Coppermind, intenta romper la app | — | ídem |

Principios de trabajo:
- **Propiedad de ficheros disjunta:** los agentes que trabajan en paralelo nunca tocan los mismos
  ficheros, y ninguno hace commit. Solo el líder o `release-manager` integran y publican.
- **Toda afirmación con evidencia:** hechos y nombres verificados con fuentes. Cada fallo
  corregido lleva su prueba de regresión.
- **Puertas de calidad** antes de cada commit: `build --check`, `check-app`, `unit`, `smoke`, `edge`.
  La CI de GitHub repite las mismas comprobaciones.

## Flujos guardados

Se lanzan pidiéndoselo a Claude, por ejemplo: «ejecuta el flujo `beta-round` con round 2».

| Flujo | Qué hace | Argumentos |
|---|---|---|
| `content-pipeline` | Redactor → verificador → 4 traductores en paralelo | `world`, `counts` (`{d1,d2,d3,d4}`), `scope`, `rev` |
| `translate` | Traduce a los 4 idiomas lo nuevo o cambiado desde una revisión | `rev`, `langs` |
| `dev-change` | Desarrollador implementa → QA independiente revisa | `brief` (con criterios de aceptación) |
| `beta-round` | Los 4 testers en paralelo → triaje deduplicado y priorizado | `round`, `previous`, `focus`, `testers` |
| `team-meeting` | 5 perfiles revisan el proyecto → acta con plan por fases | `topic` |
| `release` | Integra, regenera datos, pasa puertas, commit y push → QA posterior | `summary` |

Ciclo habitual de una versión:

1. `team-meeting` para decidir el siguiente paso.
2. `content-pipeline` y/o `dev-change`. Pueden ir en paralelo porque tocan ficheros distintos.
3. `beta-round` y, después, los arreglos.
4. `beta-round` en modo regresión, con `previous`.
5. `release`.

## Ampliar el equipo

Para añadir un rol, crea `.claude/agents/<nombre>.md` con la cabecera `name`, `description` (cuándo
usarlo) y `tools`, y escribe debajo su prompt. Los flujos lo usan con `agentType: '<nombre>'`.
Las reglas comunes van en `.claude/CLAUDE.md`, que todos los agentes reciben automáticamente;
no hace falta repetirlas en cada rol.
