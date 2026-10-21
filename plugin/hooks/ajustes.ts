// Los ajustes del proyecto (.claude/equipo.json de la copia) para el mod. Los valores por defecto son los mismos que
// usan los scripts (scripts/por-defecto.mjs). La lectura del archivo la hace register.tsx.

import type { Ajustes } from '../scripts/por-defecto.mjs'
import { mezclar, POR_DEFECTO } from '../scripts/por-defecto.mjs'

export type { Ajustes }

export const ARCHIVO = '.claude/equipo.json'

/** Los ajustes a partir del texto del archivo; si no está (null) o no es JSON, valen los de por defecto. */
export function ajustesDeTexto(texto: unknown): Ajustes {
  if (typeof texto !== 'string') return mezclar(POR_DEFECTO, {})
  try {
    return mezclar(POR_DEFECTO, JSON.parse(texto) as unknown)
  } catch {
    return mezclar(POR_DEFECTO, {})
  }
}
