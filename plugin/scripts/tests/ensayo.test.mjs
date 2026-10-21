// Subida ordenada con ramas de prueba en un repositorio temporal. Nunca toca este repositorio.
//
//   node --test plugin/scripts/tests
//
// Ramas que chocan como en las tandas de verdad:
// - lock-a y lock-b: cambian la misma línea de package-lock.json (generado) y de src/rutas.ts (código), y añaden
//   decisiones y tareas al final de DESIGN.md y BACKLOG.md;
// - codigo-a y codigo-b: cambian la misma línea de src/carrito.ts (codigo-b además choca con lock-b en otra línea);
// - docs-mal: cambia una línea de DESIGN.md que main también cambió (choque de verdad con main).

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as ensayo from '../ensayo.mjs'
import * as fusion from '../fusion.mjs'
import { añadir, borrar, cambiar, commit, escribir, leer, repoNuevo, sh } from './ayudas.mjs'

const SCRIPTS = fileURLToPath(new URL('..', import.meta.url))
const LOCK = 'package-lock.json'
const CARRITO = 'src/carrito.ts'
const RUTAS = 'src/rutas.ts'

const AJUSTES = {
  decisiones: { activo: true },
  backlog: { activo: true },
  generados: [LOCK],
  comandos: { regenerar: 'npm install' },
}

const lock = version => `{\n  "name": "tienda",\n  "version": "${version}",\n  "lockfileVersion": 3,\n  "packages": {}\n}\n`

describe('repositorio con ramas que chocan', () => {
  let repo

  beforeEach(() => {
    repo = repoNuevo('subidas-')
    const r = repo
    escribir(r, '.claude/equipo.json', JSON.stringify(AJUSTES, null, 2))
    escribir(r, 'DESIGN.md', '# Diseño\n\n### D1. Primera\nTexto uno.\n\n### D2. Segunda\nTexto dos.\n')
    escribir(r, 'BACKLOG.md', '# Backlog\n\n| # | Pendiente |\n|---|---|\n| T1 | algo |\n')
    escribir(r, LOCK, lock('1.0.0'))
    escribir(r, CARRITO, 'export class Carrito {\n  a = 1\n  b = 2\n}\n')
    escribir(r, RUTAS, 'export const rutas = []\n')
    commit(r, 'base')
    assert.equal(fusion.instalar({ repo: r }).codigo, 0)

    // main sigue después de que salgan las ramas.
    sh(r, ['checkout', '-q', '-b', 'docs-mal'])
    cambiar(r, 'DESIGN.md', 'Texto dos.', 'Texto dos, cambiado en la rama.')
    commit(r, 'docs-mal')
    sh(r, ['checkout', '-q', 'main'])
    cambiar(r, 'DESIGN.md', 'Texto dos.', 'Texto dos, cambiado en main.')
    commit(r, 'main sigue')

    for (const [rama, version, decision, codigo] of [
      ['lock-a', '1.0.1-a', 'D10', 'lock-a-T1'],
      ['lock-b', '1.0.1-b', 'D20', 'lock-b-T1'],
    ]) {
      sh(r, ['checkout', '-q', '-b', `ana/${rama}`, 'main'])
      escribir(r, LOCK, lock(version))
      cambiar(r, RUTAS, '[]', `['/${rama}']`)
      añadir(r, 'DESIGN.md', `\n### ${decision}. De ${rama}\nAlgo.\n`)
      añadir(r, 'BACKLOG.md', `| ${codigo} | de ${rama} |\n`)
      commit(r, rama)
    }
    sh(r, ['checkout', '-q', 'ana/lock-b'])
    cambiar(r, CARRITO, 'b = 2', 'b = 20')
    commit(r, 'lock-b toca el carrito')
    for (const [rama, valor] of [['codigo-a', '10'], ['codigo-b', '11']]) {
      sh(r, ['checkout', '-q', '-b', `ana/${rama}`, 'main'])
      cambiar(r, CARRITO, 'a = 1', `a = ${valor}`)
      if (rama === 'codigo-b') cambiar(r, CARRITO, 'b = 2', 'b = 22')
      añadir(r, 'DESIGN.md', `\n### D3${valor}. De ${rama}\nAlgo.\n`)
      commit(r, rama)
    }
    sh(r, ['checkout', '-q', 'main'])
  })

  afterEach(() => borrar(repo))

  test('sin drivers, el lockfile y DESIGN chocan', () => {
    // Sin instalar: ni atributos ni drivers (un atributo sin su driver hace fallar a git).
    escribir(fusion.gitComun(repo), 'info/attributes', '')
    for (const nombre of Object.keys(fusion.DRIVERS)) sh(repo, ['config', '--unset', `merge.${nombre}.driver`])
    const [, choques] = ensayo.mergeTree('ana/lock-a', 'ana/lock-b', repo)
    assert.ok(choques.includes('DESIGN.md'))
    assert.ok(choques.includes(LOCK))
  })

  test('con drivers solo choca el código', () => {
    const [, choques] = ensayo.mergeTree('ana/lock-a', 'ana/lock-b', repo)
    assert.deepEqual(choques, [RUTAS]) // las dos cambian la misma línea de rutas.ts: eso sí es código
  })

  test('los drivers van al .git común y no al repositorio', () => {
    const comun = fusion.gitComun(repo)
    assert.ok(existsSync(join(comun, 'equipo', 'fusion.mjs')))
    const atributos = readFileSync(join(comun, 'info', 'attributes'), 'utf8')
    assert.match(atributos, /^DESIGN\.md merge=equipo-docs$/m)
    assert.match(atributos, /^BACKLOG\.md merge=equipo-docs$/m)
    assert.match(atributos, /^package-lock\.json merge=equipo-generado$/m)
    assert.equal(sh(repo, ['status', '--porcelain']).stdout, '')
    assert.equal(fusion.instalar({ repo, comprobar: true }).codigo, 0)
    fusion.desinstalar({ repo })
    assert.equal(readFileSync(join(comun, 'info', 'attributes'), 'utf8'), '')
    assert.equal(existsSync(join(comun, 'equipo')), false)
    assert.equal(fusion.instalar({ repo, comprobar: true }).codigo, 1)
  })

  test('el plan ordena, aparta lo que choca y no mueve main', () => {
    sh(repo, ['branch', '-m', 'docs-mal', 'ana/docs-mal'])
    const antes = sh(repo, ['rev-parse', 'main']).stdout
    const plan = ensayo.ensayar(['ana/codigo-b', 'ana/lock-a', 'ana/docs-mal', 'ana/codigo-a', 'ana/lock-b'], 'main', repo)
    assert.equal(sh(repo, ['rev-parse', 'main']).stdout, antes)
    assert.equal(sh(repo, ['status', '--porcelain']).stdout, '')
    const apartadas = Object.fromEntries(plan.apartadas.map(a => [a.rama, a]))
    // docs-mal choca con main: se aparta antes de ordenar.
    assert.deepEqual(apartadas['ana/docs-mal'].con, ['main'])
    assert.deepEqual(apartadas['ana/docs-mal'].archivos, ['DESIGN.md'])
    // Choques por parejas: lock-a 1 (lock-b); codigo-b 2 (codigo-a, lock-b); codigo-a 2 (codigo-b, lock-b); lock-b 3.
    // Entran primero las de menos choques y, si empatan, la que llegó antes: lock-a y codigo-b.
    assert.deepEqual(plan.orden, ['ana/lock-a', 'ana/codigo-b'])
    assert.deepEqual(apartadas['ana/codigo-a'].con, ['ana/codigo-b'])
    assert.deepEqual(apartadas['ana/codigo-a'].archivos, [CARRITO])
    assert.deepEqual(apartadas['ana/lock-b'].con, ['ana/lock-a', 'ana/codigo-b'])
    assert.deepEqual(apartadas['ana/lock-b'].archivos, [CARRITO, RUTAS])
    assert.deepEqual(plan.generados, ['ana/lock-a'])
    assert.match(ensayo.texto(plan), /Apartada codigo-a: choca con codigo-b en src\/carrito\.ts/)
  })

  test('la subida real sigue el plan sin choques y une los documentos', () => {
    const plan = ensayo.ensayar(['ana/lock-a', 'ana/codigo-a'], 'main', repo)
    for (const rama of plan.orden) sh(repo, ['merge', '--no-ff', '-q', '-m', `Fusión de ${rama}`, rama])
    const design = leer(repo, 'DESIGN.md')
    assert.match(design, /### D10\. De lock-a/)
    assert.match(design, /### D310\. De codigo-a/)
    assert.doesNotMatch(design, /<<<<<<</)
    assert.match(leer(repo, 'BACKLOG.md'), /lock-a-T1/)
  })

  test('dos ramas que solo añaden a los documentos y tocan el lockfile entran juntas', () => {
    sh(repo, ['checkout', '-q', 'ana/lock-b'])
    sh(repo, ['revert', '--no-edit', 'HEAD']) // quita lo del carrito
    cambiar(repo, RUTAS, "'/lock-b'", "'/lock-a'") // el mismo cambio que lock-a: no choca
    commit(repo, 'igual que lock-a')
    sh(repo, ['checkout', '-q', 'main'])
    const plan = ensayo.ensayar(['ana/lock-a', 'ana/lock-b'], 'main', repo)
    assert.deepEqual(plan.orden, ['ana/lock-a', 'ana/lock-b'])
    assert.deepEqual(plan.apartadas, [])
    for (const rama of plan.orden) sh(repo, ['merge', '--no-ff', '-q', '-m', `Fusión de ${rama}`, rama])
    const design = leer(repo, 'DESIGN.md')
    assert.ok(design.indexOf('### D10.') < design.indexOf('### D20.'))
    const backlog = leer(repo, 'BACKLOG.md')
    assert.match(backlog, /\| lock-a-T1 \|/)
    assert.match(backlog, /\| lock-b-T1 \|/)
    // El lockfile se queda con el de la primera rama (el de main en ese momento); regenerar lo rehará.
    assert.match(leer(repo, LOCK), /1\.0\.1-a/)
  })

  test('JSON por la línea de órdenes, con una rama que no existe', () => {
    const r = spawnSync(process.execPath, [join(SCRIPTS, 'ensayo.mjs'), '--json', '--repo', repo, 'ana/lock-a', 'no-existe'], { encoding: 'utf8' })
    const plan = JSON.parse(r.stdout)
    assert.deepEqual(plan.orden, ['ana/lock-a'])
    assert.equal(plan.errores[0].rama, 'no-existe')
  })
})

describe('unirAñadidos', () => {
  test('base vacía se une', () => {
    assert.equal(fusion.unirAñadidos('a\n<<<<<<< x\nde x\n||||||| base\n=======\nde y\n>>>>>>> y\nb\n'), 'a\nde x\nde y\nb\n')
  })
  test('lo mismo por los dos lados no se repite', () => {
    assert.equal(fusion.unirAñadidos('<<<<<<< x\nigual\n||||||| base\n=======\nigual\n>>>>>>> y\n'), 'igual\n')
  })
  test('base con líneas es choque', () => {
    assert.equal(fusion.unirAñadidos('<<<<<<< x\nuno x\n||||||| base\nuno\n=======\nuno y\n>>>>>>> y\n'), null)
  })
  test('un choque real entre varios lo hace real', () => {
    const t = '<<<<<<< x\nnuevo x\n||||||| base\n=======\nnuevo y\n>>>>>>> y\nmedio\n<<<<<<< x\nuno x\n||||||| base\nuno\n=======\nuno y\n>>>>>>> y\n'
    assert.equal(fusion.unirAñadidos(t), null)
  })
  test('el bloque de atributos se reescribe sin tocar lo demás', () => {
    const antes = '*.png binary\n'
    const con = fusion.conBloque(antes, ['A.md merge=equipo-docs'])
    assert.match(con, /^\*\.png binary\n# >>> equipo.*\nA\.md merge=equipo-docs\n# <<< equipo\n$/)
    assert.equal(fusion.conBloque(con, ['B.md merge=equipo-docs']).match(/equipo-docs/g).length, 1)
    assert.equal(fusion.conBloque(con, []), antes)
  })
})
