---
name: comprobar-lote
description: Use when, in the main copy of a repository that works with Orca worktrees, the equipo plugin asks to check a batch of branches just merged into the main branch, when a branch was merged by hand and needs checking, or when typing /comprobar-lote.
---

# /comprobar-lote — comprobar en la principal lo que acaba de subir

**Solo en la copia principal.** Una sola comprobación por lote: nada de repetir todo ni lo que los agentes ya pasaron.
No arregles en la principal lo que falla en una rama ni deshagas fusiones sin que lo pida el usuario.

Los scripts del plugin están en `../../scripts` respecto a la carpeta de esta skill (la «Base directory» que sale al
cargarla). Abajo se escriben como `<scripts>`. Los ajustes, con `node <scripts>/ajustes.mjs`.

Ramas del lote: las de la petición del mod (que trae el aviso de cada agente, con su «Probar:»), o las que diga el
usuario (su fusión, con `git log --merges --oneline -10`; su aviso, en la conversación). Las apartadas no son del lote:
el mod ya avisó a sus agentes.

## Pasos

1. **Generados** (si alguna toca `generados`; lo dice la petición o `pruebas.mjs`): al fusionar se han quedado como
   estaban donde chocaban. Rehazlos una vez con `comandos.regenerar` y haz commit **uno a uno** solo de lo generado
   que cambie: «Lote de subidas: generados rehechos tras <ramas>».
2. **Renumerar** (solo con `backlog.activo`):
   - `node <scripts>/renumerar.mjs --aplicar <nombres cortos del lote>`. Escribe `viejo → nuevo` y los archivos que
     cambia.
   - `node <scripts>/renumerar.mjs --comprobar <nombres cortos del lote>` debe salir con 0.
   - `node <scripts>/renumerar.mjs` sin nombres enseña los que quedan de ramas anteriores. No los toques sin
     preguntar: díselos al usuario en el paso 5.
   - Commit con los archivos que dijo el script y los códigos nuevos en el asunto: «Lote de subidas: códigos de
     <ramas> renumerados (<T88-T90>)».
3. **Pruebas, una sola vez.** Propuesta: `node <scripts>/pruebas.mjs <fusión>^1..<fusión> …`, una por rama.
   - `comandos.compilar`, una vez.
   - Las pruebas de lo que tocan: primero las del «Probar:» de cada aviso; si no dice nada, las que propone
     `pruebas.mjs` (con `comandos.probarArchivos` si está puesto). Una prueba que vale para dos ramas se pasa una vez.
   - Si no sabes acotarlas, `comandos.probar`, una vez para todo el lote.
4. **Resultado:** la herramienta `mcp__equipo__resultado_lote` con cada rama del lote: `ok`, o el motivo del fallo.
   Vale el nombre corto. Para una fusionada a mano que no está en la franja, añade `sesion` (la de su agente en
   `ListAgents`). Si responde «quedan sin renumerar», vuelve al paso 2.
5. **Al usuario:** qué entró, qué quedó apartado y con quién choca, qué se ha probado y qué no, y los códigos viejos sin
   renumerar si los hay. En pocas líneas.
6. **Apuntar lo que queda** en el documento de `pendientes`: quita la fila de «En marcha» de cada rama subida y añade
   lo que no se ha probado. Commit solo de ese archivo: «Pendientes: <ramas> subidas».

## Errores comunes

| Error | Consecuencia |
|---|---|
| Decir «renumerados» sin `--comprobar` | Quedan filas `| rama-T1 |` en el backlog |
| `git add -A` tras regenerar | La guarda lo niega en la principal: añade uno a uno |
| Pasar las pruebas una vez por rama | Tiempo perdido: una sola tanda para el lote |
| No llamar a `resultado_lote` | El worktree no se cierra y el agente no se entera |
| Arreglar en la principal lo de una rama | No: `resultado_lote` con el motivo y lo arregla su agente |
