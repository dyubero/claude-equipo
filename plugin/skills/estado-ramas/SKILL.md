---
name: estado-ramas
description: Use when, in the main copy of a repository that works with Orca worktrees, the user asks how the branches or worktrees are going, which are ready, stuck or waiting, what would conflict if uploaded now, or types /estado-ramas.
---

# /estado-ramas — cómo van todas las ramas

Solo lee: no toca ninguna copia, no fusiona, no cierra worktrees y no avisa a nadie. Lo que haya que hacer, se le
propone al usuario.

Los scripts del plugin están en `../../scripts` respecto a la carpeta de esta skill (la «Base directory» que sale al
cargarla).

Si el proyecto no tiene `.claude/equipo.json`, todavía no está preparado: sigue antes la skill `equipo:preparar`
(estudia el proyecto y pregunta al usuario cómo compila, prueba y documenta).

## Pasos

1. `node ../../scripts/estado.mjs` (con la ruta completa). Para cada worktree da:
   - su fase, su bloque (comentario de Orca) y el estado de su agente;
   - `+delante/−detrás` de la rama principal y lo que tiene sin confirmar (sin contar los `prohibidos`).

   Después ensaya la subida de todas las que llevan commits: en qué orden entrarían, cuáles chocarían, con quién y en
   qué archivos, y cuáles tocan archivos generados. Para tratar los datos: `--json`.
2. La franja de subidas no se ve desde Claude. Si una rama sale «al día, para subir», pregunta al usuario si está en su
   franja; si no lo está, quizá su agente no mandó el aviso (paso 7 de `equipo:lista-para-subir`).
3. Cuéntaselo al usuario agrupado, primero lo que necesita algo de él:

| Fase | Qué significa | Qué proponer |
|---|---|---|
| a media fusión | `git merge` sin acabar en el worktree (MERGE_HEAD) | Que su agente lo resuelva; si está parado, avisarle |
| esperando al usuario | Agente parado, sin estar al día o con cambios sin confirmar | Mirar su sesión: suele tener una pregunta |
| al día, para subir | Lleva commits, tiene todo lo de la principal y su agente está parado | Si no está en la franja, pedirle el aviso |
| en marcha | Su agente trabaja | Nada |
| todo en la principal | No lleva nada que la principal no tenga | Cerrarla con `resultado_lote` ok, si el usuario quiere |

4. Del ensayo, di el orden en que entrarían y, de cada apartada, con quién choca y en qué archivos. Lo que se resuelve
   solo no cuenta como choque: los documentos de `unir` con solo añadidos, y los `generados`.

No pases al usuario la salida en bruto: un resumen corto, con las ramas que necesitan algo primero.
