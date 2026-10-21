// Panel de ramas y /reservar: lectura de `orca worktree ps --json` y de `git worktree list`, y cálculo del siguiente
// bloque libre de decisiones (si se usan).

import type { Rama } from '../types'

type OrcaWorktree = {
  path?: string
  branch?: string
  displayName?: string
  comment?: string
  isMainWorktree?: boolean
  lastActivityAt?: number
  agents?: { state?: string }[]
}

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

/** Las ramas del repositorio: las de git, con el comentario y los agentes de Orca si los hay. */
export function montarRamas(porcelana: string, orcaJson: string, prefijo = 'D'): Rama[] {
  let orca: OrcaWorktree[] = []
  try {
    const datos = JSON.parse(orcaJson) as { result?: { worktrees?: OrcaWorktree[] } }
    orca = datos.result?.worktrees ?? []
  } catch {
    orca = []
  }
  return rutasDeGit(porcelana).map((git, i) => {
    const o = orca.find(w => w.path !== undefined && misma(w.path, git.ruta))
    const comentario = o?.comment ?? ''
    return {
      nombre: o?.displayName ?? git.ruta.split(/[\\/]/).pop() ?? git.ruta,
      rama: git.rama,
      ruta: git.ruta,
      comentario,
      bloque: bloqueDe(comentario, prefijo),
      agente: (o?.agents ?? []).map(a => a.state ?? '?').join(', '),
      principal: i === 0,
      actividad: o?.lastActivityAt ?? 0,
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

/** El mayor encabezado «### <prefijo><n>» de un documento de diseño. */
export function mayorDecision(design: string, prefijo = 'D'): number {
  let mayor = 0
  for (const m of design.matchAll(new RegExp(`^#{1,6}\\s+${escapar(prefijo)}(\\d+)\\b`, 'gm'))) mayor = Math.max(mayor, Number(m[1]))
  return mayor
}

/** El siguiente bloque libre: tras la mayor decisión de cualquier copia y el mayor bloque reservado en un worktree. */
export function siguienteBloque(mayoresDesign: number[], ramas: Rama[], tamaño = 10): [number, number] {
  const reservado = Math.max(0, ...ramas.map(r => r.bloque?.[1] ?? 0))
  const inicio = Math.max(0, ...mayoresDesign, reservado) + 1
  return [inicio, inicio + Math.max(1, tamaño) - 1]
}

export const textoBloque = (b: [number, number], prefijo = 'D') => `${prefijo}${b[0]}-${prefijo}${b[1]}`

/** `git rev-list --left-right --count main...rama` → [detrás, delante]. */
export function cuentas(salida: string): [number, number] {
  const [detras, delante] = salida.trim().split(/\s+/).map(Number)
  return [detras ?? 0, delante ?? 0]
}
