// Los worktrees de los encargos, con Orca o con git a secas: la única puerta por la que el mod y las skills los
// crean, los cierran y los listan.
//
//   node worktree.mjs crear <nombre> --encargo <archivo> [--repo <dir>]   # worktree, rama y sesión del agente
//   node worktree.mjs cerrar <rama> [--forzar [--punta <commit>]] [--descartar] [--repo <dir>]   # worktree fuera, rama borrada
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
import { ajustes, argumentos, corto as cortoDe, git, gitComun, imprimir, misma, ramasLocales, resolverRama, worktrees } from './comun.mjs'
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
  if (ramasLocales(principal).some(r => r === corto || cortoDe(r) === corto) || copias.some(w => basename(w.ruta.replace(/\\/g, '/')) === corto)) {
    throw new Error(`ya hay una rama o un worktree «${corto}»: elige otro nombre`)
  }
  const g = gestor ?? gestorDe(a)
  const comun = gitComun(principal)
  const copia = join(comun, 'equipo', 'encargos', `${corto}.md`)
  const prompt = promptDeEncargo(copia, a)
  let encargo = ''
  let reservado = null
  // El bloque de decisiones se calcula antes de crear (el encargo tiene que estar escrito cuando arranque el agente) y
  // se apunta a nombre de la rama en cuanto existe. Todo con el candado de las reservas echado: dos encargos lanzados a
  // la vez no se llevan el mismo bloque.
  const hacer = () => {
    reservado = a.decisiones.activo ? bloque.siguiente(principal, g === conOrca ? null : []) : null
    encargo = pedido.replace(/\s*$/, '') + pieDeEncargo(a, reservado?.bloque ?? '')
    mkdirSync(dirname(copia), { recursive: true })
    writeFileSync(copia, encargo)
    ignorar(comun, ENCARGO)
    const creado = g.crear({ principal, corto, base: a.ramaPrincipal, a, prompt })
    if (reservado) reservas.guardar(principal, creado.rama, [reservado.inicio, reservado.fin])
    return creado
  }
  const { ruta, rama } = a.decisiones.activo ? reservas.conCandado(principal, hacer) : hacer()
  if (reservado && g === conOrca) conOrca.comentar({ principal, ruta, texto: reservado.bloque })
  mkdirSync(join(ruta, dirname(ENCARGO)), { recursive: true })
  writeFileSync(join(ruta, ENCARGO), encargo)
  const lanzado = g.abrir({ ruta, corto, prompt, a, entorno })
  return { nombre: corto, ruta, rama, gestor: g.nombre, bloque: reservado?.bloque ?? '', encargo: join(ruta, ENCARGO), ...lanzado }
}

/** Lo que el worktree tiene sin confirmar (sin contar lo que git ignora ni los `prohibidos` de los ajustes). */
function sinConfirmar(ruta, prohibidos) {
  if (!existsSync(ruta)) return []
  return git(['status', '--porcelain'], { repo: ruta, ok: [0, 128] })
    .stdout.split(/\r?\n/)
    .filter(l => l.length > 3)
    .map(l => l.slice(3))
    .filter(r => !prohibidos.some(p => r === p || r.startsWith(p.endsWith('/') ? p : `${p}/`)))
}

/**
 * Cierra el worktree de una rama y borra la rama. Devuelve { cerrado, rama, ruta, motivo }. No se pierde nada sin
 * pedirlo:
 * - si la rama tiene commits que la principal no tiene, se niega; `forzar` lo permite (con «squash» sus commits no están
 *   en la principal), y entonces `punta` es el commit en el que tiene que seguir la rama: si se ha movido, se niega;
 * - si el worktree tiene cambios sin confirmar, se niega; `descartar` los da por perdidos.
 */
export function cerrar(nombre, { repo = '.', forzar = false, punta = '', descartar = false, gestor = null } = {}) {
  const copias = worktrees(repo)
  const principal = copias[0].ruta
  const a = ajustes(principal)
  const rama = resolverRama(nombre, principal)
  const no = (motivo, ruta = '') => ({ cerrado: false, rama: rama || nombre, ruta, motivo })
  if (rama === '') return no(`no hay ninguna rama «${nombre}»`)
  if (rama === a.ramaPrincipal) return no(`${rama} es la rama principal`)
  const ref = `refs/heads/${rama}`
  const entera = git(['merge-base', '--is-ancestor', ref, `refs/heads/${a.ramaPrincipal}`], { repo: principal, ok: [0, 1, 128] }).status === 0
  const ahora = git(['rev-parse', '--verify', ref], { repo: principal, ok: [0, 1, 128] }).stdout.trim()
  if (!entera) {
    if (!forzar) return no(`${rama} tiene commits que ${a.ramaPrincipal} no tiene`)
    if (punta && !ahora.startsWith(punta)) return no(`${rama} se ha movido desde que se subió (está en ${ahora.slice(0, 9)}, no en ${punta.slice(0, 9)})`)
  }
  const copia = copias.find(w => w.rama === rama)
  const ruta = copia?.ruta ?? ''
  if (copia?.principal) return no(`${rama} está abierta en la copia principal`, ruta)
  // Sin worktree a la vista, una rama que no está en la principal puede tener su trabajo en un worktree con el HEAD
  // suelto: no se borra a ciegas.
  if (!copia && !entera) return no(`${rama} no está entera en ${a.ramaPrincipal} y no encuentro su worktree`)
  if (copia && !descartar) {
    const cambios = sinConfirmar(ruta, a.prohibidos)
    if (cambios.length > 0) {
      return no(`su worktree tiene ${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'} sin confirmar: ${cambios.slice(0, 4).join(', ')}${cambios.length > 4 ? '…' : ''}`, ruta)
    }
  }
  if (copia) {
    const g = gestor ?? gestorDe(a)
    let hecho = g.cerrar({ principal, rama, ruta })
    // Un worktree que Orca no conoce (lo creó git): se quita con git.
    if (!hecho.cerrado && g !== conGit) hecho = conGit.cerrar({ principal, rama, ruta })
    if (!hecho.cerrado) return no(hecho.motivo, ruta)
  }
  git(['worktree', 'prune'], { repo: principal, ok: [0, 1, 128] })
  // La rama se borra solo si sigue donde estaba al mirarla: un commit hecho entretanto no se pierde.
  const borrada = entera
    ? git(['branch', '-d', rama], { repo: principal, ok: [0, 1, 128] })
    : git(['update-ref', '-d', ref, ahora], { repo: principal, ok: [0, 1, 128] })
  if (borrada.status !== 0) return no(`el worktree está cerrado, pero la rama no se ha borrado: ${(borrada.stderr || borrada.stdout).trim().slice(0, 200)}`, ruta)
  reservas.quitar(principal, rama)
  // La copia del encargo va por el nombre corto: se quita si no queda otra rama que se llame igual.
  if (!ramasLocales(principal).some(r => cortoDe(r) === cortoDe(rama))) {
    rmSync(join(gitComun(principal), 'equipo', 'encargos', `${cortoDe(rama)}.md`), { force: true })
  }
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
  const a = argumentos(argv, ['--forzar', '--descartar'], ['--repo', '--encargo', '--punta'])
  const [orden, nombre] = a.sueltos
  const repo = a.repo ?? '.'
  try {
    if (orden === 'crear') imprimir(JSON.stringify(crear(nombre, a.encargo, { repo })))
    else if (orden === 'cerrar' && nombre) {
      const r = cerrar(nombre, { repo, forzar: Boolean(a.forzar), punta: a.punta ?? '', descartar: Boolean(a.descartar) })
      imprimir(JSON.stringify(r))
      return r.cerrado ? 0 : 1
    } else if (orden === 'lista') imprimir(JSON.stringify(lista({ repo })))
    else {
      imprimir('Uso: node worktree.mjs crear <nombre> --encargo <archivo> | cerrar <rama> [--forzar [--punta <commit>]] [--descartar] | lista   [--repo <dir>]')
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
