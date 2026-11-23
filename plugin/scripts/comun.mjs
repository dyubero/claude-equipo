// Ayudas comunes de los scripts del equipo: git, ajustes del proyecto, nombres de rama y worktrees.
// Solo Node (18 o posterior) y git: sin dependencias.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join, resolve } from 'node:path'

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

/**
 * Ejecuta un programa que no es git (orca, un lanzador…) sin shell. En Windows sí pasa por la shell, que es la que
 * encuentra los `.cmd`, con cada argumento entre comillas.
 */
export function ejecutar(argv, { cwd = '.', timeout = 30000, env } = {}) {
  const [programa, ...args] = argv.map(String)
  const entorno = env ?? process.env
  const opciones = { cwd, encoding: 'utf8', timeout, windowsHide: true, env: entorno }
  if (process.platform !== 'win32') return spawnSync(programa, args, opciones)
  // Un .exe se lanza sin shell, con los argumentos tal cual. Solo los .cmd y .bat necesitan cmd.exe, y allí unas
  // comillas no protegen de `%VAR%` ni de otras comillas: un argumento que las lleve no se lanza.
  const ruta = /[\\/]/.test(programa) ? programa : rutaEnPath(programa, entorno, 'win32')
  if (ruta && /\.(exe|com)$/i.test(ruta)) return spawnSync(ruta, args, opciones)
  const malo = args.find(a => /["%]/.test(a))
  if (malo !== undefined) return { error: new Error(`no se puede pasar «${malo}» a ${programa} en Windows: lleva comillas dobles o %`), status: null, stdout: '', stderr: '' }
  // Una barra invertida justo antes de la comilla de cierre la escaparía: se dobla.
  const cita = a => `"${a.replace(/(\\+)$/, '$1$1')}"`
  return spawnSync([/\s/.test(programa) ? cita(programa) : programa, ...args.map(cita)].join(' '), { ...opciones, shell: true })
}

/** La ruta de `programa` en el PATH (con las extensiones de Windows si hace falta), o '' si no está. */
export function rutaEnPath(programa, env = process.env, plataforma = process.platform) {
  const extensiones = plataforma === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')] : ['']
  for (const carpeta of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of extensiones) if (existsSync(join(carpeta, programa + ext))) return join(carpeta, programa + ext)
  }
  return ''
}

/** Las ramas locales, con su nombre entero (aunque haya una etiqueta que se llame igual). */
export function ramasLocales(repo = '.') {
  return git(['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads'], { repo }).stdout.split(/\r?\n/).filter(Boolean)
}

/** El directorio .git común a la copia principal y a todos sus worktrees. */
export function gitComun(repo = '.') {
  const dicho = git(['rev-parse', '--git-common-dir'], { repo }).stdout.trim()
  return isAbsolute(dicho) ? dicho : resolve(repo, dicho)
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
  const r = ejecutar(['orca', 'worktree', 'ps', '--json'], { cwd: repo, timeout: 30000 })
  if (r.error || r.status !== 0) return []
  try {
    return JSON.parse(r.stdout)?.result?.worktrees ?? []
  } catch {
    return []
  }
}

/** Dos rutas son la misma carpeta. Las mayúsculas solo se ignoran donde el sistema de archivos suele ignorarlas. */
export const misma = (a, b) => normal(a) === normal(b)
const PLEGAR = process.platform === 'win32' || process.platform === 'darwin'
const normal = r => {
  // La ruta real, si existe: en Windows una carpeta puede venir con su nombre corto (RUNNER~1) y en macOS por un
  // enlace (/var y /private/var), y git da siempre la real.
  let real = String(r)
  try {
    real = realpathSync.native(real)
  } catch {}
  const ruta = real.replace(/\\/g, '/').replace(/\/+$/, '')
  return PLEGAR ? ruta.toLowerCase() : ruta
}

/** La rama local que corresponde a un nombre largo, corto o de carpeta; '' si no hay ninguna. */
export function resolverRama(nombre, repo = '.') {
  const ramas = ramasLocales(repo)
  if (ramas.includes(nombre)) return nombre
  const porCorto = ramas.filter(r => corto(r) === nombre)
  if (porCorto.length === 1) return porCorto[0]
  for (const w of worktrees(repo)) if (corto(w.ruta.replace(/\\/g, '/')) === nombre && w.rama) return w.rama
  return ''
}

// ---------------------------------------------------------------- ajustes (~/.claude/equipo.json y el del proyecto)

export const AJUSTES = '.claude/equipo.json'

export { mezclar, POR_DEFECTO }

/** El archivo de ajustes de la persona, para todos sus repositorios (EQUIPO_AJUSTES_USUARIO lo cambia: pruebas). */
export const ajustesDeUsuario = () => process.env.EQUIPO_AJUSTES_USUARIO || join(homedir(), AJUSTES)

function leerJson(ruta) {
  if (!existsSync(ruta)) return null
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch (error) {
    throw new Error(`${ruta} no es JSON válido: ${error.message}`)
  }
}

/** Los dos archivos de ajustes: { usuario, proyecto }, cada uno { ruta, datos } (`datos` es null si no existe). */
export function capas(repo = '.') {
  let r
  try {
    r = raiz(repo)
  } catch {
    r = repo
  }
  const usuario = ajustesDeUsuario()
  const proyecto = join(r, AJUSTES)
  return { usuario: { ruta: usuario, datos: leerJson(usuario) }, proyecto: { ruta: proyecto, datos: leerJson(proyecto) } }
}

/** Los ajustes que valen en la copia en la que está `repo`: por defecto, los del usuario y, encima, los del proyecto. */
export function ajustes(repo = '.') {
  const c = capas(repo)
  return mezclar(POR_DEFECTO, c.usuario.datos ?? {}, c.proyecto.datos ?? {})
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
