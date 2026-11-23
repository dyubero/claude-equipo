// Los ajustes del proyecto (.claude/equipo.json) con los valores por defecto donde no dicen nada.
//
//   node ajustes.mjs [--repo <dir>]          # los ajustes que valen en esta copia, en JSON
//   node ajustes.mjs --crear [--repo <dir>]  # crea .claude/equipo.json con los valores por defecto, si no existe

import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AJUSTES, ajustes, argumentos, imprimir, POR_DEFECTO, raiz } from './comun.mjs'

export function main(argv) {
  const a = argumentos(argv, ['--crear'], ['--repo'])
  const repo = a.repo ?? '.'
  if (a.crear) {
    const ruta = join(raiz(repo), AJUSTES)
    if (existsSync(ruta)) {
      imprimir(`${AJUSTES} ya existe: no lo toco.`)
      return 1
    }
    mkdirSync(dirname(ruta), { recursive: true })
    writeFileSync(ruta, `${JSON.stringify(POR_DEFECTO, null, 2)}\n`)
    imprimir(`Creado ${AJUSTES} con los valores por defecto.`)
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
