// Estado de todas las ramas del equipo y con qué chocarían al subir. Solo lee: no toca ninguna copia.
//
//   node estado.mjs [--json] [--sin-ensayo] [--repo <dir>] [--base <rama>]
//
// Para cada worktree: su bloque de decisiones reservado, el estado de su agente (si hay Orca), commits por delante y por detrás de la
// rama principal, cambios sin confirmar y en qué punto está:
// - «a media fusión»: tiene un `git merge` sin acabar (MERGE_HEAD), normalmente al traer la principal con choques;
// - «en marcha»: su agente está trabajando;
// - «todo en la principal»: no lleva nada que la principal no tenga;
// - «al día, para subir»: lleva commits, tiene todo lo de la principal, nada sin confirmar y su agente está parado;
// - «esperando al usuario»: su agente está parado y no está al día o le queda algo sin confirmar.
// Después ensaya la subida de todas las que llevan commits (ensayo.mjs): quién chocaría con la principal o entre sí.

import { existsSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ajustes, argumentos, corto, git, imprimir } from './comun.mjs'
import * as ensayo from './ensayo.mjs'
import { lista } from './worktree.mjs'

export const FASES = ['a media fusión', 'esperando al usuario', 'al día, para subir', 'en marcha', 'todo en la principal']

function sinConfirmar(ruta, prohibidos) {
  const salida = git(['status', '--porcelain'], { repo: ruta, ok: [0, 128] }).stdout
  return salida
    .split(/\r?\n/)
    .filter(l => l.length > 3)
    .map(l => l.slice(3))
    .filter(r => !prohibidos.some(p => r === p || r.startsWith(p.endsWith('/') ? p : `${p}/`)))
}

export function fase(fila) {
  if (fila.mediaFusion) return 'a media fusión'
  if (fila.agente.includes('working')) return 'en marcha'
  if (fila.delante === 0) return 'todo en la principal'
  if (fila.detras === 0 && fila.sinConfirmar.length === 0) return 'al día, para subir'
  return 'esperando al usuario'
}

export function estado(repo = '.', { base, ensayar = true, orca = null } = {}) {
  const a = ajustes(repo)
  const principal = base ?? a.ramaPrincipal
  const filas = []
  for (const w of lista({ repo, orca })) {
    if (w.principal || !w.rama) continue
    const [detras, delante] = git(['rev-list', '--left-right', '--count', `${principal}...${w.rama}`], { repo }).stdout.trim().split(/\s+/).map(Number)
    const fila = {
      nombre: w.nombre,
      rama: w.rama,
      ruta: w.ruta,
      bloque: w.bloque,
      agente: w.agente || 'sin agente',
      delante,
      detras,
      mediaFusion: git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { repo: w.ruta, ok: [0, 1, 128] }).status === 0,
      sinConfirmar: existsSync(w.ruta) ? sinConfirmar(w.ruta, a.prohibidos) : [],
    }
    fila.fase = fase(fila)
    filas.push(fila)
  }
  let plan = null
  if (ensayar) {
    const candidatas = filas.filter(f => f.delante > 0).map(f => f.rama)
    if (candidatas.length > 0) plan = ensayo.ensayar(candidatas, principal, repo)
  }
  return { ramas: filas, ensayo: plan }
}

export function texto(datos) {
  const lineas = []
  for (const f of [...datos.ramas].sort((x, y) => FASES.indexOf(x.fase) - FASES.indexOf(y.fase))) {
    const extra = f.sinConfirmar.length > 0 ? ` · ${f.sinConfirmar.length} sin confirmar` : ''
    lineas.push(`- ${f.nombre} [${f.fase}] ${f.bloque || 'sin bloque'} · +${f.delante}/−${f.detras} · agente ${f.agente}${extra}`)
  }
  const plan = datos.ensayo
  if (plan) {
    lineas.push('', 'Ensayo de subirlas todas ahora:', ensayo.texto(plan))
    for (const p of plan.parejas) lineas.push(`  · ${corto(p.ramas[0])} y ${corto(p.ramas[1])} chocan en ${p.archivos.join(', ')}`)
  }
  return lineas.join('\n') || 'No hay worktrees aparte de la copia principal.'
}

export function main(argv) {
  const a = argumentos(argv, ['--json', '--sin-ensayo'], ['--repo', '--base'])
  const datos = estado(a.repo ?? '.', { base: a.base, ensayar: !a['sin-ensayo'] })
  imprimir(a.json ? JSON.stringify(datos) : texto(datos))
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
