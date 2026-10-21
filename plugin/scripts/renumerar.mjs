// Renumera en la rama principal los códigos del backlog que traen el nombre de su rama delante (solo con
// «backlog.activo» en .claude/equipo.json).
//
//   node renumerar.mjs                      # lista los que quedan (cualquier prefijo) y lo que haría
//   node renumerar.mjs --aplicar [corto …]  # los renumera, solo los de esas ramas si se dan
//   node renumerar.mjs --comprobar [corto]  # sale con 1 si quedan filas «| <corto>-T… |»
//
// En los worktrees, cada rama apunta sus tareas nuevas con su nombre delante («carrito-T1»), para que dos ramas no
// cojan el mismo número. Tras subirlas, «carrito-T1» pasa al siguiente número libre de su serie («T88»); un código sin
// letras («carrito-1») va a la serie T. Se renumeran por rama y por número, y se cambian también donde se citen: en
// cualquier archivo de texto del repositorio.
//
// El backlog es un documento Markdown con tablas cuya primera celda es el código: «| T12 | … |».

import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ajustes, argumentos, git, imprimir, raiz } from './comun.mjs'

// Primera celda de una fila: «| T12 |», «| ~~T12~~ |», «| ✅ T12 |»…
const PRIMERA = /^\|\s*([^|]*?)\s*\|/gm
const CON_PREFIJO = /(?<![\w/-])([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-([A-Z]*)(\d+)(?![\w-])/g
const SIN_PREFIJO = /(?<![\w-])([A-Z]+)(\d+)(?![\w-])/g

const celdas = texto => [...texto.matchAll(PRIMERA)].map(m => m[1])

/** [[código, prefijo, serie, número]] de las filas con prefijo de rama, en orden y sin repetir. */
export function conPrefijo(texto, prefijos = null) {
  const vistos = new Set()
  const lista = []
  for (const celda of celdas(texto)) {
    for (const m of celda.matchAll(CON_PREFIJO)) {
      const [codigo, prefijo, serie, numero] = [m[0], m[1], m[2] || 'T', Number(m[3])]
      if (prefijos && !prefijos.has(prefijo)) continue
      if (!vistos.has(codigo)) {
        vistos.add(codigo)
        lista.push([codigo, prefijo, serie, numero])
      }
    }
  }
  return lista
}

/** Mayor número de cada serie en la primera celda de las filas. */
export function mayores(texto) {
  const mayor = {}
  for (const celda of celdas(texto)) {
    if (new RegExp(CON_PREFIJO.source).test(celda)) continue
    for (const m of celda.matchAll(SIN_PREFIJO)) mayor[m[1]] = Math.max(mayor[m[1]] ?? 0, Number(m[2]))
  }
  return mayor
}

/** {código viejo: código nuevo}. */
export function plan(texto, prefijos = null) {
  const mayor = mayores(texto)
  const cambios = {}
  const orden = conPrefijo(texto, prefijos).sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : a[3] - b[3]))
  for (const [codigo, , serie] of orden) {
    mayor[serie] = (mayor[serie] ?? 0) + 1
    cambios[codigo] = `${serie}${mayor[serie]}`
  }
  return cambios
}

const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function sustituir(texto, cambios) {
  const claves = Object.keys(cambios).sort((a, b) => b.length - a.length)
  if (claves.length === 0) return texto
  const patron = new RegExp(`(?<![\\w/-])(${claves.map(escapar).join('|')})(?![\\w-])`, 'g')
  return texto.replace(patron, c => cambios[c])
}

/** Cambia los códigos en todos los archivos de texto del repositorio que los citan. Devuelve los archivos. */
export function aplicar(cambios, repo = '.') {
  const codigos = Object.keys(cambios)
  if (codigos.length === 0) return []
  const args = ['grep', '-l', '-I', '-F']
  for (const c of codigos) args.push('-e', c)
  const top = raiz(repo)
  const tocados = []
  for (const ruta of git(args, { repo: top, ok: [0, 1] }).stdout.split(/\r?\n/).filter(Boolean)) {
    const p = join(top, ruta)
    const viejo = readFileSync(p, 'utf8')
    const nuevo = sustituir(viejo, cambios)
    if (nuevo !== viejo) {
      writeFileSync(p, nuevo)
      tocados.push(ruta)
    }
  }
  return tocados
}

export function main(argv) {
  const a = argumentos(argv, ['--aplicar', '--comprobar'], ['--repo'])
  const repo = a.repo ?? '.'
  const aj = ajustes(repo)
  if (!aj.backlog.activo) {
    imprimir('La renumeración del backlog está apagada (backlog.activo en .claude/equipo.json): no hay nada que hacer.')
    return 0
  }
  const prefijos = a.sueltos.length > 0 ? new Set(a.sueltos.map(r => r.split('/').pop())) : null
  const texto = readFileSync(join(raiz(repo), aj.backlog.documento), 'utf8')
  const quedan = conPrefijo(texto, prefijos)
  if (a.comprobar) {
    if (quedan.length > 0) {
      imprimir(`Quedan sin renumerar: ${quedan.map(c => c[0]).join(', ')}`)
      return 1
    }
    imprimir(`No queda ningún código con prefijo de rama en ${aj.backlog.documento}.`)
    return 0
  }
  const cambios = plan(texto, prefijos)
  if (Object.keys(cambios).length === 0) {
    imprimir('No hay códigos con prefijo de rama que renumerar.')
    return 0
  }
  imprimir(Object.entries(cambios).map(([v, n]) => `${v} → ${n}`).join('\n'))
  if (a.aplicar) imprimir(`Archivos cambiados: ${aplicar(cambios, repo).join(', ')}`)
  else imprimir('(sin --aplicar no se cambia nada)')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
