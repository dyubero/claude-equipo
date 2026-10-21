---
name: lista-para-subir
description: Use when, in an Orca worktree (not the main copy; .git is a file), the assigned work or a fix requested from the main session is finished and the branch must be offered for upload to the main branch, or when typing /lista-para-subir.
---

# /lista-para-subir — avisar de que la rama está lista

**Solo en un worktree** (`.git` es un archivo). Nunca fusionas en la rama principal: lo hace el usuario desde la sesión
principal con «Subir» (el plugin equipo lo niega desde aquí). Antes de empezar, las pruebas de lo tuyo ya tienen que
haber pasado.

Los scripts del plugin están en `../../scripts` respecto a la carpeta de esta skill (la «Base directory» que sale al
cargarla). Abajo se escriben como `<scripts>`. Los ajustes, con `node <scripts>/ajustes.mjs`.

## Pasos

1. **Commit de lo tuyo:**
   - archivo a archivo con `git add <ruta>`; nunca los de `prohibidos` (la guarda los niega);
   - el mensaje, en el idioma de `idioma`, dice qué hace; con decisiones numeradas, lleva sus códigos entre paréntesis.
   - Con decisiones: solo las del bloque que te reservaron. Con backlog: tus códigos nuevos llevan el nombre corto de
     la rama delante (`carrito-T1`); **no los renumeres**: lo hace la principal al subir.
2. **Traer la principal:** `git merge <rama principal>` (sin choques vale el mensaje que pone git).
   - Los documentos de `unir` (y el de decisiones y el backlog, si están activos) con solo añadidos por los dos lados
     se unen solos. Los de `generados` se quedan con lo tuyo.
   - Si choca algo de eso, es que los drivers no están instalados: `git merge --abort`,
     `node <scripts>/fusion.mjs instalar` y repite.
   - Otros choques: resuélvelos, compila y `git commit`.
3. **Qué ha traído la principal:** `node <scripts>/pruebas.mjs ORIG_HEAD..HEAD`. Si no traía nada (`Already up to
   date`), salta este paso y el 4: basta lo que ya pasaste.
4. **Repite solo lo que se cruza con lo tuyo:**
   - si cambian `package.json` o algo de `generados`, instala o rehaz (`comandos.regenerar`) y haz commit solo de lo
     generado que cambie;
   - siempre `comandos.compilar`;
   - las pruebas que `pruebas.mjs` propone y que también son tuyas (con `comandos.probarArchivos` si está puesto);
   - si nada se cruza, basta compilar. No repitas lo que ya pasó.
5. **El commit de la punta:** `git rev-parse --short HEAD`.
6. **Las sesiones**, con `ListAgents` (cárgala con ToolSearch si hace falta):
   - la tuya es la línea «This session is …»;
   - la principal es la que empieza por `sesionPrincipal` de los ajustes o, si está vacío, por el nombre de la carpeta
     de la copia principal (`git worktree list`, la primera; los «_» pasan a «-»). El destinatario de `SendMessage` es
     ese nombre, tal cual.
   - Si hay varias o ninguna, no adivines: dile al usuario que avise él y dale el mensaje.
7. **Aviso** con `SendMessage` a la principal, **exactamente** con este formato (la franja lo lee por sus etiquetas):
   ```
   La rama <rama completa, p. ej. ana/carrito> está lista para subir (<commit corto>)
   Sesión: <tu sesión>
   Resumen: <una línea para el mensaje de la fusión, con los códigos si los hay>
   Qué cambia: …
   Decisiones: …
   Probar: <qué pruebas conviene pasar en la principal>
   Por revisar:
   - <lo que no está bien, no has podido probar o el usuario tiene que mirar; quita el apartado si no hay nada>
   ```
   Lo que no has repetido tras traer la principal porque no se cruzaba no va en «Por revisar».
8. **Al usuario:** que está lista para subir y, en una línea, qué has probado (antes y después de traer la principal) y
   qué no. Después espera:
   - si la principal avisa de que se ha subido, el worktree se cierra solo;
   - si avisa de un choque, de que la ha apartado o de un fallo, arréglalo y vuelve al paso 1.

## Errores comunes

| Error | Consecuencia |
|---|---|
| Avisar sin traer la principal | Choca al subir y vuelta a empezar |
| «Lista para subir» con otras palabras | No sale en la franja |
| Renumerar el backlog en la rama | Choca con otras ramas; eso lo hace la principal |
| Repetir todas las pruebas tras traer la principal | Tiempo perdido: solo lo que se cruza |
| `git merge` hacia la principal o `git push` | La guarda lo niega; no lo rodees |
