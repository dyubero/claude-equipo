// Bloques de decisiones reservados por rama: <.git común>/equipo/reservas.json, { "<rama>": [desde, hasta] }.
// Lo comparten la copia principal y todos los worktrees, y no va en ningún commit.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { git, gitComun } from './comun.mjs'

export const archivo = (repo = '.') => join(gitComun(repo), 'equipo', 'reservas.json')

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
  const ramas = new Set(git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { repo }).stdout.split(/\s+/).filter(Boolean))
  const vivas = {}
  for (const [rama, bloque] of Object.entries(datos ?? {})) {
    if (ramas.has(rama) && Array.isArray(bloque) && bloque.length === 2 && bloque.every(Number.isInteger)) vivas[rama] = bloque
  }
  return vivas
}

function escribir(repo, reservas) {
  const ruta = archivo(repo)
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, `${JSON.stringify(reservas, null, 2)}\n`)
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
