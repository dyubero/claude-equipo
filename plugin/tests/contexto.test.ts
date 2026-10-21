// Franja del contexto y botón para compactar.

import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { miles, texto } from '../hooks/contexto'

const BANDA = {
  plugin: 'equipo',
  component: 'AbovePrompt',
  requestId: 'franja',
  viewport: { columns: 140, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 130, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

const uso = (tokens: number | undefined, window = 200_000) => ({
  startedAt: 0,
  context: { tokens, window, percent: tokens === undefined ? undefined : Math.round((tokens / window) * 100) },
  rateLimits: [],
})

function preparar(on: On, tokens: number | undefined) {
  const r = { compactados: 0, toasts: [] as string[] }
  on('session.start', () => ({ cwd: 'C:/x' }))
  on('session.usage', () => ({ value: uso(tokens) }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'hola', toolUses: [] }] }))
  on('session.measure', () => ({ changed: ['context'] }))
  on('session.compact', () => {
    r.compactados++
    return { messages: [{ role: 'user', text: 'resumen', toolUses: [] }], tokensBefore: 120_000, tokensAfter: 18_000 }
  })
  on('ui.toast', ($, e) => {
    r.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['lo de Claude Code'] }))
  return r
}

const arrancar = ($: { session: { start: (entrada: never) => Promise<unknown> } }) =>
  $.session.start({ surface: 'terminal', isInteractive: true, cwd: 'C:/x' } as never)

test('enseña lo usado y lo libre, en terminal y escritorio', async ($, on) => {
  preparar(on, 84_000)
  await arrancar($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    expect(await ui.find({ type: 'Text', text: '● Contexto: 84k de 200k usados (42 %) · libres 116k' })).toBeDefined()
    expect(await ui.find({ key: 'compactar' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'lo de Claude Code' })).toBeDefined()
    await ui.unmount()
  }
})

test('se pone al día tras cada turno y avisa con color al llenarse', async ($, on) => {
  preparar(on, 20_000)
  await arrancar($)
  await $.session.measure({ context: { tokens: 170_000, window: 200_000, percent: 85 }, rateLimits: [], changed: ['context'] } as never)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  const linea = await ui.find({ type: 'Text', text: /Contexto: 170k de 200k usados \(85 %\) · libres 30k/ })
  expect(linea).toBeDefined()
  expect((linea?.props as { color?: string } | undefined)?.color).toBe('error')
})

test('«Compactar» compacta y pone la cifra al día', async ($, on) => {
  const r = preparar(on, 120_000)
  await arrancar($)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'compactar' })
  expect(r.compactados).toBe(1)
  expect(r.toasts).toEqual(['Compactado: de 120k a 18k'])
  expect(await ui.find({ type: 'Text', text: /Contexto: 18k de 200k usados \(9 %\) · libres 182k/ })).toBeDefined()
})

test('sin tokensAfter, dice que se pondrá al día con la próxima respuesta', async ($, on) => {
  on('session.start', () => ({ cwd: 'C:/x' }))
  on('session.usage', () => ({ value: uso(120_000) }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'hola', toolUses: [] }] }))
  on('session.compact', () => ({ messages: [{ role: 'user', text: 'resumen', toolUses: [] }] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['x'] }))
  await arrancar($)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'compactar' })
  expect(await ui.find({ type: 'Text', text: /compactado \(la cifra se pone al día/ })).toBeDefined()
})

test('mientras Claude trabaja no sale el botón', async ($, on) => {
  preparar(on, 120_000)
  await arrancar($)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal', props: { ...BANDA.props, isWorking: true } })
  expect(await ui.find({ key: 'compactar' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Contexto: 120k/ })).toBeDefined()
})

test('antes de la primera respuesta no hay cifras ni botón', async ($, on) => {
  preparar(on, undefined)
  await arrancar($)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /se sabrá tras la primera respuesta/ })).toBeDefined()
  expect(await ui.find({ key: 'compactar' })).toBeUndefined()
})

test('si compactar falla, lo avisa', async ($, on) => {
  const r = { toasts: [] as string[] }
  on('session.start', () => ({ cwd: 'C:/x' }))
  on('session.usage', () => ({ value: uso(50_000) }))
  on('session.messages', () => ({ value: [{ role: 'user', text: 'hola', toolUses: [] }] }))
  on('session.compact', () => ({ skip: 'lo ha parado un hook' }))
  on('ui.toast', ($, e) => {
    r.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['x'] }))
  await arrancar($)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'compactar' })
  expect(r.toasts[0]).toBe('No se ha compactado: lo ha parado un hook')
  expect(await ui.find({ key: 'compactar' })).toBeDefined()
})

test('las cifras se escriben cortas', () => {
  expect(miles(950)).toBe('950')
  expect(miles(1234)).toBe('1,2k')
  expect(miles(84_400)).toBe('84k')
  expect(miles(1_000_000)).toBe('1M')
  expect(texto({ tokens: 130_000, ventana: 200_000, compactando: false, compactado: false })).toBe(
    '◆ Contexto: 130k de 200k usados (65 %) · libres 70k',
  )
})
