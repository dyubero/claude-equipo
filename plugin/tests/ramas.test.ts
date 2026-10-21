// /ramas, /reservar y /pendiente.

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { apuntar, apuntes } from '../hooks/pendientes'
import { bloqueDe, mayorDecision, montarRamas, siguienteBloque } from '../hooks/ramas'
import { hoy } from '../hooks/vista'

const PRINCIPAL = 'C:/Users/ana/proyectos/tienda'
const CARRITO = 'C:/Users/ana/orca/workspaces/tienda/carrito'
const LOGIN = 'C:/Users/ana/orca/workspaces/tienda/login'

const PORCELANA =
  `worktree ${PRINCIPAL}\nHEAD 1\nbranch refs/heads/main\n\n` +
  `worktree ${CARRITO}\nHEAD 2\nbranch refs/heads/ana/carrito\n\n` +
  `worktree ${LOGIN}\nHEAD 3\nbranch refs/heads/ana/login\n`

const ORCA = JSON.stringify({
  ok: true,
  result: {
    worktrees: [
      { path: PRINCIPAL, displayName: 'main', comment: '', isMainWorktree: true, agents: [{ state: 'working' }] },
      { path: CARRITO, displayName: 'carrito', comment: 'D15-D24', agents: [{ state: 'done' }] },
      { path: LOGIN, displayName: 'login', comment: '', agents: [{ state: 'working' }] },
      { path: 'C:/otro/repo', displayName: 'ajeno', comment: 'D9000-D9009' },
    ],
  },
})

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
  on('fs.stat', ($, e) => ({ value: { kind: e.path.replace(/\\/g, '/').toLowerCase().startsWith(PRINCIPAL.toLowerCase()) ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false } }))
  on('fs.read', ($, e) => {
    const p = e.path.replace(/\\/g, '/')
    if (r.escrito.has(p)) return { value: r.escrito.get(p) as string }
    if (p.endsWith('.claude/equipo.json')) return { value: ajustes }
    if (p.endsWith('docs/pendientes.md')) return { value: PENDIENTES }
    if (p === `${PRINCIPAL}/DESIGN.md`) return { value: '### D1. a\n### D14. b\n' }
    if (p === `${CARRITO}/DESIGN.md`) return { value: '### D19. c\n' }
    if (p === `${LOGIN}/DESIGN.md`) return { value: '### D8. d\n' }
    return { deny: 'no existe' }
  })
  on('fs.write', ($, e) => {
    r.escrito.set(e.path.replace(/\\/g, '/'), e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    r.ordenes.push(argv)
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'orca' && argv[2] === 'ps') return ok(ORCA)
    if (argv[0] === 'orca') return ok('{"ok":true}')
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

test('el siguiente bloque sale de los documentos de diseño y de los bloques reservados', () => {
  const ramas = montarRamas(PORCELANA, ORCA)
  expect(ramas.map(r => r.nombre)).toEqual(['main', 'carrito', 'login'])
  expect(siguienteBloque([14, 19, 8], ramas)).toEqual([25, 34])
  expect(siguienteBloque([31], ramas, 5)).toEqual([32, 36])
  expect(bloqueDe('ADR-3-ADR-7', 'ADR-')).toEqual([3, 7])
  expect(mayorDecision('## ADR-3 x\n### ADR-12. y\n', 'ADR-')).toBe(12)
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

test('/reservar da el bloque y, con un worktree sin bloque, lo apunta en Orca', SIN_FRANJAS, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  expect((await $.command.run({ command: 'reservar', args: '' } as never)).text).toMatch(/Siguiente bloque libre: D25-D34/)
  expect((await $.command.run({ command: 'reservar', args: 'carrito' } as never)).text).toMatch(/ya tiene el bloque D15-D24/)
  expect((await $.command.run({ command: 'reservar', args: 'login' } as never)).text).toMatch(/Reservado D25-D34 para login/)
  expect(r.ordenes).toContainEqual(['orca', 'worktree', 'set', '--worktree', `path:${LOGIN}`, '--comment', 'D25-D34'])
})

test('/reservar desde un worktree no apunta nada', SIN_FRANJAS, async ($, on) => {
  const r = preparar(on, { enPrincipal: false })
  await arrancar($, CARRITO)
  expect((await $.command.run({ command: 'reservar', args: 'login' } as never)).text).toMatch(/desde la copia principal/)
  expect(r.ordenes.some(o => o[0] === 'orca' && o[2] === 'set')).toBe(false)
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

test('apuntar y apuntes', () => {
  const uno = apuntar('# P\n', 'a', '2026-01-01', '')
  const dos = apuntar(uno, 'b', '2026-01-02', 'x')
  expect(apuntes(dos)).toEqual(['- 2026-01-01: a', '- 2026-01-02 (x): b'])
  expect(hoy(Date.UTC(2026, 0, 5, 12))).toBe('2026-01-05')
})
