# `.claude/equipo.json` — every setting

All keys are optional: anything missing takes its default (source of truth: `scripts/por-defecto.mjs`). Keys keep
their Spanish names because the rest of the plugin uses them; values (commands, paths, language) are whatever the
project needs. Nested objects are merged one level deep, so `{"comandos": {"probar": "pytest"}}` changes only that
command.

| Key | Default | What it does | When to change it |
|---|---|---|---|
| `ramaPrincipal` | `"main"` | Branch every task branch is merged into. Guards, dry runs and the batch check all use it. | The project uses `master`, `trunk`, `develop`… |
| `idioma` | `"es"` | Language (ISO 639-1 code: `en`, `es`, `fr`, `de`, `pt`, `ja`…) agents write commits, notices and docs in. Skills read it. | Almost always set it explicitly to the team's language. |
| `comandos.compilar` | `"npm run build"` | Checks that the code compiles (build, type check, lint): run once per batch and after a worktree pulls the main branch. `""` if there is nothing to compile. | Any non-npm project, or when CI's "must pass" is more than the build. |
| `comandos.probar` | `"npm test"` | The whole test suite. Used when the tests touched by a batch cannot be narrowed down. | Any non-npm project; leave out slow suites if the user prefers. |
| `comandos.probarArchivos` | `""` | Runs only some tests: `{archivos}` is replaced by the list of test files. Empty means always use `probar`. | The runner accepts files (vitest, jest, pytest, rspec, phpunit, mix, dart/flutter, deno…) and the full suite is slow. |
| `comandos.regenerar` | `""` | Rebuilds the `generados` files after a batch is merged (e.g. `npm install`, `uv lock`, `go mod tidy`, a codegen script). | Whenever `generados` is not empty. |
| `pruebas.patron` | JS/TS `*.test.*` / `*.spec.*` | Regular expression (over paths from the root) that says which files are tests, so the batch check can pick the tests a branch touched. | Any non-JS project; `inspect-project.mjs` proposes one per ecosystem. |
| `prohibidos` | `[]` | Files or folders (paths from the root, no wildcards; folders end in `/`) that the guard never lets into a commit, in any copy. | Secrets or build output that git does not ignore. Prefer `.gitignore` when it fits; use this for files that must exist untracked. |
| `generados` | `[]` | Patterns (`.gitattributes` syntax) of derived files: on a merge conflict the current version is kept, and `comandos.regenerar` rebuilds them after the batch. | Lockfiles, codegen output, editor-generated assets. Never real source files: their conflicts would be silently resolved to one side. |
| `unir` | `[]` | Documents where, if two branches only **append** lines at the same spot, both additions are kept instead of conflicting. | Changelogs, append-only logs, docs where many branches add entries at the end. |
| `decisiones.activo` | `false` | Numbered design decisions in one document (`### D12. Title`), with a block of numbers reserved per branch so parallel agents never reuse a number. | The project already numbers decisions, or the user wants it. Overhead otherwise. |
| `decisiones.documento` / `prefijo` / `bloque` | `"DESIGN.md"` / `"D"` / `10` | Where the decisions are, how their headings start (`"ADR-"` works), and how many numbers each branch gets. | To match an existing document. |
| `backlog.activo` | `false` | Backlog as a table with a code in the first cell (`\| T12 \| … \|`). In branches, new codes carry the branch name (`cart-T1`); the main copy renumbers them when merging. | The project keeps such a table and agents add to it. |
| `backlog.documento` | `"BACKLOG.md"` | The backlog file. | To match an existing file. |
| `pendientes` | `"docs/pendientes.md"` | Where `/pendiente`, `encargo` and the batch check write what is in progress and what was left untested. | The project already has a TODO or notes file for this. |
| `orca.repo` | `""` | The repository's name in Orca; empty means the name of the main copy's folder. | Orca knows the repository by another name. |
| `sesionPrincipal` | `""` | How the main session's name starts in `ListAgents`, so worktree agents know whom to notify; empty means derived from the folder name. | The main session is named differently. |

The switches for each piece of the plugin (context bar, merges from the main copy, merge guard, commit guard) are
not in this file: they are in `/config`, under the `equipo` plugin.

## Example: Python service with uv

```json
{
  "idioma": "en",
  "comandos": {
    "compilar": "uv run ruff check . && uv run mypy .",
    "probar": "uv run pytest",
    "probarArchivos": "uv run pytest {archivos}",
    "regenerar": "uv lock"
  },
  "pruebas": { "patron": "(^|/)(test_[^/]*|[^/]*_test)\\.py$" },
  "generados": ["uv.lock"],
  "prohibidos": [".env"]
}
```

## Example: web app with pnpm and a changelog

```json
{
  "idioma": "en",
  "comandos": {
    "compilar": "pnpm typecheck && pnpm lint",
    "probar": "pnpm test",
    "probarArchivos": "pnpm exec vitest run {archivos}",
    "regenerar": "pnpm install"
  },
  "generados": ["pnpm-lock.yaml"],
  "unir": ["CHANGELOG.md"]
}
```
