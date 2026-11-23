// Gestor de worktrees con git a secas: `git worktree add` y `git worktree remove`. La sesión del agente la abre el
// lanzador (lanzadores.mjs), porque git no sabe abrir terminales.

import { existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'

import { git } from '../comun.mjs'
import { lanzar } from '../lanzadores.mjs'

export const nombre = 'git'

/** La carpeta del worktree: `worktrees.carpeta` con {repo} y {nombre}, desde la copia principal. */
export function carpetaDe(principal, plantilla, corto) {
  return resolve(principal, String(plantilla).replace(/\{repo\}/g, basename(principal)).replace(/\{nombre\}/g, corto))
}

/** Crea la rama y su worktree. No lanza nada todavía: el archivo del encargo tiene que estar antes en la carpeta. */
export function crear({ principal, corto, base, a }) {
  const rama = `${a.worktrees.prefijoRama}${corto}`
  const ruta = carpetaDe(principal, a.worktrees.carpeta, corto)
  if (existsSync(ruta)) throw new Error(`la carpeta ${ruta} ya existe`)
  git(['worktree', 'add', '-q', '-b', rama, ruta, base], { repo: principal })
  return { ruta, rama }
}

/** Abre la sesión del agente en el worktree recién creado. */
export function abrir({ ruta, corto, prompt, a, entorno }) {
  return lanzar(a.lanzar, { ruta, nombre: corto, prompt }, { entorno })
}

/** Quita el worktree. `--force` hace falta por lo que git ignora (dependencias, compilados); lo que no está confirmado
 *  lo mira antes worktree.mjs. */
export function cerrar({ principal, ruta }) {
  const r = git(['worktree', 'remove', '--force', ruta], { repo: principal, ok: [0, 1, 128, 255] })
  return r.status === 0 ? { cerrado: true, motivo: '' } : { cerrado: false, motivo: (r.stderr || r.stdout).trim().slice(0, 300) }
}

/** git no sabe nada de agentes ni de comentarios. */
export const datos = () => []
