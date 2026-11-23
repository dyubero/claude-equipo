---
name: encargo
description: Use when, in the main copy of a repository that works with the equipo plugin (the main branch checked out, .git is a folder), the user asks for new work that must go to its own worktree and agent, or types /encargo.
---

# /encargo — launch a task in its own worktree

Nothing is implemented in the main copy: each task goes to a new worktree with its own agent, and the user then talks
to that agent. This skill launches it whole, without forgetting anything. **Only in the main copy** (`.git` is a
folder). In a worktree, do not use it.

Talk to the user in the language they write to you in. Write the commit and the pending-work document in the team's
language: the `idioma` setting.

The plugin's scripts are in `../../scripts` relative to this skill's folder (the "Base directory" shown when the skill
loads); below they are written `<scripts>`. They print Spanish or JSON: read their output, do not relay it verbatim.

If the project has no `.claude/equipo.json`, it is not set up yet: follow the `equipo:adapt-to-project` skill first (it
studies the project and asks the user how it builds, tests and documents things).

The worktree is created by `worktree.mjs`: with Orca when it is installed, with `git worktree` otherwise. Do not call
`orca` or `git worktree add` yourself: the script also reserves the block of decision numbers, puts the task where the
agent reads it, and opens the agent's session.

## Steps

1. **Settings:** `node <scripts>/ajustes.mjs`. It gives the main branch, whether numbered decisions are used
   (`decisiones.activo`) and the pending-work document (`pendientes`).
2. **Open design decisions.** If the task leaves things for the user to decide, pick one of two:
   - the task is short and the doubts are few: ask them first, in one block with options and a recommendation;
   - the task is large or needs exploring first: launch it, and say in the task that the agent must put those questions
     to the user before implementing.
3. **Short name:** kebab-case, 1-3 words from the task (`cart-payment`, `magic-login`). It is the folder name and the
   end of the branch name (Orca adds its own prefix, `user/<name>`; with git, the one in `worktrees.prefijoRama`). If a
   worktree or branch by that name already exists (`node <scripts>/worktree.mjs lista`), pick another.
4. **The task text**, in a temporary file (write it with your file tool, not through the shell). It carries:
   - what the user asked for, **verbatim**, in quotation marks;
   - what was decided with them (the options chosen), or which questions the agent must ask them.

   No character needs escaping or removing: the text does not travel on a command line. Do not add the decision block
   or "when you finish, follow lista-para-subir" either: the script appends both.
5. **Create:** `node <scripts>/worktree.mjs crear <name> --encargo <file>`. It answers in JSON:
   - `error`: nothing was created. Tell the user, with the error; do not retry under another name on your own.
   - `ruta` (the folder), `rama` (the branch) and `bloque` (the reserved block of decision numbers, when used).
   - `lanzado: true`: the agent's session is open (in Orca, or in the tab or window the launcher opens).
   - `lanzado: false`: it could not be opened automatically (`motivo` says why; with the `manual` launcher this is the
     normal case). Give the user the command in `orden` to paste into a new terminal.
6. **The pending-work document** (`pendientes` in the settings):
   - a row at the end of the table under the "in progress" section: `| <name> | <one-line summary> | <block or —> |`.
     Use the section the document already has; if there is none, create `## En marcha` (Spanish), `## In progress`
     (English) or the equivalent in the team's language, with the header row `| Branch | Task | Decisions |` in that
     language;
   - the "updated on" line, if the document has one.

   Commit only that file: `git add <document>` and `git commit -m "<Pending: <name> in progress, in the idioma language>"`.
7. **Tell the user:** the worktree's name, the block if there is one, and that from now on they talk to that agent (or
   the command they must paste, if the session did not open on its own).

## Several tasks at once

One worktree per task, created one after another: each `crear` reserves its block, so the next one already counts it.
One commit of the pending-work document with all the rows.

## Common mistakes

| Mistake | How to avoid it |
|---|---|
| The task loses what the user said | Their text goes in verbatim, in quotation marks |
| Creating the worktree by hand (`orca worktree create`, `git worktree add`) | No reserved block and no task file: always `worktree.mjs crear` |
| Saying "you can talk to its agent now" with `lanzado: false` | The session is not open: give them the command in `orden` |
| Implementing in the main copy | Never: from the main copy you only create worktrees and merge branches |
