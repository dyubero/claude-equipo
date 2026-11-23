// Lo que comparten las piezas del plugin: el valor inicial del estado que guarda en la sesión, los ajustes que valen
// en ella, los scripts de Node del plugin y los mensajes a otras sesiones.

import type { EngineInterface } from 'claude-code'

import type { Contexto, PanelRamas, Subida } from '../types'
import type { Ajustes } from './ajustes'
import { ajustesDeTexto, ARCHIVO } from './ajustes'
import { ponerIdioma } from './idioma'

// ---------------------------------------------------------------- estado

// Tres valores, con las claves «contexto», «panel» y «subidas» del plugin. Cada archivo que los usa declara su `atom`
// (el motor de los mods lo exige para saber qué lee y escribe cada uno); con la misma clave es el mismo valor en todos.
export const CONTEXTO_INICIAL: Contexto = { tokens: null, ventana: 0, compactando: false, compactado: false }
export const PANEL_INICIAL: PanelRamas = { ramas: [], siguiente: '', leido: 0, error: '' }
export const SUBIDAS_INICIAL: Subida[] = []

// ---------------------------------------------------------------- ajustes

/** La carpeta del usuario, tal como la da el sistema ('' si no se sabe). */
export async function carpetaDeUsuario($: EngineInterface): Promise<string> {
  // $.env.get quiere el nombre escrito tal cual: así se sabe qué variables lee el plugin.
  const perfil = await $.env.get('USERPROFILE').catch(() => undefined)
  return perfil ?? (await $.env.get('HOME').catch(() => undefined)) ?? ''
}

/** Los ajustes que valen en una copia: los del usuario (~/.claude/equipo.json) y, encima, los de la copia. */
export async function leerAjustes($: EngineInterface, raiz: string): Promise<Ajustes> {
  const home = await carpetaDeUsuario($)
  const usuario = home ? await $.fs.read(`${home.replace(/\\/g, '/')}/${ARCHIVO}`).catch(() => null) : null
  return ajustesDeTexto(await $.fs.read(`${raiz}/${ARCHIVO}`).catch(() => null), usuario)
}

/** Los ajustes de la sesión. De paso deja puesto su idioma para los textos (idioma.ts). */
export async function ajustesDe($: EngineInterface): Promise<Ajustes> {
  const a = await leerAjustes($, await $.session.root())
  ponerIdioma(a)
  return a
}

export async function enPrincipal($: EngineInterface): Promise<boolean> {
  const raiz = await $.session.root()
  const git = await $.fs.stat(`${raiz}/.git`).catch(() => undefined)
  return git?.kind === 'dir'
}

// ---------------------------------------------------------------- scripts del plugin

/**
 * Carpeta de los scripts del plugin, con barras normales. Es una declaración `function`, como todo lo que recibe `$`
 * desde otro archivo: el motor de los mods solo sigue a `$` a través de un import si llega a una declaración.
 */
export function scripts($: EngineInterface): string {
  return `${$.plugin.root.replace(/\\/g, '/')}/scripts`
}

export type Salida = { exitCode: number; stdout: string; stderr: string }

/**
 * `node scripts/<nombre> …` en la raíz de la sesión, y el JSON de su última línea; null si no se ha podido lanzar o no
 * ha escrito JSON. No mira el código de salida: los scripts dicen en el JSON lo que ha pasado.
 */
export async function script($: EngineInterface, nombre: string, args: string[], timeoutMs: number): Promise<unknown> {
  const raiz = await $.session.root()
  const r = await $.process.run(['node', `${scripts($)}/${nombre}`, ...args], { cwd: raiz, timeoutMs }).catch(() => null)
  if (!r) return null
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as unknown
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- mensajes a otras sesiones

export async function avisar($: EngineInterface, sesion: string, texto: string): Promise<boolean> {
  if (!sesion) return false
  const r = await $.session.send({ to: sesion, text: texto }).catch(() => ({ isDelivered: false as const, reason: 'error' }))
  return r.isDelivered === true
}
