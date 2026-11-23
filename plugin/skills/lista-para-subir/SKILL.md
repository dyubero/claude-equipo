---
name: lista-para-subir
description: Use when, in a task worktree of the equipo plugin (not the main copy; .git is a file), the assigned work or a fix requested by the main session is finished and the branch must be handed back to be merged into the main branch, or when the user types /lista-para-subir. Also the way out when the plugin's guard refuses a merge into the main copy.
---

# /lista-para-subir — hand the branch back to be merged

**Only in a worktree** (`.git` is a file). You never merge into the main branch: the user does it from the main session
by pressing the merge button in the bar above their prompt, and the plugin's guard refuses it from here. Before you
start, the tests of your own work must already have passed.

Talk to the user in the language they write to you in. Write commits and the notice's content in the team's language:
the `idioma` setting.

The plugin's scripts are in `../../scripts` relative to this skill's folder (the "Base directory" shown when the skill
loads); below they are written `<scripts>`. They print Spanish: read their output, do not relay it verbatim. Settings:
`node <scripts>/ajustes.mjs`.

If the project has no `.claude/equipo.json`, the build and test commands are empty: use the ones you know from the
project (its README, its CI) and tell the user to set it up in the main copy with the `equipo:adapt-to-project` skill.

## Steps

1. **Commit your work:**
   - add files one by one with `git add <path>`; never the ones in `prohibidos` (the guard refuses them);
   - the message, in the `idioma` language, says what the change does; with numbered decisions, it carries their codes
     in parentheses.
   - With decisions: only the numbers of the block reserved for you (it is at the end of your task file,
     `.claude/equipo-encargo.md`). With a backlog: your new codes carry the branch's short name in front (`cart-T1`);
     **do not renumber them**, the main copy does it when merging.
2. **Bring the main branch in:** `git merge <main branch>` (with no conflicts, git's own message is fine).
   - Documents in `unir` (and the decisions document and the backlog, when on) where both sides only appended merge on
     their own. Files in `generados` keep your side.
   - If one of those conflicts, the merge drivers are not installed: `git merge --abort`,
     `node <scripts>/fusion.mjs instalar`, and merge again.
   - Other conflicts: resolve them, build, and `git commit`.
3. **What the main branch brought:** `node <scripts>/pruebas.mjs ORIG_HEAD..HEAD`. If it brought nothing (`Already up
   to date`), skip this step and the next: what you already ran is enough.
4. **Rerun only what overlaps with your work:**
   - if a dependency manifest or something in `generados` changed, install or rebuild (`comandos.regenerar`) and commit
     only the generated files that change;
   - always `comandos.compilar`, when it is set;
   - the tests `pruebas.mjs` proposes that are also yours (with `comandos.probarArchivos` when it is set);
   - if nothing overlaps, building is enough. Do not repeat what already passed.
5. **The tip commit:** `git rev-parse --short HEAD`.
6. **The sessions**, with `ListAgents` (load it with ToolSearch if needed):
   - yours is the line "This session is …";
   - the main one starts with `sesionPrincipal` from the settings or, if that is empty, with the name of the main copy's
     folder (`git worktree list`, the first one; "_" becomes "-"). The `SendMessage` recipient is that name, as is.
   - With several candidates or none, do not guess: tell the user to notify the main session themselves and give them
     the message.
7. **The notice**, with `SendMessage` to the main session. The first line is fixed and the labels are in English,
   whatever the language of the content: the bar reads the notice by them.
   ```
   equipo:lista <full branch, e.g. ana/cart> <short commit>
   Session: <your session>
   Summary: <one line for the merge commit message, with the decision codes if any>
   What changes: …
   Decisions: …
   Test: <which tests are worth running in the main copy>
   To review:
   - <what is not right, what you could not test, what the user must look at; drop the section if there is nothing>
   ```
   What you did not rerun after bringing the main branch in because it did not overlap does not go under "To review".
8. **Tell the user** it is ready to be merged and, in one line, what you tested (before and after bringing the main
   branch in) and what you did not. Then wait:
   - if the main session says it is merged, your worktree is closed for you (or stays open, if the project keeps them);
   - if it reports a conflict, that it was left out of the batch, or a failure, fix it and go back to step 1.

## Common mistakes

| Mistake | What happens |
|---|---|
| Notifying without bringing the main branch in | It conflicts on merge, and the round starts again |
| A first line other than `equipo:lista <branch> <commit>` | It does not show in the bar; the main session's Claude gets it as an ordinary message |
| Translating the labels (`Session:`, `Summary:`, `To review:`) | The bar misses the session or the items to review; only Spanish and English labels are read |
| Renumbering the backlog in the branch | It conflicts with other branches; the main copy does that |
| Rerunning every test after bringing the main branch in | Wasted time: only what overlaps |
| `git merge` into the main branch, or `git push` | The guard refuses it; do not work around it |
