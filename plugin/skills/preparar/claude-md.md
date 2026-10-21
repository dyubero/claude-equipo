## Trabajo en paralelo (worktrees de Orca y plugin equipo)

Cada encargo va en una rama nueva con su worktree de Orca y su propio agente; puede haber varios a la vez. Mira dónde
estás: en la copia principal, `.git` es una carpeta; en un worktree, es un archivo. Los ajustes del flujo están en
`.claude/equipo.json`.

**En la copia principal (`<ramaPrincipal>`):** no implementes aquí los encargos.
- Por cada cosa que pida el usuario, lanza un worktree con la skill `encargo`; después el usuario habla con ese agente.
- Aquí se lanzan encargos, se sube lo que acaban los agentes y se atiende lo general (preguntas, estado, documentos).
- Cuando un agente acaba, su aviso «La rama X está lista para subir» sale en la franja de encima del prompt con
  «Subir». Pulsar «Subir» es la orden del usuario: nunca fusiones tú una rama sin que lo pida.
- Al acabar de subir, el plugin pide una comprobación del lote: sigue la skill `comprobar-lote`. No arregles aquí lo que
  falla en una rama: se lo dices a su agente con `resultado_lote`.
- Cómo van las ramas: skill `estado-ramas`, o el panel `/ramas`.

**En un worktree:** todo lo tuyo es de esta copia; no toques las demás.
- Trabaja y haz commits en tu rama, añadiendo tus archivos uno a uno. **Nunca fusiones en `<ramaPrincipal>`**: la
  guarda del plugin lo niega.
- Decisiones de diseño: solo con los números del bloque que te han reservado (`<prefijo>…`, en el encargo).
- Pendientes nuevos del backlog: con el nombre de tu rama delante (`mi-rama-T1`); la principal los renumera al subir.
- Cuando acabes (y cada vez que arregles algo que te pidan desde la principal), sigue la skill `lista-para-subir`:
  trae `<ramaPrincipal>`, comprueba que compila, repite solo las pruebas que se cruzan y avisa a la sesión principal.

**Qué probar:** lo que cambia y lo que depende de ello, no todo. Compilar: `<comandos.compilar>`. Unas pruebas:
`<comandos.probarArchivos>`. Todas: `<comandos.probar>` (solo si el cambio es de base o no se sabe acotar).
