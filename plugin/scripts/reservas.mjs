// Bloques de decisiones reservados por rama: <.git común>/equipo/reservas.json, { "<rama>": [desde, hasta] }.
// Lo comparten la copia principal y todos los worktrees, y no va en ningún commit.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { gitComun, ramasLocales } from './comun.mjs'

export const archivo = (repo = '.') => join(gitComun(repo), 'equipo', 'reservas.json')

const dormir = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Ejecuta `fn` con el candado de las reservas echado: entre calcular el siguiente bloque y apuntarlo no puede colarse
 * otro proceso. El candado es una carpeta en el .git común; si lleva más de cinco minutos, es de un proceso que murió.
 */
export function conCandado(repo, fn, { esperaMs = 240000 } = {}) {
  const candado = `${archivo(repo)}.candado`
  mkdirSync(dirname(candado), { recursive: true })
  const limite = Date.now() + esperaMs
  for (;;) {
    try {
      mkdirSync(candado)
      break
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let edad = 0
      try {
        edad = Date.now() - statSync(candado).mtimeMs
      } catch {}
      if (edad > 300000) rmSync(candado, { recursive: true, force: true })
      else if (Date.now() > limite) throw new Error('otra reserva de bloque sigue en marcha: no he podido coger el candado de las reservas')
      else dormir(150)
    }
  }
  try {
    return fn()
  } finally {
    rmSync(candado, { recursive: true, force: true })
  }
}

/** Las reservas de las ramas que siguen existiendo (las de ramas borradas se olvidan). */
export function leer(repo = '.') {
  const ruta = archivo(repo)
  if (!existsSync(ruta)) return {}
  let datos
  try {
    datos = JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    return {}
  }
  const ramas = new Set(ramasLocales(repo))
  const vivas = {}
  for (const [rama, bloque] of Object.entries(datos ?? {})) {
    if (ramas.has(rama) && Array.isArray(bloque) && bloque.length === 2 && bloque.every(Number.isInteger)) vivas[rama] = bloque
  }
  return vivas
}

/** Escribe el archivo entero de una vez (a otro nombre y cambiándolo): nadie lo lee a medias. */
function escribir(repo, reservas) {
  const ruta = archivo(repo)
  mkdirSync(dirname(ruta), { recursive: true })
  const temporal = `${ruta}.${process.pid}.tmp`
  writeFileSync(temporal, `${JSON.stringify(reservas, null, 2)}\n`)
  renameSync(temporal, ruta)
}

export function guardar(repo, rama, bloque) {
  escribir(repo, { ...leer(repo), [rama]: bloque })
}

export function quitar(repo, rama) {
  const reservas = leer(repo)
  if (!(rama in reservas)) return
  delete reservas[rama]
  escribir(repo, reservas)
}

export const texto = (bloque, prefijo = 'D') => `${prefijo}${bloque[0]}-${prefijo}${bloque[1]}`
