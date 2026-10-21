// Pruebas de explorar.mjs (skill `preparar`) con proyectos temporales de distintos tipos. Nunca toca este repositorio.
//
//   node --test plugin/scripts/tests

import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'

import * as explorar from '../explorar.mjs'
import { borrar, commit, escribir, repoNuevo, sh } from './ayudas.mjs'

const paquete = (scripts, dev = {}, extra = {}) => JSON.stringify({ name: 'tienda', scripts, devDependencies: dev, ...extra }, null, 2)

describe('explorar', () => {
  let repo
  afterEach(() => borrar(repo))

  test('web con npm y vitest: comandos de npm, el lockfile generado y lo que no se ignora', () => {
    repo = repoNuevo('explorar-')
    escribir(repo, 'package.json', paquete({ build: 'vite build', test: 'vitest run', lint: 'eslint .' }, { vitest: '^2' }))
    escribir(repo, 'package-lock.json', '{}\n')
    escribir(repo, 'CHANGELOG.md', '# Cambios\n')
    escribir(repo, 'src/routeTree.gen.ts', 'export {}\n')
    escribir(repo, '.gitignore', 'node_modules/\n')
    commit(repo, 'Añade el carrito de la tienda con los descuentos')
    escribir(repo, '.env.local', 'CLAVE=1\n') // sin ignorar ni commit
    escribir(repo, 'dist/index.html', '')
    const { hechos, propuesta, preguntas } = explorar.explorar(repo)
    assert.equal(hechos.copiaPrincipal, true)
    assert.equal(hechos.node.gestor, 'npm')
    assert.equal(hechos.node.ejecutor, 'vitest')
    assert.equal(hechos.commits.idioma, 'es')
    // npm run build y npm test son los de por defecto: no salen en la propuesta.
    assert.deepEqual(propuesta.comandos, { probarArchivos: 'npx vitest run {archivos}', regenerar: 'npm install' })
    assert.deepEqual(propuesta.generados, ['package-lock.json'])
    assert.deepEqual(propuesta.unir, ['CHANGELOG.md'])
    assert.deepEqual(propuesta.prohibidos, ['.env.local', 'dist/'])
    assert.equal(propuesta.idioma, undefined)
    assert.ok(preguntas.some(p => p.includes('src/routeTree.gen.ts')))
    assert.ok(preguntas.some(p => p.includes('.env.local')))
    assert.ok(preguntas.some(p => /decisiones de diseño/.test(p)))
  })

  test('pnpm, rama master, decisiones y backlog existentes, commits en inglés', () => {
    repo = repoNuevo('explorar-')
    escribir(repo, 'package.json', paquete({ typecheck: 'tsc --noEmit', 'test:unit': 'jest' }, { jest: '^29', '@playwright/test': '^1' }))
    escribir(repo, 'pnpm-lock.yaml', 'lockfileVersion: 9\n')
    escribir(repo, 'pnpm-workspace.yaml', 'packages: []\n')
    escribir(repo, 'docs/design.md', '# Design\n\n## ADR-1 Use React\n\n## ADR-2 Use pnpm\n\n## ADR-3 Monorepo\n')
    escribir(repo, 'TODO.md', '| # | Task |\n|---|---|\n| T1 | a |\n| ~~T2~~ | b |\n| T3 | c |\n')
    commit(repo, 'Add the design document for the app')
    escribir(repo, 'README.md', '# App\n')
    commit(repo, 'Fix the build when the cache is empty')
    sh(repo, ['branch', '-m', 'main', 'master'])
    const { hechos, propuesta, preguntas } = explorar.explorar(repo)
    assert.deepEqual(hechos.ramaPrincipal, { rama: 'master', de: 'existe' })
    assert.equal(hechos.node.monorepo, true)
    assert.equal(propuesta.ramaPrincipal, 'master')
    assert.equal(propuesta.idioma, 'en')
    assert.deepEqual(propuesta.comandos, {
      compilar: 'pnpm typecheck',
      probar: 'pnpm test:unit',
      probarArchivos: 'pnpm exec jest {archivos}',
      regenerar: 'pnpm install',
    })
    assert.deepEqual(propuesta.decisiones, { activo: true, documento: 'docs/design.md', prefijo: 'ADR-' })
    assert.deepEqual(propuesta.backlog, { activo: true, documento: 'TODO.md' })
    assert.ok(preguntas.some(p => /extremo a extremo/.test(p)))
    assert.ok(preguntas.some(p => /monorepo/.test(p)))
  })

  test('sin package.json: comandos vacíos y la pregunta de cómo se compila', () => {
    repo = repoNuevo('explorar-')
    escribir(repo, 'pyproject.toml', '[project]\nname = "x"\n')
    commit(repo, 'x')
    const { hechos, propuesta, preguntas } = explorar.explorar(repo)
    assert.equal(hechos.node, null)
    assert.deepEqual(propuesta.comandos, { compilar: '', probar: '' })
    assert.ok(preguntas.some(p => p.includes('Python (pyproject.toml)')))
    assert.ok(preguntas.some(p => /idioma/.test(p))) // «x» no dice nada
  })

  test('idioma y prefijo de las decisiones', () => {
    assert.equal(explorar.idiomaDe(['Arregla el carrito de la tienda', 'Añade los descuentos por cantidad']), 'es')
    assert.equal(explorar.idiomaDe(['Fix the cart', 'Add discounts to the checkout']), 'en')
    assert.equal(explorar.idiomaDe(['wip', 'v2']), '')
    assert.equal(explorar.prefijoDecisiones('### D1. Uno\n### D2. Dos\n'), 'D')
    assert.equal(explorar.prefijoDecisiones('## 1. Uno\n## Instalar\n'), '')
    assert.equal(explorar.prefijoDecisiones('### D1. Solo una\n'), '')
    assert.equal(explorar.filasConCodigo('| T1 | a |\n| ~~T2~~ | b |\n| x | c |\n'), 2)
  })
})

