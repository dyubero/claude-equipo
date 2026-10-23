// Tests for inspect-project.mjs (skill `adapt-to-project`) with temporary projects of many kinds. They never touch
// this repository.
//
//   node --test plugin/scripts/tests

import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import * as ip from '../inspect-project.mjs'
import { borrar, commit, escribir, repoNuevo, sh } from './ayudas.mjs'

const pkg = (scripts, dev = {}, extra = {}) => JSON.stringify({ name: 'shop', scripts, devDependencies: dev, ...extra }, null, 2)

describe('inspect-project', () => {
  let repo
  afterEach(() => borrar(repo))

  /** A new repository with these files and one commit with this subject. */
  function project(files, subject = 'Add the first version of the shop') {
    repo = repoNuevo('inspect-')
    for (const [path, text] of Object.entries(files)) escribir(repo, path, text)
    commit(repo, subject)
    return repo
  }

  test('npm + vitest web app: npm commands, lockfile as generated, files git does not ignore', () => {
    project(
      {
        'package.json': pkg({ build: 'vite build', test: 'vitest run', lint: 'eslint .' }, { vitest: '^2' }),
        'package-lock.json': '{}\n',
        'CHANGELOG.md': '# Changes\n',
        'src/routeTree.gen.ts': 'export {}\n',
        '.gitignore': 'node_modules/\n',
      },
      'Añade el carrito de la tienda con los descuentos',
    )
    escribir(repo, '.env.local', 'KEY=1\n')
    escribir(repo, 'dist/index.html', '')
    const { facts, proposal, questions } = ip.inspect(repo)
    assert.equal(facts.isMainCopy, true)
    assert.equal(facts.ecosystems[0].id, 'node')
    assert.equal(facts.commits.language, 'es')
    // npm run build and npm test are the defaults: they are not in the proposal.
    assert.deepEqual(proposal.comandos, { probarArchivos: 'npx vitest run {archivos}', regenerar: 'npm install' })
    assert.deepEqual(proposal.generados, ['package-lock.json'])
    assert.deepEqual(proposal.unir, ['CHANGELOG.md'])
    assert.deepEqual(proposal.prohibidos, ['.env.local', 'dist/'])
    assert.equal(proposal.pruebas, undefined)
    assert.ok(questions.some(q => q.includes('src/routeTree.gen.ts')))
    assert.ok(questions.some(q => q.includes('.env.local')))
  })

  test('pnpm monorepo on master, with ADR-style decisions, a backlog and English commits', () => {
    project({
      'package.json': pkg({ typecheck: 'tsc --noEmit', 'test:unit': 'jest' }, { jest: '^29', '@playwright/test': '^1' }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'pnpm-workspace.yaml': 'packages: []\n',
      'docs/design.md': '# Design\n\n## ADR-1 Use React\n\n## ADR-2 Use pnpm\n\n## ADR-3 Monorepo\n',
      'TODO.md': '| # | Task |\n|---|---|\n| T1 | a |\n| ~~T2~~ | b |\n| T3 | c |\n',
    }, 'Add the design document for the app')
    escribir(repo, 'README.md', '# App\n')
    commit(repo, 'Fix the build when the cache is empty')
    sh(repo, ['branch', '-m', 'main', 'master'])
    const { facts, proposal, questions } = ip.inspect(repo)
    assert.deepEqual(facts.mainBranch, { branch: 'master', from: 'exists' })
    assert.equal(proposal.ramaPrincipal, 'master')
    assert.equal(proposal.idioma, 'en')
    assert.deepEqual(proposal.comandos, { compilar: 'pnpm typecheck', probar: 'pnpm test:unit', probarArchivos: 'pnpm exec jest {archivos}', regenerar: 'pnpm install' })
    assert.deepEqual(proposal.decisiones, { activo: true, documento: 'docs/design.md', prefijo: 'ADR-' })
    assert.deepEqual(proposal.backlog, { activo: true, documento: 'TODO.md' })
    assert.ok(questions.some(q => /end-to-end/.test(q)))
    assert.ok(questions.some(q => /monorepo/.test(q)))
  })

  test('Python with uv and pytest: uv commands, Python test pattern, French commits', () => {
    project(
      {
        'pyproject.toml': '[project]\nname = "x"\n[dependency-groups]\ndev = ["pytest", "mypy"]\n',
        'uv.lock': 'version = 1\n',
        'tests/test_cart.py': 'def test_x(): pass\n',
      },
      'Ajoute la correction du panier pour les remises',
    )
    const { facts, proposal } = ip.inspect(repo)
    assert.equal(facts.ecosystems[0].id, 'python')
    assert.equal(proposal.idioma, 'fr')
    assert.deepEqual(proposal.comandos, { compilar: 'uv run mypy .', probar: 'uv run pytest', probarArchivos: 'uv run pytest {archivos}', regenerar: 'uv lock' })
    assert.deepEqual(proposal.pruebas, { patron: ip.TEST_PATTERNS.python })
    assert.match('tests/test_cart.py', new RegExp(proposal.pruebas.patron))
    assert.deepEqual(proposal.generados, ['uv.lock'])
  })

  test('Rust, Go and .NET get their own commands', () => {
    project({ 'Cargo.toml': '[package]\nname = "x"\n', 'Cargo.lock': '' }, 'feat: first commit of the crate')
    let { facts, proposal } = ip.inspect(repo)
    assert.equal(facts.commits.style, 'conventional')
    assert.deepEqual(proposal.comandos, { compilar: 'cargo check --all-targets', probar: 'cargo test', regenerar: 'cargo check' })
    borrar(repo)

    project({ 'go.mod': 'module x\n', 'go.sum': '' })
    ;({ proposal } = ip.inspect(repo))
    assert.deepEqual(proposal.comandos, { compilar: 'go vet ./...', probar: 'go test ./...', regenerar: 'go mod tidy' })
    borrar(repo)

    project({ 'Shop.sln': '', 'src/Shop/Shop.csproj': '<Project/>' })
    ;({ proposal } = ip.inspect(repo))
    assert.deepEqual(proposal.comandos, { compilar: 'dotnet build Shop.sln', probar: 'dotnet test Shop.sln' })
  })

  test('Unity: batchmode commands for the editor of the project, C# test pattern, lockfile not generated', () => {
    project({
      'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 6000.0.30f1\n',
      'Packages/manifest.json': '{}\n',
      'Packages/packages-lock.json': '{}\n',
      'Assembly-CSharp.csproj': '<Project/>',
    })
    escribir(repo, 'Library/x', '')
    const { facts, proposal, questions } = ip.inspect(repo)
    assert.deepEqual(facts.ecosystems.map(e => e.id), ['unity'])
    assert.equal(facts.ecosystems[0].name, 'Unity 6000.0.30f1')
    assert.match(proposal.comandos.compilar, /Hub\/Editor\/6000\.0\.30f1\/.*-batchmode .*-quit/)
    assert.match(proposal.comandos.probar, /-runTests -testPlatform EditMode/)
    assert.equal(proposal.comandos.probarArchivos, undefined) // -testFilter takes class names, not files
    assert.equal(proposal.generados, undefined) // Unity rewrites packages-lock.json itself
    assert.match('Assets/Tests/EditMode/InventarTests.cs', new RegExp(proposal.pruebas.patron))
    assert.doesNotMatch('Assets/Scripts/Inventar.cs', new RegExp(proposal.pruebas.patron))
    assert.ok(proposal.prohibidos.includes('Library/'))
    assert.ok(facts.ecosystems[0].notes.some(n => /editor 6000\.0\.30f1 (installed|NOT found)/.test(n)))
    assert.ok(questions.some(q => /Unity: do agents compile and test/.test(q)))
  })

  test('no known ecosystem: Makefile targets and CI commands', () => {
    project({
      Makefile: 'all: build\n\nbuild:\n\tcc -o app main.c\n\ntest: build\n\t./run-tests.sh\n\nVAR := 1\n',
      '.github/workflows/ci.yml': 'jobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4\n      - run: make build\n      - run: |\n          make test\n          ./lint.sh\n',
    })
    const { facts, proposal, questions } = ip.inspect(repo)
    assert.deepEqual(facts.tasks, { Makefile: ['all', 'build', 'test'] })
    assert.deepEqual(facts.ci.commands, ['make build', 'make test', './lint.sh'])
    assert.deepEqual(proposal.comandos, { compilar: 'make all', probar: 'make test' })
    assert.ok(questions.some(q => /No known ecosystem/.test(q)))
    assert.ok(questions.some(q => /CI runs checks the proposal does not: make build · \.\/lint\.sh/.test(q)))
  })

  test('Go + Vite with a Makefile: the Makefile checks both, lockfiles of both, patterns of both', () => {
    project({
      'go.mod': 'module shop\n',
      'go.sum': '',
      'package.json': pkg({ build: 'vite build', test: 'vitest run' }, { vitest: '^2' }),
      'package-lock.json': '{}\n',
      Makefile: 'build:\n\tgo build ./... && npm run build\n\ntest:\n\tgo test ./... && npm test\n',
    })
    let { facts, proposal, questions } = ip.inspect(repo)
    const joined = { compilar: 'npm run build && go vet ./...', probar: 'npm test && go test ./...', regenerar: 'npm install && go mod tidy' }
    if (facts.tools.make) {
      assert.deepEqual(proposal.comandos, { compilar: 'make build', probar: 'make test', regenerar: 'npm install && go mod tidy' })
    } else {
      // Without make on this machine, the Makefile is no use: the ecosystems' own commands, and a question.
      assert.deepEqual(proposal.comandos, joined)
      assert.ok(questions.some(q => /make is not installed/.test(q)))
    }
    assert.deepEqual(proposal.generados, ['package-lock.json', 'go.sum'])
    const patron = new RegExp(proposal.pruebas.patron)
    assert.ok(patron.test('internal/cart/cart_test.go') && patron.test('src/cart.test.ts'))
    assert.ok(questions.some(q => /Several ecosystems: Node, Go/.test(q)))
    // Without the Makefile, the commands are joined.
    sh(repo, ['rm', '-q', 'Makefile'])
    commit(repo, 'no make')
    ;({ proposal } = ip.inspect(repo))
    assert.deepEqual(proposal.comandos, joined)
  })

  test('commit language, decision prefix and coded rows', () => {
    assert.equal(ip.commitLanguage(['Arregla el carrito de la tienda', 'Añade los descuentos por cantidad']), 'es')
    assert.equal(ip.commitLanguage(['Fix the cart', 'Add discounts to the checkout']), 'en')
    assert.equal(ip.commitLanguage(['Fehler im Warenkorb behoben', 'Rabatte für die Kasse hinzugefügt']), 'de')
    assert.equal(ip.commitLanguage(['wip', 'v2']), '')
    assert.equal(ip.commitStyle(['feat(cart): discounts', 'fix: rounding', 'docs: readme']), 'conventional')
    assert.equal(ip.commitStyle(['Add discounts', 'fix: rounding', 'Readme']), '')
    assert.equal(ip.decisionPrefix('### D1. One\n### D2. Two\n'), 'D')
    assert.equal(ip.decisionPrefix('## 1. One\n## Install\n'), '')
    assert.equal(ip.decisionPrefix('### D1. Only one\n'), '')
    assert.equal(ip.codedRows('| T1 | a |\n| ~~T2~~ | b |\n| x | c |\n'), 2)
    assert.deepEqual(ip.taskTargets('build:\n\tx\ntest: build\n\ty\nX := 1\nrelease:\n'), ['build', 'test'])
  })
})
