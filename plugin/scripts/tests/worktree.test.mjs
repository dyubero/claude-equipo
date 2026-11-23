// Pruebas de worktree.mjs (crear, cerrar, lista), de los lanzadores y de las reservas de bloques, con repositorios
// temporales. Orca se prueba con un `orca` de mentira puesto delante en el PATH.

import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import * as bloque from '../bloque.mjs'
import { ajustes } from '../comun.mjs'
import * as conGit from '../gestores/git.mjs'
import * as conOrca from '../gestores/orca.mjs'
import { detectar, enPath, lanzar, ordenManual, PREAJUSTES, sustituir } from '../lanzadores.mjs'
import * as reservas from '../reservas.mjs'
import * as worktree from '../worktree.mjs'
import { añadir, borrar, commit, escribir, leer, repoNuevo, sh } from './ayudas.mjs'

const ENCARGO = 'Añade «descuentos» al carrito.\nEl usuario dijo: "con $ y `acentos graves`; y punto y coma".\n'

/** Un lanzador de mentira: un script de Node que apunta sus argumentos en un archivo. */
function lanzadorFalso(carpeta) {
  const script = join(carpeta, 'lanzador.mjs')
  const salida = join(carpeta, 'lanzado.json')
  writeFileSync(script, "import { writeFileSync } from 'node:fs'\nwriteFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))\n")
  return { orden: ['node', script, salida, '{ruta}', '{nombre}', '{prompt}'], leer: () => JSON.parse(readFileSync(salida, 'utf8')) }
}

describe('lanzadores', () => {
  test('los huecos se cambian, y dentro de AppleScript van entre comillas de shell y escapados', () => {
    const datos = { ruta: '/Users/ana/mis worktrees/carrito', nombre: 'carrito', prompt: "Lee el archivo y haz el encargo de l'Ana" }
    assert.deepEqual(sustituir(['tmux', '-c', '{ruta}', '-n', '{nombre}', '{prompt}'], datos), ['tmux', '-c', datos.ruta, '-n', 'carrito', datos.prompt])
    const [, , script] = sustituir(PREAJUSTES.terminal, datos)
    assert.equal(
      script,
      `tell application "Terminal" to do script "cd '/Users/ana/mis worktrees/carrito' && claude 'Lee el archivo y haz el encargo de l'\\\\''Ana'"`,
    )
  })

  test('el preajuste se detecta por lo que hay en la máquina', () => {
    const hay = lista => p => lista.includes(p)
    assert.equal(detectar({ env: { TMUX: '/tmp/tmux-1' }, plataforma: 'linux', hay: hay(['tmux']) }), 'tmux')
    assert.equal(detectar({ env: {}, plataforma: 'win32', hay: hay(['wt']) }), 'wt')
    assert.equal(detectar({ env: {}, plataforma: 'win32', hay: hay([]) }), 'manual')
    assert.equal(detectar({ env: { TERM_PROGRAM: 'iTerm.app' }, plataforma: 'darwin', hay: hay([]) }), 'iterm')
    assert.equal(detectar({ env: { TERM_PROGRAM: 'Apple_Terminal' }, plataforma: 'darwin', hay: hay([]) }), 'terminal')
    assert.equal(detectar({ env: {}, plataforma: 'linux', hay: hay(['tmux']) }), 'manual') // tmux instalado, pero no dentro de él
  })

  test('enPath encuentra node y no encuentra lo que no existe', () => {
    assert.equal(enPath('node'), true)
    assert.equal(enPath('no-existe-este-programa-equipo'), false)
  })

  test('manual no ejecuta nada y da la orden; un preajuste desconocido o un lanzador que falla también caen ahí', () => {
    const datos = { ruta: '/x/carrito', nombre: 'carrito', prompt: 'Lee el archivo' }
    assert.deepEqual(lanzar({ preajuste: 'manual' }, datos), { lanzado: false, preajuste: 'manual', orden: 'cd "/x/carrito" && claude "Lee el archivo"', motivo: '' })
    assert.match(lanzar({ preajuste: 'kitty' }, datos).motivo, /no conozco el preajuste «kitty»/)
    assert.match(lanzar({ preajuste: 'propio', orden: [] }, datos).motivo, /lanzar\.orden está vacío/)
    const roto = lanzar({ preajuste: 'propio', orden: ['node', '-e', 'process.exit(3)'] }, { ...datos, ruta: tmpdir() })
    assert.equal(roto.lanzado, false)
    assert.match(roto.motivo, /el lanzador «propio» ha fallado/)
    assert.equal(roto.orden, ordenManual({ ...datos, ruta: tmpdir() }))
  })
})

describe('worktrees con git a secas', () => {
  let repo, fuera, encargo

  beforeEach(() => {
    repo = repoNuevo('equipo-wt-')
    fuera = mkdtempSync(join(tmpdir(), 'equipo-fuera-'))
    encargo = join(fuera, 'encargo.md')
    writeFileSync(encargo, ENCARGO)
    escribir(repo, 'DESIGN.md', '### D10. Diez\n')
    escribir(repo, 'src/a.ts', 'export const a = 1\n')
  })

  afterEach(() => {
    borrar(repo)
    borrar(fuera)
    borrar(`${repo}-worktrees`)
  })

  const preparar = lanzarAjuste => {
    escribir(repo, '.claude/equipo.json', JSON.stringify({ decisiones: { activo: true }, worktrees: { gestor: 'git', prefijoRama: 'ana/' }, lanzar: lanzarAjuste }))
    commit(repo, 'base')
  }

  test('crear: rama, worktree, encargo en un archivo que git ignora y lanzador con los huecos puestos', () => {
    const falso = lanzadorFalso(fuera)
    preparar({ preajuste: 'propio', orden: falso.orden })
    const r = worktree.crear('carrito', encargo, { repo })
    assert.equal(r.gestor, 'git')
    assert.equal(r.rama, 'ana/carrito')
    assert.equal(r.lanzado, true)
    assert.match(r.ruta.replace(/\\/g, '/'), /-worktrees\/carrito$/)
    // El encargo llega entero, con sus comillas, y no ensucia el worktree.
    assert.equal(
      leer(r.ruta, '.claude/equipo-encargo.md'),
      `${ENCARGO.trimEnd()}\n\n---\nTu bloque de decisiones reservado es D11-D20.\nAl acabar, sigue la skill equipo:lista-para-subir. No fusiones tú en main.\n`,
    )
    assert.equal(r.bloque, 'D11-D20')
    assert.deepEqual(reservas.leer(repo), { 'ana/carrito': [11, 20] })
    assert.equal(sh(r.ruta, ['status', '--porcelain']).stdout, '')
    assert.equal(sh(r.ruta, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim(), 'ana/carrito')
    const [ruta, nombre, prompt] = falso.leer()
    assert.equal(ruta, r.ruta)
    assert.equal(nombre, 'carrito')
    assert.match(prompt, /^Lee el archivo \.claude\/equipo-encargo\.md de esta carpeta/)
    assert.doesNotMatch(prompt, /["'`$;]/)
    // El mismo nombre no vale dos veces.
    assert.throws(() => worktree.crear('carrito', encargo, { repo }), /ya hay una rama o un worktree «carrito»/)
    assert.throws(() => worktree.crear('con espacio', encargo, { repo }), /no vale como nombre/)
  })

  test('crear en inglés y con lanzador manual: no lanza nada y da la orden para pegar', () => {
    escribir(repo, '.claude/equipo.json', JSON.stringify({ idioma: 'en', worktrees: { gestor: 'git' }, lanzar: { preajuste: 'manual' } }))
    commit(repo, 'base')
    const r = worktree.crear('login', encargo, { repo })
    assert.equal(r.lanzado, false)
    assert.equal(r.rama, 'login')
    assert.equal(r.bloque, '')
    assert.match(leer(r.ruta, '.claude/equipo-encargo.md'), /\n---\nWhen you finish, follow the skill equipo:lista-para-subir\. Do not merge into main yourself\.\n$/)
    assert.match(r.orden, /^cd ".*login" && claude "Read the file \.claude\/equipo-encargo\.md in this folder and do the task it describes\. If it is missing, it is the same as .*login\.md"$/)
  })

  test('cerrar: se niega si la rama lleva algo que main no tiene; ya en main, quita worktree, rama y reserva', () => {
    preparar({ preajuste: 'manual' })
    const r = worktree.crear('carrito', encargo, { repo })
    assert.deepEqual(reservas.leer(repo), { 'ana/carrito': [11, 20] })
    escribir(r.ruta, 'src/carrito.ts', 'export const carrito = 1\n')
    commit(r.ruta, 'carrito')
    const no = worktree.cerrar('carrito', { repo })
    assert.equal(no.cerrado, false)
    assert.match(no.motivo, /tiene commits que main no tiene/)
    assert.equal(existsSync(r.ruta), true)

    sh(repo, ['merge', '-q', '--no-ff', 'ana/carrito', '-m', 'Fusión'])
    const si = worktree.cerrar('carrito', { repo })
    assert.deepEqual([si.cerrado, si.rama], [true, 'ana/carrito'])
    assert.equal(existsSync(r.ruta), false)
    assert.equal(sh(repo, ['branch', '--list', 'ana/carrito']).stdout.trim(), '')
    assert.deepEqual(reservas.leer(repo), {})
    assert.match(worktree.cerrar('carrito', { repo }).motivo, /no hay ninguna rama «carrito»/)
    assert.match(worktree.cerrar('main', { repo }).motivo, /es la rama principal/)
  })

  test('las reservas: cada rama su bloque, el siguiente las cuenta y la lista las enseña', () => {
    preparar({ preajuste: 'manual' })
    // Al crear, cada encargo se lleva su bloque. Una rama hecha a mano lo pide con `bloque.mjs --reservar`.
    assert.equal(worktree.crear('carrito', encargo, { repo }).bloque, 'D11-D20')
    assert.equal(worktree.crear('login', encargo, { repo }).bloque, 'D21-D30')
    const sinOrca = { orca: [], comentar: () => {} }
    assert.deepEqual(bloque.reservar('carrito', repo, sinOrca), { rama: 'ana/carrito', bloque: 'D11-D20', inicio: 11, fin: 20, yaTenia: true })
    sh(repo, ['branch', 'a-mano'])
    assert.deepEqual(bloque.reservar('a-mano', repo, sinOrca), { rama: 'a-mano', bloque: 'D31-D40', inicio: 31, fin: 40, yaTenia: false })
    assert.equal(bloque.siguiente(repo, []).bloque, 'D41-D50')
    assert.match(bloque.reservar('no-existe', repo, sinOrca).error, /no hay ninguna rama/)
    const filas = worktree.lista({ repo, orca: [] })
    assert.deepEqual(filas.map(f => [f.nombre, f.rama, f.principal, f.bloque, f.agente]), [
      [filas[0].nombre, 'main', true, '', ''],
      ['carrito', 'ana/carrito', false, 'D11-D20', ''],
      ['login', 'ana/login', false, 'D21-D30', ''],
    ])
    assert.equal(filas.length, 3) // «a-mano» es una rama sin worktree: no es una copia
    // Un bloque que solo está en el comentario de Orca (de antes de reservas.json) se respeta y se apunta.
    worktree.crear('pagos', encargo, { repo })
    const pagos = worktree.lista({ repo, orca: [] }).find(f => f.nombre === 'pagos')
    assert.equal(pagos.bloque, 'D41-D50')
    reservas.quitar(repo, 'ana/pagos')
    const deOrca = [{ path: pagos.ruta, comment: 'D90-D99 · pagos' }]
    assert.equal(worktree.lista({ repo, orca: deOrca }).find(f => f.nombre === 'pagos').bloque, 'D90-D99')
    assert.deepEqual(bloque.reservar('pagos', repo, { orca: deOrca, comentar: () => {} }), { rama: 'ana/pagos', bloque: 'D90-D99', inicio: 90, fin: 99, yaTenia: true })
    assert.deepEqual(reservas.leer(repo)['ana/pagos'], [90, 99])
  })

  test('el gestor sale de los ajustes, y con «auto» depende de si Orca está', () => {
    preparar({ preajuste: 'manual' })
    const a = ajustes(repo)
    assert.equal(worktree.gestorDe(a), conGit)
    assert.equal(worktree.gestorDe({ worktrees: { gestor: 'orca' } }), conOrca)
    assert.equal(worktree.gestorDe({ worktrees: { gestor: 'auto' } }, { hayOrca: () => true }), conOrca)
    assert.equal(worktree.gestorDe({ worktrees: { gestor: 'auto' } }, { hayOrca: () => false }), conGit)
  })
})

describe('worktrees con Orca (un orca de mentira en el PATH)', () => {
  let repo, fuera, encargo, pathAntes

  /** `orca` que crea y quita worktrees con git y apunta lo que recibe. */
  const ORCA_FALSO = `
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
appendFileSync(join(aqui, 'llamadas.jsonl'), JSON.stringify(args) + '\\n')
const valor = clave => args[args.indexOf(clave) + 1]
const git = (...a) => spawnSync('git', a, { encoding: 'utf8' })
if (args[1] === 'create') {
  const r = git('worktree', 'add', '-q', '-b', 'ana/' + valor('--name'), join(aqui, 'workspaces', valor('--name')), valor('--base-branch'))
  process.stdout.write(JSON.stringify({ ok: r.status === 0 }))
  process.exit(r.status)
}
if (args[1] === 'rm') {
  const rama = valor('--worktree').replace('branch:', '')
  const lista = git('worktree', 'list', '--porcelain').stdout.split('\\n\\n').find(b => b.includes('refs/heads/' + rama))
  const r = git('worktree', 'remove', '--force', /^worktree (.+)$/m.exec(lista)[1])
  process.exit(r.status)
}
process.stdout.write(JSON.stringify({ ok: true, result: { worktrees: [] } }))
`

  beforeEach(() => {
    repo = repoNuevo('equipo-orca-')
    fuera = mkdtempSync(join(tmpdir(), 'equipo-orca-bin-'))
    writeFileSync(join(fuera, 'orca-falso.mjs'), ORCA_FALSO)
    if (process.platform === 'win32') writeFileSync(join(fuera, 'orca.cmd'), '@node "%~dp0orca-falso.mjs" %*\r\n')
    else {
      writeFileSync(join(fuera, 'orca'), '#!/bin/sh\nexec node "$(dirname "$0")/orca-falso.mjs" "$@"\n')
      chmodSync(join(fuera, 'orca'), 0o755)
    }
    mkdirSync(join(fuera, 'workspaces'))
    encargo = join(fuera, 'encargo.md')
    writeFileSync(encargo, ENCARGO)
    escribir(repo, '.claude/equipo.json', JSON.stringify({ worktrees: { gestor: 'orca' }, orca: { repo: 'tienda' } }))
    escribir(repo, 'src/a.ts', 'export const a = 1\n')
    commit(repo, 'base')
    pathAntes = process.env.PATH
    process.env.PATH = `${fuera}${delimiter}${pathAntes}`
  })

  afterEach(() => {
    process.env.PATH = pathAntes
    borrar(repo)
    borrar(fuera)
  })

  const llamadas = () => readFileSync(join(fuera, 'llamadas.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))

  test('crear pasa a Orca el repositorio, el nombre y un prompt entero; cerrar le pide quitar el worktree', () => {
    const r = worktree.crear('carrito', encargo, { repo })
    assert.deepEqual([r.gestor, r.rama, r.lanzado], ['orca', 'ana/carrito', true])
    assert.match(leer(r.ruta, '.claude/equipo-encargo.md'), /y punto y coma"\.\n\n---\nAl acabar, sigue la skill equipo:lista-para-subir/)
    const [creada] = llamadas().filter(l => l[1] === 'create')
    assert.deepEqual(creada.slice(0, 9), ['worktree', 'create', '--repo', 'name:tienda', '--name', 'carrito', '--no-parent', '--base-branch', 'main'])
    // El prompt llega como un solo argumento, con sus espacios.
    const prompt = creada[creada.indexOf('--prompt') + 1]
    assert.match(prompt, /^Lee el archivo \.claude\/equipo-encargo\.md de esta carpeta y haz el encargo que describe\. Si no está, es el mismo que .*carrito\.md$/)

    const cerrada = worktree.cerrar('carrito', { repo })
    assert.equal(cerrada.cerrado, true)
    assert.equal(existsSync(r.ruta), false)
    assert.deepEqual(llamadas().at(-1), ['worktree', 'rm', '--worktree', 'branch:ana/carrito', '--force', '--json'])
  })

  test('un worktree que Orca no conoce se cierra con git', () => {
    const ruta = join(fuera, 'workspaces', 'a-mano')
    sh(repo, ['worktree', 'add', '-q', '-b', 'a-mano', ruta, 'main'])
    writeFileSync(join(fuera, 'orca-falso.mjs'), 'process.exit(1)\n')
    assert.equal(worktree.cerrar('a-mano', { repo }).cerrado, true)
    assert.equal(existsSync(ruta), false)
  })
})
