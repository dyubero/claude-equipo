import type { RenderInput } from 'claude-code'

/** El evento de la franja sobre el prompt (ui.render de AbovePrompt). */
export type FranjaEvento = RenderInput<'AbovePrompt'>

/** Lo que devuelve `next(e)` en la franja es un dibujo que se puede meter debajo (Box o Text), no otra cosa. */
export function esDibujo(x: unknown): x is { type: 'Box' | 'Text' } {
  return typeof x === 'object' && x !== null && ((x as { type?: unknown }).type === 'Box' || (x as { type?: unknown }).type === 'Text')
}
