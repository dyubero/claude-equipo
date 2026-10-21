// Qué probar de una o varias ramas, según lo que tocan.
//
//   node pruebas.mjs <desde>..<hasta> …          # p. ej. f07df6c1^1..f07df6c1 (una fusión) o main..rama
//   node pruebas.mjs --json …
//
// Para cada rango da:
// - `tests`: los archivos de prueba que cambian (los que casan con «pruebas.patron») y los que nombran un archivo de
//   código que cambia (por su nombre sin extensión: «carrito.ts» → los tests que dicen «carrito»);
// - `generados`: si toca archivos de «generados», que hay que rehacer con «comandos.regenerar»;
// - `dependencias`: si cambia algún package.json (puede hacer falta instalar antes de probar).
// Y una orden conjunta: «comandos.probarArchivos» con los tests de todas las ramas, o «comandos.probar» si no hay
// plantilla o no ha salido ningún test. Siempre va antes «comandos.compilar».
//
// Es una propuesta: el aviso del agente («Probar:») manda, y se pasa una sola vez lo que se repita entre ramas.

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ajustes, argumentos, generados, git, imprimir } from './comun.mjs'

/** Nombres demasiado comunes para buscar quién los usa. */
const VACIOS = new Set(['index', 'main', 'app', 'utils', 'util', 'types', 'type', 'config', 'constants', 'helpers', 'helper', 'styles', 'style', 'mod', 'lib'])

const nombreBase = ruta => ruta.split('/').pop().replace(/\.(test|spec)(?=\.)/, '').replace(/\.[^.]+$/, '').replace(/\.d$/, '')

export function testsDe(archivos, patron, repo = '.') {
  const esTest = r => patron.test(r)
  const tests = new Set(archivos.filter(esTest))
  const nombres = new Set(
    archivos
      .filter(a => !esTest(a) && /\.[cm]?[jt]sx?$|\.vue$|\.svelte$/.test(a))
      .map(nombreBase)
      .filter(n => n.length >= 3 && !VACIOS.has(n.toLowerCase())),
  )
  if (nombres.size > 0) {
    const args = ['grep', '-l', '-w', '-F']
    for (const n of nombres) args.push('-e', n)
    const salida = git(args, { repo, ok: [0, 1] }).stdout
    for (const ruta of salida.split(/\r?\n/)) if (ruta && esTest(ruta)) tests.add(ruta)
  }
  return [...tests].sort()
}

export function analizar(rango, repo = '.', a = ajustes(repo)) {
  const archivos = git(['diff', '--name-only', rango], { repo }).stdout.split(/\r?\n/).filter(l => l.trim() !== '')
  const patron = new RegExp(a.pruebas.patron)
  return {
    rango,
    archivos: archivos.length,
    tests: testsDe(archivos, patron, repo),
    generados: generados(archivos, repo).length > 0,
    dependencias: archivos.some(r => /(^|\/)package\.json$/.test(r)),
  }
}

/** La orden de pruebas para todos los rangos juntos. */
export function orden(resultados, a) {
  const tests = [...new Set(resultados.flatMap(r => r.tests))].sort()
  const plantilla = a.comandos.probarArchivos ?? ''
  if (plantilla.includes('{archivos}') && tests.length > 0) return plantilla.replace('{archivos}', tests.join(' '))
  return a.comandos.probar ?? ''
}

export function texto(resultados, a) {
  const lineas = []
  for (const r of resultados) {
    lineas.push(`## ${r.rango} (${r.archivos} archivos)`)
    lineas.push(`- tests: ${r.tests.length > 0 ? r.tests.join(', ') : 'ninguno por nombre (los del aviso, o la tanda entera si no dice nada)'}`)
    if (r.generados) lineas.push(`- toca archivos generados: rehacerlos con ${a.comandos.regenerar ? `\`${a.comandos.regenerar}\`` : 'comandos.regenerar (no está puesto)'}`)
    if (r.dependencias) lineas.push('- cambia package.json: instala las dependencias antes de compilar')
  }
  if (a.comandos.compilar) lineas.push(`Compilar: ${a.comandos.compilar}`)
  lineas.push(`Probar: ${orden(resultados, a) || '(comandos.probar no está puesto)'}`)
  return lineas.join('\n')
}

export function main(argv) {
  const args = argumentos(argv, ['--json'], ['--repo'])
  const repo = args.repo ?? '.'
  if (args.sueltos.length === 0) {
    imprimir('Uso: node pruebas.mjs [--json] [--repo <dir>] <desde>..<hasta> …')
    return 2
  }
  const a = ajustes(repo)
  const resultados = args.sueltos.map(r => analizar(r, repo, a))
  imprimir(args.json ? JSON.stringify({ ramas: resultados, compilar: a.comandos.compilar, probar: orden(resultados, a) }) : texto(resultados, a))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
