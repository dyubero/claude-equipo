---
name: estado-ramas
description: Use when, in the main copy of a repository that works with the equipo plugin (one worktree per task), the user asks how the branches or worktrees are doing, which are ready, stuck or waiting, what would conflict if merged now, or types /estado-ramas.
---

# /estado-ramas — how all the branches are doing

Read-only: it touches no copy, merges nothing, closes no worktree and notifies nobody. Whatever needs doing is
proposed to the user.

Talk to the user in the language they write to you in.

The plugin's scripts are in `../../scripts` relative to this skill's folder (the "Base directory" shown when the skill
loads). They print Spanish: read their output, do not relay it verbatim.

If the project has no `.claude/equipo.json`, it is not set up yet: follow the `equipo:adapt-to-project` skill first.

## Steps

1. `node ../../scripts/estado.mjs` (with the full path). For each worktree it gives:
   - its phase, its reserved block of decision numbers, and its agent's state (known only with Orca; without it the
     script prints "sin agente" and the phase is deduced from git alone);
   - `+ahead/−behind` the main branch, and what it has uncommitted (not counting `prohibidos`).

   It then does a dry run of merging every branch that carries commits: in which order they would go in, which would
   conflict, with which and in which files, and which touch generated files. To process the data: `--json`.
2. Claude cannot see the bar above the user's prompt. If a branch shows as up to date and ready ("al día, para subir"),
   ask the user whether it is in their bar; if not, its agent may not have sent the notice (step 7 of
   `equipo:lista-para-subir`).
3. Tell the user, grouped, starting with what needs something from them:

| Phase (as the script prints it) | What it means | What to propose |
|---|---|---|
| a media fusión | An unfinished `git merge` in the worktree (MERGE_HEAD) | Its agent resolves it; if it is idle, tell it |
| esperando al usuario | Agent idle, not up to date or with uncommitted changes | Look at its session: it usually has a question |
| al día, para subir | It carries commits, has everything from the main branch, and its agent is idle | If it is not in the bar, ask its agent for the notice |
| en marcha | Its agent is working | Nothing |
| todo en la principal | It carries nothing the main branch lacks | Close it with `resultado_lote` ok, if the user wants |

4. From the dry run, say the order they would go in and, for each one left out, what it conflicts with and in which
   files. What resolves on its own is not a conflict: append-only `unir` documents, and `generados` files.

Do not hand the user the raw output: a short summary, with the branches that need something first.
