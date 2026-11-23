// Pruebas de renumerar, bloque, pruebas, estado y ajustes, con repositorios temporales.
//
//   node --test plugin/scripts/tests

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import * as bloque from '../bloque.mjs'
import * as ajustesMjs from '../ajustes.mjs'
import { ajustes, ejecutar, mezclar, POR_DEFECTO } from '../comun.mjs'
import { comprobar } from '../por-defecto.mjs'
import * as estado from '../estado.mjs'
import * as pruebas from '../pruebas.mjs'
import * as renumerar from '../renumerar.mjs'
import { añadir, borrar, commit, escribir, leer, repoNuevo, sh } from './ayudas.mjs'

const BACKLOG = `# Backlog

| # | Pendiente |
|---|---|
| T1 | algo |
| ~~T7~~ | resuelto ✅ |
| CT3 | otra serie |
| carrito-pago-T1 | uno; ver también carrito-pago-T2 |
| carrito-pago-T2 | dos |
| login-1 | sin letras |
| estilos-M1 | serie nueva |
`

// Las salidas por consola de main() no ensucian el informe.
const callado = fn => {
  const escribirAntes = process.stdout.write
  process.stdout.write = () => true
  try {
    return fn()
  } finally {
    process.stdout.write = escribirAntes
  }
}

describe('ajustes', () => {
  test('sin archivo valen los valores por defecto', () => {
    const repo = repoNuevo('ajustes-')
    try {
      const a = ajustes(repo)
      assert.equal(a.ramaPrincipal, 'main')
      // Los comandos dependen del proyecto: sin ajustes están vacíos, no son los de npm.
      assert.deepEqual(a.comandos, { compilar: '', probar: '', probarArchivos: '', regenerar: '' })
      assert.equal(a.fusion.estrategia, 'merge')
      assert.deepEqual(a.contexto, { aviso: 60, peligro: 80 })
      assert.equal(a.decisiones.activo, false)
      assert.equal(a.backlog.activo, false)
    } finally {
      borrar(repo)
    }
  })

  test('lo del archivo va encima, objeto a objeto', () => {
    const a = mezclar(POR_DEFECTO, { comandos: { probar: 'npx vitest run' }, decisiones: { activo: true, prefijo: 'ADR-' }, prohibidos: ['.env'] })
    assert.equal(a.comandos.probar, 'npx vitest run')
    assert.equal(a.comandos.compilar, '')
    assert.equal(a.decisiones.prefijo, 'ADR-')
    assert.equal(a.decisiones.documento, 'DESIGN.md')
    assert.deepEqual(a.prohibidos, ['.env'])
  })
})

describe('renumerar', () => {
  test('el plan', () => {
    assert.deepEqual(renumerar.mayores(BACKLOG), { T: 7, CT: 3 })
    assert.deepEqual(renumerar.plan(BACKLOG), { 'carrito-pago-T1': 'T8', 'carrito-pago-T2': 'T9', 'estilos-M1': 'M1', 'login-1': 'T10' })
    assert.deepEqual(renumerar.plan(BACKLOG, new Set(['login'])), { 'login-1': 'T8' })
  })

  test('no toca lo parecido', () => {
    assert.equal(renumerar.sustituir('ver login-1, no login-12 ni login-1b ni a/login-1', { 'login-1': 'T8' }), 'ver T8, no login-12 ni login-1b ni a/login-1')
  })

  test('aplica en todo el repositorio y comprueba', () => {
    const repo = repoNuevo('renumerar-')
    try {
      escribir(repo, '.claude/equipo.json', '{ "backlog": { "activo": true } }')
      escribir(repo, 'BACKLOG.md', BACKLOG)
      escribir(repo, 'DESIGN.md', '### D5. Algo\nVer carrito-pago-T2.\n')
      escribir(repo, 'src/x.ts', '// pendiente: login-1\n')
      commit(repo, 'base')
      callado(() => {
        assert.equal(renumerar.main(['--repo', repo, '--comprobar', 'login']), 1)
        assert.equal(renumerar.main(['--repo', repo, '--aplicar', 'ana/carrito-pago', 'login']), 0)
      })
      const texto = leer(repo, 'BACKLOG.md')
      assert.match(texto, /\| T8 \| uno; ver también T9 \|/)
      assert.match(texto, /\| T10 \| sin letras \|/)
      assert.match(texto, /\| estilos-M1 \|/) // no se ha pedido
      assert.match(leer(repo, 'DESIGN.md'), /Ver T9\./)
      assert.match(leer(repo, 'src/x.ts'), /pendiente: T10/)
      callado(() => {
        assert.equal(renumerar.main(['--repo', repo, '--comprobar', 'carrito-pago', 'login']), 0)
        assert.equal(renumerar.main(['--repo', repo, '--comprobar']), 1) // queda estilos-M1
      })
    } finally {
      borrar(repo)
    }
  })

  test('apagado no hace nada', () => {
    const repo = repoNuevo('renumerar-')
    try {
      escribir(repo, 'BACKLOG.md', BACKLOG)
      commit(repo, 'base')
      assert.equal(callado(() => renumerar.main(['--repo', repo, '--aplicar'])), 0)
      assert.equal(leer(repo, 'BACKLOG.md'), BACKLOG)
    } finally {
      borrar(repo)
    }
  })
})

describe('ejecutar', () => {
  test('los argumentos llegan enteros: espacios, y una barra invertida al final', () => {
    const r = ejecutar([process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', 'con espacio', 'fin\\', 'otro'])
    assert.deepEqual(JSON.parse(r.stdout), ['con espacio', 'fin\\', 'otro'])
  })
})

describe('ajustes del usuario y del proyecto', () => {
  let repo, casa, antes

  beforeEach(() => {
    repo = repoNuevo('ajustes-dos-')
    casa = mkdtempSync(join(tmpdir(), 'equipo-casa-'))
    antes = process.env.EQUIPO_AJUSTES_USUARIO
    process.env.EQUIPO_AJUSTES_USUARIO = join(casa, 'equipo.json')
  })

  afterEach(() => {
    process.env.EQUIPO_AJUSTES_USUARIO = antes
    borrar(repo)
    borrar(casa)
  })

  test('lo del usuario va sobre lo de por defecto, y lo del proyecto sobre lo del usuario', () => {
    escribir(casa, 'equipo.json', JSON.stringify({ lanzar: { preajuste: 'tmux' }, contexto: { aviso: 50 }, idioma: 'en', worktrees: { prefijoRama: 'ana/' } }))
    escribir(repo, '.claude/equipo.json', JSON.stringify({ idioma: 'fr', contexto: { peligro: 90 }, worktrees: { gestor: 'git' } }))
    const a = ajustes(repo)
    assert.equal(a.idioma, 'fr')
    assert.deepEqual(a.contexto, { aviso: 50, peligro: 90 })
    assert.deepEqual(a.worktrees, { gestor: 'git', carpeta: '../{repo}-worktrees/{nombre}', prefijoRama: 'ana/', cerrarAlSubir: true })
    assert.equal(a.lanzar.preajuste, 'tmux')
    const origen = Object.fromEntries(ajustesMjs.origenes(repo).map(f => [f.clave, f.origen]))
    assert.equal(origen.idioma, 'proyecto')
    assert.equal(origen['contexto.aviso'], 'usuario')
    assert.equal(origen['contexto.peligro'], 'proyecto')
    assert.equal(origen['lanzar.preajuste'], 'usuario')
    assert.equal(origen.ramaPrincipal, 'por defecto')
  })

  test('comprobar: claves que no existen, tipos y valores que no valen', () => {
    assert.deepEqual(comprobar({ $schema: 'x', idioma: 'en', comandos: { probar: 'pytest' }, textos: { 'fusion.mensaje': 'x' } }), [])
    assert.deepEqual(comprobar({ comandos: { compliar: 'make' }, RamaPrincipal: 'dev', prohibidos: '.env', fusion: { estrategia: 'rebase' } }), [
      '«comandos.compliar» no es un ajuste',
      '«RamaPrincipal» no es un ajuste (¿«ramaPrincipal»?)',
      '«prohibidos» tiene que ser lista, y es texto',
      '«fusion.estrategia» vale "merge", "squash"; no "rebase"',
    ])
    assert.match(comprobar({ pruebas: { patron: '(' } })[0], /«pruebas\.patron» no es una expresión regular/)
    assert.deepEqual(comprobar({ contexto: { aviso: 90, peligro: 70 } }), ['«contexto.aviso» no puede ser mayor que «contexto.peligro»'])
    assert.match(comprobar({ lanzar: { preajuste: 'propio' } })[0], /hace falta «lanzar\.orden»/)
    assert.deepEqual(comprobar([]), ['el archivo tiene que ser un objeto { … }'])
  })

  test('ajustes.mjs --comprobar sale con 1 si algún archivo está mal, y dice cuál', () => {
    escribir(repo, '.claude/equipo.json', JSON.stringify({ idioma: 'en' }))
    assert.equal(callado(() => ajustesMjs.main(['--comprobar', '--repo', repo])), 0)
    escribir(casa, 'equipo.json', JSON.stringify({ lanzar: { preajuste: 'kitty' } }))
    const [usuario, proyecto] = ajustesMjs.problemas(repo)
    assert.match(usuario.problemas[0], /«lanzar\.preajuste» vale "auto"/)
    assert.deepEqual(proyecto.problemas, [])
    assert.equal(callado(() => ajustesMjs.main(['--comprobar', '--repo', repo])), 1)
  })

  test('el esquema para el editor tiene las mismas claves que los valores por defecto', () => {
    const esquema = JSON.parse(readFileSync(new URL('../../equipo.schema.json', import.meta.url), 'utf8'))
    const claves = (objeto, propiedades) => {
      assert.deepEqual(Object.keys(propiedades).filter(k => k !== '$schema').sort(), Object.keys(objeto).sort())
      for (const [k, v] of Object.entries(objeto)) {
        if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) claves(v, propiedades[k].properties)
      }
    }
    claves(POR_DEFECTO, esquema.properties)
    assert.deepEqual(esquema.properties.fusion.properties.estrategia.enum, ['merge', 'squash'])
  })
})

describe('repositorio con una rama en su worktree', () => {
  let repo, carpeta

  beforeEach(() => {
    repo = repoNuevo('equipo-')
    const r = repo
    escribir(r, '.claude/equipo.json', JSON.stringify({ decisiones: { activo: true }, comandos: { probarArchivos: 'npx vitest run {archivos}' } }))
    escribir(r, 'DESIGN.md', '### D10. Diez\n')
    escribir(r, 'src/carrito.ts', 'export const carrito = 1\n')
    escribir(r, 'src/carrito.test.ts', "import { carrito } from './carrito'\n")
    escribir(r, 'src/otro.test.ts', 'test(1)\n')
    escribir(r, 'src/index.ts', 'export * from "./carrito"\n')
    escribir(r, 'tests/compra.spec.ts', "import { carrito } from '../src/carrito'\n")
    commit(r, 'base')
    sh(r, ['checkout', '-q', '-b', 'ana/carrito'])
    añadir(r, 'DESIGN.md', '### D25. Del carrito\n')
    escribir(r, 'src/carrito.ts', 'export const carrito = 2\n')
    escribir(r, 'src/index.ts', 'export * from "./carrito" // cambia\n')
    escribir(r, 'package.json', '{}\n')
    commit(r, 'carrito')
    sh(r, ['checkout', '-q', 'main'])
    carpeta = join(mkdtempSync(join(tmpdir(), 'wt-')), 'carrito')
    sh(r, ['worktree', 'add', '-q', carpeta, 'ana/carrito'])
  })

  afterEach(() => {
    sh(repo, ['worktree', 'remove', '--force', carpeta])
    borrar(repo)
    borrar(join(carpeta, '..'))
  })

  test('el bloque mira ramas, copias y Orca', () => {
    assert.equal(bloque.siguiente(repo, [])['bloque'], 'D26-D35')
    añadir(carpeta, 'DESIGN.md', '### D31. Sin confirmar\n')
    assert.equal(bloque.siguiente(repo, []).bloque, 'D32-D41')
    const orca = [{ comment: 'D40-D49' }, { comment: 'D90-D99', isArchived: true }]
    assert.equal(bloque.siguiente(repo, orca).bloque, 'D50-D59')
  })

  test('el bloque con otro prefijo y otro tamaño', () => {
    assert.equal(bloque.mayorDecision('## ADR-3 Algo\n### ADR-12. Otra\n', 'ADR-'), 12)
    assert.equal(bloque.mayorReservado(['ADR-20-ADR-24'], 'ADR-'), 24)
  })

  test('las pruebas propuestas', () => {
    const r = pruebas.analizar('main..ana/carrito', repo)
    assert.deepEqual(r.tests, ['src/carrito.test.ts', 'tests/compra.spec.ts']) // index.ts no cuenta: nombre vacío
    assert.equal(r.dependencias, true)
    assert.equal(r.generados, false)
    assert.equal(pruebas.orden([r], ajustes(repo)), 'npx vitest run src/carrito.test.ts tests/compra.spec.ts')
    assert.equal(pruebas.orden([{ tests: [] }], ajustes(repo)), '')
    assert.equal(pruebas.orden([{ tests: [] }], { comandos: { probar: 'npm test', probarArchivos: '' } }), 'npm test')
  })

  test('el estado y el ensayo', () => {
    const orca = [{ path: carpeta, displayName: 'carrito', comment: 'D20-D29', agents: [{ state: 'idle' }] }]
    let datos = estado.estado(repo, { orca })
    const fila = datos.ramas[0]
    assert.deepEqual([fila.nombre, fila.delante, fila.detras, fila.fase], ['carrito', 1, 0, 'al día, para subir'])
    assert.deepEqual(datos.ensayo.orden, ['ana/carrito'])
    // A media fusión al traer main con un choque.
    escribir(repo, 'src/carrito.ts', 'export const carrito = 3\n')
    commit(repo, 'main cambia lo mismo')
    sh(carpeta, ['merge', 'main'], [1])
    datos = estado.estado(repo, { orca })
    assert.equal(datos.ramas[0].fase, 'a media fusión')
    assert.deepEqual(datos.ensayo.apartadas[0].con, ['main'])
    assert.match(estado.texto(datos), /carrito \[a media fusión\] D20-D29/)
  })
})

describe('pruebas en otros lenguajes', () => {
  let repo
  afterEach(() => borrar(repo))

  test('Python y Go: los tests que nombran el código cambiado, y los manifiestos', () => {
    repo = repoNuevo('lenguajes-')
    escribir(repo, 'src/orders/core.py', 'def total(): pass\n')
    escribir(repo, 'tests/test_core.py', 'from orders.core import total\n')
    escribir(repo, 'tests/test_otro.py', 'def test_x(): pass\n')
    escribir(repo, 'internal/panier/panier.go', 'package panier\n')
    escribir(repo, 'internal/panier/panier_test.go', 'package panier\n')
    commit(repo, 'base')
    const patron = new RegExp('(^|/)(test_[^/]*\.py|[^/]*_test\.go)$')
    assert.deepEqual(pruebas.testsDe(['src/orders/core.py', 'internal/panier/panier.go'], patron, repo), [
      'internal/panier/panier_test.go',
      'tests/test_core.py',
    ])
    assert.equal(pruebas.nombreBase('Assets/Tests/InventarTests.cs'), 'Inventar')
    assert.equal(pruebas.nombreBase('spec/cart_spec.rb'), 'cart')
    sh(repo, ['checkout', '-q', '-b', 'deps'])
    escribir(repo, 'pyproject.toml', '[project]\n')
    commit(repo, 'deps')
    assert.equal(pruebas.analizar('main..deps', repo).dependencias, true)
  })
})
