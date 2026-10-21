// La franja del contexto: cómo se escriben las cifras. El dibujo y lo que lee de la sesión están en register.tsx.

import type { Contexto } from '../types'

/** Desde qué porcentaje se avisa en amarillo y en rojo. */
const AVISO = 60
const PELIGRO = 80

// ---------------------------------------------------------------- texto

/** 1234 → «1,2k», 84000 → «84k», 1000000 → «1M». */
export function miles(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1).replace('.', ',')}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`
  return String(n)
}

export function porcentaje(c: Contexto): number {
  return c.tokens === null || c.ventana <= 0 ? 0 : Math.round((c.tokens / c.ventana) * 100)
}

export function texto(c: Contexto): string {
  if (c.compactando) return '◐ Contexto: compactando…'
  if (c.tokens === null || c.ventana <= 0) return '◌ Contexto: se sabrá tras la primera respuesta'
  const p = porcentaje(c)
  const icono = p >= PELIGRO ? '▲' : p >= AVISO ? '◆' : '●'
  const libre = Math.max(0, c.ventana - c.tokens)
  const despues = c.compactado ? ' · compactado (la cifra se pone al día con la próxima respuesta)' : ''
  return `${icono} Contexto: ${miles(c.tokens)} de ${miles(c.ventana)} usados (${p} %) · libres ${miles(libre)}${despues}`
}

export function color(c: Contexto): string {
  if (c.tokens === null || c.compactando) return 'inactive'
  const p = porcentaje(c)
  return p >= PELIGRO ? 'error' : p >= AVISO ? 'warning' : 'subtle'
}
