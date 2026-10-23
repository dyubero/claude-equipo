---
name: adapt-to-project
description: Adapts the equipo plugin (parallel agents in Orca worktrees, merges from the main copy, git guards) to the current project - inspects how it builds, tests and documents, asks the user only what cannot be deduced, then writes .claude/equipo.json, verifies the commands, installs the merge drivers and documents the workflow in CLAUDE.md. Use it right after installing the equipo plugin, whenever a project has no .claude/equipo.json, when the plugin reminds the user that the project is not set up, or when the user asks - in any language - to set up, configure, adapt, tune or fix the equipo plugin, the worktree workflow, or the build/test commands the plugin runs (e.g. "adapt the plugin to this project", "prepara el plugin equipo", "configure le plugin pour ce dépôt").
---

# Adapt the equipo plugin to this project

The equipo plugin brings a ready-made workflow: each task goes to its own Orca worktree with its own agent, finished
branches are merged from the main copy with a dry run first, one check per batch, and git guards that keep agents from
merging on their own. What changes from project to project — how it compiles, which tests run, which files are
generated or must never be committed, how decisions and pending work are written down — lives in
`.claude/equipo.json`. Your job is to fill that file in **for this project**, with the user, so that the first batch of
branches merges and gets checked without surprises.

Two principles shape everything below:

- **Deduce first, ask second.** The user should only answer what the project itself cannot tell you. Every question
  you skip because the code already answers it is time saved; every guess you make silently about something that is
  really theirs to decide (which tests are worth running on every merge, whether to number decisions) becomes a
  surprise later.
- **Speak the user's language.** Talk to the user in the language they write to you in. Write the settings, the
  CLAUDE.md section and commit messages in the **team's** language: the one the existing commits and docs use (the
  script guesses it), or the user's language if the project gives no hint. The script's output and these instructions
  are in English; translate as you go, never paste them raw.

The plugin's scripts are in `../../scripts` relative to this skill's folder (the "Base directory" shown when the skill
loads); below they are written `<scripts>`. Run them with `node` (22 or later). `inspect-project.mjs` prints English;
the plugin's other scripts and its on-screen texts are in Spanish — read them, don't relay them verbatim.

## 1. Check where you are

Work in the **main copy** of the repository (where `.git` is a folder, not a file), on the main branch. Settings
written in a worktree only exist in that worktree; they must be committed on the main branch so every new worktree
inherits them. If you are in a worktree, tell the user and stop.

Uncommitted changes are fine: you will only ever add your own files to a commit.

If `.claude/equipo.json` already exists, this is a **review**, not a first setup: start from it, compare it with what
you find, and only bring up what no longer matches (a renamed script, a new lockfile, a test command that now fails).

## 2. Inspect the project

Run `node <scripts>/inspect-project.mjs` (add `--json` if you prefer to parse it). It reports:

- the main branch; every ecosystem it recognises (Node, Deno, Python, Rust, Go, JVM, .NET, PHP, Ruby, Elixir,
  Dart/Flutter, Swift, CMake, Unity, Godot, Unreal) with proposed build, test and single-file test commands, lockfiles
  and the command that regenerates them;
- Makefile/justfile/Taskfile targets and the commands CI runs;
- tracked files that look generated; documents that look like numbered decisions, a coded backlog or a changelog;
- sensitive files and build folders that git does not ignore;
- the language and style of the commits, existing agent instructions (CLAUDE.md, AGENTS.md), and tool versions;
- a **proposed** `.claude/equipo.json` (only what differs from the defaults) and a list of **open questions**.

The script is a starting point, not the answer. Read what it cannot: the README and contributing guide, the CI
workflows (they are the most honest description of "what must pass"), the test configuration, scripts that wrap the
real commands. In particular:

- If CI runs something the proposal lacks (lint, type check, a code generator check), it probably belongs in
  `comandos.compilar` — merging a branch that CI would reject is exactly what the batch check should catch.
- If the project mixes ecosystems (a Python API and a TypeScript front end), the proposal checks all of them: through
  the Makefile/justfile targets when the runner is installed, otherwise with the commands joined by `&&`. A part that
  is not ready (a front end with no sources yet) is worth asking about rather than dropping silently.
- For ecosystems the script does not know, find the build and test commands yourself and propose them.
- Game engines (Unity, Godot, Unreal) build and test through the editor. Each worktree is a separate project with its
  own editor and caches; ask how agents are expected to compile and test, and which assets are generated by scripts.
  For Unity the script proposes batchmode commands for the project's editor version and says whether it is installed.
- Design decisions kept as ADRs (one file per decision) don't use the numbered-decision blocks, which need a single
  document. Two parallel branches could pick the same ADR number; the simple rule is that an agent takes the next free
  number when it merges the main branch before handing its branch back. Put that rule in the CLAUDE.md section.

**Try the proposed commands now, before asking** — at least the build and a quick test run (skip anything that takes
many minutes). Installing the project's own dependencies inside the project (`npm ci`, `uv sync`, `bundle install`
into a local folder) is fine, since nothing runs without them; installing tools or toolchains on the machine is not.
Whatever breaks becomes part of the single question block instead of a second round later:

- *A tool or toolchain is missing* (go, uv, the Unity version the project pins…): don't install it. Keep the command if
  the user confirms it is right, and report it as untested.
- *The project itself is broken* (main fails its own CI, an empty or corrupt lockfile — which `regenerar` would then
  silently rewrite —, a target with nothing to build): that is
  not yours to fix silently. Ask whether to leave that part out of the checks for now or to fix it in a separate commit
  before setting up the plugin.
- *A fix uncovers the next failure* (CI was red for more than one reason): stop at what the user approved, list what is
  still failing, and let them decide; don't chain fixes they did not see.
- *A command needs a different working directory or shell* (spaces in a Windows path, a sub-project): adjust it and
  say so.

What each setting means, its default and when to change it: `references/settings.md`. Read it before deciding
anything you are not sure about.

## 3. Ask the user — once, and only what is open

Gather the open questions and ask them together with `AskUserQuestion` (up to 4 per block; a second block if really
needed). Each question gets concrete options taken from the project, the one you recommend first and marked as
recommended, and a short line on the trade-off. Drop every question the project already answered and say in one line
what you deduced instead, so the user can correct it.

The usual open points, roughly in order of how much they matter:

1. **What must pass before a merge counts as good.** The compile/type-check command, and which tests run in the batch
   check. Slow suites (end-to-end, integration against services) are usually better left to branches that ask for them
   in their notice; fast unit tests go in.
2. **Files that are generated** (lockfiles, codegen output, editor-generated assets) and the command that rebuilds them.
   On a merge conflict the plugin keeps the current version and rebuilds afterwards, so a wrong entry here can hide a
   real change: only list files that are truly derived.
3. **Files that must never be committed** that git does not already ignore. Often `.gitignore` is the better fix;
   offer both.
4. **Numbered decisions and a coded backlog.** Useful when many agents make design decisions in parallel, because each
   branch gets its own block of numbers and codes are renumbered on merge. Pure overhead otherwise: recommend them only
   if the project already works that way or the user wants it.
5. **Language** of commits and documents, if the commits do not make it clear.
6. **The CLAUDE.md section** (step 6). Recommend yes: without it the agent in the main copy does not know it must not
   implement tasks there, and worktree agents do not know how to hand their work back.

Do not ask about things the user cannot reasonably know or care about (driver internals, regex patterns). Decide those
yourself and mention them in the summary.

## 4. Write and verify the settings

Write `.claude/equipo.json` with **only** the keys that differ from the defaults — a short file is easier for the team
to read and keeps future default improvements flowing in. Write it with your file-writing tool, not a shell heredoc:
shells eat the backslashes in `pruebas.patron` and leave invalid JSON. Then:

- `node <scripts>/ajustes.mjs` must print the merged settings without errors.
- Every command in `comandos` should have run once (step 2, or now if it changed). A command that fails now will fail
  the first batch. Note how long `probar` takes: if it is several minutes, suggest `probarArchivos` (tests for just the
  changed files) when the runner accepts file paths, and try it with a real test file. Leave `probarArchivos` empty
  when the runner filters by something else (Unity's `-testFilter` takes class names) or when several ecosystems
  share the checks: it would run only one of them.
- If you changed `pruebas.patron`, check it matches a few real test files and none of the source files.
- The `pendientes` document does not need to exist: the skills create it the first time they write to it.

## 5. Install the merge drivers

Run `node <scripts>/fusion.mjs instalar`, then `node <scripts>/fusion.mjs instalar --comprobar`, which must report it
is up to date. The drivers live in the repository's `.git` folder (shared by all its worktrees), never in committed
files; the plugin also refreshes them at the start of each session. Documents listed in `unir` or `generados` that do
not exist yet are fine.

## 6. Document the workflow for the agents

If the user agreed, add the section in `references/claude-md-section.md` to the project's CLAUDE.md (create it if there
is none; use AGENTS.md if that is what the project uses). Translate it into the team's language, replace the
`<placeholders>` with this project's values, drop the lines about decisions or backlog if they are off, and match the
tone of the existing file. Show the user the final section before writing it.

Two kinds of text stay exactly as they are, whatever the language: the skill names, and the notice
`La rama <branch> está lista para subir (<commit>)` with the button labels **Subir** and **Solucionar**. The plugin
recognises the notice by that exact sentence and draws those buttons itself; translating them in CLAUDE.md would only
confuse the agents. A short gloss in the team's language next to them is fine.

## 7. Commit

With the user's go-ahead, commit only the files you created or changed (`.claude/equipo.json`, CLAUDE.md,
`.gitignore`…), adding them **one by one**: the plugin's guard rejects `git add -A`, `git add .` and `git commit -a` in
the main copy, precisely so nobody sweeps unrelated changes into a commit. Follow the project's commit style
(conventional commits, language, prefixes).

## 8. Report

Tell the user, briefly and in their language:

- what is in the settings and why — what was deduced and what they chose;
- which commands you ran and whether they passed, and anything left untested;
- how to start: in this session they describe a task, the `encargo` skill launches it into its own worktree and agent;
  when that agent finishes, its branch appears above the prompt with **Subir**;
- that every piece can be switched off in `/config` (plugin `equipo`), and that they can ask you to change the
  settings at any time.

## Common mistakes

| Mistake | What goes wrong |
|---|---|
| Copying the proposal without asking | Settings that are not the team's: slow suites on every merge, or checks that miss what CI catches |
| Asking what the project already answers | The user wades through obvious questions and stops reading them |
| Turning on decisions or backlog "just in case" | Number blocks and renumbering nobody uses |
| Not running the commands | The first batch fails on a typo |
| Listing real source files as generated | Merge conflicts in them get silently resolved to one side |
| `git add -A` / `git add .` | Rejected by the guard in the main copy; add files one by one |
| Writing the settings in a worktree | Other worktrees never see them; they belong on the main branch |
| Pasting the English template into a Spanish (or any other) CLAUDE.md | Agents get mixed-language instructions; translate it |
| Translating the notice sentence or the button names | The plugin no longer recognises the notice; keep them verbatim |
| Fixing a broken project without asking | Unrelated changes inside the setup commit; ask, and fix in a separate commit |
| Writing equipo.json through a heredoc | Backslashes in `pruebas.patron` get lost: invalid JSON |
