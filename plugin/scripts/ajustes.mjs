// Los ajustes que valen en una copia: los valores por defecto, encima los del usuario (~/.claude/equipo.json) y encima
// los del proyecto (.claude/equipo.json).
//
//   node ajustes.mjs [--repo <dir>]              # los ajustes que valen en esta copia, en JSON
//   node ajustes.mjs --origen [--repo <dir>]     # lo mismo, con el archivo del que sale cada valor
//   node ajustes.mjs --comprobar [--repo <dir>]  # claves que no existen, tipos equivocados, valores que no valen
//   node ajustes.mjs --crear [--repo <dir>]      # crea .claude/equipo.json con los valores por defecto, si no existe

import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AJUSTES, ajustes, argumentos, capas, imprimir, POR_DEFECTO, raiz } from './comun.mjs'
import { comprobar } from './por-defecto.mjs'

export const ESQUEMA = 'https://raw.githubusercontent.com/dyubero/claude-equipo/main/plugin/equipo.schema.json'

const esObjeto = x => typeof x === 'object' && x !== null && !Array.isArray(x)

/** El valor de «a.b.c» en un objeto, o undefined. */
const en = (objeto, ruta) => ruta.split('.').reduce((o, k) => (esObjeto(o) ? o[k] : undefined), objeto)

/** [{ clave, valor, origen }] de cada ajuste: 'proyecto', 'usuario' o 'por defecto'. */
export function origenes(repo = '.') {
  const c = capas(repo)
  const filas = []
  const recorrer = (objeto, ruta) => {
    for (const [clave, valor] of Object.entries(objeto)) {
      const donde = ruta ? `${ruta}.${clave}` : clave
      if (esObjeto(valor) && Object.keys(valor).length > 0) recorrer(valor, donde)
      else filas.push({ clave: donde, valor, origen: en(c.proyecto.datos, donde) !== undefined ? 'proyecto' : en(c.usuario.datos, donde) !== undefined ? 'usuario' : 'por defecto' })
    }
  }
  recorrer(ajustes(repo), '')
  return filas
}

/** Los problemas de cada archivo de ajustes que exista: [{ ruta, problemas }]. */
export function problemas(repo = '.') {
  const salida = []
  let c
  try {
    c = capas(repo)
  } catch (error) {
    return [{ ruta: '', problemas: [error.message] }]
  }
  for (const capa of [c.usuario, c.proyecto]) if (capa.datos !== null) salida.push({ ruta: capa.ruta, problemas: comprobar(capa.datos) })
  return salida
}

export function main(argv) {
  const a = argumentos(argv, ['--crear', '--origen', '--comprobar'], ['--repo'])
  const repo = a.repo ?? '.'
  if (a.crear) {
    const ruta = join(raiz(repo), AJUSTES)
    if (existsSync(ruta)) {
      imprimir(`${AJUSTES} ya existe: no lo toco.`)
      return 1
    }
    mkdirSync(dirname(ruta), { recursive: true })
    writeFileSync(ruta, `${JSON.stringify({ $schema: ESQUEMA, ...POR_DEFECTO }, null, 2)}\n`)
    imprimir(`Creado ${AJUSTES} con los valores por defecto.`)
    return 0
  }
  if (a.comprobar) {
    const archivos = problemas(repo)
    const malos = archivos.filter(x => x.problemas.length > 0)
    if (archivos.length === 0) imprimir('No hay ningún archivo de ajustes: valen los valores por defecto.')
    for (const x of archivos) imprimir(x.problemas.length === 0 ? `${x.ruta}: bien` : `${x.ruta}:\n${x.problemas.map(p => `  - ${p}`).join('\n')}`)
    return malos.length > 0 ? 1 : 0
  }
  if (a.origen) {
    imprimir(origenes(repo).map(f => `${f.clave} = ${JSON.stringify(f.valor)}  (${f.origen})`).join('\n'))
    return 0
  }
  imprimir(JSON.stringify(ajustes(repo), null, 2))
  return 0
}

// Se compara por la ruta real: con un enlace simbólico por medio (en macOS, /var es /private/var), node da a
// import.meta.url la ruta resuelta y a process.argv[1] la escrita, y sin esto el script acabaría sin hacer nada.
const real = ruta => {
  try {
    return realpathSync.native(ruta)
  } catch {
    return resolve(ruta)
  }
}
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1])) process.exitCode = main(process.argv.slice(2))
