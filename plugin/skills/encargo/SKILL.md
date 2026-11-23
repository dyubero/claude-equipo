---
name: encargo
description: Use when, in the main copy of a repository that works with the equipo plugin (the main branch checked out, .git is a folder), the user asks for new work that must go to its own worktree and agent, or types /encargo.
---

# /encargo — lanzar un encargo en su worktree

Desde la copia principal no se implementa: cada encargo va a un worktree nuevo con su propio agente, y el usuario
habla después con ese agente. Esta skill lo lanza entero, sin olvidar nada. **Solo en la copia principal** (`.git` es
una carpeta). En un worktree, no la uses.

Los scripts del plugin están en `../../scripts` respecto a la carpeta de esta skill (la «Base directory» que sale al
cargarla). Abajo se escriben como `<scripts>`.

Si el proyecto no tiene `.claude/equipo.json`, todavía no está preparado: sigue antes la skill `equipo:adapt-to-project`
(estudia el proyecto y pregunta al usuario cómo compila, prueba y documenta).

El worktree lo crea `worktree.mjs`, con Orca si está instalado y con `git worktree` si no. No llames tú a `orca` ni a
`git worktree add`: el script además reserva el bloque de decisiones, deja el encargo donde el agente lo lee y abre su
sesión.

## Pasos

1. **Ajustes:** `node <scripts>/ajustes.mjs`. De ahí salen la rama principal, si se usan decisiones numeradas
   (`decisiones.activo`) y el documento de pendientes.
2. **Decisiones de diseño abiertas.** Si el encargo deja cosas que decide el usuario, elige una de dos:
   - el encargo es corto y las dudas son pocas: pregúntaselas antes, en un bloque con opciones y una recomendación;
   - el encargo es grande o pide explorar primero: lánzalo y di en el encargo que el agente le presente esas preguntas
     antes de implementar.
3. **Nombre corto:** kebab-case, 1-3 palabras del encargo (`carrito-pago`, `login-magico`). Es el nombre de la carpeta
   y el final de la rama (Orca le pone su prefijo, `usuario/<nombre>`; con git, el de `worktrees.prefijoRama`). Si ya
   hay un worktree o una rama con ese nombre (`node <scripts>/worktree.mjs lista`), elige otro.
4. **Texto del encargo**, en un archivo temporal (escríbelo con tu herramienta de archivos, no con la shell). Lleva:
   - lo que pidió el usuario, **tal cual**, entre «»;
   - lo que se haya decidido con él (opciones elegidas), o qué preguntas tiene que hacerle el agente.

   No hace falta quitar comillas ni ningún otro carácter: el texto no pasa por la línea de órdenes. Tampoco hace falta
   escribir el bloque de decisiones ni «al acabar, sigue lista-para-subir»: lo añade el script al final.
5. **Crear:** `node <scripts>/worktree.mjs crear <nombre> --encargo <archivo>`. Contesta en JSON:
   - `error`: no se ha creado. Cuéntaselo al usuario con el error; no lo reintentes con otro nombre por tu cuenta.
   - `ruta`, `rama` y `bloque` (el bloque de decisiones reservado, si se usan).
   - `lanzado: true`: la sesión del agente ya está abierta (en Orca, o en la pestaña o ventana que abre el lanzador).
   - `lanzado: false`: no se ha podido abrir sola (`motivo` dice por qué; con el lanzador `manual` es lo normal). Dale al
     usuario la orden de `orden` para que la pegue en una terminal nueva.
6. **Documento de pendientes** (`pendientes` de los ajustes):
   - una fila al final de la tabla de «## En marcha»: `| <nombre> | <resumen en una línea> | <bloque o —> |` (si la
     sección no existe, créala con la cabecera `| Rama | Encargo | Decisiones |`);
   - «Actualizado el <hoy>.» si el documento tiene esa línea.

   Commit solo de ese archivo: `git add <documento>` y `git commit -m "Pendientes: <nombre> en marcha"` (en el idioma
   de `idioma`).
7. **Al usuario:** el nombre del worktree, el bloque si lo hay y que a partir de ahora habla con ese agente (o la orden
   que tiene que pegar, si no se ha abierto solo).

## Varios encargos a la vez

Un worktree por encargo, creados uno tras otro: cada `crear` reserva su bloque, así que el siguiente ya lo cuenta. Un
solo commit del documento de pendientes con todas las filas.

## Errores comunes

| Error | Cómo se evita |
|---|---|
| El encargo pierde lo que dijo el usuario | Su texto va literal, entre «» |
| Crear el worktree a mano (`orca worktree create`, `git worktree add`) | Sin bloque reservado ni archivo de encargo: siempre `worktree.mjs crear` |
| Decir «ya habla con su agente» con `lanzado: false` | La sesión no está abierta: dale la orden de `orden` |
| Se implementa en la copia principal | Nunca: desde la principal solo se crean worktrees y se suben ramas |
