// Freno a las fusiones en la principal. Desde un worktree, una orden que fusiona en la copia principal
// (`git -C <principal> merge …`, `cd <principal> && git merge …`, también `pull`) se niega: las ramas las sube el
// usuario desde la sesión principal (franja de subidas). En la copia principal no se frena nada.

import type { Copia } from './copia'
import { llamadasGit } from './shell'

export type Fusion = {
  /** Rama que se sube ('' si no se sabe). */
  rama: string
  /** La carpeta no se ha podido saber (una variable): puede que sea la principal. */
  dudosa: boolean
}

const SALIDAS = new Set(['--abort', '--quit'])
const OPCIONES_CON_VALOR = new Set(['-m', '-F', '-s', '-X', '--strategy', '--strategy-option', '--file', '--into-name'])

/** La fusión en la copia principal que lanza la orden, o null si no lanza ninguna. */
export function fusionEnPrincipal(orden: string, carpeta: string, c: Copia): Fusion | null {
  if (!c.esWorktree) return null
  for (const git of llamadasGit(orden, carpeta, c.home)) {
    if (git.orden !== 'merge' && git.orden !== 'pull') continue
    if (git.args.some(a => SALIDAS.has(a))) continue
    if (git.carpeta !== null && git.carpeta !== c.principal) continue
    return { rama: ramaDe(git.orden, git.args) || c.rama, dudosa: git.carpeta === null }
  }
  return null
}

function ramaDe(orden: string, args: string[]): string {
  const sueltos: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string
    if (OPCIONES_CON_VALOR.has(a)) {
      i++
      continue
    }
    if (a.startsWith('-') || a.startsWith('__HEREDOC_')) continue
    sueltos.push(a)
  }
  // `git merge <rama>`; `git pull <remoto> <rama>`.
  return (orden === 'pull' ? sueltos[sueltos.length - 1] : sueltos[0]) ?? ''
}

export function negativa(f: Fusion, principal = 'main'): string {
  const rama = f.rama || '<tu-rama>'
  const duda = f.dudosa ? ' (no sé qué carpeta es esa, y podría ser la copia principal)' : ''
  return (
    `equipo: desde un worktree no se fusiona en la copia principal${duda}. Las ramas las sube el usuario desde la ` +
    `sesión principal. Sigue la skill equipo:lista-para-subir: haz commit, trae la rama principal (\`git merge ${principal}\`) y ` +
    `avisa a la sesión principal con SendMessage: «La rama ${rama} está lista para subir (<commit>)», con las líneas ` +
    '«Sesión:», «Resumen:» y, si hay algo, «Por revisar:». Después espera. No lo intentes de otra forma.'
  )
}
