// Drivers de fusión de git para lo que más choca al subir varias ramas a la vez.
//
// Git los llama en cualquier fusión: `git merge` en la principal o en un worktree, y `git merge-tree` en el ensayo de
// las subidas (ensayo.mjs). Si no están instalados, git fusiona como siempre.
//
//   node fusion.mjs docs <O> <A> <B> [<marcas> [<ruta>]]   # documentos de la lista «unir» (y decisiones y backlog)
//   node fusion.mjs generado <O> <A> <B>                   # archivos de la lista «generados»
//   node fusion.mjs instalar [--comprobar] [--repo <dir>]  # apunta los drivers y los atributos en el .git común
//   node fusion.mjs desinstalar [--repo <dir>]             # los quita (git vuelve a fusionar como siempre)
//
// - docs: si en todos los choques los dos lados solo añaden líneas sobre la misma base (dos ramas que añaden
//   decisiones o tareas al final), conserva las dos: primero lo de la copia actual y después lo que llega. Si algún
//   choque cambia o borra líneas de la base, es un choque de verdad: deja las marcas y sale con 1.
// - generado: se queda con lo de la copia actual. Tras subir el lote se rehace con `comandos.regenerar`.
// - instalar: copia este archivo a <.git común>/equipo/fusion.mjs (así no depende de dónde esté el plugin), apunta los
//   dos drivers en la configuración común de git y escribe en <.git común>/info/attributes los archivos de
//   .claude/equipo.json. Nada de eso va al repositorio, y lo comparten todos los worktrees.
//
// Este archivo no importa nada del plugin: se copia solo.

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const DRIVERS = {
  'equipo-docs': ['equipo: une lo que dos ramas añaden a un documento', 'docs %O %A %B %L %P'],
  'equipo-generado': ['equipo: lo generado se queda como en la copia actual', 'generado %O %A %B'],
}

const INICIO = '# >>> equipo: lo escribe «fusion.mjs instalar» desde .claude/equipo.json; no lo edites'
const FIN = '# <<< equipo'

/** Parte la salida de `git merge-file --diff3` en trozos: ['igual', líneas] o ['choque', nuestras, base, suyas]. */
function bloques(lineas, marcas) {
  const abre = '<'.repeat(marcas)
  const base = '|'.repeat(marcas)
  const sep = '='.repeat(marcas)
  const cierra = '>'.repeat(marcas)
  const trozos = []
  let i = 0
  while (i < lineas.length) {
    if (!lineas[i].startsWith(abre)) {
      trozos.push(['igual', [lineas[i]]])
      i++
      continue
    }
    const partes = { nuestras: [], base: [], suyas: [] }
    let actual = 'nuestras'
    i++
    while (i < lineas.length && !lineas[i].startsWith(cierra)) {
      const linea = lineas[i]
      if (linea.startsWith(base) && actual === 'nuestras') actual = 'base'
      else if (linea.replace(/\r?\n$/, '') === sep && (actual === 'nuestras' || actual === 'base')) actual = 'suyas'
      else partes[actual].push(linea)
      i++
    }
    i++ // la línea >>>>>>>
    trozos.push(['choque', partes.nuestras, partes.base, partes.suyas])
  }
  return trozos
}

/** El texto unido si todos los choques son de solo añadir (base vacía); null si alguno es de verdad. */
export function unirAñadidos(textoDiff3, marcas = 7) {
  const lineas = textoDiff3.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const salida = []
  for (const trozo of bloques(lineas, marcas)) {
    if (trozo[0] === 'igual') {
      salida.push(...trozo[1])
      continue
    }
    const [, nuestras, base, suyas] = trozo
    if (base.some(l => l.trim() !== '')) return null
    salida.push(...nuestras)
    if (suyas.join('') !== nuestras.join('')) {
      if (salida.length > 0 && !salida[salida.length - 1].endsWith('\n')) salida[salida.length - 1] += '\n'
      salida.push(...suyas)
    }
  }
  return salida.join('')
}

function mergeFile(actual, base, otra, marcas, ruta, diff3) {
  const orden = ['merge-file', `--marker-size=${marcas}`, '-L', ruta || 'actual', '-L', 'base', '-L', 'suya', '-p']
  if (diff3) orden.push('--diff3')
  orden.push(actual, base, otra)
  return spawnSync('git', orden, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true })
}

export function docs(base, actual, otra, marcas = '7', ruta = '') {
  const n = Number(marcas) || 7
  // Primero la fusión normal: si no choca, ya está.
  const normal = mergeFile(actual, base, otra, n, ruta, false)
  if (normal.error || normal.status === null || normal.status < 0) return 2
  if (normal.status === 0) {
    writeFileSync(actual, normal.stdout)
    return 0
  }
  const unido = unirAñadidos(mergeFile(actual, base, otra, n, ruta, true).stdout, n)
  if (unido !== null) {
    writeFileSync(actual, unido)
    return 0
  }
  // Choque de verdad: las marcas de siempre en el archivo, y git lo deja como conflicto.
  writeFileSync(actual, normal.stdout)
  return 1
}

export const generado = () => 0 // se queda lo de la copia actual (%A sin tocar)

function gitEn(repo, args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true })
  return { status: r.status, stdout: (r.stdout ?? '').trim() }
}

/** El directorio .git común a la principal y a todos sus worktrees. */
export function gitComun(repo = '.') {
  const r = gitEn(repo, ['rev-parse', '--git-common-dir'])
  if (r.status !== 0) throw new Error('no es un repositorio de git')
  return isAbsolute(r.stdout) ? r.stdout : resolve(repo, r.stdout)
}

/** Las líneas de atributos para `unir` y `generados` de los ajustes. */
export function lineasDeAtributos(ajustes) {
  const unir = [...(ajustes.unir ?? [])]
  if (ajustes.decisiones?.activo) unir.push(ajustes.decisiones.documento ?? 'DESIGN.md')
  if (ajustes.backlog?.activo) unir.push(ajustes.backlog.documento ?? 'BACKLOG.md')
  return [...[...new Set(unir)].map(p => `${p} merge=equipo-docs`), ...(ajustes.generados ?? []).map(p => `${p} merge=equipo-generado`)]
}

/** El archivo de atributos con el bloque del equipo puesto al día (lo demás, como estaba). */
export function conBloque(texto, lineas) {
  const limpio = texto.replace(/\r\n/g, '\n')
  const i = limpio.indexOf(INICIO)
  const j = limpio.indexOf(FIN, i)
  const fuera = i >= 0 && j >= 0 ? limpio.slice(0, i) + limpio.slice(j + FIN.length).replace(/^\n/, '') : limpio
  const bloque = lineas.length > 0 ? `${INICIO}\n${lineas.join('\n')}\n${FIN}\n` : ''
  const resto = fuera.replace(/\n*$/, fuera.trim() === '' ? '' : '\n')
  return resto + bloque
}

function leerAjustes(repo) {
  const top = gitEn(repo, ['rev-parse', '--show-toplevel']).stdout || repo
  const ruta = join(top, '.claude', 'equipo.json')
  if (!existsSync(ruta)) return {}
  return JSON.parse(readFileSync(ruta, 'utf8'))
}

export const ordenDriver = (script, args) => `node "${script.replace(/\\/g, '/')}" ${args}`

/** Instala los drivers. Con `comprobar`, solo dice si están al día (0) o no (1). */
export function instalar({ repo = '.', comprobar = false } = {}) {
  const comun = gitComun(repo)
  const destino = join(comun, 'equipo', 'fusion.mjs')
  const atributos = join(comun, 'info', 'attributes')
  const lineas = lineasDeAtributos(leerAjustes(repo))
  const faltan = []
  const propio = fileURLToPath(import.meta.url)
  if (!existsSync(destino) || readFileSync(destino, 'utf8') !== readFileSync(propio, 'utf8')) faltan.push('script')
  for (const [nombre, [, args]] of Object.entries(DRIVERS)) {
    if (gitEn(repo, ['config', '--get', `merge.${nombre}.driver`]).stdout !== ordenDriver(destino, args)) faltan.push(nombre)
  }
  const antes = existsSync(atributos) ? readFileSync(atributos, 'utf8') : ''
  const despues = conBloque(antes, lineas)
  if (despues !== antes.replace(/\r\n/g, '\n')) faltan.push('atributos')
  if (comprobar) return { codigo: faltan.length > 0 ? 1 : 0, texto: faltan.length > 0 ? `faltan: ${faltan.join(', ')}` : 'al día' }
  if (faltan.includes('script') && resolve(propio) !== resolve(destino)) {
    mkdirSync(join(comun, 'equipo'), { recursive: true })
    copyFileSync(propio, destino)
  }
  for (const [nombre, [descripcion, args]] of Object.entries(DRIVERS)) {
    gitEn(repo, ['config', `merge.${nombre}.name`, descripcion])
    gitEn(repo, ['config', `merge.${nombre}.driver`, ordenDriver(destino, args)])
  }
  if (faltan.includes('atributos')) {
    mkdirSync(join(comun, 'info'), { recursive: true })
    writeFileSync(atributos, despues)
  }
  const que = lineas.length > 0 ? lineas.join('; ') : 'ningún archivo en «unir» ni «generados»'
  return { codigo: 0, texto: `${faltan.length > 0 ? 'drivers instalados' : 'drivers ya al día'}: ${que}` }
}

/** Quita lo que puso `instalar`: el bloque de atributos, los drivers y la copia del script. */
export function desinstalar({ repo = '.' } = {}) {
  const comun = gitComun(repo)
  const atributos = join(comun, 'info', 'attributes')
  if (existsSync(atributos)) writeFileSync(atributos, conBloque(readFileSync(atributos, 'utf8'), []))
  for (const nombre of Object.keys(DRIVERS)) gitEn(repo, ['config', '--remove-section', `merge.${nombre}`])
  rmSync(join(comun, 'equipo'), { recursive: true, force: true })
  return { codigo: 0, texto: 'drivers quitados: git fusiona como siempre' }
}

export function main(argv) {
  const [orden, ...resto] = argv
  if (orden === 'instalar') {
    const i = resto.indexOf('--repo')
    const r = instalar({ repo: i >= 0 ? resto[i + 1] : '.', comprobar: resto.includes('--comprobar') })
    process.stdout.write(`${r.texto}\n`)
    return r.codigo
  }
  if (orden === 'desinstalar') {
    const i = resto.indexOf('--repo')
    const r = desinstalar({ repo: i >= 0 ? resto[i + 1] : '.' })
    process.stdout.write(`${r.texto}
`)
    return r.codigo
  }
  if (orden === 'docs' && resto.length >= 3) return docs(...resto.slice(0, 5))
  if (orden === 'generado' && resto.length >= 3) return generado()
  process.stdout.write('Uso: node fusion.mjs docs <O> <A> <B> [marcas [ruta]] | generado <O> <A> <B> | instalar [--comprobar] [--repo <dir>] | desinstalar [--repo <dir>]\n')
  return 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
