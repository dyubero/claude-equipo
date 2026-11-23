// Siguiente bloque libre de decisiones numeradas (solo con «decisiones.activo» en .claude/equipo.json).
//
//   node bloque.mjs [--json] [--repo <dir>]                # el siguiente bloque libre
//   node bloque.mjs --reservar <rama> [--json] [--repo <dir>]  # lo reserva para esa rama (o dice el que ya tiene)
//
// Mira el mayor encabezado «### <prefijo><n>» del documento de diseño en todas las ramas locales (lo confirmado) y en
// todas las copias abiertas (lo que aún no tienen confirmado), y el mayor bloque ya reservado. El bloque siguiente
// empieza justo después y tiene «decisiones.bloque» números.
//
// Las reservas se guardan en <.git común>/equipo/reservas.json (reservas.mjs). Con Orca se copian además al comentario
// del worktree, para que se vean allí, y se siguen leyendo los comentarios de los worktrees abiertos antes de que
// existiera ese archivo.

import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ajustes, argumentos, git, imprimir, misma, orcaWorktrees, resolverRama, worktrees } from './comun.mjs'
import * as conOrca from './gestores/orca.mjs'
import { enPath } from './lanzadores.mjs'
import * as reservas from './reservas.mjs'

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
  const reservado = Math.max(mayorReservado(vivos.map(w => w.comment ?? ''), prefijo), 0, ...Object.values(reservas.leer(repo)).map(b => b[1]))
  const mayor = Math.max(reservado, 0, ...Object.values(fuentes))
  const de = reservado === mayor && reservado > 0 ? 'un bloque reservado' : (Object.entries(fuentes).find(([, v]) => v === mayor)?.[0] ?? '')
  const inicio = mayor + 1
  const fin = mayor + Math.max(1, Number(tamaño) || 10)
  return { inicio, fin, bloque: `${prefijo}${inicio}-${prefijo}${fin}`, mayor, de }
}

/**
 * Reserva el siguiente bloque para una rama. Si ya tiene uno, lo devuelve sin cambiar nada (`yaTenia`).
 * Devuelve { rama, bloque, inicio, fin, yaTenia } o { error }.
 */
export function reservar(nombre, repo = '.', { orca = null, comentar = null } = {}) {
  const { prefijo } = ajustes(repo).decisiones
  const rama = resolverRama(nombre, repo)
  if (rama === '') return { error: `no hay ninguna rama «${nombre}»` }
  const tiene = reservas.leer(repo)[rama]
  if (tiene) return { rama, bloque: reservas.texto(tiene, prefijo), inicio: tiene[0], fin: tiene[1], yaTenia: true }
  const copia = worktrees(repo).find(w => w.rama === rama)
  // Un bloque apuntado solo en el comentario de Orca (de antes de reservas.json) también cuenta.
  const deOrca = orca ?? orcaWorktrees(repo)
  const viejo = copia ? deOrca.find(w => !w.isArchived && String(w.path ?? '').replace(/\\/g, '/') === copia.ruta.replace(/\\/g, '/')) : undefined
  const m = new RegExp(`${escapar(prefijo)}(\\d+)\\s*[-–]\\s*(?:${escapar(prefijo)})?(\\d+)`).exec(viejo?.comment ?? '')
  if (m) {
    reservas.guardar(repo, rama, [Number(m[1]), Number(m[2])])
    return { rama, bloque: `${prefijo}${m[1]}-${prefijo}${m[2]}`, inicio: Number(m[1]), fin: Number(m[2]), yaTenia: true }
  }
  const s = siguiente(repo, deOrca)
  reservas.guardar(repo, rama, [s.inicio, s.fin])
  // En Orca, además, en el comentario del worktree: solo para que se vea allí.
  if (copia && !copia.principal) {
    const apuntar = comentar ?? (enPath('orca') ? texto => conOrca.comentar({ principal: worktrees(repo)[0].ruta, ruta: copia.ruta, texto }) : null)
    if (apuntar) apuntar(s.bloque)
  }
  return { rama, bloque: s.bloque, inicio: s.inicio, fin: s.fin, yaTenia: false }
}

export function main(argv) {
  const a = argumentos(argv, ['--json'], ['--repo', '--reservar'])
  const repo = a.repo ?? '.'
  if (!ajustes(repo).decisiones.activo) {
    imprimir(a.json ? JSON.stringify({ apagado: true }) : 'Las decisiones numeradas están apagadas (decisiones.activo en .claude/equipo.json): no hay bloques que reservar.')
    return 0
  }
  if (a.reservar) {
    const hecho = reservar(a.reservar, repo)
    imprimir(a.json ? JSON.stringify(hecho) : hecho.error ? `No he podido reservar: ${hecho.error}` : `${hecho.yaTenia ? 'Ya tenía' : 'Reservado'} ${hecho.bloque} para ${hecho.rama}`)
    return hecho.error ? 1 : 0
  }
  const r = siguiente(repo)
  imprimir(a.json ? JSON.stringify(r) : `Siguiente bloque libre: ${r.bloque} (mayor ${r.mayor}, de ${r.de || 'ningún sitio'})`)
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
