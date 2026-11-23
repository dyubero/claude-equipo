// Panel de ramas y /reservar: lectura de `git worktree list` y de `node scripts/worktree.mjs lista`. El siguiente
// bloque libre de decisiones y las reservas los lleva scripts/bloque.mjs.

import type { Rama } from '../types'

/** Una copia tal como la da `node scripts/worktree.mjs lista`. */
type CopiaDeLista = { ruta?: string; nombre?: string; bloque?: string; agente?: string; actividad?: number }

/** Las rutas de `git worktree list --porcelain`, la principal primero. */
export function rutasDeGit(porcelana: string): { ruta: string; rama: string }[] {
  return porcelana
    .replace(/\r/g, '')
    .split('\n\n')
    .map(bloque => ({
      ruta: /^worktree (.+)$/m.exec(bloque)?.[1] ?? '',
      rama: /^branch refs\/heads\/(.+)$/m.exec(bloque)?.[1] ?? '',
    }))
    .filter(w => w.ruta !== '')
}

const normal = (r: string) => r.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
export const misma = (a: string, b: string) => normal(a) === normal(b)

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Las ramas del repositorio: las de git, con lo que añade `worktree.mjs lista` (el nombre que enseña Orca, el bloque
 * de decisiones reservado y el estado de los agentes). Si la lista no ha llegado, solo lo de git.
 */
export function montarRamas(porcelana: string, lista: unknown, prefijo = 'D'): Rama[] {
  const copias = Array.isArray(lista) ? (lista as CopiaDeLista[]) : []
  return rutasDeGit(porcelana).map((git, i) => {
    const o = copias.find(w => typeof w.ruta === 'string' && misma(w.ruta, git.ruta))
    const comentario = o?.bloque ?? ''
    return {
      nombre: o?.nombre ?? git.ruta.split(/[\\/]/).pop() ?? git.ruta,
      rama: git.rama,
      ruta: git.ruta,
      comentario,
      bloque: bloqueDe(comentario, prefijo),
      agente: o?.agente ?? '',
      principal: i === 0,
      actividad: o?.actividad ?? 0,
      delante: 0,
      detras: 0,
    }
  })
}

/** El bloque «D715-D724» de un comentario, o null. */
export function bloqueDe(texto: string, prefijo = 'D'): [number, number] | null {
  const p = escapar(prefijo)
  const m = new RegExp(`${p}(\\d+)\\s*[-–]\\s*(?:${p})?(\\d+)`).exec(texto)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** `git rev-list --left-right --count main...rama` → [detrás, delante]. */
export function cuentas(salida: string): [number, number] {
  const [detras, delante] = salida.trim().split(/\s+/).map(Number)
  return [detras ?? 0, delante ?? 0]
}
