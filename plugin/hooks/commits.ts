// Guarda de los commits.
// - En la copia principal: nada de `git add -A`, `git add .`, `git add -u`, `git commit -a` / `--all` ni
//   `git commit .`: allí solo entran las fusiones y lo que se añade archivo a archivo.
// - En cualquier copia: los archivos o carpetas de «prohibidos» (.claude/equipo.json) no entran.

import type { Copia } from './copia'
import type { T } from './idioma'
import { ES } from './idioma'
import { dentroDe, normalizar } from './rutas'
import type { Git } from './shell'

/** La copia (principal o esta) en la que está `carpeta`, o null si es otra. */
export function copiaDe(carpeta: string | null, c: Copia): string | null {
  if (carpeta === null) return null
  if (dentroDe(carpeta, c.raiz)) return c.raiz
  if (dentroDe(carpeta, c.principal)) return c.principal
  return null
}

export type Juicio =
  | { tipo: 'pasa' }
  /** `motivo` es el texto entero que se le da a Claude. */
  | { tipo: 'niega'; motivo: string }
  /** Hay que mirar `git status` de los prohibidos: si alguno tiene cambios que entrarían, se niega. */
  | { tipo: 'mirar'; copia: string; modo: Modo }

/**
 * Qué cambios de los archivos prohibidos entrarían: `todo` (un `git add` que barre, también los nuevos), `seguidos`
 * (un `commit -a`: lo que ya está en el índice y lo cambiado de lo que git sigue) o `indice` (un `commit` sin -a).
 */
export type Modo = 'todo' | 'seguidos' | 'indice'

const BARRIDOS_ADD = new Set(['-A', '--all', '-u', '--update', '--no-ignore-removal'])

/** Los prohibidos, relativos a la copia, con barras normales, sin barra final y, con `plegar`, en minúsculas. */
export function normalizarProhibidos(prohibidos: readonly string[], plegar = true): string[] {
  return prohibidos
    .map(p => p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
    .map(p => (plegar ? p.toLowerCase() : p))
    .filter(p => p !== '' && p !== '.')
}

/** El prohibido (tal como está en los ajustes) que es `abs` o la contiene, o null. */
function prohibidoDe(abs: string, copiaGit: string, prohibidos: readonly string[], plegar: boolean): string | null {
  const normales = normalizarProhibidos(prohibidos, plegar)
  const i = normales.findIndex(p => dentroDe(abs, `${copiaGit}/${p}`))
  return i >= 0 ? (prohibidos.filter(p => normalizarProhibidos([p]).length > 0)[i] ?? null) : null
}

/**
 * Lo que dice la guarda de un `git add`, `git rm` o `git commit`. Con `barridos` en falso (guardas.barridos de los
 * ajustes) no niega los `git add -A` y `git commit -a` de la copia principal; los prohibidos se miran siempre.
 */
export function juzgar(git: Git, c: Copia, prohibidos: readonly string[], barridos = true, t: T = ES): Juicio {
  const copiaGit = copiaDe(git.carpeta, c)
  const enPrincipal = copiaGit !== null && copiaGit === c.principal
  const hayProhibidos = normalizarProhibidos(prohibidos).length > 0
  if (git.orden === 'add' || git.orden === 'rm' || git.orden === 'stage') {
    if (git.args.includes('-n') || git.args.includes('--dry-run')) return { tipo: 'pasa' }
    const { opciones, rutas } = partir(git.args)
    const barrido =
      (git.orden !== 'rm' && opciones.some(o => BARRIDOS_ADD.has(o) || (/^-[a-zA-Z]+$/.test(o) && /[Au]/.test(o)))) ||
      rutas.some(r => r === '.' || r === ':/' || r === ':' || r === '*')
    if (enPrincipal && barrido && barridos) {
      return { tipo: 'niega', motivo: t('guarda.barridoAdd', { orden: git.orden }) }
    }
    if (copiaGit === null || !hayProhibidos) return { tipo: 'pasa' }
    for (const ruta of rutas) {
      const abs = normalizar(ruta, git.carpeta, c.home, c.plegar)
      const prohibido = abs === null ? null : prohibidoDe(abs, copiaGit, prohibidos, c.plegar)
      if (prohibido) return { tipo: 'niega', motivo: motivoProhibido(prohibido, t) }
    }
    const cubre = barrido || rutas.some(r => cubreProhibidos(r, git.carpeta, copiaGit, c, prohibidos))
    return cubre ? { tipo: 'mirar', copia: copiaGit, modo: git.orden === 'rm' ? 'seguidos' : 'todo' } : { tipo: 'pasa' }
  }
  if (git.orden === 'commit') {
    const { opciones, rutas } = partir(git.args, ['-m', '-F', '-c', '-C', '--message', '--file', '-t', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer'])
    // `git commit <rutas>` se lleva el estado actual de esas rutas, como un -a limitado a ellas: `git commit .` es -a.
    const todo =
      opciones.some(o => o === '--all' || (/^-[a-zA-Z]+$/.test(o) && /^-[^mFcCt]*a/.test(o))) ||
      rutas.some(r => r === '.' || r === ':/' || r === '*') ||
      (copiaGit !== null && rutas.some(r => cubreProhibidos(r, git.carpeta, copiaGit, c, prohibidos)))
    if (enPrincipal && todo && barridos) {
      return { tipo: 'niega', motivo: t('guarda.barridoCommit') }
    }
    if (copiaGit === null || !hayProhibidos) return { tipo: 'pasa' }
    for (const ruta of rutas) {
      const abs = normalizar(ruta, git.carpeta, c.home, c.plegar)
      const prohibido = abs === null ? null : prohibidoDe(abs, copiaGit, prohibidos, c.plegar)
      if (prohibido) return { tipo: 'niega', motivo: motivoProhibido(prohibido, t) }
    }
    // Siempre se mira el índice: un archivo prohibido ya añadido entraría con este commit.
    return { tipo: 'mirar', copia: copiaGit, modo: todo ? 'seguidos' : 'indice' }
  }
  return { tipo: 'pasa' }
}

/** La ruta (una carpeta que los contiene, o un patrón) puede llevarse alguno de los prohibidos. */
function cubreProhibidos(ruta: string, carpeta: string | null, copiaGit: string, c: Copia, prohibidos: readonly string[]): boolean {
  const normales = normalizarProhibidos(prohibidos, c.plegar)
  if (normales.length === 0) return false
  if (/[*?[]/.test(ruta)) return true
  const abs = normalizar(ruta, carpeta, c.home, c.plegar)
  return abs !== null && normales.some(p => dentroDe(`${copiaGit}/${p}`, abs) || dentroDe(abs, `${copiaGit}/${p}`))
}

export function motivoProhibido(ruta: string, t: T = ES): string {
  return t('guarda.prohibido', { ruta })
}

/** De la salida de `git status --porcelain -- <prohibidos>`, los archivos que entrarían según el modo. */
export function prohibidosConCambios(porcelana: string, modo: Modo): string[] {
  const salida: string[] = []
  for (const linea of porcelana.split(/\r?\n/)) {
    if (linea.length < 4) continue
    const indice = linea[0] as string
    const arbol = linea[1] as string
    const enIndice = indice !== ' ' && indice !== '?' && indice !== '!'
    const cambiado = arbol !== ' ' && arbol !== '?' && arbol !== '!'
    const nuevo = indice === '?'
    if (enIndice || (modo !== 'indice' && cambiado) || (modo === 'todo' && nuevo)) {
      salida.push(linea.slice(3).replace(/^"|"$/g, ''))
    }
  }
  return salida
}

function partir(args: string[], conValor: string[] = []): { opciones: string[]; rutas: string[] } {
  const opciones: string[] = []
  const rutas: string[] = []
  let soloRutas = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (soloRutas) {
      rutas.push(a)
    } else if (a === '--') {
      soloRutas = true
    } else if (a.startsWith('-') && a.length > 1) {
      opciones.push(a)
      if (conValor.includes(a)) i++
    } else if (a.startsWith('__HEREDOC_') || a.startsWith('>') || a === '2>&1') {
      continue
    } else {
      rutas.push(a)
    }
  }
  return { opciones, rutas }
}
