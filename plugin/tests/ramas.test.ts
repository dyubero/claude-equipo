// /ramas, /reservar y /pendiente.

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { apuntar, apuntes } from '../hooks/pendientes'
import { bloqueDe, montarRamas } from '../hooks/ramas'
import { hoy } from '../hooks/vista'

const PRINCIPAL = 'C:/Users/ana/proyectos/tienda'
const CARRITO = 'C:/Users/ana/orca/workspaces/tienda/carrito'
const LOGIN = 'C:/Users/ana/orca/workspaces/tienda/login'

// En Linux y macOS una ruta «C:/…» no es absoluta, y Claude Code la resuelve contra la carpeta actual: aquí se le
// quita lo que lleve delante, para que las rutas de mentira valgan igual en los tres sistemas.
const limpia = (ruta: string) => {
  const p = ruta.replace(/\\/g, '/')
  const i = p.toLowerCase().indexOf('c:/users/ana')
  return i > 0 ? p.slice(i) : p
}


const PORCELANA =
  `worktree ${PRINCIPAL}\nHEAD 1\nbranch refs/heads/main\n\n` +
  `worktree ${CARRITO}\nHEAD 2\nbranch refs/heads/ana/carrito\n\n` +
  `worktree ${LOGIN}\nHEAD 3\nbranch refs/heads/ana/login\n`

// Lo que contesta `node scripts/worktree.mjs lista`: las copias con su nombre, su bloque reservado y sus agentes.
const LISTA = JSON.stringify([
  { ruta: PRINCIPAL, rama: 'main', principal: true, nombre: 'main', bloque: '', agente: 'working', actividad: 0 },
  { ruta: CARRITO, rama: 'ana/carrito', principal: false, nombre: 'carrito', bloque: 'D15-D24', agente: 'done', actividad: 0 },
  { ruta: LOGIN, rama: 'ana/login', principal: false, nombre: 'login', bloque: '', agente: 'working', actividad: 0 },
])

const PENDIENTES = '# Pendientes\n\nIntro.\n\nActualizado el 2026-10-06.\n\n## En marcha\n\n| a |\n\n## Ideas\n\nx\n'
const CON_DECISIONES = '{ "decisiones": { "activo": true } }'

const PANEL = {
  plugin: 'equipo',
  component: 'Pane',
  requestId: 'ramas',
  viewport: { columns: 140, rows: 40 },
  props: { title: 'Ramas', isFocused: true, bodyColumns: 120, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

function preparar(on: On, { enPrincipal = true, ajustes = CON_DECISIONES } = {}) {
  const r = { ordenes: [] as string[][], escrito: new Map<string, string>() }
  mock.clock(on, { now: Date.UTC(2026, 9, 21, 12) })
  const raiz = enPrincipal ? PRINCIPAL : CARRITO
  on('session.start', () => ({ cwd: raiz }))
  on('session.root', () => ({ value: raiz }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__equipo__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.stat', ($, e) => ({ value: { kind: limpia(e.path).toLowerCase().startsWith(PRINCIPAL.toLowerCase()) ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false } }))
  on('fs.read', ($, e) => {
    const p = limpia(e.path)
    if (r.escrito.has(p)) return { value: r.escrito.get(p) as string }
    if (p.endsWith('.claude/equipo.json')) return { value: ajustes }
    if (p.endsWith('docs/pendientes.md')) return { value: PENDIENTES }
    if (p === `${PRINCIPAL}/DESIGN.md`) return { value: '### D1. a\n### D14. b\n' }
    if (p === `${CARRITO}/DESIGN.md`) return { value: '### D19. c\n' }
    if (p === `${LOGIN}/DESIGN.md`) return { value: '### D8. d\n' }
    return { deny: 'no existe' }
  })
  on('fs.write', ($, e) => {
    r.escrito.set(limpia(e.path), e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    r.ordenes.push(argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const guion = argv[0] === 'node' ? (argv[1] ?? '').split('/').pop() : ''
    if (guion === 'worktree.mjs' && argv[2] === 'lista') return ok(LISTA)
    if (guion === 'bloque.mjs' && argv[2] === '--reservar') return ok(JSON.stringify({ rama: argv[3], bloque: 'D25-D34', inicio: 25, fin: 34, yaTenia: false }))
    if (guion === 'bloque.mjs') return ok(JSON.stringify({ inicio: 25, fin: 34, bloque: 'D25-D34', mayor: 24, de: 'un bloque reservado' }))
    if (argv.includes('worktree')) return ok(PORCELANA)
    if (argv.includes('rev-list') && argv.includes('--count')) return ok(argv.some(a => a.endsWith('carrito')) ? '2\t5\n' : '0\t0\n')
    return ok('')
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['x'] }))
  return r
}

const arrancar = ($: { session: { start: (entrada: never) => Promise<unknown> } }, raiz = PRINCIPAL) =>
  $.session.start({ surface: 'terminal', isInteractive: true, cwd: raiz } as never)

const SIN_FRANJAS = { options: { contexto: false } }

test('las ramas salen de git, con el nombre, el bloque y los agentes de la lista; sin lista, solo lo de git', () => {
  const ramas = montarRamas(PORCELANA, JSON.parse(LISTA))
  expect(ramas.map(r => [r.nombre, r.comentario, r.agente])).toEqual([
    ['main', '', 'working'],
    ['carrito', 'D15-D24', 'done'],
    ['login', '', 'working'],
  ])
  expect(ramas[1]?.bloque).toEqual([15, 24])
  expect(montarRamas(PORCELANA, null).map(r => [r.nombre, r.rama, r.principal])).toEqual([
    ['tienda', 'main', true],
    ['carrito', 'ana/carrito', false],
    ['login', 'ana/login', false],
  ])
  expect(bloqueDe('ADR-3-ADR-7', 'ADR-')).toEqual([3, 7])
})

test('/ramas abre el panel con las copias, sus bloques y cuánto llevan', SIN_FRANJAS, async ($, on) => {
  preparar(on)
  await arrancar($)
  const r = await $.command.run({ command: 'ramas', args: '' } as never)
  expect(r.text ?? '').toMatch(/carrito · D15-D24 · \+5\/−2/)
  expect(r.text ?? '').toMatch(/Siguiente bloque libre: D25-D34/)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANEL, surface })
    expect(await ui.find({ type: 'Text', text: /carrito .*\+5 \/ −2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Siguiente bloque libre: D25-D34/ })).toBeDefined()
    await ui.unmount()
  }
})

test('sin decisiones, /ramas no habla de bloques y /reservar lo dice', SIN_FRANJAS, async ($, on) => {
  preparar(on, { ajustes: '{}' })
  await arrancar($)
  const r = await $.command.run({ command: 'ramas', args: '' } as never)
  expect(r.text ?? '').not.toMatch(/Siguiente bloque/)
  const reserva = await $.command.run({ command: 'reservar', args: '' } as never)
  expect(reserva.text ?? '').toMatch(/decisiones numeradas están apagadas/)
})

test('/reservar da el bloque y, con un worktree sin bloque, se lo reserva con bloque.mjs', SIN_FRANJAS, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  expect((await $.command.run({ command: 'reservar', args: '' } as never)).text).toMatch(/Siguiente bloque libre: D25-D34/)
  expect((await $.command.run({ command: 'reservar', args: 'carrito' } as never)).text).toMatch(/ya tiene el bloque D15-D24/)
  expect((await $.command.run({ command: 'reservar', args: 'login' } as never)).text).toMatch(/Reservado D25-D34 para login/)
  const reserva = r.ordenes.find(o => o[0] === 'node' && o[2] === '--reservar')
  expect(reserva?.[1]).toMatch(/\/scripts\/bloque\.mjs$/)
  expect(reserva?.slice(2)).toEqual(['--reservar', 'ana/login', '--json'])
})

test('/reservar desde un worktree no apunta nada', SIN_FRANJAS, async ($, on) => {
  const r = preparar(on, { enPrincipal: false })
  await arrancar($, CARRITO)
  expect((await $.command.run({ command: 'reservar', args: 'login' } as never)).text).toMatch(/desde la copia principal/)
  expect(r.ordenes.some(o => o.includes('--reservar'))).toBe(false)
})

test('/pendiente apunta con fecha y rama, y sin texto lista lo apuntado', SIN_FRANJAS, async ($, on) => {
  const r = preparar(on, { enPrincipal: false })
  await arrancar($, CARRITO)
  const hecho = await $.command.run({ command: 'pendiente', args: 'probar el carrito vacío' } as never)
  expect(hecho.text).toMatch(/Apuntado en docs\/pendientes\.md/)
  const doc = r.escrito.get(`${CARRITO}/docs/pendientes.md`) ?? ''
  expect(doc).toMatch(/## Apuntes rápidos\n\n.*\n\n- 2026-10-21 \(ana\/carrito\): probar el carrito vacío\n\n## En marcha/)
  expect(doc).toMatch(/Actualizado el 2026-10-21\./)
  const lista = await $.command.run({ command: 'pendiente', args: '' } as never)
  expect(lista.text).toMatch(/- 2026-10-21 \(ana\/carrito\): probar el carrito vacío/)
})

test('con idioma «en», /ramas, /reservar y /pendiente hablan inglés y el documento de pendientes se escribe en inglés', SIN_FRANJAS, async ($, on) => {
  const r = preparar(on, { enPrincipal: false, ajustes: '{ "idioma": "en", "decisiones": { "activo": true }, "pendientes": "docs/todo.md" }' })
  await arrancar($, CARRITO)
  expect((await $.command.run({ command: 'ramas', args: '' } as never)).text).toMatch(/★ main · main copy · agent working\n● carrito · D15-D24 · \+5\/−2 · agent done\n✔ login · all in the main branch · agent working\nNext free block: D25-D34/)
  expect((await $.command.run({ command: 'reservar', args: 'login' } as never)).text).toBe('Blocks are reserved from the main copy. Next free block: D25-D34.')
  expect((await $.command.run({ command: 'pendiente', args: 'try the empty cart' } as never)).text).toBe('Noted in docs/todo.md (Quick notes): try the empty cart')
  expect(r.escrito.get(`${CARRITO}/docs/todo.md`)).toBe(
    '# Pending\n\nUpdated on 2026-10-21.\n\n## Quick notes\n\nNoted with `/pendiente`. Once done or launched, remove it from here or move it to its section.\n\n- 2026-10-21 (ana/carrito): try the empty cart\n\n',
  )
  expect((await $.command.run({ command: 'pendiente', args: '' } as never)).text).toBe('Quick notes in docs/todo.md:\n- 2026-10-21 (ana/carrito): try the empty cart')
})

test('apuntar y apuntes', () => {
  const uno = apuntar('# P\n', 'a', '2026-01-01', '')
  const dos = apuntar(uno, 'b', '2026-01-02', 'x')
  expect(apuntes(dos)).toEqual(['- 2026-01-01: a', '- 2026-01-02 (x): b'])
  expect(hoy(Date.UTC(2026, 0, 5, 12))).toBe('2026-01-05')
})
