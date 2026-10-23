// Inspects a project to adapt the equipo plugin to it (skill `adapt-to-project`): what can be deduced and what has to
// be asked. Read-only: it writes nothing. Output is in English; the agent talks to the user in the user's language.
//
//   node inspect-project.mjs [--repo <dir>]          # human-readable summary
//   node inspect-project.mjs --json [--repo <dir>]   # { facts, proposal, questions }
//
// - facts: main branch, ecosystems (Node, Python, Rust, Go, JVM, .NET, PHP, Ruby, Deno, Elixir, Dart/Flutter, Swift,
//   C/C++ with CMake, Unity, Godot, Unreal) with their commands, lockfiles and test-file pattern; Makefile/justfile
//   targets; commands run by CI; tracked files that look generated; documents that look like decisions, backlog or
//   changelog; sensitive or build files git does not ignore; language and style of the commits; agent instructions
//   (CLAUDE.md, AGENTS.md); installed tools.
// - proposal: a .claude/equipo.json with only what differs from the defaults (scripts/por-defecto.mjs).
// - questions: what the script cannot decide. The agent asks the user, in the user's language.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { AJUSTES, argumentos, git, imprimir, POR_DEFECTO, raiz } from './comun.mjs'

// ---------------------------------------------------------------- reading helpers

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function toolVersion(command) {
  // On Windows some tools are .cmd files: a shell is needed, and then the command goes as one string.
  const r = spawnSync(`${command} --version`, { encoding: 'utf8', timeout: 15000, shell: true, windowsHide: true })
  if (r.error || r.status !== 0) return ''
  return (r.stdout || r.stderr).trim().split(/\r?\n/)[0]
}

/** Test-file patterns (regular expressions over paths from the root) for each ecosystem. */
export const TEST_PATTERNS = {
  node: POR_DEFECTO.pruebas.patron,
  deno: POR_DEFECTO.pruebas.patron,
  python: '(^|/)(test_[^/]*|[^/]*_test)\\.py$',
  rust: '(^|/)tests/[^/]*\\.rs$',
  go: '_test\\.go$',
  jvm: '(Test|Tests|IT|Spec)\\.(java|kt|scala|groovy)$',
  dotnet: '(Test|Tests)\\.(cs|fs|vb)$',
  php: 'Test\\.php$',
  ruby: '(_spec|_test)\\.rb$',
  elixir: '_test\\.exs$',
  dart: '_test\\.dart$',
  swift: 'Tests?\\.swift$',
  unity: '(^|/)Tests?/.*\\.cs$|Tests?\\.cs$',
}

/** Where Unity Hub installs an editor version on this OS, and whether it is there. */
export function unityEditor(version) {
  const path =
    process.platform === 'win32'
      ? `C:/Program Files/Unity/Hub/Editor/${version}/Editor/Unity.exe`
      : process.platform === 'darwin'
        ? `/Applications/Unity/Hub/Editor/${version}/Unity.app/Contents/MacOS/Unity`
        : `${homedir().replace(/\\/g, '/')}/Unity/Hub/Editor/${version}/Editor/Unity`
  return { path, installed: existsSync(path) }
}

// ---------------------------------------------------------------- ecosystems
//
// Each detector gets { root, has, files } and returns null or
// { id, name, manager?, build, test, testFiles, lockfiles: [], regenerate, notes: [], questions: [] }.
// `build`, `test`, `testFiles` and `regenerate` are proposals: '' when nothing sensible can be deduced.

const NODE_RUNNERS = {
  npm: { script: s => (s === 'test' ? 'npm test' : `npm run ${s}`), bin: 'npx', install: 'npm install' },
  pnpm: { script: s => `pnpm ${s}`, bin: 'pnpm exec', install: 'pnpm install' },
  yarn: { script: s => `yarn ${s}`, bin: 'yarn', install: 'yarn install' },
  bun: { script: s => `bun run ${s}`, bin: 'bunx', install: 'bun install' },
}
const NODE_LOCKS = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]
const NODE_TEST_RUNNERS = [
  ['vitest', 'vitest run {archivos}'],
  ['jest', 'jest {archivos}'],
  ['mocha', 'mocha {archivos}'],
  ['ava', 'ava {archivos}'],
]
const NODE_BUILD = ['build', 'typecheck', 'check', 'tsc', 'compile']
const NODE_TEST = ['test', 'test:unit', 'tests', 'vitest', 'jest']

function node({ root, has }) {
  const pkg = readJson(join(root, 'package.json'))
  if (!pkg) return null
  const [lock, found] = NODE_LOCKS.find(([f]) => has(f)) ?? [null, (pkg.packageManager ?? 'npm').split('@')[0]]
  const manager = NODE_RUNNERS[found] ? found : 'npm'
  const run = NODE_RUNNERS[manager]
  const scripts = pkg.scripts ?? {}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const build = NODE_BUILD.find(s => s in scripts)
  const test = NODE_TEST.find(s => s in scripts)
  const runner = NODE_TEST_RUNNERS.find(([n]) => n in deps)
  const e2e = ['@playwright/test', 'cypress'].filter(n => n in deps)
  const monorepo = Boolean(pkg.workspaces) || has('pnpm-workspace.yaml') || has('turbo.json') || has('nx.json') || has('lerna.json')
  const questions = []
  if (!build) questions.push('package.json has no build or typecheck script: how do we check that it compiles (empty if not needed)?')
  if (!test) questions.push('package.json has no test script: how are the tests run?')
  if (e2e.length > 0) questions.push(`There are end-to-end tests (${e2e.join(', ')}): run them when checking a batch, or only when a branch asks?`)
  if (monorepo) questions.push('It is a monorepo: are the commands run from the root or per package?')
  return {
    id: 'node',
    name: 'Node',
    manager,
    scripts: Object.fromEntries(Object.entries(scripts).filter(([k]) => /^(build|typecheck|check|tsc|compile|lint|test|tests|e2e|vitest|jest|generate|codegen)(:|$)/.test(k))),
    build: build ? run.script(build) : '',
    test: test ? run.script(test) : '',
    testFiles: runner ? `${run.bin} ${runner[1]}` : '',
    lockfiles: lock ? [lock] : [],
    regenerate: lock ? run.install : '',
    notes: [runner ? `tests with ${runner[0]}` : '', monorepo ? 'monorepo' : ''].filter(Boolean),
    questions,
  }
}

function python({ root, has, files }) {
  if (!['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'].some(has)) return null
  const pyproject = readText(join(root, 'pyproject.toml'))
  const config = pyproject + readText(join(root, 'setup.cfg')) + readText(join(root, 'requirements.txt')) + readText(join(root, 'requirements-dev.txt')) + readText(join(root, 'Pipfile'))
  let manager = 'pip'
  let run = ''
  let lock = null
  let regenerate = ''
  if (has('uv.lock')) [manager, run, lock, regenerate] = ['uv', 'uv run ', 'uv.lock', 'uv lock']
  else if (has('poetry.lock')) [manager, run, lock, regenerate] = ['poetry', 'poetry run ', 'poetry.lock', 'poetry lock']
  else if (has('pdm.lock')) [manager, run, lock, regenerate] = ['pdm', 'pdm run ', 'pdm.lock', 'pdm lock']
  else if (has('Pipfile.lock')) [manager, run, lock, regenerate] = ['pipenv', 'pipenv run ', 'Pipfile.lock', 'pipenv lock']
  const pytest = /pytest/.test(config) || has('conftest.py') || has('pytest.ini') || files.some(f => /(^|\/)conftest\.py$/.test(f))
  const build = /\bmypy\b/.test(config) ? `${run}mypy .` : /\bpyright\b/.test(config) ? `${run}pyright` : /\bruff\b/.test(config) ? `${run}ruff check .` : ''
  const questions = []
  if (!build) questions.push('Python has no compile step: is there a type checker or linter to run as the "build" check (mypy, pyright, ruff), or leave it empty?')
  if (!pytest) questions.push('No pytest found: how are the Python tests run (python -m unittest, tox, nox…)?')
  return {
    id: 'python',
    name: 'Python',
    manager,
    build,
    test: pytest ? `${run}pytest` : 'python -m unittest',
    testFiles: pytest ? `${run}pytest {archivos}` : '',
    lockfiles: lock ? [lock] : [],
    regenerate,
    notes: [pytest ? 'tests with pytest' : ''].filter(Boolean),
    questions,
  }
}

function rust({ has }) {
  if (!has('Cargo.toml')) return null
  return {
    id: 'rust',
    name: 'Rust',
    manager: 'cargo',
    build: 'cargo check --all-targets',
    test: 'cargo test',
    testFiles: '',
    lockfiles: has('Cargo.lock') ? ['Cargo.lock'] : [],
    regenerate: has('Cargo.lock') ? 'cargo check' : '',
    notes: ['cargo runs tests per crate, not per file: testFiles stays empty'],
    questions: [],
  }
}

function go({ has }) {
  if (!has('go.mod')) return null
  return {
    id: 'go',
    name: 'Go',
    manager: 'go',
    build: 'go vet ./...',
    test: 'go test ./...',
    testFiles: '',
    lockfiles: has('go.sum') ? ['go.sum'] : [],
    regenerate: has('go.sum') ? 'go mod tidy' : '',
    notes: ['go tests run per package: testFiles stays empty'],
    questions: [],
  }
}

function jvm({ has }) {
  const gradle = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some(has)
  if (!gradle && !has('pom.xml')) return null
  if (gradle) {
    const g = has('gradlew') ? './gradlew' : 'gradle'
    return {
      id: 'jvm',
      name: 'JVM (Gradle)',
      manager: 'gradle',
      build: `${g} assemble`,
      test: `${g} test`,
      testFiles: '',
      lockfiles: has('gradle.lockfile') ? ['gradle.lockfile'] : [],
      regenerate: has('gradle.lockfile') ? `${g} dependencies --write-locks` : '',
      notes: [has('gradlew') ? 'on Windows the wrapper is gradlew.bat' : ''].filter(Boolean),
      questions: [],
    }
  }
  const m = has('mvnw') ? './mvnw' : 'mvn'
  return { id: 'jvm', name: 'JVM (Maven)', manager: 'maven', build: `${m} -q compile`, test: `${m} -q test`, testFiles: '', lockfiles: [], regenerate: '', notes: [], questions: [] }
}

function dotnet({ files, has }) {
  const solutions = files.filter(f => /\.(sln|slnx)$/.test(f) && !f.includes('/'))
  const projects = files.filter(f => /\.(cs|fs|vb)proj$/.test(f))
  if (solutions.length === 0 && projects.length === 0) return null
  // A Unity project has .csproj too, generated and usually ignored; the Unity detector covers it.
  if (has('ProjectSettings/ProjectVersion.txt')) return null
  const target = solutions.length === 1 ? ` ${solutions[0]}` : ''
  const locks = files.filter(f => f.endsWith('packages.lock.json'))
  return {
    id: 'dotnet',
    name: '.NET',
    manager: 'dotnet',
    build: `dotnet build${target}`,
    test: `dotnet test${target}`,
    testFiles: '',
    lockfiles: locks,
    regenerate: locks.length > 0 ? 'dotnet restore --force-evaluate' : '',
    notes: [solutions.length > 1 ? `several solutions: ${solutions.join(', ')}` : ''].filter(Boolean),
    questions: solutions.length > 1 ? ['There are several .sln files: which one do the build and the tests use?'] : [],
  }
}

function php({ root, has }) {
  const composer = readJson(join(root, 'composer.json'))
  if (!composer) return null
  const scripts = composer.scripts ?? {}
  const phpunit = 'phpunit/phpunit' in (composer['require-dev'] ?? {}) || has('phpunit.xml') || has('phpunit.xml.dist')
  const pest = 'pestphp/pest' in (composer['require-dev'] ?? {})
  const runner = pest ? 'vendor/bin/pest' : phpunit ? 'vendor/bin/phpunit' : ''
  const phpstan = 'phpstan/phpstan' in (composer['require-dev'] ?? {})
  return {
    id: 'php',
    name: 'PHP',
    manager: 'composer',
    build: phpstan ? 'vendor/bin/phpstan analyse' : '',
    test: 'test' in scripts ? 'composer test' : runner,
    testFiles: runner ? `${runner} {archivos}` : '',
    lockfiles: has('composer.lock') ? ['composer.lock'] : [],
    regenerate: has('composer.lock') ? 'composer update --lock' : '',
    notes: [],
    questions: runner || 'test' in scripts ? [] : ['No PHP test runner found: how are the tests run?'],
  }
}

function ruby({ root, has, files }) {
  if (!has('Gemfile')) return null
  const gemfile = readText(join(root, 'Gemfile'))
  const rspec = /rspec/.test(gemfile) || files.some(f => f.startsWith('spec/'))
  return {
    id: 'ruby',
    name: 'Ruby',
    manager: 'bundler',
    build: /rubocop/.test(gemfile) ? 'bundle exec rubocop' : '',
    test: rspec ? 'bundle exec rspec' : has('bin/rails') ? 'bin/rails test' : 'bundle exec rake test',
    testFiles: rspec ? 'bundle exec rspec {archivos}' : has('bin/rails') ? 'bin/rails test {archivos}' : '',
    lockfiles: has('Gemfile.lock') ? ['Gemfile.lock'] : [],
    regenerate: has('Gemfile.lock') ? 'bundle lock' : '',
    notes: [],
    questions: [],
  }
}

function deno({ has }) {
  if (!has('deno.json') && !has('deno.jsonc')) return null
  return {
    id: 'deno',
    name: 'Deno',
    manager: 'deno',
    build: 'deno check .',
    test: 'deno test',
    testFiles: 'deno test {archivos}',
    lockfiles: has('deno.lock') ? ['deno.lock'] : [],
    regenerate: has('deno.lock') ? 'deno install' : '',
    notes: [],
    questions: [],
  }
}

function elixir({ has }) {
  if (!has('mix.exs')) return null
  return {
    id: 'elixir',
    name: 'Elixir',
    manager: 'mix',
    build: 'mix compile --warnings-as-errors',
    test: 'mix test',
    testFiles: 'mix test {archivos}',
    lockfiles: has('mix.lock') ? ['mix.lock'] : [],
    regenerate: has('mix.lock') ? 'mix deps.get' : '',
    notes: [],
    questions: [],
  }
}

function dart({ root, has }) {
  if (!has('pubspec.yaml')) return null
  const flutter = /\bflutter\s*:/.test(readText(join(root, 'pubspec.yaml')))
  const t = flutter ? 'flutter' : 'dart'
  return {
    id: 'dart',
    name: flutter ? 'Flutter' : 'Dart',
    manager: t,
    build: `${t} analyze`,
    test: `${t} test`,
    testFiles: `${t} test {archivos}`,
    lockfiles: has('pubspec.lock') ? ['pubspec.lock'] : [],
    regenerate: has('pubspec.lock') ? `${t} pub get` : '',
    notes: [],
    questions: [],
  }
}

function swift({ has }) {
  if (!has('Package.swift')) return null
  return {
    id: 'swift',
    name: 'Swift',
    manager: 'swiftpm',
    build: 'swift build',
    test: 'swift test',
    testFiles: '',
    lockfiles: has('Package.resolved') ? ['Package.resolved'] : [],
    regenerate: has('Package.resolved') ? 'swift package resolve' : '',
    notes: [],
    questions: [],
  }
}

function cmake({ has }) {
  if (!has('CMakeLists.txt')) return null
  return {
    id: 'cmake',
    name: 'C/C++ (CMake)',
    manager: 'cmake',
    build: 'cmake -S . -B build && cmake --build build',
    test: 'ctest --test-dir build',
    testFiles: '',
    lockfiles: has('vcpkg.json') && has('vcpkg-lock.json') ? ['vcpkg-lock.json'] : [],
    regenerate: '',
    notes: [],
    questions: ['C/C++ with CMake: is this the right way to configure, build and test (preset, build folder, generator)?'],
  }
}

/** Game engines: building and testing goes through the editor, so the agent has to ask how it is done here. */
function engine({ root, has, files }) {
  if (has('ProjectSettings/ProjectVersion.txt')) {
    const version = /m_EditorVersion:\s*(\S+)/.exec(readText(join(root, 'ProjectSettings/ProjectVersion.txt')))?.[1] ?? ''
    const editor = version ? unityEditor(version) : { path: '', installed: false }
    const unity = editor.path ? `"${editor.path}" -batchmode -nographics -projectPath .` : ''
    return {
      id: 'unity',
      name: `Unity${version ? ` ${version}` : ''}`,
      manager: 'unity',
      build: unity ? `${unity} -quit -logFile Logs/compile.log` : '',
      test: unity ? `${unity} -runTests -testPlatform EditMode -testResults Logs/tests.xml -logFile Logs/tests.log` : '',
      // -testFilter takes test class names, not file paths: the batch check runs every EditMode test.
      testFiles: '',
      // Unity rewrites packages-lock.json itself when it resolves packages: nothing to list as generated.
      lockfiles: [],
      regenerate: '',
      notes: [
        editor.installed ? `editor ${version} installed at ${editor.path}` : `editor ${version} NOT found at ${editor.path}: install it with Unity Hub, or ask which path to use`,
        'batchmode fails while an editor has the same project open; every worktree is its own project with its own Library folder',
        'Packages/packages-lock.json is rewritten by Unity: not listed as generated',
      ],
      questions: [
        'Unity: do agents compile and test with the proposed batchmode commands, through an editor bridge (MCP), or by hand? Batchmode needs the project closed in the editor.',
        'Unity: are some assets generated by editor scripts (scenes, prefabs, ScriptableObjects, localisation tables)? If so, list them as generated and give the command that rebuilds them.',
      ],
    }
  }
  if (has('project.godot')) {
    return {
      id: 'godot',
      name: 'Godot',
      manager: 'godot',
      build: '',
      test: '',
      testFiles: '',
      lockfiles: [],
      regenerate: '',
      notes: ['Godot: headless checks with godot --headless; tests usually with GUT or gdUnit4'],
      questions: ['Godot: how do agents check the project and run tests headless (godot --headless …, GUT, gdUnit4)?'],
    }
  }
  if (files.some(f => /^[^/]+\.uproject$/.test(f))) {
    return {
      id: 'unreal',
      name: 'Unreal Engine',
      manager: 'unreal',
      build: '',
      test: '',
      testFiles: '',
      lockfiles: [],
      regenerate: '',
      notes: ['Unreal: builds with UnrealBuildTool / RunUAT; tests with the Automation framework'],
      questions: ['Unreal: which UBT/RunUAT command builds the project, and how are automation tests run?'],
    }
  }
  return null
}

const DETECTORS = [engine, node, deno, python, rust, go, jvm, dotnet, php, ruby, elixir, dart, swift, cmake]

// ---------------------------------------------------------------- other facts

/** Targets of a Makefile or justfile that look like build, test or check. */
export function taskTargets(text) {
  const names = [...text.matchAll(/^([A-Za-z][\w-]*)\s*:(?!=)/gm)].map(m => m[1])
  return [...new Set(names)].filter(n => /^(all|build|check|compile|lint|test|tests|typecheck|verify|ci)$/.test(n))
}

/** Shell commands that CI runs (GitHub Actions `run:`, GitLab `script:` items), deduplicated. */
export function ciCommands(text) {
  const out = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const run = /^\s*-?\s*run:\s*(.*)$/.exec(lines[i])
    if (run) {
      if (/^[|>]-?\s*$/.test(run[1])) {
        const indent = /^\s*/.exec(lines[i + 1] ?? '')?.[0].length ?? 0
        for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || /^\s*/.exec(lines[j])[0].length >= indent); j++) {
          if (lines[j].trim()) out.push(lines[j].trim())
          i = j
        }
      } else if (run[1].trim()) out.push(run[1].trim().replace(/^["']|["']$/g, ''))
      continue
    }
    const item = /^\s+-\s+(.+)$/.exec(lines[i])
    if (item && /^\s*(script|before_script):/.test(lines.slice(Math.max(0, i - 20), i).reverse().find(l => /^\s*\w+:/.test(l)) ?? '')) out.push(item[1].trim())
  }
  return [...new Set(out)].filter(c => !/^(echo|cd|mkdir|export|set |if |fi$|done$|else$)/.test(c)).slice(0, 25)
}

/** The main branch: origin/HEAD; otherwise main, master, trunk or develop if they exist; otherwise the current one. */
export function mainBranch(repo) {
  const origin = git(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], { repo, ok: [0, 1, 128] }).stdout.trim()
  if (origin) return { branch: origin.replace(/^origin\//, ''), from: 'origin/HEAD' }
  const branches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { repo }).stdout.split(/\s+/).filter(Boolean)
  for (const b of ['main', 'master', 'trunk', 'develop']) if (branches.includes(b)) return { branch: b, from: 'exists' }
  const current = git(['symbolic-ref', '-q', '--short', 'HEAD'], { repo, ok: [0, 1, 128] }).stdout.trim()
  return { branch: current || 'main', from: 'current' }
}

// Very frequent words of each language, to guess the language of the commits. Not exhaustive: when unsure, the
// script says nothing and the agent asks (or reads the commits itself).
const WORDS = {
  en: ['the', 'and', 'of', 'to', 'in', 'for', 'with', 'on', 'add', 'fix', 'remove', 'update', 'from', 'when', 'use', 'is', 'make', 'move'],
  es: ['de', 'la', 'el', 'en', 'que', 'y', 'los', 'las', 'del', 'con', 'por', 'para', 'una', 'un', 'al', 'añade', 'arregla', 'quita', 'cambia', 'añadir', 'arreglar'],
  fr: ['le', 'la', 'les', 'des', 'du', 'et', 'pour', 'dans', 'avec', 'sur', 'une', 'ajout', 'ajoute', 'corrige', 'correction', 'supprime', 'mise'],
  de: ['der', 'die', 'das', 'und', 'für', 'mit', 'von', 'im', 'auf', 'nicht', 'ein', 'eine', 'hinzugefügt', 'behoben', 'entfernt', 'füge', 'fehler'],
  pt: ['de', 'da', 'do', 'em', 'para', 'com', 'os', 'as', 'uma', 'um', 'adiciona', 'corrige', 'remove', 'adicionado', 'corrigido', 'não'],
  it: ['il', 'di', 'della', 'del', 'per', 'con', 'una', 'un', 'gli', 'aggiunge', 'aggiunto', 'corretto', 'corregge', 'rimuove', 'rimosso'],
}

/** ISO 639-1 code of the commit language, or '' if unclear. Words shared by several languages count for all. */
export function commitLanguage(subjects) {
  const count = Object.fromEntries(Object.keys(WORDS).map(k => [k, 0]))
  for (const subject of subjects) {
    const words = subject.toLowerCase().split(/[^a-zàâäáãçéèêëíìîïñóòôöõúùûüß]+/)
    for (const [lang, list] of Object.entries(WORDS)) count[lang] += words.filter(w => list.includes(w)).length
  }
  const [[best, a], [, b] = [null, 0]] = Object.entries(count).sort((x, y) => y[1] - x[1])
  if (a < 2 || a < 1.5 * b) return ''
  return best
}

/** 'conventional' (feat:, fix(scope):…) if most subjects follow it; '' otherwise. */
export function commitStyle(subjects) {
  if (subjects.length === 0) return ''
  const n = subjects.filter(s => /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\(.+\))?!?: /.test(s)).length
  return n >= subjects.length / 2 ? 'conventional' : ''
}

/** Prefix of the numbered decisions of a document («### D12. …», «## ADR-3: …»), or ''. */
export function decisionPrefix(text) {
  const count = new Map()
  for (const m of text.matchAll(/^#{2,4} +([A-Z]{1,4}-?)(\d+)\b/gm)) count.set(m[1], (count.get(m[1]) ?? 0) + 1)
  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1])
  return best && best[1] >= 2 ? best[0] : ''
}

/** How many table rows start with a code («| T12 |»). */
export const codedRows = text => [...text.matchAll(/^\| *~*[A-Z]{1,4}\d+~* *\|/gm)].length

const GENERATED = /(^|\/)(__generated__\/|generated\/|[^/]*\.(gen|generated|g)\.[^/]+$|[^/]*_pb2(_grpc)?\.py$|[^/]*\.pb\.go$|routeTree\.gen\.ts$|next-env\.d\.ts$)/
const SENSITIVE = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx|keystore|jks)|credentials[^/]*\.json|secrets?\.[^/]+|id_rsa[^/]*)$/
const SAMPLE = /\.(example|sample|template|dist)$/
const BUILD_OUTPUTS = ['dist', 'build', 'out', 'target', 'bin', 'obj', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage', '.turbo', 'storybook-static', '__pycache__', '.venv', 'venv', 'Library', 'Temp', 'Logs', '.godot']

// ---------------------------------------------------------------- inspection

export function inspect(repo = '.') {
  const root = raiz(repo)
  const files = git(['ls-files'], { repo: root }).stdout.split(/\r?\n/).filter(Boolean)
  const set = new Set(files)
  const has = path => set.has(path)
  const ctx = { root, has, files }
  const facts = { root, name: basename(root) }

  facts.isMainCopy = existsSync(join(root, '.git')) && statSync(join(root, '.git')).isDirectory()
  facts.settingsExist = existsSync(join(root, AJUSTES))
  facts.mainBranch = mainBranch(root)
  facts.worktrees = git(['worktree', 'list', '--porcelain'], { repo: root }).stdout.split(/\r?\n/).filter(l => l.startsWith('worktree ')).length
  facts.ecosystems = DETECTORS.map(d => d(ctx)).filter(Boolean)

  const tasks = {}
  for (const f of ['Makefile', 'makefile', 'GNUmakefile', 'justfile', 'Justfile', 'Taskfile.yml']) {
    if (!has(f)) continue
    const targets = f === 'Taskfile.yml' ? [...readText(join(root, f)).matchAll(/^ {2}([\w-]+):\s*$/gm)].map(m => m[1]).filter(n => /^(build|check|lint|test|tests|ci)$/.test(n)) : taskTargets(readText(join(root, f)))
    if (targets.length > 0) tasks[f] = targets
  }
  facts.tasks = tasks

  const ciFiles = files.filter(f => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f) || f === '.gitlab-ci.yml' || f === 'azure-pipelines.yml' || f === 'bitbucket-pipelines.yml' || /^\.circleci\/config\.ya?ml$/.test(f))
  facts.ci = { files: ciFiles, commands: [...new Set(ciFiles.flatMap(f => ciCommands(readText(join(root, f)))))].slice(0, 25) }

  facts.generated = files.filter(f => GENERATED.test(f)).slice(0, 20)

  const docs = files.filter(f => /\.(md|markdown|rst|txt)$/i.test(f) && !/(^|\/)(node_modules|vendor)\//.test(f) && f.split('/').length <= 3)
  facts.documents = { decisions: [], backlog: [], changelog: [], todo: [], adrFolder: '' }
  for (const f of docs) {
    const base = basename(f).toLowerCase()
    const text = readText(join(root, f))
    const prefix = decisionPrefix(text)
    if (prefix) facts.documents.decisions.push({ file: f, prefix, count: [...text.matchAll(new RegExp(`^#{2,4} +${prefix}\\d+`, 'gm'))].length })
    const rows = codedRows(text)
    if (rows >= 2) facts.documents.backlog.push({ file: f, rows })
    if (/^(changelog|changes|history|news)(\.|$)/.test(base)) facts.documents.changelog.push(f)
    if (/^(todo|pending|pendientes?|backlog)(\.|$)/.test(base)) facts.documents.todo.push(f)
  }
  const adr = files.filter(f => /(^|\/)(adr|adrs|decisions|architecture\/decisions)\/[^/]+\.md$/i.test(f))
  facts.documents.adrFolder = adr.length > 0 ? adr[0].replace(/\/[^/]+$/, '') : ''

  const ignored = path => git(['check-ignore', '-q', path], { repo: root, ok: [0, 1, 128] }).status === 0
  const untracked = git(['ls-files', '--others', '--exclude-standard'], { repo: root }).stdout.split(/\r?\n/).filter(Boolean)
  facts.notIgnored = {
    sensitive: [...new Set([...files, ...untracked].filter(f => SENSITIVE.test(f) && !SAMPLE.test(f)))],
    tracked: files.filter(f => SENSITIVE.test(f) && !SAMPLE.test(f)),
    buildOutputs: BUILD_OUTPUTS.filter(d => existsSync(join(root, d)) && statSync(join(root, d)).isDirectory() && !ignored(`${d}/`)),
  }

  const subjects = git(['log', '-50', '--no-merges', '--format=%s'], { repo: root, ok: [0, 128] }).stdout.split(/\r?\n/).filter(Boolean)
  facts.commits = { language: commitLanguage(subjects), style: commitStyle(subjects), examples: subjects.slice(0, 6) }

  facts.instructions = ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md'].filter(f => existsSync(join(root, f)))
  facts.tools = { node: process.version, git: toolVersion('git'), orca: toolVersion('orca') }
  // Task runners only matter if the project has their file; a Makefile is no use on a machine without make.
  for (const [file, tool] of [['Makefile', 'make'], ['makefile', 'make'], ['GNUmakefile', 'make'], ['justfile', 'just'], ['Justfile', 'just'], ['Taskfile.yml', 'task']]) {
    if (file in facts.tasks && !(tool in facts.tools)) facts.tools[tool] = toolVersion(tool)
  }

  return { facts, ...propose(facts) }
}

/** The settings that can be deduced, and what has to be asked. */
export function propose(f) {
  const proposal = {}
  const questions = []
  const ask = q => questions.push(q)

  if (f.mainBranch.branch !== POR_DEFECTO.ramaPrincipal) proposal.ramaPrincipal = f.mainBranch.branch
  if (f.mainBranch.from === 'current') ask(`Is "${f.mainBranch.branch}" the main branch? (no origin/HEAD, main or master)`)

  if (f.commits.language && f.commits.language !== POR_DEFECTO.idioma) proposal.idioma = f.commits.language
  if (!f.commits.language) ask('Which language do agents write commits, notices and documents in? The commits do not make it clear (use the user\'s language if in doubt).')

  // Commands: one ecosystem gives its own; several are joined with && (or the task runner's targets when it has them),
  // so a merge is checked for every part of the project.
  const eco = f.ecosystems
  const commands = { compilar: '', probar: '', probarArchivos: '', regenerar: '' }
  const joined = list => [...new Set(list.filter(Boolean))].join(' && ')
  const fromTasks = () => {
    const entry = Object.entries(f.tasks)[0]
    if (!entry) return null
    const [file, targets] = entry
    const tool = /just/i.test(file) ? 'just' : /Taskfile/.test(file) ? 'task' : 'make'
    const build = targets.find(t => /^(build|compile|all|check)$/.test(t))
    const test = targets.find(t => /^tests?$/.test(t))
    return { compilar: build ? `${tool} ${build}` : '', probar: test ? `${tool} ${test}` : '', file, tool, installed: Boolean(f.tools[tool]) }
  }
  for (const e of eco) for (const q of e.questions) ask(q)
  if (eco.length === 1) {
    commands.compilar = eco[0].build
    commands.probar = eco[0].test
    commands.probarArchivos = eco[0].testFiles
  } else if (eco.length > 1) {
    // The task runner's targets, if it is installed here; otherwise the ecosystems' own commands.
    const runner = fromTasks()
    const tasks = runner?.installed ? runner : null
    if (runner && !runner.installed) ask(`${runner.file} has build/test targets but ${runner.tool} is not installed on this machine: the proposal uses the ecosystems' own commands instead. Is ${runner.tool} expected on the machines where agents run?`)
    commands.compilar = tasks?.compilar || joined(eco.map(e => e.build))
    commands.probar = tasks?.probar || joined(eco.map(e => e.test))
    // A per-file command would run only one ecosystem's tests: the batch check runs the whole suite instead.
    const how = tasks?.compilar || tasks?.probar ? `through the ${tasks.file} targets` : 'with the commands joined by &&'
    ask(`Several ecosystems: ${eco.map(e => e.name).join(', ')}. The proposal checks all of them ${how}; is any part not ready yet, or not worth checking on every merge?`)
  } else {
    const tasks = fromTasks()
    if (tasks) [commands.compilar, commands.probar] = [tasks.compilar, tasks.probar]
    if (tasks && !tasks.installed) ask(`${tasks.tool} is not installed on this machine: the ${tasks.file} targets cannot be tried here.`)
    ask('No known ecosystem was detected: how is the project built and how are the tests run?')
  }
  commands.regenerar = joined(eco.map(e => e.regenerate))
  const patterns = [...new Set(eco.map(e => TEST_PATTERNS[e.id]).filter(Boolean))]
  if (patterns.length > 0 && !(patterns.length === 1 && patterns[0] === POR_DEFECTO.pruebas.patron)) {
    proposal.pruebas = { patron: patterns.length === 1 ? patterns[0] : patterns.map(p => `(?:${p})`).join('|') }
  }
  const proposed = Object.values(commands).join(' ')
  const missing = f.ci.commands.filter(c => !proposed.includes(c) && /\b(lint|check|test|build|vet|tsc|mypy|ruff|clippy|eslint|pytest|phpstan|rubocop)\b/.test(c))
  if (missing.length > 0) ask(`CI runs checks the proposal does not: ${missing.slice(0, 8).join(' · ')}. Should they be part of compilar/probar, so a merge is held to the same bar as CI?`)
  for (const [key, value] of Object.entries(commands)) if (value !== POR_DEFECTO.comandos[key]) (proposal.comandos ??= {})[key] = value

  // Only lockfiles that can be rebuilt: a generated file nobody regenerates would keep one side of every conflict.
  const lockfiles = f.ecosystems.filter(e => e.regenerate).flatMap(e => e.lockfiles)
  if (lockfiles.length > 0) proposal.generados = lockfiles
  if (f.generated.length > 0) ask(`Are these tracked files generated (kept as-is on merge and rebuilt after)? ${f.generated.join(', ')}. If so, with which command?`)

  const forbidden = [...f.notIgnored.sensitive, ...f.notIgnored.buildOutputs.map(d => `${d}/`)]
  if (forbidden.length > 0) {
    proposal.prohibidos = forbidden
    ask(`Not ignored by git: ${forbidden.join(', ')}. Add them to "prohibidos", to .gitignore, or both?`)
  }
  if (f.notIgnored.tracked.length > 0) ask(`Possibly secret files are already committed: ${f.notIgnored.tracked.join(', ')}. Tell the user; removing them from history is their call.`)

  const [decisions] = [...f.documents.decisions].sort((a, b) => b.count - a.count)
  if (decisions) {
    proposal.decisiones = { activo: true, documento: decisions.file, ...(decisions.prefix !== POR_DEFECTO.decisiones.prefijo ? { prefijo: decisions.prefix } : {}) }
    ask(`${decisions.file} has ${decisions.count} numbered decisions (${decisions.prefix}1, ${decisions.prefix}2…): reserve a block of numbers per branch so parallel agents never reuse one?`)
  } else if (f.documents.adrFolder) {
    ask(`There are ADRs in ${f.documents.adrFolder}/, one file per decision. Number blocks only work with a single document, so with ADRs agents take the next free number when they merge the main branch (say so in CLAUDE.md). Should agents record their decisions there?`)
  } else {
    ask('Record design decisions numbered in a document (DESIGN.md), with a block of numbers per branch? Only worth it with many agents deciding things in parallel.')
  }
  const [backlog] = [...f.documents.backlog].sort((a, b) => b.rows - a.rows)
  if (backlog) {
    proposal.backlog = { activo: true, documento: backlog.file }
    ask(`${backlog.file} has a table with codes (T1, T2…): is it the backlog, with codes renumbered when branches are merged?`)
  }
  if (f.documents.changelog.length > 0) proposal.unir = f.documents.changelog
  if (f.documents.todo.length > 0 && !backlog) ask(`Is ${f.documents.todo[0]} where pending work gets written down, or use a new ${POR_DEFECTO.pendientes}?`)

  if (!f.tools.orca) ask('Orca is not in PATH: without it there are no task worktrees and branches cannot be closed. Is it installed?')
  ask(f.instructions.length > 0 ? `Add the parallel-work section to ${f.instructions[0]}?` : 'Create a CLAUDE.md with the parallel-work section?')
  return { proposal, questions }
}

function summary({ facts: f, proposal, questions }) {
  const l = []
  l.push(`Project ${f.name} (${f.root})${f.isMainCopy ? '' : ' · WARNING: this is not the main copy'}`)
  if (f.settingsExist) l.push(`${AJUSTES} already exists.`)
  l.push(`Main branch: ${f.mainBranch.branch} (${f.mainBranch.from}) · worktrees: ${f.worktrees}`)
  for (const e of f.ecosystems) {
    l.push(`${e.name}${e.manager ? ` with ${e.manager}` : ''}${e.lockfiles.length ? ` (${e.lockfiles.join(', ')})` : ''}${e.notes.length ? ` · ${e.notes.join('; ')}` : ''}`)
    if (e.scripts) for (const [k, v] of Object.entries(e.scripts)) l.push(`  ${k}: ${v}`)
  }
  if (f.ecosystems.length === 0) l.push('No known ecosystem.')
  for (const [file, targets] of Object.entries(f.tasks)) l.push(`${file}: ${targets.join(', ')}`)
  if (f.ci.files.length > 0) l.push(`CI (${f.ci.files.join(', ')}):`, ...f.ci.commands.map(c => `  $ ${c}`))
  if (f.generated.length > 0) l.push(`Look generated: ${f.generated.join(', ')}`)
  const d = f.documents
  for (const x of d.decisions) l.push(`Decisions: ${x.file} (${x.count} with ${x.prefix})`)
  for (const x of d.backlog) l.push(`Backlog: ${x.file} (${x.rows} coded rows)`)
  if (d.changelog.length > 0) l.push(`Changelog: ${d.changelog.join(', ')}`)
  if (d.adrFolder) l.push(`ADRs: ${d.adrFolder}/`)
  l.push(`Commits in ${f.commits.language || '?'}${f.commits.style ? ` (${f.commits.style})` : ''}: ${f.commits.examples.map(s => `"${s}"`).join(' ')}`)
  l.push(`Agent instructions: ${f.instructions.join(', ') || 'none'}`)
  l.push(`Tools: node ${f.tools.node}, ${f.tools.git || 'no git'}, ${f.tools.orca ? `orca ${f.tools.orca}` : 'no orca'}`)
  l.push('', `Proposed ${AJUSTES}:`, JSON.stringify(proposal, null, 2), '', 'Questions (ask the user, in their language, only those the project does not answer):')
  for (const q of questions) l.push(`- ${q}`)
  return l.join('\n')
}

export function main(argv) {
  const a = argumentos(argv, ['--json'], ['--repo'])
  const result = inspect(a.repo ?? '.')
  imprimir(a.json ? JSON.stringify(result, null, 2) : summary(result))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
