// Revisión de git de una fusión recién hecha en la principal: que es una fusión, que no han entrado archivos
// prohibidos, que las decisiones nuevas están dentro del bloque de la rama (si se usan) y qué códigos del backlog traen
// el prefijo de la rama (si se renumeran).

import type { Ajustes } from './ajustes'
import { normalizarProhibidos } from './commits'
import { codigosSinRenumerar } from './subidas'

export type Entrada = {
  rama: string
  /** El bloque reservado a la rama (comentario de Orca), si se sabe. */
  bloque: [number, number] | null
  /** `git rev-list --parents -n 1 <commit>`: el commit y sus padres. */
  padres: string
  /** `git diff --name-status <commit>^1 <commit>`. */
  archivos: string
  /** `git diff -U0 <commit>^1 <commit> -- <documento de diseño> <backlog>`. */
  diff: string
  /** `git status --porcelain` de la copia principal. */
  estado: string
  /** El backlog entero en el commit, para ver si quedan códigos sin renumerar. */
  backlog?: string
}

export type Revision = { lineas: string[]; problemas: number; generados: boolean }

export function revisar(x: Entrada, a: Ajustes): Revision {
  const lineas: string[] = []
  let problemas = 0
  const mal = (texto: string) => {
    lineas.push(`✖ ${texto}`)
    problemas++
  }
  const bien = (texto: string) => lineas.push(`✔ ${texto}`)
  const nota = (texto: string) => lineas.push(`• ${texto}`)

  const padres = x.padres.trim().split(/\s+/).filter(Boolean)
  if (padres.length === 0) {
    mal('el commit no existe en esta copia (¿se ha fusionado en otra carpeta?)')
    return { lineas, problemas, generados: false }
  }
  if (padres.length < 3) mal('el commit no es una fusión (--no-ff)')
  else bien('es una fusión')

  const cambios = x.archivos
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.split('\t'))
    .filter(p => p.length >= 2)
    .map(p => p[p.length - 1] as string)
  const prohibidos = normalizarProhibidos(a.prohibidos)
  const esProhibido = (ruta: string) => prohibidos.some(p => ruta.toLowerCase() === p || ruta.toLowerCase().startsWith(`${p}/`))
  const ajenos = cambios.filter(esProhibido)
  if (ajenos.length > 0) mal(`han entrado archivos prohibidos: ${ajenos.join(', ')}`)
  else bien(`${cambios.length} archivos${prohibidos.length > 0 ? ', ninguno prohibido' : ''}`)

  const { design, backlog } = anadidas(x.diff, a)
  if (a.decisiones.activo) {
    const p = escapar(a.decisiones.prefijo)
    const decisiones = design.flatMap(l => [...l.matchAll(new RegExp(`^#{1,6}\\s+${p}(\\d+)\\b`, 'g'))].map(m => Number(m[1])))
    const rango = (numeros: number[]) => {
      const orden = [...numeros].sort((m, n) => m - n)
      return orden.length === 1 ? `${a.decisiones.prefijo}${orden[0]}` : `${a.decisiones.prefijo}${orden[0]}-${a.decisiones.prefijo}${orden[orden.length - 1]}`
    }
    if (decisiones.length === 0) nota(`sin decisiones nuevas en ${a.decisiones.documento}`)
    else if (x.bloque) {
      const [desde, hasta] = x.bloque
      const fuera = decisiones.filter(d => d < desde || d > hasta)
      if (fuera.length > 0) mal(`decisiones fuera del bloque ${rango([desde, hasta])}: ${fuera.map(d => `${a.decisiones.prefijo}${d}`).join(', ')}`)
      else bien(`decisiones ${rango(decisiones)}, dentro de su bloque`)
    } else nota(`decisiones ${rango(decisiones)} (no sé qué bloque tenía la rama)`)
  }
  if (a.backlog.activo) {
    // Lo que cuenta es lo que queda en el backlog entero tras la fusión, no solo lo añadido.
    const sinRenumerar = codigosSinRenumerar(x.rama, x.backlog ?? backlog.map(l => (l.startsWith('|') ? l : `| ${l} |`)).join('\n'))
    if (sinRenumerar.length > 0) {
      mal(`${a.backlog.documento} tiene ${sinRenumerar.length} códigos con el nombre de la rama delante: ${sinRenumerar.slice(0, 4).join(', ')}`)
    } else if (backlog.length > 0) bien(`ningún código de ${a.backlog.documento} con el nombre de la rama delante`)
  }

  const generados = a.generados.length > 0 && cambios.some(r => a.generados.some(g => coincide(r, g)))
  if (generados) nota(`toca archivos generados: hay que rehacerlos con ${a.comandos.regenerar ? `\`${a.comandos.regenerar}\`` : 'comandos.regenerar'}`)

  const sucios = x.estado
    .replace(/\r/g, '')
    .split('\n')
    .filter(l => l.length > 3)
    .map(l => l.slice(3))
    .filter(r => !esProhibido(r))
  if (sucios.length > 0) nota(`la copia principal tiene ${sucios.length} cambios sin confirmar: ${sucios.slice(0, 4).join(', ')}${sucios.length > 4 ? '…' : ''}`)

  return { lineas, problemas, generados }
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Un patrón de .gitattributes sencillo: ruta exacta, o con * y ** (sin barra, vale en cualquier carpeta). */
export function coincide(ruta: string, patron: string): boolean {
  const p = patron.replace(/\\/g, '/').replace(/^\//, '')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i] as string
    if (c === '*' && p[i + 1] === '*') {
      re += '.*'
      i++
      if (p[i + 1] === '/') i++
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += escapar(c)
  }
  return new RegExp(p.includes('/') ? `^${re}$` : `(^|/)${re}$`).test(ruta)
}

function anadidas(diff: string, a: Ajustes): { design: string[]; backlog: string[] } {
  const design: string[] = []
  const backlog: string[] = []
  let actual = ''
  for (const linea of diff.replace(/\r/g, '').split('\n')) {
    if (linea.startsWith('+++ ')) {
      actual = linea.endsWith(`/${a.decisiones.documento}`) ? 'design' : linea.endsWith(`/${a.backlog.documento}`) ? 'backlog' : ''
      continue
    }
    if (!linea.startsWith('+') || linea.startsWith('+++')) continue
    if (actual === 'design') design.push(linea.slice(1))
    if (actual === 'backlog') backlog.push(linea.slice(1))
  }
  return { design, backlog }
}
