// Siguiente bloque libre de decisiones numeradas (solo con «decisiones.activo» en .claude/equipo.json).
//
//   node bloque.mjs [--json] [--repo <dir>]
//
// Mira el mayor encabezado «### <prefijo><n>» del documento de diseño en todas las ramas locales (lo confirmado) y en
// todas las copias abiertas (lo que aún no tienen confirmado), y el mayor bloque reservado en los comentarios de Orca de
// los worktrees vivos («D40-D49»). El bloque siguiente empieza justo después y tiene «decisiones.bloque» números.

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ajustes, argumentos, git, imprimir, orcaWorktrees, worktrees } from './comun.mjs'

const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function mayorDecision(texto, prefijo = 'D') {
  const patron = new RegExp(`^#{1,6}\\s+${escapar(prefijo)}(\\d+)\\b`, 'gm')
  let mayor = 0
  for (const m of texto.matchAll(patron)) mayor = Math.max(mayor, Number(m[1]))
  return mayor
}

export function mayorReservado(comentarios, prefijo = 'D') {
  const p = escapar(prefijo)
  const patron = new RegExp(`${p}(\\d+)\\s*[-–]\\s*(?:${p})?(\\d+)`, 'g')
  let mayor = 0
  for (const c of comentarios) for (const m of String(c ?? '').matchAll(patron)) mayor = Math.max(mayor, Number(m[2]))
  return mayor
}

export function siguiente(repo = '.', orca = null) {
  const a = ajustes(repo)
  const { documento, prefijo, bloque: tamaño } = a.decisiones
  const fuentes = {}
  for (const rama of git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { repo }).stdout.split(/\s+/).filter(Boolean)) {
    const r = git(['show', `${rama}:${documento}`], { repo, ok: [0, 128] })
    if (r.status === 0) fuentes[`rama ${rama}`] = mayorDecision(r.stdout, prefijo)
  }
  for (const w of worktrees(repo)) {
    const p = join(w.ruta, documento)
    if (existsSync(p)) fuentes[`copia ${w.ruta.replace(/\\/g, '/').split('/').pop()}`] = mayorDecision(readFileSync(p, 'utf8'), prefijo)
  }
  const vivos = (orca ?? orcaWorktrees(repo)).filter(w => !w.isArchived)
  const reservado = mayorReservado(vivos.map(w => w.comment ?? ''), prefijo)
  const mayor = Math.max(reservado, 0, ...Object.values(fuentes))
  const de = reservado === mayor && reservado > 0 ? 'un bloque reservado en Orca' : (Object.entries(fuentes).find(([, v]) => v === mayor)?.[0] ?? '')
  const inicio = mayor + 1
  const fin = mayor + Math.max(1, Number(tamaño) || 10)
  return { inicio, fin, bloque: `${prefijo}${inicio}-${prefijo}${fin}`, mayor, de }
}

export function main(argv) {
  const a = argumentos(argv, ['--json'], ['--repo'])
  const repo = a.repo ?? '.'
  if (!ajustes(repo).decisiones.activo) {
    imprimir(a.json ? JSON.stringify({ apagado: true }) : 'Las decisiones numeradas están apagadas (decisiones.activo en .claude/equipo.json): no hay bloques que reservar.')
    return 0
  }
  const r = siguiente(repo)
  imprimir(a.json ? JSON.stringify(r) : `Siguiente bloque libre: ${r.bloque} (mayor ${r.mayor}, de ${r.de || 'ningún sitio'})`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
