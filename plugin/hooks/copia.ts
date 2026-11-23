// Qué copia del repositorio es la de la sesión: su carpeta, si es un worktree, cuál es la copia principal (la primera
// línea de `git worktree list`) y su rama. La lectura del disco y de git la hace guardas.ts (solo allí se puede usar
// `$`); aquí se monta el resultado.

import { normalizar } from './rutas'

export type Copia = {
  /** Carpeta de la copia, normalizada (ver rutas.ts). */
  raiz: string
  /** La misma, tal como la da Claude Code. */
  raizOriginal: string
  esWorktree: boolean
  /** Copia principal, normalizada; igual a `raiz` en la principal. */
  principal: string
  principalOriginal: string
  /** Rama de la copia ('' si no se sabe). */
  rama: string
  home: string
  /** El sistema de archivos no distingue mayúsculas: las rutas se comparan en minúsculas. */
  plegar: boolean
}

/**
 * @param raizOriginal la raíz de la sesión
 * @param homeOriginal la carpeta del usuario
 * @param gitEsArchivo `.git` es un archivo (worktree) y no una carpeta
 * @param porcelana la salida de `git worktree list --porcelain`, o '' si no se ha podido leer
 * @param ignoraMayusculas `core.ignorecase` de git (lo fija al clonar según el sistema de archivos); null si no se
 *   sabe: entonces se pliega solo con rutas de Windows (`C:`)
 */
export function montarCopia(
  raizOriginal: string,
  homeOriginal: string,
  gitEsArchivo: boolean,
  porcelana: string,
  ignoraMayusculas: boolean | null = null,
): Copia {
  const plegar = ignoraMayusculas ?? (/^[a-zA-Z]:/.test(raizOriginal) || /^[a-zA-Z]:/.test(homeOriginal))
  const home = normalizar(homeOriginal, null, '', plegar) ?? ''
  const raiz = normalizar(raizOriginal, null, home, plegar) ?? raizOriginal
  let principalOriginal = raizOriginal
  let rama = ''
  const bloques = porcelana.replace(/\r/g, '').split('\n\n')
  const primera = /^worktree (.+)$/m.exec(bloques[0] ?? '')
  if (primera) principalOriginal = primera[1] as string
  for (const bloque of bloques) {
    const ruta = /^worktree (.+)$/m.exec(bloque)
    if (ruta && normalizar(ruta[1] as string, null, home, plegar) === raiz) rama = /^branch refs\/heads\/(.+)$/m.exec(bloque)?.[1] ?? ''
  }
  return {
    raiz,
    raizOriginal,
    esWorktree: gitEsArchivo,
    principal: normalizar(principalOriginal, null, home, plegar) ?? raiz,
    principalOriginal,
    rama,
    home,
    plegar,
  }
}
