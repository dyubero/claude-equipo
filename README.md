# claude-equipo

*English · [Español](README.es.md)*

A [Claude Code](https://code.claude.com) plugin for working with **several agents at once, each in its own worktree**
(with Orca or plain `git worktree`), and merging their branches into the main branch without stepping on each other.
You talk to one session in the main copy; it launches each task into a new worktree with its own agent; and when an
agent finishes, its branch shows up in a bar above your prompt with a **Merge** button.

It comes out of the tooling of a project that has worked this way for months, with up to ten branches in parallel. This
copy is generic: what changes from one project to another (build and test commands, files that must not be
committed…) lives in a settings file, and **you do not have to write it by hand: your agent does**, by studying your
project and asking you what it cannot deduce.

"Equipo" is Spanish for "team". The plugin started in Spanish, so its skills, commands and settings keep their Spanish
names (`encargo` is a task, `lista-para-subir` is "ready to merge"); everything you read on screen is in English or
Spanish, as you choose.

## Getting started: hand it to your agent

Open Claude Code in your project's folder (the main copy, on the main branch) and tell it:

> Install the plugin from https://github.com/dyubero/claude-equipo and adapt it to this project. Read its README, study
> how the project builds, tests and documents things, and ask me whatever you need before configuring it.

Any language works: the agent talks to you in yours and writes the settings and CLAUDE.md in the team's. The agent:

1. installs the plugin (see "Install");
2. follows the **`adapt-to-project`** skill: a script studies the project (the ecosystem and its commands — Node,
   Python, Rust, Go, JVM, .NET, PHP, Ruby, Elixir, Dart/Flutter, Swift, CMake, Unity, Godot, Unreal —, Makefile
   targets, what CI runs, lockfiles and generated files, design documents, backlog or changelog, sensitive files git
   does not ignore, the language and style of the commits, CLAUDE.md) and proposes the settings; the agent also reads
   whatever else is needed (README, CI, test configuration);
3. asks you, in one block with options and a recommendation, only what is open: what must pass to count as building,
   which tests run on merge, which files are generated or must never be committed, whether you want numbered decisions
   or a backlog…;
4. writes `.claude/equipo.json`, tries the commands, installs the merge drivers and, if you want, adds the workflow
   section to your CLAUDE.md (so the agent in the main copy does not implement there and the ones in worktrees know how
   to hand their work back);
5. tells you what is set up and how to launch the first task.

**If you are the agent installing it:** install it as "Install" says and follow the `equipo:adapt-to-project` skill.
If it is not in your skill list yet, read `plugin/skills/adapt-to-project/SKILL.md` in this repository directly and
follow it, with the scripts in `plugin/scripts`. Do not write the settings without asking the user what the project
does not answer.

## What is in it

| Piece | Where | What it does |
|---|---|---|
| **Context bar** | every session | A line above the prompt: "● Context: 84k of 200k used (42%) · 116k free", yellow from 60% and red from 80%, with a **Compact** button (the same as `/compact`) that hides while Claude is working. |
| **Merges** | main copy | The notice an agent sends when it finishes (a message starting with `equipo:lista <branch> <commit>`) does not reach Claude: it shows in the bar with **Merge**, **Fix** and **Dismiss**, plus checkboxes with **Merge checked** and **Merge all**. See "The workflow". |
| **Dry run** | main copy | When each notice arrives and when you press "Merge", it rehearses the merge with `git merge-tree`, touching nothing: the bar says "⚠ would conflict with X: files" before you press, and on merge the branches that conflict least go first. |
| **Merge drivers** | every copy | Documents where two branches usually append at the end (a CHANGELOG, the design document, the backlog) merge on their own when both sides only append; generated files (`package-lock.json`) stay as they were and are rebuilt afterwards. |
| **`resultado_lote`** | main copy | A tool Claude calls after checking the batch: branches that are fine get notified and their worktree closed; failing ones get the reason. |
| **`/ramas`** | all | A panel with every worktree: its reserved block of decision numbers, how far ahead and behind the main branch it is, and, with Orca, its agent's state. |
| **`/reservar`** | main | Only with numbered decisions: the next free block; with a worktree's name, reserves it for that worktree. |
| **`/pendiente`** | all | `/pendiente <text>` notes it, with the date and branch, under "Quick notes" in the pending-work document. With no text, lists what is noted. |
| **Merge guard** | worktrees | A command that merges into the main copy from a worktree (`git -C <main> merge …`, `cd <main> && git merge …`, `pull`) is refused, with an explanation of how to hand the branch back. |
| **Commit guard** | all | In the main copy it refuses `git add -A`, `git add .`, `git add -u`, `git commit -a` / `--all` and `git commit .`. In any copy it refuses the files in `prohibidos` (say `.env.local` or `dist/`). |
| **Skill `adapt-to-project`** | main | Adapts the plugin to your project: studies it, asks you what is open, writes `.claude/equipo.json`, tries the commands, installs the drivers and adds the workflow to your CLAUDE.md. If the main copy has no settings, the plugin reminds you at session start. |
| **Skill `encargo`** | main | Launches a task: branch name, a new worktree (with Orca or git), a block of decision numbers if they are used, the user's text verbatim in a file the agent reads, its session opened, and a row in the pending-work document. |
| **Skill `lista-para-subir`** | worktree | Commit, bring the main branch in, rerun only the tests that overlap, and the notice to the main session in the exact format the bar reads. |
| **Skill `comprobar-lote`** | main | What Claude does when the bar asks it to check a batch: rebuild generated files, renumber the backlog, one test run, and `resultado_lote`. |
| **Skill `estado-ramas`** | main | How each worktree is doing (working, waiting for the user, mid-merge, up to date and ready) and what it would conflict with if merged now. |

The skills are written in English and talk to you in your language. What the plugin shows on screen and the messages
it sends to agents are in English or Spanish, depending on the `idioma` setting (see "Language and texts").

## Requirements

- **Claude Code 2.1.292** or later (the mods use the *function hooks* API, which is still in early access and may
  change between versions).
- **Node 22** or later in `PATH`: the scripts and the merge driver are dependency-free `.mjs` files.
- **git 2.38** or later (`git merge-tree --write-tree`).
- **Orca is optional.** With the `orca` CLI in `PATH`, worktrees and their agents are handled by Orca. Without it, the
  plugin creates and closes worktrees with `git worktree` and opens each agent's session with a *launcher* (see
  "Without Orca"). The only thing you lose is the agents' state in `/ramas` and `estado-ramas`.

It runs on Windows, macOS and Linux. It is used daily on Windows; on macOS and Linux what is checked on every change
is the repository's test suite (the scripts, against real git repositories, and the mods, against Claude Code's
simulator), which passes on all three in GitHub Actions. Paths are compared case-insensitively only where the file
system does not tell case apart (git's `core.ignorecase` says so).

At session start the plugin warns if it cannot find `node` or if `git` is older than 2.38. With `nvm` or another
version manager, `node` must be in the `PATH` of the terminal Claude Code is started from.

## Without Orca: git worktrees and launchers

Git can create worktrees, but it cannot open terminals. So, without Orca, after creating the worktree the plugin runs
a *launcher*: a command that opens a tab or a window with `claude` in that folder. With `lanzar.preajuste` set to
`"auto"` (the default) it is chosen per machine:

| Preset | When `auto` picks it | What it does |
|---|---|---|
| `tmux` | the session runs inside tmux | `tmux new-window` in the worktree's folder |
| `wt` | Windows, with Windows Terminal in `PATH` | a new Windows Terminal tab |
| `iterm` | macOS, from iTerm2 | a new iTerm2 window |
| `terminal` | macOS, from any other terminal | a new Terminal.app window |
| `manual` | none of the above | opens nothing: Claude gives you the command to paste into a new terminal |
| `propio` | never: you set it yourself | the command in `lanzar.orden`, with `{ruta}`, `{nombre}` and `{prompt}` |

If a launcher fails, the worktree is still created and Claude gives you the command to open the session by hand. With
`propio` ("own") you can plug in any other terminal, for example kitty:

```json
"lanzar": { "preajuste": "propio", "orden": ["kitty", "@", "launch", "--type=tab", "--cwd", "{ruta}", "claude", "{prompt}"] }
```

**What is tested and what is not.** `manual`, `propio`, and creating and closing worktrees with git are tested end to
end on Windows, macOS and Linux on every change. For the `tmux`, `wt`, `terminal` and `iterm` presets only the way the
command is put together is tested: they have not yet been run against those terminals for real. If one of them does
not open the session, the plugin falls back to `manual` and tells you; please report it in an issue.

The task does not travel on a command line. It is written to `.claude/equipo-encargo.md` inside the worktree (git
ignores it through `<.git>/info/exclude`, so it never ends up in a commit), and the agent starts with one sentence
telling it to read that file. That is why the task text can carry quotation marks or any other character.

## Install

In a terminal with Claude Code:

```
/plugin install equipo --marketplace dyubero/claude-equipo
```

Answer `y` to add the marketplace, pick the scope (user scope covers all your projects) and leave the switches as they
are. If you have it in a folder rather than on GitHub:

```sh
claude plugin marketplace add /path/to/claude-equipo
claude plugin install equipo@claude-equipo
```

With the folder as the marketplace, a session reads the plugin from that folder: after changing something,
`/reload-plugins` is enough.

New skills show up in the next session (or after `/reload-plugins`). Then, in each project:

1. **Adapt it:** in the main copy's session, ask "adapt the equipo plugin to this project" or run
   `/equipo:adapt-to-project` (see "Getting started"). Commit `.claude/equipo.json`: each worktree reads its own copy.

   It can also be done by hand: `node <plugin folder>/scripts/inspect-project.mjs` says what can be deduced from the
   project and proposes the settings; `node <plugin folder>/scripts/ajustes.mjs --crear` writes a file with the
   defaults (`claude plugin list` tells you where the plugin is); or copy `ejemplos/equipo.json`.
2. Open the main copy's session **at the repository root**. At start, the plugin installs the merge drivers in the
   repository's `.git` (see "What it touches in your repository").

## Settings: `.claude/equipo.json`

Everything is optional; whatever is missing takes its default. There are two levels, and the project's goes on top:

- **`~/.claude/equipo.json`**, yours across all your repositories: your launcher, your context-bar thresholds, your
  branch prefix. It is never committed.
- **`<project>/.claude/equipo.json`**, the project's, committed: how it builds, which tests it runs, what must not be
  committed.

`node <plugin>/scripts/ajustes.mjs` shows what applies in that copy; with `--origen`, which file each value comes
from; with `--comprobar`, misspelt keys and invalid values (the plugin also warns about them at session start). For
your editor to complete and check the file, start it with:

```json
"$schema": "https://raw.githubusercontent.com/dyubero/claude-equipo/main/plugin/equipo.schema.json"
```

The keys are Spanish words; the schema describes each one in English.

| Key | Default | What it is for |
|---|---|---|
| `ramaPrincipal` | `"main"` | The branch the others are merged into. |
| `idioma` | `"es"` | Language of the commits, documents and notices the agents write (ISO code: `en`, `es`, `fr`…; the skills read it) and of the plugin's own texts: Spanish with `es`, English with `en` and with anything else. |
| `comandos.compilar` | `""` | The first thing run in the batch check and after bringing the main branch in (`"npm run build"`, `"cargo check"`…). Empty if there is nothing to build. |
| `comandos.probar` | `""` | The whole test suite (`"npm test"`, `"pytest"`…). |
| `comandos.probarArchivos` | `""` | Only some tests: `{archivos}` is replaced by the list of files (e.g. `"npx vitest run {archivos}"`). Empty: always `probar`. |
| `comandos.regenerar` | `""` | Rebuilds the `generados` files after merging (e.g. `"npm install"` for `package-lock.json`). |
| `pruebas.patron` | the usual conventions of JS/TS, Python, Rust, Go, JVM, .NET, PHP, Ruby, Elixir, Dart and Swift | Regular expression that says which files are tests, to pick each branch's. Change it only if the project names them differently. |
| `prohibidos` | `[]` | Files or folders (paths from the root, no wildcards) that never go into a commit. |
| `generados` | `[]` | Patterns (as in `.gitattributes`) of generated files: on merge the current copy's version is kept, then they are rebuilt. |
| `unir` | `[]` | Documents where, if two branches only append lines at the same spot, both are kept. |
| `decisiones.activo` | `false` | Numbered decisions in a design document (`### D12. Title`), with a block of numbers reserved per branch. |
| `decisiones.documento` / `prefijo` / `bloque` | `"DESIGN.md"` / `"D"` / `10` | Where they are, how they start (`"ADR-"` works) and how many per block. |
| `backlog.activo` | `false` | Backlog with a code in the first cell of each row (`\| T12 \| … \|`): branches write them with the branch name in front (`cart-T1`) and the main copy renumbers them on merge. |
| `backlog.documento` | `"BACKLOG.md"` | The backlog. |
| `fusion.estrategia` | `"merge"` | How each branch goes in: `"merge"` (a merge commit with `--no-ff`) or `"squash"` (a single commit with the whole branch). |
| `contexto.aviso` / `contexto.peligro` | `60` / `80` | Percentages from which the context bar turns yellow and red. |
| `guardas.barridos` | `true` | In the main copy, refuse `git add -A` / `.` / `-u` and `git commit -a`. `prohibidos` is enforced either way. |
| `worktrees.cerrarAlSubir` | `true` | Close a branch's worktree once the batch check approves it. With `false`, the agent is notified and the worktree stays. |
| `pendientes` | `"docs/pendientes.md"` | Where `/pendiente`, `encargo` and `comprobar-lote` note what is in progress and what was left untested. |
| `worktrees.gestor` | `"auto"` | Who creates and closes worktrees: `"orca"`, `"git"` or `"auto"` (Orca when it is in `PATH`, git otherwise). |
| `worktrees.carpeta` | `"../{repo}-worktrees/{nombre}"` | With git: each worktree's folder, relative to the main copy. |
| `worktrees.prefijoRama` | `""` | With git: what goes before the task name in the branch (`"ana/"` gives `ana/cart`). |
| `lanzar.preajuste` / `lanzar.orden` | `"auto"` / `[]` | With git: how the agent's session is opened (see "Without Orca"). |
| `orca.repo` | `""` | The repository's name in Orca; empty, the name of the main copy's folder. |
| `sesionPrincipal` | `""` | How the main copy's session name starts in `ListAgents`; empty, its folder name (with `_` → `-`). |
| `textos` | `{}` | Texts of the plugin replaced by yours (see "Language and texts"). |

The commands have no default because they depend on the project: `adapt-to-project` sets them. Without them, the
batch check asks Claude to run the tests it can narrow down, without making up any command.

Each piece has its switch in `/config`, in the rows of the `equipo` plugin: *Context bar*, *Merges from the main copy*,
*Merge guard* and *Commit guard*.

## Language and texts

The `idioma` setting decides two things: which language the agents write in (commits, documents, the content of their
notices) and which language the plugin speaks. The plugin has its texts in Spanish and English; for any other language
it uses English. That covers the bar and its buttons, the toasts, what `/ramas`, `/reservar` and `/pendiente` answer,
the guards' refusals, the messages to agents, the message of each merge commit, and the batch-check request.

Note that the default is `es`: if you have not adapted the project yet and want English, set `"idioma": "en"` (in the
project's file or in `~/.claude/equipo.json`). `adapt-to-project` always sets it explicitly.

Any of those texts can be replaced from the settings, with the text's key and a template:

```json
"textos": {
  "fusion.mensaje": "feat({rama}): {resumen}",
  "fusion.mensajeSinResumen": "feat({rama})"
}
```

The keys and the placeholders (`{rama}`, `{principal}`…) of each text are in `plugin/textos/en.mjs` and `es.mjs`.
`ajustes.mjs --comprobar` reports a key that does not exist or a placeholder that text does not have.

What does not change with the language: the names of the skills and commands, the settings' keys, and what the scripts
in `plugin/scripts` print to the terminal (Spanish; agents read it, you do not).

## The workflow, from a task to the merge

1. **You ask for something in the main copy's session.** Claude follows the `encargo` skill: it picks a short name
   (`cart-payment`), writes your request verbatim to a file and runs `node <plugin>/scripts/worktree.mjs crear`, which
   creates the worktree (with Orca or git), reserves a block of decision numbers if you use them, and opens the agent's
   session. From then on you talk to that agent, in its worktree. You can launch several at once.
2. **The agent works on its branch.** If it tries to merge into the main branch, the guard refuses and tells it how to
   hand the branch back.
3. **When it finishes, it follows `lista-para-subir`:** commit, `git merge main`, build, rerun only the tests that
   overlap with what main brought, and send the main session:
   ```
   equipo:lista ana/cart-payment 3f2a9c1
   Session: cart-payment-4e
   Summary: card payments in the cart
   What changes: …
   Test: npx vitest run src/cart.test.ts
   To review:
   - untested in Safari
   ```
   The first line and the labels are fixed (that is how the bar reads it in any language); the content is in the
   team's language. Spanish labels (`Sesión:`, `Resumen:`, `Por revisar:`) are read too.
4. **In the main copy, the notice shows in the bar** (it does not reach Claude): `⇡ ana/cart-payment (3f2a9c1) · ready
   to merge`, with the summary, what there is to review and, if the dry run sees it, "⚠ would conflict with login:
   src/app.ts".
5. **You press "Merge"** (or check several and "Merge checked", or "Merge all"). The mod:
   - rehearses what is queued against the main branch and orders it from fewest to most conflicts;
   - leaves out a branch that really conflicts with the main branch and tells its agent which files;
   - merges one after another with `git merge --no-ff <branch> -m "Merge <branch> into main: <summary>"` (or, with
     `fusion.estrategia` set to `"squash"`, `git merge --squash` and a commit with that message); if one conflicts
     despite the dry run, it is undone and its agent is told;
   - tells a branch that conflicted with another one in the batch once that one is in, so it brings main in once.
6. **With the queue empty, the mod asks Claude for one check of the batch** (skill `comprobar-lote`): rebuild
   generated files if any branch touches them, renumber the backlog if you use it, build once, run the tests of what
   they touch once, and call `resultado_lote`.
7. **`resultado_lote`** notifies each agent. For the ones that are fine it closes the worktree (`worktree.mjs cerrar`:
   it removes it with Orca or git and deletes the branch); the failing ones get the reason and their branch stays in
   the bar as "merged, but failing", with **Fix**.
8. **Fix** (shown when the notice has "To review" items, or when the branch conflicted or failed) asks for an optional
   note and sends it to the agent with what it has to fix. The agent fixes it, goes back to step 3, and its branch
   returns to the bar. **Dismiss** only removes the notice.

At any time, `estado-ramas` ("how are the branches doing?") says where each worktree stands and what it would conflict
with.

## What it touches in your repository

- **Nothing that goes into commits.** The merge drivers are installed in the common `.git` (the main copy's, shared by
  all worktrees):
  - `<.git>/equipo/fusion.mjs`, a copy of the driver, so it does not depend on where the plugin is installed;
  - two entries, `merge.equipo-docs` and `merge.equipo-generado`, in `<.git>/config`;
  - a marked block in `<.git>/info/attributes` with the files in `unir`, `generados` and, when they are on, the
    decisions document and the backlog.

  They are refreshed at the start of each session with merges switched on. To remove them:
  `node <plugin>/scripts/fusion.mjs desinstalar`.
- Also in the common `.git`: `equipo/reservas.json` (the blocks of decision numbers reserved per branch),
  `equipo/encargos/` (a copy of each task in progress) and one line in `info/exclude` so git ignores
  `.claude/equipo-encargo.md` in the worktrees.
- Without Orca, the worktrees' folder: by default `../<repository>-worktrees/`, next to the main copy.
- The `pendientes` document, which the skills and `/pendiente` write (and the main copy commits on its own).
- What the mod runs: `git` (worktree list, rev-list, merge, merge-tree, commit, status, diff, show, config) and
  `node <plugin>/scripts/*.mjs`, which in turn call `git worktree add|remove`, `git branch -d`,
  `orca worktree create|ps|set|rm` when Orca is there, and the launcher. It sends messages to the agents with
  `SendMessage` and asks Claude for the batch check with a prompt.

## How it is tested

```sh
npm test              # both suites
npm run test:scripts  # scripts and merge driver, against temporary git repositories (node --test)
npm run test:plugin   # the mods: claude plugin test plugin
npm run validar       # claude plugin validate --strict for the marketplace and the plugin
```

The script tests create branches that really conflict (in the lockfile, in a document and in code) in temporary
repositories; they never touch this repository. The mod tests simulate Claude Code and git. Both suites run on
Windows, macOS and Linux in GitHub Actions on every push.

To try a change to the plugin without reinstalling it: `claude --plugin-dir plugin`.

## What it does not do

- It does not read a whole shell interpreter: it follows `cd`/`Set-Location`/`pushd`, `git -C`,
  `--git-dir`/`--work-tree`, `bash -c` (also `sh`, `zsh`, `fish`, `dash` and `ksh`, and with grouped options:
  `bash -lc`) and `powershell -Command`. A path with a variable other than `$HOME`/`$PWD` cannot be known: the merge
  guard refuses it anyway; the commit guard lets it through.
- `git push . branch:main` or `git update-ref` from a worktree are not stopped.
- The queue lives in the mod: if plugins are reloaded in the middle of a merge, branches stay "queued" without moving;
  press "Dismiss" and have the agent notify again.
- The bar is drawn in the terminal and in the desktop app; not in the VS Code extension or in `claude -p`.
- Notices are recognised by their first line: `equipo:lista <branch> <commit>`. If an agent writes it differently, it
  does not show in the bar and Claude gets it as an ordinary message. (The sentence earlier versions used, "La rama X
  está lista para subir (commit)", is still recognised.)
- The plugin's texts are in Spanish and English; other languages get English. What the scripts print, and the messages
  of `ajustes.mjs --comprobar`, are in Spanish only.
- The `tmux`, `wt`, `terminal` and `iterm` launchers have not yet been run against those terminals for real (see
  "Without Orca").
- With `fusion.estrategia` set to `"squash"`, a branch merged by hand (not through the bar) is not closed by
  `resultado_lote`: its commits are not in the main branch, so the plugin cannot tell that it is fully merged.

## License

MIT: see `LICENSE`.
