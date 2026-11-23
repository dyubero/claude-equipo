// Tipos de indice.mjs, para el mod.

/** Escribe el texto de una clave con sus huecos puestos. */
export type T = (clave: string, datos?: Record<string, string | number>) => string

export declare const CATALOGOS: Readonly<Record<string, Readonly<Record<string, string>>>>
export declare function idiomaDe(idioma: unknown): string
export declare function huecos(plantilla: string): string[]
export declare function textos(idioma?: string, propios?: Record<string, string>): T
export declare function comprobarTextos(propios: unknown): string[]
