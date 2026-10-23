<!--
Template for the project's CLAUDE.md (or AGENTS.md). Before writing it:
- translate it into the team's language (the `idioma` setting);
- replace every <placeholder> with this project's value;
- keep only the decisions line that applies: numbered blocks (decisiones.activo), the ADR-folder variant, or neither;
  drop the backlog line if backlog.activo is off;
- if comandos.probarArchivos is empty, replace the "Some tests" line with how to run a narrower set by hand (a test
  filter, a package path) or drop it;
- drop this comment.
Keep verbatim, in any language: the skill names (encargo, lista-para-subir, comprobar-lote, estado-ramas), the notice
sentence «La rama X está lista para subir» and the button labels (Subir, Solucionar). The plugin recognises the notice
by that exact sentence and draws the buttons itself. A short gloss in the team's language next to them is fine.
-->

## Parallel work (Orca worktrees and the equipo plugin)

Each task runs on its own branch, in its own Orca worktree, with its own agent; several can run at once. Check where
you are: in the main copy `.git` is a folder, in a worktree it is a file. The workflow settings are in
`.claude/equipo.json`.

**In the main copy (`<main branch>`): do not implement tasks here.**
- For each thing the user asks for, launch a worktree with the `encargo` skill; the user then talks to that agent.
- This session launches tasks, merges what agents finish, and handles general questions, status and documents.
- When an agent finishes, its notice "La rama X está lista para subir" shows up above the prompt with a **Subir**
  button. Pressing it is the user's decision: never merge a branch yourself unless the user asks.
- After a batch is merged, the plugin asks for one check of the whole batch: follow the `comprobar-lote` skill. Do not
  fix a failing branch here; report it with `resultado_lote` so its own agent fixes it.
- How the branches are doing: the `estado-ramas` skill, or the `/ramas` panel.

**In a worktree: everything you do belongs to this copy; do not touch the others.**
- Work and commit on your branch, adding your files one by one. **Never merge into `<main branch>`**: the plugin's
  guard blocks it.
- Design decisions (numbered blocks): only with the numbers of the block reserved for you (`<prefix>…`, given in the
  task).
- Design decisions (ADR folder `<folder>`): take the next free ADR number when you merge `<main branch>`, just before
  notifying.
- New backlog items: prefixed with your branch name (`my-branch-T1`); the main copy renumbers them on merge.
- When you finish (and every time you fix something the main session asks for), follow the `lista-para-subir` skill:
  merge `<main branch>` into your branch, check it compiles, rerun only the tests that overlap, and notify the main
  session.

**What to test:** what changed and what depends directly on it, not everything.
- Compile: `<comandos.compilar>`
- Some tests: `<comandos.probarArchivos>`
- All tests: `<comandos.probar>` (only for changes to shared foundations, or when the scope is unclear)
