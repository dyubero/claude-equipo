// Los worktrees de los encargos, con Orca o con git a secas: la única puerta por la que el mod y las skills los
// crean, los cierran y los listan.
//
//   node worktree.mjs crear <nombre> --encargo <archivo> [--repo <dir>]   # worktree, rama y sesión del agente
//   node worktree.mjs cerrar <rama> [--forzar] [--repo <dir>]             # worktree fuera, rama borrada
//   node worktree.mjs lista [--repo <dir>]                                # todas las copias, con bloque y agente
//
// Siempre escribe JSON. El gestor sale de `worktrees.gestor` de los ajustes: «orca», «git» o «auto» (Orca si está en el
// PATH, si no git). Con git, la sesión la abre el lanzador de `lanzar` (lanzadores.mjs).
//
// El encargo no viaja en la línea de órdenes: se copia a <worktree>/.claude/equipo-encargo.md (que git ignora por
// <.git común>/info/exclude) y a <.git común>/equipo/encargos/<nombre>.md, y el agente recibe una frase corta que le
// dice que lo lea. Así el texto puede llevar comillas, `$` o lo que sea. Al final del encargo el script añade lo que
// no puede faltar: el bloque de decisiones reservado para la rama (si se usan) y cómo se entrega el trabajo.

import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as bloque from './bloque.mjs'
import { ajustes, argumentos, git, gitComun, imprimir, misma, resolverRama, worktrees } from './comun.mjs'
import * as conGit from './gestores/git.mjs'
import * as conOrca from './gestores/orca.mjs'
import { enPath } from './lanzadores.mjs'
import * as reservas from './reservas.mjs'
import { textos } from '../textos/indice.mjs'

export const ENCARGO = '.claude/equipo-encargo.md'

/** El gestor que vale: el de los ajustes o, con «auto», Orca si está en el PATH. */
export function gestorDe(a, { hayOrca = () => enPath('orca') } = {}) {
  const pedido = a.worktrees.gestor
  if (pedido === 'orca') return conOrca
  if (pedido === 'git') return conGit
  return hayOrca() ? conOrca : conGit
}

/** La frase que recibe el agente. Sin comillas, `;`, `$` ni acentos graves: pasa por terminales y por AppleScript. */
export function promptDeEncargo(copia, a = { idioma: 'es', textos: {} }) {
  return textos(a.idioma, a.textos)('encargo.prompt', { archivo: ENCARGO, copia: copia.replace(/\\/g, '/') })
}

/** Lo que se añade al final de todo encargo: el bloque reservado y cómo se entrega. */
export function pieDeEncargo(a, reservado) {
  const t = textos(a.idioma, a.textos)
  const lineas = []
  if (reservado) lineas.push(t('encargo.pieBloque', { bloque: reservado }))
  lineas.push(t('encargo.pieEntrega', { principal: a.ramaPrincipal }))
  return `\n\n---\n${lineas.join('\n')}\n`
}

/** Añade una línea a <.git común>/info/exclude si no está. */
function ignorar(comun, linea) {
  const ruta = join(comun, 'info', 'exclude')
  const antes = existsSync(ruta) ? readFileSync(ruta, 'utf8') : ''
  if (antes.split(/\r?\n/).includes(linea)) return
  mkdirSync(dirname(ruta), { recursive: true })
  writeFileSync(ruta, `${antes}${antes === '' || antes.endsWith('\n') ? '' : '\n'}${linea}\n`)
}

export function crear(corto, archivoEncargo, { repo = '.', gestor = null, entorno } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(corto ?? '')) throw new Error(`«${corto}» no vale como nombre: letras, números, punto, guion y guion bajo`)
  if (!archivoEncargo || !existsSync(archivoEncargo)) throw new Error('falta --encargo <archivo> con el texto del encargo')
  const pedido = readFileSync(archivoEncargo, 'utf8')
  const copias = worktrees(repo)
  const principal = copias[0].ruta
  const a = ajustes(principal)
  if (resolverRama(corto, principal) !== '' || copias.some(w => basename(w.ruta.replace(/\\/g, '/')) === corto)) {
    throw new Error(`ya hay una rama o un worktree «${corto}»: elige otro nombre`)
  }
  // El bloque de decisiones se calcula antes de crear (el encargo tiene que estar escrito cuando arranque el agente) y
  // se apunta a nombre de la rama en cuanto existe.
  const g = gestor ?? gestorDe(a)
  const reservado = a.decisiones.activo ? bloque.siguiente(principal, g === conOrca ? null : []) : null
  const encargo = pedido.replace(/\s*$/, '') + pieDeEncargo(a, reservado?.bloque ?? '')
  const comun = gitComun(principal)
  const copia = join(comun, 'equipo', 'encargos', `${corto}.md`)
  mkdirSync(dirname(copia), { recursive: true })
  writeFileSync(copia, encargo)
  ignorar(comun, ENCARGO)

  const prompt = promptDeEncargo(copia, a)
  const { ruta, rama } = g.crear({ principal, corto, base: a.ramaPrincipal, a, prompt })
  if (reservado) {
    reservas.guardar(principal, rama, [reservado.inicio, reservado.fin])
    if (g === conOrca) conOrca.comentar({ principal, ruta, texto: reservado.bloque })
  }
  mkdirSync(join(ruta, dirname(ENCARGO)), { recursive: true })
  writeFileSync(join(ruta, ENCARGO), encargo)
  const lanzado = g.abrir({ ruta, corto, prompt, a, entorno })
  return { nombre: corto, ruta, rama, gestor: g.nombre, bloque: reservado?.bloque ?? '', encargo: join(ruta, ENCARGO), ...lanzado }
}

/**
 * Cierra el worktree de una rama y borra la rama. Sin `forzar`, solo si la rama está entera en la rama principal.
 * Devuelve { cerrado, rama, ruta, motivo }.
 */
export function cerrar(nombre, { repo = '.', forzar = false, gestor = null } = {}) {
  const copias = worktrees(repo)
  const principal = copias[0].ruta
  const a = ajustes(principal)
  const rama = resolverRama(nombre, principal)
  if (rama === '') return { cerrado: false, rama: nombre, ruta: '', motivo: `no hay ninguna rama «${nombre}»` }
  if (rama === a.ramaPrincipal) return { cerrado: false, rama, ruta: '', motivo: `${rama} es la rama principal` }
  const entera = git(['merge-base', '--is-ancestor', `refs/heads/${rama}`, `refs/heads/${a.ramaPrincipal}`], { repo: principal, ok: [0, 1, 128] }).status === 0
  if (!entera && !forzar) {
    return { cerrado: false, rama, ruta: '', motivo: `${rama} tiene commits que ${a.ramaPrincipal} no tiene` }
  }
  const copia = copias.find(w => w.rama === rama)
  const ruta = copia?.ruta ?? ''
  if (copia?.principal) return { cerrado: false, rama, ruta, motivo: `${rama} está abierta en la copia principal` }
  if (copia) {
    const g = gestor ?? gestorDe(a)
    let hecho = g.cerrar({ principal, rama, ruta })
    // Un worktree que Orca no conoce (lo creó git): se quita con git.
    if (!hecho.cerrado && g !== conGit) hecho = conGit.cerrar({ principal, rama, ruta })
    if (!hecho.cerrado) return { cerrado: false, rama, ruta, motivo: hecho.motivo }
  }
  // Lo que pueda quedar a medias: el registro del worktree, la rama, su reserva y la copia del encargo.
  git(['worktree', 'prune'], { repo: principal, ok: [0, 1, 128] })
  git(['branch', entera ? '-d' : '-D', rama], { repo: principal, ok: [0, 1, 128] })
  reservas.quitar(principal, rama)
  rmSync(join(gitComun(principal), 'equipo', 'encargos', `${rama.split('/').pop()}.md`), { force: true })
  return { cerrado: true, rama, ruta, motivo: '' }
}

const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** El bloque «D40-D49» de un comentario de Orca, o ''. */
function bloqueDeComentario(comentario, prefijo) {
  const p = escapar(prefijo)
  const m = new RegExp(`${p}(\\d+)\\s*[-–]\\s*(?:${p})?(\\d+)`).exec(String(comentario ?? ''))
  return m ? `${prefijo}${m[1]}-${prefijo}${m[2]}` : ''
}

/**
 * Todas las copias: [{ ruta, rama, principal, nombre, bloque, agente, actividad }]. `bloque` es el reservado para la
 * rama (reservas.json o, si no, el comentario de Orca); `agente`, el estado de sus agentes según Orca ('' sin Orca).
 */
export function lista({ repo = '.', orca = null } = {}) {
  const copias = worktrees(repo)
  const principal = copias[0].ruta
  const a = ajustes(principal)
  const deOrca = (orca ?? (gestorDe(a) === conOrca ? conOrca.datos(principal) : [])).filter(w => !w.isArchived)
  const reservadas = reservas.leer(principal)
  const prefijo = a.decisiones.prefijo
  return copias.map(w => {
    const o = deOrca.find(x => misma(x.path ?? '', w.ruta)) ?? {}
    return {
      ruta: w.ruta,
      rama: w.rama,
      principal: w.principal,
      nombre: o.displayName || basename(w.ruta.replace(/\\/g, '/')),
      bloque: reservadas[w.rama] ? reservas.texto(reservadas[w.rama], prefijo) : bloqueDeComentario(o.comment, prefijo),
      agente: (o.agents ?? []).map(x => x.state ?? '?').join(', '),
      actividad: o.lastActivityAt ?? 0,
    }
  })
}

export function main(argv) {
  const a = argumentos(argv, ['--forzar'], ['--repo', '--encargo'])
  const [orden, nombre] = a.sueltos
  const repo = a.repo ?? '.'
  try {
    if (orden === 'crear') imprimir(JSON.stringify(crear(nombre, a.encargo, { repo })))
    else if (orden === 'cerrar' && nombre) {
      const r = cerrar(nombre, { repo, forzar: Boolean(a.forzar) })
      imprimir(JSON.stringify(r))
      return r.cerrado ? 0 : 1
    } else if (orden === 'lista') imprimir(JSON.stringify(lista({ repo })))
    else {
      imprimir('Uso: node worktree.mjs crear <nombre> --encargo <archivo> | cerrar <rama> [--forzar] | lista   [--repo <dir>]')
      return 2
    }
    return 0
  } catch (error) {
    imprimir(JSON.stringify({ error: error.message }))
    return 1
  }
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
