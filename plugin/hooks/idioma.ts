// El idioma de los textos del mod. Los catálogos están en ../textos (los comparten los scripts); aquí está el que vale
// ahora en la sesión, que se pone al día cada vez que se leen los ajustes (base.ts).

import type { T } from '../textos/indice.mjs'
import { textos } from '../textos/indice.mjs'

export type { T }

/** Español, sin cambios de los ajustes: lo que vale mientras no se han leído, y en las pruebas de lo que no usa `$`. */
export const ES: T = textos()

let actual: T = ES

/** El que escribe los textos en el idioma de la sesión. */
export const tr = (): T => actual

/** Pone el idioma y los textos cambiados de unos ajustes recién leídos, y devuelve el que escribe con ellos. */
export function ponerIdioma(a: { idioma: string; textos: Record<string, string> }): T {
  actual = textos(a.idioma, a.textos)
  return actual
}
