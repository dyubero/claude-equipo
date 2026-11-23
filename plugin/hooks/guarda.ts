// La guarda de las órdenes de git que lanza Claude (Bash y PowerShell): el freno a las fusiones en la principal desde
// un worktree (fusiones.ts) y la guarda de los commits (commits.ts). Aquí está lo que lee de la sesión.

import type { EngineInterface } from 'claude-code'

import { leerAjustes } from './base'
import type { Modo } from './commits'
import { juzgar, motivoProhibido, prohibidosConCambios } from './commits'
import type { Copia } from './copia'
import { montarCopia } from './copia'
import { fusionEnPrincipal, negativa } from './fusiones'
import { normalizar } from './rutas'
import { llamadasGit } from './shell'

/** Qué guardas están encendidas en /config. */
export type Activas = { fusiones: boolean; commits: boolean }

/** Lo que dice la guarda de una orden: el motivo por el que se niega, o null si pasa. */
export async function guardar($: EngineInterface, orden: string, activas: Activas): Promise<string | null> {
  const c = await copia($)
  const carpeta = await carpetaActual($, c)

  if (activas.fusiones) {
    const fusion = fusionEnPrincipal(orden, carpeta, c)
    if (fusion) {
      const { ramaPrincipal } = await leerAjustes($, c.raizOriginal)
      return negativa(fusion, ramaPrincipal)
    }
  }

  if (activas.commits) {
    const { prohibidos, guardas } = await leerAjustes($, c.raizOriginal)
    for (const git of llamadasGit(orden, carpeta, c.home, c.plegar)) {
      const juicio = juzgar(git, c, prohibidos, guardas.barridos)
      if (juicio.tipo === 'niega') return `equipo: ${juicio.motivo}`
      if (juicio.tipo === 'mirar') {
        // Las rutas normalizadas pueden ir en minúsculas: git, con la ruta tal como es.
        const carpetaGit = juicio.copia === c.raiz ? c.raizOriginal : juicio.copia === c.principal ? c.principalOriginal : juicio.copia
        const entran = await prohibidosQueEntran($, carpetaGit, juicio.modo, prohibidos)
        if (entran.length > 0) return `equipo: ${motivoProhibido(entran.join(', '))}`
      }
    }
  }
  return null
}

const copias = new Map<string, Copia>()

/** La copia de la sesión (se lee una vez por raíz). */
export async function copia($: EngineInterface): Promise<Copia> {
  const raiz = await $.session.root()
  const guardada = copias.get(raiz)
  if (guardada) return guardada
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const git = await $.fs.stat(`${raiz}/.git`).catch(() => undefined)
  const lista = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: raiz, timeoutMs: 10000 }).catch(() => undefined)
  // git fija core.ignorecase al clonar según el sistema de archivos: dice si las rutas se comparan sin mayúsculas.
  const ignora = await $.process.run(['git', 'config', '--get', 'core.ignorecase'], { cwd: raiz, timeoutMs: 10000 }).catch(() => undefined)
  const dicho = ignora && ignora.exitCode === 0 ? ignora.stdout.trim() : ''
  const ignoraMayusculas = dicho === 'true' ? true : dicho === 'false' ? false : null
  const leida = montarCopia(raiz, home, git?.kind === 'file', lista && lista.exitCode === 0 ? lista.stdout : '', ignoraMayusculas)
  copias.set(raiz, leida)
  return leida
}

/** Carpeta de la sesión ahora mismo, normalizada. */
export async function carpetaActual($: EngineInterface, c: Copia): Promise<string> {
  return normalizar(await $.session.cwd(), null, c.home, c.plegar) ?? c.raiz
}

export async function prohibidosQueEntran($: EngineInterface, carpeta: string, modo: Modo, prohibidos: readonly string[]): Promise<string[]> {
  if (prohibidos.length === 0) return []
  const estado = await $.process
    .run(['git', '-C', carpeta, 'status', '--porcelain', '--untracked-files=all', '--', ...prohibidos], { timeoutMs: 15000 })
    .catch(() => undefined)
  return estado && estado.exitCode === 0 ? prohibidosConCambios(estado.stdout, modo) : []
}
