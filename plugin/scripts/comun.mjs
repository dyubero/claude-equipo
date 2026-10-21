// Ayudas comunes de los scripts del equipo: git, ajustes del proyecto, nombres de rama y worktrees.
// Solo Node (18 o posterior) y git: sin dependencias.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { mezclar, POR_DEFECTO } from './por-defecto.mjs'

export class GitError extends Error {}

/** Ejecuta git y devuelve { status, stdout, stderr }. Lanza GitError si el código no está en `ok`. */
export function git(args, { repo = '.', ok = [0], entrada, env } = {}) {
  const r = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    input: entrada,
    env: env ?? process.env,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  })
  if (r.error) throw new GitError(`git ${args.join(' ')}: ${r.error.message}`)
  if (!ok.includes(r.status)) throw new GitError(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`)
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** «usuario/mi-rama» → «mi-rama»: el nombre del worktree y el prefijo de los códigos del backlog. */
export const corto = rama => rama.split('/').pop()

/** Raíz de la copia (worktree o principal) en la que está `repo`. */
export function raiz(repo = '.') {
  return git(['rev-parse', '--show-toplevel'], { repo }).stdout.trim()
}

/** [{ruta, rama, principal}] de `git worktree list --porcelain`, la principal primero. */
export function worktrees(repo = '.') {
  const salida = git(['worktree', 'list', '--porcelain'], { repo }).stdout
  const lista = []
  for (const bloque of salida.replace(/\r/g, '').split('\n\n')) {
    const ruta = /^worktree (.+)$/m.exec(bloque)
    if (!ruta) continue
    const rama = /^branch refs\/heads\/(.+)$/m.exec(bloque)
    lista.push({ ruta: ruta[1], rama: rama ? rama[1] : '', principal: lista.length === 0 })
  }
  return lista
}

/** Los worktrees de Orca (`orca worktree ps --json`), o [] si Orca no está. */
export function orcaWorktrees(repo = '.') {
  const r = spawnSync('orca', ['worktree', 'ps', '--json'], { cwd: repo, encoding: 'utf8', timeout: 30000, shell: process.platform === 'win32', windowsHide: true })
  if (r.error || r.status !== 0) return []
  try {
    return JSON.parse(r.stdout)?.result?.worktrees ?? []
  } catch {
    return []
  }
}

export const misma = (a, b) => normal(a) === normal(b)
const normal = r => String(r).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** La rama local que corresponde a un nombre largo, corto o de carpeta; '' si no hay ninguna. */
export function resolverRama(nombre, repo = '.') {
  const ramas = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { repo }).stdout.split(/\s+/).filter(Boolean)
  if (ramas.includes(nombre)) return nombre
  const porCorto = ramas.filter(r => corto(r) === nombre)
  if (porCorto.length === 1) return porCorto[0]
  for (const w of worktrees(repo)) if (corto(w.ruta.replace(/\\/g, '/')) === nombre && w.rama) return w.rama
  return ''
}

// ---------------------------------------------------------------- ajustes del proyecto (.claude/equipo.json)

export const AJUSTES = '.claude/equipo.json'

export { mezclar, POR_DEFECTO }

/** Los ajustes de la copia en la que está `repo`, con los valores por defecto donde no diga nada. */
export function ajustes(repo = '.') {
  let propios = {}
  let r
  try {
    r = raiz(repo)
  } catch {
    r = repo
  }
  const ruta = join(r, AJUSTES)
  if (existsSync(ruta)) {
    try {
      propios = JSON.parse(readFileSync(ruta, 'utf8'))
    } catch (error) {
      throw new Error(`${AJUSTES} no es JSON válido: ${error.message}`)
    }
  }
  return mezclar(POR_DEFECTO, propios)
}

/** Los documentos en los que dos ramas que solo añaden líneas se unen solas: `unir` más los activos. */
export function documentosUnidos(a) {
  const lista = [...a.unir]
  if (a.decisiones.activo) lista.push(a.decisiones.documento)
  if (a.backlog.activo) lista.push(a.backlog.documento)
  return [...new Set(lista)]
}

/** Los archivos que llevan el driver de lo generado (merge=equipo-generado). */
export function generados(archivos, repo = '.') {
  if (archivos.length === 0) return []
  const salida = git(['check-attr', '--stdin', 'merge'], { repo, entrada: archivos.join('\n') + '\n' }).stdout
  return salida
    .split(/\r?\n/)
    .filter(l => l.endsWith(': merge: equipo-generado'))
    .map(l => l.slice(0, l.indexOf(': merge: ')))
}

/** Escribe en UTF-8 lo que se imprime (la consola de Windows no siempre lo está). */
export function imprimir(texto) {
  process.stdout.write(texto.endsWith('\n') ? texto : `${texto}\n`)
}

/** Opciones `--clave valor` y `--bandera` de la línea de órdenes; el resto, en `sueltos`. */
export function argumentos(argv, banderas = [], conValor = []) {
  const salida = { sueltos: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (banderas.includes(a)) salida[a.slice(2)] = true
    else if (conValor.includes(a)) salida[a.slice(2)] = argv[++i]
    else salida.sueltos.push(a)
  }
  return salida
}
