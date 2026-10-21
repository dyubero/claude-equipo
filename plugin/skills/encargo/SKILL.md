---
name: encargo
description: Use when, in the main copy of a repository that works with Orca worktrees (the main branch checked out, .git is a folder), the user asks for new work that must go to its own Orca worktree and agent, or types /encargo.
---

# /encargo — lanzar un encargo en su worktree

Desde la copia principal no se implementa: cada encargo va a un worktree nuevo de Orca con su propio agente, y el
usuario habla después con ese agente. Esta skill lo lanza entero, sin olvidar nada. **Solo en la copia principal**
(`.git` es una carpeta). En un worktree, no la uses.

Los scripts del plugin están en `../../scripts` respecto a la carpeta de esta skill (la «Base directory» que sale al
cargarla). Abajo se escriben como `<scripts>`.

## Pasos

1. **Ajustes:** `node <scripts>/ajustes.mjs`. De ahí salen la rama principal, si se usan decisiones numeradas
   (`decisiones.activo`), el documento de pendientes y el nombre del repositorio en Orca (`orca.repo`; vacío = el nombre
   de la carpeta de la copia principal).
2. **Decisiones de diseño abiertas.** Si el encargo deja cosas que decide el usuario, elige una de dos:
   - el encargo es corto y las dudas son pocas: pregúntaselas antes, en un bloque con opciones y una recomendación;
   - el encargo es grande o pide explorar primero: lánzalo y di en el encargo que el agente le presente esas preguntas
     antes de implementar.
3. **Nombre corto de la rama:** kebab-case, 1-3 palabras del encargo (`carrito-pago`, `login-magico`). Orca crea la rama
   con su prefijo (`usuario/<nombre>`). Si ya hay un worktree o una rama con ese nombre (`orca worktree ps`), elige otro.
4. **Bloque de decisiones** (solo con `decisiones.activo`): `node <scripts>/bloque.mjs`. Mira el documento de diseño de
   todas las ramas y copias y los comentarios de Orca de los worktrees vivos. No lo calcules a mano.
5. **Texto del encargo.** Tiene que llevar:
   - lo que pidió el usuario, **tal cual**, entre «»;
   - lo que se haya decidido con él (opciones elegidas), o qué preguntas tiene que hacerle el agente;
   - con decisiones: «Tu bloque de decisiones reservado es D…-D….»;
   - «Al acabar, sigue la skill equipo:lista-para-subir. No fusiones tú en <rama principal>.».

   **Sin comillas dobles `"` en ningún sitio**: Orca corta el `--prompt` en la primera. Dentro del texto del usuario,
   que ya va entre «», sus `"` pasan a `'`. Tampoco van \` ni `$`, que los toca la shell.
6. **Crear:**
   ```sh
   orca worktree create --repo name:<repo> --name <nombre> --no-parent --base-branch <rama principal> \
     --agent claude --prompt "<encargo>" --json
   ```
   De la respuesta JSON se saca la ruta (`path`). Si falla, cuéntaselo al usuario con el error: no lo reintentes con
   otro nombre por tu cuenta.
7. **Comentario con el bloque** (solo con decisiones): `orca worktree set --worktree path:<ruta> --comment "D…-D…"`.
   Con `orca worktree ps --json`, comprueba que ese worktree tiene ese `comment`.
8. **Documento de pendientes** (`pendientes` de los ajustes):
   - una fila al final de la tabla de «## En marcha»: `| <nombre> | <resumen en una línea> | <bloque o —> |` (si la
     sección no existe, créala con la cabecera `| Rama | Encargo | Decisiones |`);
   - «Actualizado el <hoy>.» si el documento tiene esa línea.

   Commit solo de ese archivo: `git add <documento>` y `git commit -m "Pendientes: <nombre> en marcha"` (en el idioma
   de `idioma`).
9. **Al usuario:** el nombre del worktree, el bloque si lo hay y que a partir de ahora habla con ese agente.

## Varios encargos a la vez

Un worktree por encargo. Con decisiones, tras crear cada uno y poner su comentario, vuelve a ejecutar `bloque.mjs`: así
el siguiente ya cuenta el bloque reservado. Un solo commit del documento de pendientes con todas las filas.

## Errores comunes

| Error | Cómo se evita |
|---|---|
| El agente recibe el encargo cortado | Hay un `"` en el texto: cámbialo por «» o por `'` |
| Dos worktrees con el mismo bloque | Comentario de Orca puesto antes de calcular el siguiente bloque |
| El encargo pierde lo que dijo el usuario | Su texto va literal, entre «» |
| Se implementa en la copia principal | Nunca: desde la principal solo se crean worktrees y se suben ramas |
