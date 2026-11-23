// Subidas desde la copia principal: aviso «lista para subir», Subir / Solucionar / Borrar, cola, ensayo y lote.

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { ajustesDeTexto } from '../hooks/ajustes'
import { revisar } from '../hooks/revision'
import { textos } from '../textos/indice.mjs'
import { avisoDeSubida, choquesDe, codigosConPrefijo, codigosSinRenumerar, leerPlan, mensajeFusion, peticionLote } from '../hooks/subidas'

const PRINCIPAL = 'C:/Users/ana/proyectos/tienda'
const CARRITO = 'C:/Users/ana/orca/workspaces/tienda/carrito'

// En Linux y macOS una ruta «C:/…» no es absoluta, y Claude Code la resuelve contra la carpeta actual: aquí se le
// quita lo que lleve delante, para que las rutas de mentira valgan igual en los tres sistemas.
const limpia = (ruta: string) => {
  const p = ruta.replace(/\\/g, '/')
  const i = p.toLowerCase().indexOf('c:/users/ana')
  return i > 0 ? p.slice(i) : p
}


const LISTA_CARRITO = [
  'La rama carrito está lista para subir (aaa1111)',
  'Sesión: carrito-e4',
  'Resumen: carrito con descuentos por cantidad (D31-D33)',
  'Qué cambia: src/carrito.ts y su test.',
  'Probar: npx vitest run src/carrito.test.ts',
].join('\n')

const LISTA_LOGIN = [
  'La rama `login` está lista para subir (`bbb2222`)',
  'Sesión: `login-87`',
  'Resumen: inicio de sesión con enlace mágico.',
  'Por revisar:',
  '- sin probar en Safari',
  '- el aviso de error se pisa con el del formulario',
  '',
  'Probar: npm test',
].join('\n')

const PORCELANA = `worktree ${PRINCIPAL}\nHEAD 1\nbranch refs/heads/main\n\nworktree ${CARRITO}\nHEAD 2\nbranch refs/heads/carrito\n`
// Lo que contesta `node scripts/worktree.mjs lista`.
const LISTA = JSON.stringify([{ ruta: CARRITO, rama: 'carrito', principal: false, nombre: 'carrito', bloque: 'D31-D40', agente: '', actividad: 0 }])
const CON_BACKLOG = JSON.stringify({ backlog: { activo: true }, decisiones: { activo: true }, comandos: { regenerar: 'npm install' } })

type Escena = {
  enPrincipal?: boolean
  chocan?: string[]
  plan?: unknown
  fusionadas?: string[]
  ajustes?: string | null
  /** `node` no está en el PATH. */
  sinNode?: boolean
  /** Lo que contesta `git --version`. */
  git?: string
  /** La copia principal tiene cambios añadidos (git add) sin confirmar. */
  indice?: boolean
}
type Enviado = { to: string; text: string }

const BANDA = {
  plugin: 'equipo',
  component: 'AbovePrompt',
  requestId: 'franja',
  viewport: { columns: 140, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 130, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

const NO_CONTEXTO = { options: { contexto: false } }

function preparar(on: On, escena: Escena = {}) {
  const r = { ordenes: [] as string[][], prompts: [] as string[], enviados: [] as Enviado[], toasts: [] as string[] }
  mock.clock(on, { now: Date.UTC(2026, 9, 21, 12) })
  const raiz = escena.enPrincipal === false ? CARRITO : PRINCIPAL
  const ajustes = escena.ajustes === undefined ? CON_BACKLOG : escena.ajustes
  on('session.start', () => ({ cwd: raiz }))
  on('session.root', () => ({ value: raiz }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__equipo__${e.name}` } }))
  on('ui.toast', ($, e) => {
    r.toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    r.prompts.push(e.text)
    return { text: e.text }
  })
  on('session.send', ($, e) => {
    r.enviados.push({ to: e.to, text: e.text })
    return { isDelivered: true }
  })
  on('session.receive', ($, e) => ({ text: e.text }))
  on('fs.stat', ($, e) => ({ value: { kind: limpia(e.path).toLowerCase().startsWith(PRINCIPAL.toLowerCase()) ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false } }))
  on('fs.read', ($, e) => (e.path.replace(/\\/g, '/').endsWith('.claude/equipo.json') && ajustes !== null ? { value: ajustes } : { deny: 'no existe' }))
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    r.ordenes.push(argv)
    const sale = (exitCode: number, stdout = '', stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'node' && escena.sinNode) return { deny: 'spawn node ENOENT' }
    if (argv[0] === 'git' && argv[1] === '--version') return sale(0, escena.git ?? 'git version 2.52.0\n')
    if (argv[0] === 'node' && (argv[1] ?? '').endsWith('/scripts/ensayo.mjs')) return escena.plan ? sale(0, JSON.stringify(escena.plan)) : sale(1, '', 'sin ensayo')
    if (argv[0] === 'node' && (argv[1] ?? '').endsWith('/scripts/worktree.mjs')) {
      return argv[2] === 'lista' ? sale(0, LISTA) : sale(0, JSON.stringify({ cerrado: true, rama: argv[3], ruta: CARRITO, motivo: '' }))
    }
    if (argv[0] === 'node') return sale(0, 'drivers ya al día')
    if (argv[1] === 'merge-base' && argv[2] === '--is-ancestor') {
      return sale(escena.fusionadas === undefined || escena.fusionadas.includes((argv[3] as string).replace('refs/heads/', '')) ? 0 : 1)
    }
    if (argv[1] === 'show' && argv[2] === 'HEAD:BACKLOG.md') return sale(0, '| T1 | a |\n| pagos-T2 | sin renumerar |\n')
    if (argv.includes('worktree')) return sale(0, PORCELANA)
    if (argv[1] === 'symbolic-ref') return sale(0, 'main\n')
    if (argv[1] === 'rev-parse' && argv.includes('MERGE_HEAD')) {
      const choco = r.ordenes.some(o => o[1] === 'merge' && o[2] === '--no-ff' && (escena.chocan ?? []).includes(o[3] as string))
      return sale(choco && !r.ordenes.some(o => o[2] === '--abort') ? 0 : 1)
    }
    if (argv[1] === 'rev-parse' && argv[2] === '--verify') return sale(0, (argv[3] as string).endsWith('carrito') ? 'aaa1111ffff\n' : 'bbb2222ffff\n')
    if (argv[1] === 'rev-parse' && argv[2] === 'HEAD') return sale(0, `f${r.ordenes.filter(o => o[1] === 'merge').length}00000\n`)
    if (argv[1] === 'merge' && argv[2] === '--no-ff') {
      return (escena.chocan ?? []).includes(argv[3] as string) ? sale(1, 'CONFLICT (content): Merge conflict in src/app.ts\n') : sale(0, 'Merge made\n')
    }
    if (argv[1] === 'merge' && argv[2] === '--abort') return sale(0)
    if (argv[1] === 'merge' && argv[2] === '--squash') return sale(0, 'Squash commit -- not updating HEAD\n')
    if (argv[1] === 'diff' && argv.includes('--cached')) return sale(escena.indice ? 1 : 0)
    if (argv.includes('--diff-filter=U')) return sale(0, (escena.chocan ?? []).length > 0 ? 'src/app.ts\n' : '')
    if (argv.includes('--parents')) return sale(0, r.ordenes.some(o => o[2] === '--squash') ? 'f1 p1\n' : 'f1 p1 p2\n')
    if (argv.includes('--name-status')) return sale(0, 'M\tBACKLOG.md\nM\tsrc/carrito.ts\nM\tpackage-lock.json\n')
    if (argv.includes('-U0')) return sale(0, '+++ b/BACKLOG.md\n+| carrito-1 | algo | x |\n+| carrito-2 | otra | x |\n+++ b/DESIGN.md\n+### D32. Descuentos\n')
    if (argv.includes('status')) return sale(0, '')
    return sale(0, '')
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['lo de Claude Code'] }))
  return r
}

const arrancar = ($: { session: { start: (entrada: never) => Promise<unknown> } }, raiz = PRINCIPAL) =>
  $.session.start({ surface: 'terminal', isInteractive: true, cwd: raiz } as never)

const recibir = ($: { session: { receive: (e: never) => Promise<unknown> } }, text: string) =>
  $.session.receive({ origin: { kind: 'peer-send-message' }, text } as never) as Promise<{ text?: string; consumed?: string }>

// ---------------------------------------------------------------- el aviso

test('el aviso «lista para subir» da la rama, el commit, la sesión, el resumen y lo que hay por revisar', () => {
  expect(avisoDeSubida(LISTA_CARRITO)).toEqual({
    rama: 'carrito',
    commit: 'aaa1111',
    sesion: 'carrito-e4',
    resumen: 'carrito con descuentos por cantidad (D31-D33)',
    porRevisar: [],
  })
  const login = avisoDeSubida(LISTA_LOGIN)
  expect(login?.sesion).toBe('login-87')
  expect(login?.porRevisar).toEqual(['sin probar en Safari', 'el aviso de error se pisa con el del formulario'])
  expect(avisoDeSubida('La rama x está lista para subir (abc1234)\nPor revisar: nada')?.porRevisar).toEqual([])
  expect(avisoDeSubida('La rama x está lista para subir (abc1234)\nPor revisar: falta una captura\nProbar: y')?.porRevisar).toEqual(['falta una captura'])
  expect(avisoDeSubida('La rama x está fusionada en main (abc1234)')).toBeNull()
})

test('el aviso se reconoce por la línea «equipo:lista <rama> <commit>», con las etiquetas en inglés o en español', () => {
  const aviso = ['equipo:lista ana/cart 3f2a9c1', 'Session: cart-4e', 'Summary: card payments in the cart', 'What changes: src/cart.ts', 'To review:', '- untested in Safari', '', 'Test: npm test'].join('\n')
  expect(avisoDeSubida(aviso)).toEqual({ rama: 'ana/cart', commit: '3f2a9c1', sesion: 'cart-4e', resumen: 'card payments in the cart', porRevisar: ['untested in Safari'] })
  expect(avisoDeSubida('equipo:lista `carrito` `aaa1111`\nSesión: carrito-e4\nResumen: descuentos\nPor revisar: nada')).toEqual({
    rama: 'carrito',
    commit: 'aaa1111',
    sesion: 'carrito-e4',
    resumen: 'descuentos',
    porRevisar: [],
  })
  expect(avisoDeSubida('equipo:lista cart abc1234\nTo review: none')?.porRevisar).toEqual([])
  // La línea tiene que ser la del aviso, no una cita de las instrucciones.
  expect(avisoDeSubida('vuelve a avisar con la línea «equipo:lista carrito <commit>»')).toBeNull()
  expect(avisoDeSubida('Avisa con equipo:lista cuando acabes')).toBeNull()
})

test('el mensaje de la fusión y los códigos con prefijo', () => {
  expect(mensajeFusion('carrito', 'descuentos.')).toBe('Fusión de carrito en main: descuentos')
  expect(mensajeFusion('carrito', '', 'develop')).toBe('Fusión de carrito en develop')
  expect(mensajeFusion('cart', 'discounts.', 'main', textos('en'))).toBe('Merge cart into main: discounts')
  expect(mensajeFusion('cart', 'discounts', 'main', textos('en', { 'fusion.mensaje': 'feat({rama}): {resumen}' }))).toBe('feat(cart): discounts')
  expect(codigosConPrefijo('carrito', '+++ b/BACKLOG.md\n+| carrito-1 | a |\n+ver carrito-T2\n+++ b/DESIGN.md\n+carrito-9\n')).toEqual(['carrito-1', 'carrito-T2'])
})

// ---------------------------------------------------------------- la franja

test('en la principal, el aviso no llega a Claude: sale en la franja con Subir y Borrar, y Solucionar si hay algo por revisar', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  expect((await recibir($, LISTA_CARRITO)).consumed).toMatch(/carrito lista para subir/)
  expect((await recibir($, LISTA_LOGIN)).consumed).toMatch(/login lista para subir/)
  expect(r.toasts).toContain('login lista para subir · 2 por revisar')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    expect(await ui.find({ type: 'Text', text: /carrito \(aaa1111\) · lista para subir/ })).toBeDefined()
    expect(await ui.find({ key: 'subir-carrito' })).toBeDefined()
    expect(await ui.find({ key: 'borrar-carrito' })).toBeDefined()
    expect(await ui.find({ key: 'solucionar-carrito' })).toBeUndefined()
    expect(await ui.find({ key: 'solucionar-login' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /sin probar en Safari/ })).toBeDefined()
    expect(await ui.find({ key: 'subir-todas' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'lo de Claude Code' })).toBeDefined()
    await ui.unmount()
  }
})

test('la franja del contexto va encima de la de las subidas', async ($, on) => {
  preparar(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 50_000, window: 200_000, percent: 25 }, rateLimits: [] } }))
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Contexto: 50k de 200k/ })).toBeDefined()
  expect(await ui.find({ key: 'subir-carrito' })).toBeDefined()
  expect(await ui.find({ key: 'compactar' })).toBeDefined()
})

test('en un worktree, el aviso pasa sin más', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { enPrincipal: false })
  await arrancar($, CARRITO)
  expect((await recibir($, LISTA_CARRITO)).text).toBe(LISTA_CARRITO)
  expect(r.toasts).toEqual([])
})

test('al empezar se instalan los drivers de fusión del plugin', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  const instalar = r.ordenes.find(o => o[0] === 'node' && o[2] === 'instalar')
  expect(instalar?.[1]).toMatch(/\/scripts\/fusion\.mjs$/)
})

test('en la principal sin .claude/equipo.json, recuerda que hay que preparar el proyecto', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: null })
  await arrancar($)
  expect(r.toasts.length).toBe(1)
  expect(r.toasts[0]).toMatch(/adapt-to-project/)
})

test('con ajustes no lo recuerda', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  expect(r.toasts).toEqual([])
})

test('sin node en el PATH lo dice al empezar, y la franja avisa de que no hay ensayo', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { sinNode: true })
  await arrancar($)
  expect(r.toasts.length).toBe(1)
  expect(r.toasts[0]).toMatch(/no encuentro node en el PATH/)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /carrito \(aaa1111\) · lista para subir · sin ensayo/ })).toBeDefined()
})

test('con un git anterior a 2.38 dice que el ensayo no funciona', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { git: 'git version 2.30.1\n' })
  await arrancar($)
  expect(r.toasts).toEqual(['equipo: git 2.30 es anterior a 2.38: el ensayo de las subidas (git merge-tree) no funciona.'])
})

test('con las subidas apagadas, el aviso llega a Claude y no se instala nada', { options: { subidas: false, contexto: false } }, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  expect((await recibir($, LISTA_CARRITO)).text).toBe(LISTA_CARRITO)
  expect(r.ordenes.some(o => o[0] === 'node')).toBe(false)
})

test('«Borrar» quita el aviso', NO_CONTEXTO, async ($, on) => {
  preparar(on)
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'borrar-carrito' })
  expect(await ui.find({ key: 'subir-carrito' })).toBeUndefined()
})

// ---------------------------------------------------------------- la cola y el lote

test('«Subir marcadas» fusiona en cola, una tras otra, y pide a Claude una sola comprobación del lote', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  await recibir($, LISTA_LOGIN)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'marcar-carrito' })
  await ui.press({ key: 'marcar-login' })
  await ui.press({ key: 'subir-marcadas' })
  const fusiones = r.ordenes.filter(o => o[1] === 'merge' && o[2] === '--no-ff')
  expect(fusiones.map(o => o[3])).toEqual(['carrito', 'login'])
  expect(fusiones[0]).toEqual(['git', 'merge', '--no-ff', 'carrito', '-m', 'Fusión de carrito en main: carrito con descuentos por cantidad (D31-D33)'])
  expect(r.prompts.length).toBe(1)
  expect(r.prompts[0]).toMatch(/Comprueba juntas en main las ramas .*: carrito, login/)
  expect(r.prompts[0]).toMatch(/skill equipo:comprobar-lote/)
  expect(r.prompts[0]).toMatch(/Renumera en main estos códigos de BACKLOG\.md .*: carrito-1, carrito-2/)
  expect(r.prompts[0]).toMatch(/scripts\/renumerar\.mjs" --aplicar carrito/)
  expect(r.prompts[0]).not.toMatch(/generados/) // package-lock.json no está en «generados»
  expect(r.prompts[0]).toMatch(/mcp__equipo__resultado_lote/)
  expect(r.prompts[0]).toMatch(/✔ decisiones D32, dentro de su bloque/)
  expect(r.prompts[0]).not.toMatch(/✖ BACKLOG/)
  expect(await ui.find({ type: 'Text', text: /carrito \(aaa1111\) · dentro \(f1/ })).toBeDefined()
})

test('una rama que choca se aborta, se avisa a su agente y el resto del lote sigue', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { chocan: ['carrito'] })
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  await recibir($, LISTA_LOGIN)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-todas' })
  expect(r.ordenes.some(o => o[1] === 'merge' && o[2] === '--abort')).toBe(true)
  expect(r.enviados[0]?.to).toBe('carrito-e4')
  expect(r.enviados[0]?.text).toMatch(/ha chocado con lo que ya había entrado.*\n.*src\/app\.ts/)
  expect(r.prompts.length).toBe(1)
  expect(r.prompts[0]).toMatch(/: login\./)
  expect(r.prompts[0]).toMatch(/No han entrado .*: carrito/)
  expect(await ui.find({ type: 'Text', text: /carrito .* conflicto, agente avisado/ })).toBeDefined()
})

test('sin backlog ni decisiones, la petición solo pide compilar, probar y el resultado', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{ "comandos": { "compilar": "npm run build", "probar": "npm test" } }' })
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-carrito' })
  expect(r.prompts[0]).not.toMatch(/Renumera|renumerar/)
  expect(r.prompts[0]).not.toMatch(/decisiones/)
  expect(r.prompts[0]).toMatch(/1\. Pruebas del lote, una sola vez: `npm run build`/)
  expect(r.prompts[0]).toMatch(/`npm test`/)
  expect(r.prompts[0]).toMatch(/2\. Cuenta el resultado/)
})

// ---------------------------------------------------------------- Solucionar

test('«Solucionar» pide una indicación y manda al agente lo de «Por revisar»', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  await recibir($, LISTA_LOGIN)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'solucionar-login' })
  expect(await ui.find({ key: 'nota-login' })).toBeDefined()
  await ui.input({ key: 'nota-login', text: 'prueba también en Firefox' })
  expect(r.enviados.length).toBe(1)
  expect(r.enviados[0]?.to).toBe('login-87')
  expect(r.enviados[0]?.text).toMatch(/- sin probar en Safari/)
  expect(r.enviados[0]?.text).toMatch(/Indicación del usuario: prueba también en Firefox/)
  expect(r.enviados[0]?.text).toMatch(/vuelve a avisar con la línea «equipo:lista login <commit>»/)
  expect(await ui.find({ type: 'Text', text: /login .* arreglo pedido al agente/ })).toBeDefined()
})

// ---------------------------------------------------------------- resultado del lote

test('el resultado del lote cierra el worktree de las que están bien y avisa a las que fallan', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  await recibir($, LISTA_LOGIN)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-todas' })
  const respuesta = await $.tool.call({
    tool: 'mcp__equipo__resultado_lote',
    ramas: [{ rama: 'carrito', ok: true }, { rama: 'login', ok: false, motivo: 'el test del enlace mágico falla' }],
  } as never)
  const texto = JSON.stringify(respuesta)
  expect(texto).toMatch(/carrito: comprobada, agente avisado y worktree cerrado/)
  expect(texto).toMatch(/login: marcada como fallida; agente avisado/)
  // El cierre (worktree, rama y reserva) lo hace worktree.mjs, con Orca o con git.
  const cierres = r.ordenes.filter(o => o[0] === 'node' && o[2] === 'cerrar')
  expect(cierres.map(o => o[3])).toEqual(['carrito'])
  expect(cierres[0]?.[1]).toMatch(/\/scripts\/worktree\.mjs$/)
  expect(r.enviados.find(m => m.to === 'carrito-e4')?.text).toMatch(/está subida a main/)
  expect(r.enviados.find(m => m.to === 'login-87')?.text).toMatch(/enlace mágico falla/)
  expect(await ui.find({ key: 'subir-carrito' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /login .* dentro, pero falla/ })).toBeDefined()
  expect(await ui.find({ key: 'solucionar-login' })).toBeDefined()
})

test('sin comandos en los ajustes (lo de por defecto), la petición no inventa ninguno', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{}' })
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-carrito' })
  expect(r.prompts[0]).toMatch(/1\. Pruebas del lote, una sola vez: las pruebas de lo que tocan/)
  expect(r.prompts[0]).toMatch(/comandos\.probar no está puesto/)
  expect(r.prompts[0]).not.toMatch(/npm/)
})

test('con fusion.estrategia «squash» entra un solo commit, y la rama se cierra si no se ha movido', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{ "fusion": { "estrategia": "squash" } }', fusionadas: [] })
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-carrito' })
  expect(r.ordenes).toContainEqual(['git', 'merge', '--squash', 'carrito'])
  expect(r.ordenes).toContainEqual(['git', 'commit', '-m', 'Fusión de carrito en main: carrito con descuentos por cantidad (D31-D33)'])
  expect(r.ordenes.some(o => o[1] === 'merge' && o[2] === '--no-ff')).toBe(false)
  expect(r.prompts[0]).toMatch(/es un solo commit con toda la rama \(squash\)/)
  // Los commits de la rama no están en main: se cierra a la fuerza, porque su punta es la que se subió.
  const texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'carrito', ok: true }] } as never))
  expect(texto).toMatch(/carrito: comprobada, agente avisado y worktree cerrado/)
  expect(r.ordenes.find(o => o[2] === 'cerrar')?.slice(2)).toEqual(['cerrar', 'carrito', '--forzar'])
})

test('con squash, si hay algo añadido en la copia principal no se sube', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{ "fusion": { "estrategia": "squash" } }', indice: true })
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-carrito' })
  expect(r.ordenes.some(o => o[1] === 'merge')).toBe(false)
  expect(await ui.find({ type: 'Text', text: /no ha entrado: la copia principal tiene cambios añadidos sin confirmar/ })).toBeDefined()
})

test('con worktrees.cerrarAlSubir apagado, la rama comprobada conserva su worktree', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{ "worktrees": { "cerrarAlSubir": false } }' })
  await arrancar($)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-carrito' })
  const texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'carrito', ok: true }] } as never))
  expect(texto).toMatch(/carrito: comprobada, agente avisado; su worktree sigue abierto/)
  expect(r.ordenes.some(o => o[2] === 'cerrar')).toBe(false)
  expect(r.enviados.find(m => m.to === 'carrito-e4')?.text).toMatch(/Tu worktree sigue abierto/)
})

test('unos ajustes con una clave que no existe se avisan al empezar', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{ "comandos": { "compliar": "make" } }' })
  await arrancar($)
  expect(r.toasts.length).toBe(1)
  expect(r.toasts[0]).toMatch(/\.claude\/equipo\.json tiene un problema: «comandos\.compliar» no es un ajuste/)
  expect(r.toasts[0]).toMatch(/ajustes\.mjs" --comprobar/)
})

test('con idioma «en», la franja, los avisos a los agentes y la petición del lote salen en inglés', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { ajustes: '{ "idioma": "en", "comandos": { "compilar": "npm run build", "probar": "npm test" } }', chocan: ['login'] })
  await arrancar($)
  await recibir($, 'equipo:lista carrito aaa1111\nSession: carrito-e4\nSummary: cart discounts\nTest: npx vitest run src/cart.test.ts')
  await recibir($, 'equipo:lista login bbb2222\nSession: login-87\nSummary: magic link\nTo review:\n- untested in Safari')
  expect(r.toasts).toContain('login ready to merge · 1 to review')
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /carrito \(aaa1111\) · ready to merge/ })).toBeDefined()
  expect((await ui.find({ key: 'subir-carrito' }))?.props).toMatchObject({ label: 'Merge' })
  expect((await ui.find({ key: 'subir-todas' }))?.props).toMatchObject({ label: 'Merge all (2)' })
  await ui.press({ key: 'subir-todas' })
  expect(r.ordenes).toContainEqual(['git', 'merge', '--no-ff', 'carrito', '-m', 'Merge carrito into main: cart discounts'])
  expect(r.enviados.find(m => m.to === 'login-87')?.text).toMatch(/^Merging branch login into main conflicted with what was already in/)
  expect(r.enviados.find(m => m.to === 'login-87')?.text).toMatch(/notify again with the line "equipo:lista login <commit>"/)
  expect(r.prompts[0]).toMatch(/^Check together in main the branches the equipo plugin has just merged: carrito\. Follow the skill equipo:comprobar-lote\./)
  expect(r.prompts[0]).toMatch(/✔ it is a merge/)
  expect(r.prompts[0]).toMatch(/1\. Tests for the batch, once: `npm run build`; then the tests of what they touch/)
  expect(r.prompts[0]).toMatch(/## What to do/)
  const texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'carrito', ok: true }] } as never))
  expect(texto).toMatch(/carrito: checked, agent notified and worktree closed\./)
  expect(r.enviados.find(m => m.to === 'carrito-e4')?.text).toMatch(/^Branch carrito is merged into main/)
})

const LISTA_PAGOS = 'La rama ana/pagos está lista para subir (ccc3333)\nSesión: pagos-11\nResumen: pagos con tarjeta.'
const LISTA_ESTILOS = 'La rama estilos está lista para subir (ddd4444)\nSesión: estilos-22\nResumen: estilos.'

test('resultado_lote acepta el nombre corto y una rama fusionada a mano que no está en la franja', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { fusionadas: ['carrito'] })
  await arrancar($)
  await recibir($, LISTA_PAGOS)
  let texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'pagos', ok: false, motivo: 'falla' }] } as never))
  expect(texto).toMatch(/ana\/pagos: marcada como fallida; agente avisado/)
  texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'carrito', ok: true, sesion: 'carrito-e4' }] } as never))
  expect(texto).toMatch(/carrito: comprobada, agente avisado y worktree cerrado/)
  expect(r.enviados.find(m => m.to === 'carrito-e4')?.text).toMatch(/está subida a main/)
  await recibir($, LISTA_ESTILOS)
  texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'estilos', ok: true }] } as never))
  expect(texto).toMatch(/estilos: no está entera en main/)
  expect(r.ordenes.some(o => o[2] === 'cerrar' && o[3] === 'estilos')).toBe(false)
})

test('resultado_lote avisa si quedan códigos de la rama sin renumerar', NO_CONTEXTO, async ($, on) => {
  preparar(on)
  await arrancar($)
  await recibir($, LISTA_PAGOS)
  const texto = JSON.stringify(await $.tool.call({ tool: 'mcp__equipo__resultado_lote', ramas: [{ rama: 'ana/pagos', ok: true }] } as never))
  expect(texto).toMatch(/Quedan en BACKLOG\.md sin renumerar: pagos-T2/)
})

// ---------------------------------------------------------------- ensayo, orden y apartadas

const PLAN = {
  orden: ['login', 'carrito'],
  apartadas: [
    { rama: 'ana/pagos', con: ['main'], archivos: ['src/app.ts'] },
    { rama: 'estilos', con: ['login'], archivos: ['src/estilos.css'] },
  ],
  parejas: [{ ramas: ['login', 'estilos'], archivos: ['src/estilos.css'] }],
  generados: ['carrito'],
  errores: [],
}

test('el ensayo ordena la subida, aparta lo que choca y avisa a cada agente a su tiempo', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on, { plan: PLAN })
  await arrancar($)
  for (const aviso of [LISTA_CARRITO, LISTA_LOGIN, LISTA_PAGOS, LISTA_ESTILOS]) await recibir($, aviso)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  // Antes de pulsar, la franja ya dice con qué chocaría cada una.
  expect(await ui.find({ type: 'Text', text: /chocaría con main: src\/app\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /chocaría con estilos: src\/estilos\.css/ })).toBeDefined()
  await ui.press({ key: 'subir-todas' })
  expect(r.ordenes.filter(o => o[1] === 'merge' && o[2] === '--no-ff').map(o => o[3])).toEqual(['login', 'carrito'])
  // La que choca con main se avisa antes de fusionar nada; la que choca con login, cuando login ya ha entrado.
  expect(r.enviados.map(m => m.to)).toEqual(['pagos-11', 'estilos-22'])
  expect(r.enviados[0]?.text).toMatch(/choca con main/)
  expect(r.enviados[1]?.text).toMatch(/choca con login, que ya ha entrado en main/)
  expect(r.prompts.length).toBe(1)
  expect(r.prompts[0]).toMatch(/- ana\/pagos: choca con main en src\/app\.ts/)
  expect(r.prompts[0]).toMatch(/1\. Tocan archivos generados: carrito\..*`npm install`/)
  expect(r.prompts[0]).toMatch(/pruebas\.mjs" f100000\^1\.\.f100000 f200000\^1\.\.f200000/)
  expect(await ui.find({ type: 'Text', text: /pagos .* apartada del lote: choca con main/ })).toBeDefined()
  expect(await ui.find({ key: 'solucionar-estilos' })).toBeDefined()
})

test('sin ensayo (falla), la cola sube en su orden', NO_CONTEXTO, async ($, on) => {
  const r = preparar(on)
  await arrancar($)
  await recibir($, LISTA_LOGIN)
  await recibir($, LISTA_CARRITO)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'subir-todas' })
  expect(r.ordenes.filter(o => o[1] === 'merge' && o[2] === '--no-ff').map(o => o[3])).toEqual(['login', 'carrito'])
})

test('códigos con el nombre corto de la rama, en la fusión y en el backlog entero', () => {
  expect(codigosConPrefijo('ana/carrito-pago', '+++ b/BACKLOG.md\n+| carrito-pago-T1 | a |\n+| carrito-pago-T2 | b |\n')).toEqual(['carrito-pago-T1', 'carrito-pago-T2'])
  const backlog = '| T88 | ya |\n| carrito-pago-T3 | no |\n| otra-T1 | de otra |\n| T90 | cita carrito-pago-T9 |\n'
  expect(codigosSinRenumerar('ana/carrito-pago', backlog)).toEqual(['carrito-pago-T3'])
  const a = ajustesDeTexto('{ "backlog": { "activo": true } }')
  const base = { rama: 'ana/carrito-pago', bloque: null, padres: 'f p1 p2', archivos: 'M\tBACKLOG.md', estado: '' }
  expect(revisar({ ...base, diff: '+++ b/BACKLOG.md\n+| carrito-pago-T3 | no |\n', backlog }, a).lineas.join('\n')).toMatch(/✖ BACKLOG\.md tiene 1 códigos .*carrito-pago-T3/)
  expect(revisar({ ...base, diff: '+++ b/BACKLOG.md\n+| T91 | sí |\n', backlog: '| T91 | sí |\n' }, a).lineas.join('\n')).toMatch(/✔ ningún código/)
})

test('la revisión ve los archivos prohibidos y las decisiones fuera del bloque', () => {
  const a = ajustesDeTexto('{ "prohibidos": [".env.local"], "decisiones": { "activo": true, "prefijo": "ADR-" } }')
  const rev = revisar(
    { rama: 'x', bloque: [10, 19], padres: 'f p1 p2', archivos: 'A\t.env.local\nM\tsrc/a.ts', diff: '+++ b/DESIGN.md\n+## ADR-12 Uno\n+## ADR-25 Otro\n', estado: '' },
    a,
  )
  expect(rev.lineas).toContain('✖ han entrado archivos prohibidos: .env.local')
  expect(rev.lineas).toContain('✖ decisiones fuera del bloque ADR-10-ADR-19: ADR-25')
})

test('leerPlan, choquesDe y la petición del lote con otra rama principal', () => {
  expect(leerPlan('basura')).toBeNull()
  expect(leerPlan('{"error":"x"}')).toBeNull()
  const plan = leerPlan(JSON.stringify(PLAN))
  expect(plan?.orden).toEqual(['login', 'carrito'])
  expect(choquesDe(plan as never, 'estilos')).toEqual([{ rama: 'estilos', con: ['login'], archivos: ['src/estilos.css'] }])
  expect(choquesDe(plan as never, 'ana/pagos')[0]?.con).toEqual(['main'])
  const a = ajustesDeTexto('{ "ramaPrincipal": "develop", "comandos": { "compilar": "", "probar": "pnpm test" } }')
  const texto = peticionLote(
    [{ rama: 'x', fusion: 'f1', aviso: 'aviso', revision: { lineas: ['✔ es una fusión'], problemas: 0, generados: false }, codigos: [], distinta: true }],
    [],
    [],
    [],
    { ajustes: a, scripts: '/p/scripts', herramienta: 'mcp__equipo__resultado_lote' },
  )
  expect(texto).toMatch(/Comprueba juntas en develop/)
  expect(texto).toMatch(/la punta de la rama no era el commit del aviso/)
  expect(texto).toMatch(/`pnpm test`/)
  expect(texto).not.toMatch(/npm run build/)
})
