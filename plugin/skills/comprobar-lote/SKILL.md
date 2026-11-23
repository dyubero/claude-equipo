---
name: comprobar-lote
description: Use when, in the main copy of a repository that works with the equipo plugin (one worktree per task), the plugin asks to check a batch of branches it has just merged into the main branch, when a branch was merged by hand and needs checking, or when the user types /comprobar-lote.
---

# /comprobar-lote — check in the main copy what has just been merged

**Only in the main copy.** One check per batch: do not repeat everything, nor what the agents already ran. Do not fix
in the main copy what fails in a branch, and do not undo merges unless the user asks.

Talk to the user in the language they write to you in. Write commits and the pending-work document in the team's
language: the `idioma` setting.

The plugin's scripts are in `../../scripts` relative to this skill's folder (the "Base directory" shown when the skill
loads); below they are written `<scripts>`. They print Spanish: read their output, do not relay it verbatim. Settings:
`node <scripts>/ajustes.mjs`.

If the project has no `.claude/equipo.json`, it is not set up yet: follow the `equipo:adapt-to-project` skill first.

Branches in the batch: the ones in the plugin's request (which carries each agent's notice, with its "Test:" line), or
the ones the user names (their merge commit, with `git log --merges --oneline -10`, or `git log --oneline -10` when the
project merges with squash; their notice, in the conversation). Branches left out by the dry run are not part of the
batch: the plugin has already told their agents.

## Steps

1. **Generated files** (if any branch touches `generados`; the request or `pruebas.mjs` says so): where they
   conflicted, the merge kept them as they were. Rebuild them once with `comandos.regenerar` and commit, **one by
   one**, only the generated files that change, with a message such as "Batch: generated files rebuilt after
   <branches>" in the team's language.
2. **Renumber** (only with `backlog.activo`):
   - `node <scripts>/renumerar.mjs --aplicar <short names in the batch>`. It prints `old → new` and the files it
     changes.
   - `node <scripts>/renumerar.mjs --comprobar <short names in the batch>` must exit with 0.
   - `node <scripts>/renumerar.mjs` with no names shows the ones left over from earlier branches. Do not touch them
     without asking: tell the user in step 5.
   - Commit the files the script named, with the new codes in the subject: "Batch: codes of <branches> renumbered
     (<T88-T90>)" in the team's language.
3. **Tests, once.** A proposal: `node <scripts>/pruebas.mjs <merge>^1..<merge> …`, one range per branch.
   - `comandos.compilar`, once, when it is set.
   - The tests of what the branches touch: first the ones under "Test:" in each notice; if it says nothing, the ones
     `pruebas.mjs` proposes (with `comandos.probarArchivos` when it is set). A test that serves two branches runs once.
   - If you cannot narrow them down, `comandos.probar`, once for the whole batch. If that is empty too, run the
     project's suite as its README or CI does, and suggest setting it up with `equipo:adapt-to-project`.
4. **Result:** the tool `mcp__equipo__resultado_lote` with every branch in the batch: `ok`, or the reason it fails.
   The short name works. For a branch merged by hand that is not in the bar, add `sesion` (its agent's, from
   `ListAgents`). If it answers that codes are still not renumbered, go back to step 2.
5. **Tell the user:** what got in, what was left out and what it conflicts with, what was tested and what was not, and
   any old codes still not renumbered. In a few lines.
6. **Note what is left** in the `pendientes` document: remove the "in progress" row of each merged branch and add what
   was not tested. Commit only that file.

## Common mistakes

| Mistake | What happens |
|---|---|
| Saying "renumbered" without `--comprobar` | Rows like `| branch-T1 |` stay in the backlog |
| `git add -A` after rebuilding | The guard refuses it in the main copy: add files one by one |
| Running the tests once per branch | Wasted time: one run for the batch |
| Not calling `resultado_lote` | The worktree is not closed and the agent never hears back |
| Fixing in the main copy what a branch broke | No: `resultado_lote` with the reason, and its agent fixes it |
