// Los ajustes para el mod: los valores por defecto (los mismos que usan los scripts: scripts/por-defecto.mjs), encima
// los del usuario (~/.claude/equipo.json) y encima los del proyecto (.claude/equipo.json de la copia). La lectura de
// los archivos la hace register.tsx.

import type { Ajustes } from '../scripts/por-defecto.mjs'
import { comprobar, mezclar, POR_DEFECTO } from '../scripts/por-defecto.mjs'

export type { Ajustes }

export const ARCHIVO = '.claude/equipo.json'

/** Lo que dice un archivo de ajustes; si no está (null) o no es JSON, nada. */
function leer(texto: unknown): unknown {
  if (typeof texto !== 'string') return {}
  try {
    return JSON.parse(texto) as unknown
  } catch {
    return {}
  }
}

/** Los ajustes a partir del texto de los dos archivos (el del proyecto y, si lo hay, el del usuario). */
export function ajustesDeTexto(proyecto: unknown, usuario: unknown = null): Ajustes {
  return mezclar(POR_DEFECTO, leer(usuario), leer(proyecto))
}

/** Lo que está mal en un archivo de ajustes: una línea por problema. */
export function problemasDeTexto(texto: string): string[] {
  try {
    return comprobar(JSON.parse(texto) as unknown)
  } catch (error) {
    return [`no es JSON válido: ${String(error instanceof Error ? error.message : error).slice(0, 120)}`]
  }
}
