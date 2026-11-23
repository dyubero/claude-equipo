// Gestor de worktrees con Orca: crea el worktree, abre la sesión del agente y la cierra. Además da lo que solo Orca
// sabe: el nombre que enseña, el estado de los agentes y la última actividad.

import { basename } from 'node:path'

import { ejecutar, misma, orcaWorktrees, worktrees } from '../comun.mjs'

export const nombre = 'orca'

const fallo = r => (r.error ? r.error.message : (r.stderr || r.stdout || `código ${r.status}`).trim().slice(0, 300))

/** Crea el worktree con su agente ya lanzado. Orca pone el prefijo de la rama (`usuario/<nombre>`). */
export function crear({ principal, corto, base, a, prompt }) {
  const antes = worktrees(principal)
  const repo = a.orca.repo || basename(principal)
  const r = ejecutar(
    ['orca', 'worktree', 'create', '--repo', `name:${repo}`, '--name', corto, '--no-parent', '--base-branch', base, '--agent', 'claude', '--prompt', prompt, '--json'],
    { cwd: principal, timeout: 180000 },
  )
  if (r.error || r.status !== 0) throw new Error(`orca worktree create ha fallado: ${fallo(r)}`)
  // La carpeta y la rama, de git: el worktree que antes no estaba.
  const nuevo = worktrees(principal).find(w => !antes.some(x => misma(x.ruta, w.ruta)))
  if (!nuevo) throw new Error('orca worktree create ha acabado bien, pero git no ve ningún worktree nuevo')
  return { ruta: nuevo.ruta, rama: nuevo.rama }
}

/** Orca ya ha abierto la sesión al crear. */
export const abrir = () => ({ lanzado: true, preajuste: 'orca', orden: 'orca worktree create --agent claude', motivo: '' })

export function cerrar({ principal, rama }) {
  const r = ejecutar(['orca', 'worktree', 'rm', '--worktree', `branch:${rama}`, '--force', '--json'], { cwd: principal, timeout: 120000 })
  return r.error || r.status !== 0 ? { cerrado: false, motivo: fallo(r) } : { cerrado: true, motivo: '' }
}

/** Apunta un texto en el comentario del worktree (solo para que se vea en Orca). No falla si no se puede. */
export function comentar({ principal, ruta, texto }) {
  ejecutar(['orca', 'worktree', 'set', '--worktree', `path:${ruta}`, '--comment', texto], { cwd: principal, timeout: 20000 })
}

/** [{ path, displayName, comment, agents, lastActivityAt, isArchived }] de `orca worktree ps --json`. */
export const datos = principal => orcaWorktrees(principal)
