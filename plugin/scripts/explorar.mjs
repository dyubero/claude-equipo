// Mira un proyecto para adaptarle el plugin (skill `preparar`): qué se deduce de él y qué hay que preguntar.
// Solo lee: no escribe nada.
//
//   node explorar.mjs [--repo <dir>]          # resumen para leer
//   node explorar.mjs --json [--repo <dir>]   # { hechos, propuesta, preguntas }
//
// - hechos: rama principal, gestor de paquetes, scripts de package.json, ejecutor de pruebas, lockfiles y archivos que
//   parecen generados, documentos que parecen de decisiones, backlog o changelog, archivos sensibles sin ignorar,
//   idioma de los commits, CLAUDE.md, herramientas instaladas.
// - propuesta: un .claude/equipo.json con solo lo que cambia respecto a los valores por defecto.
// - preguntas: lo que el script no puede decidir; el agente se lo pregunta al usuario.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { AJUSTES, argumentos, git, imprimir, POR_DEFECTO, raiz } from './comun.mjs'

const GESTORES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
]

/** Cómo ejecuta cada gestor un script de package.json y un binario de node_modules. */
const EJECUTAR = {
  npm: { script: s => (s === 'test' ? 'npm test' : `npm run ${s}`), bin: 'npx', instalar: 'npm install' },
  pnpm: { script: s => `pnpm ${s}`, bin: 'pnpm exec', instalar: 'pnpm install' },
  yarn: { script: s => `yarn ${s}`, bin: 'yarn', instalar: 'yarn install' },
  bun: { script: s => `bun run ${s}`, bin: 'bunx', instalar: 'bun install' },
}

/** Ejecutores de pruebas que aceptan una lista de archivos, y cómo. */
const EJECUTORES = [
  ['vitest', 'vitest run {archivos}'],
  ['jest', 'jest {archivos}'],
  ['mocha', 'mocha {archivos}'],
  ['ava', 'ava {archivos}'],
]

const COMPILAR = ['build', 'typecheck', 'check', 'tsc', 'compile']
const PROBAR = ['test', 'test:unit', 'tests', 'vitest', 'jest']

/** Archivos con seguimiento que suelen ser generados (además de los lockfiles). */
const GENERADO = /(^|\/)(__generated__\/|[^/]*\.(gen|generated)\.[^/]+$|routeTree\.gen\.ts$|next-env\.d\.ts$)/

/** Otros ecosistemas: el script no los conoce a fondo, pero el agente sí. */
const OTROS = {
  'pyproject.toml': 'Python',
  'requirements.txt': 'Python',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'pom.xml': 'Java (Maven)',
  'build.gradle': 'Java/Kotlin (Gradle)',
  'build.gradle.kts': 'Java/Kotlin (Gradle)',
  'composer.json': 'PHP',
  Gemfile: 'Ruby',
  'deno.json': 'Deno',
}

const SENSIBLES = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.(pem|key|p12|pfx)|credentials[^/]*\.json)$/
const SALIDAS = ['dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage', '.turbo', 'storybook-static']

// Palabras muy frecuentes de cada idioma, para adivinar el de los commits.
const PALABRAS = {
  es: ['de', 'la', 'el', 'en', 'que', 'y', 'los', 'las', 'del', 'con', 'por', 'para', 'una', 'un', 'se', 'al', 'añade', 'arregla', 'quita', 'cambia'],
  en: ['the', 'and', 'of', 'to', 'in', 'for', 'with', 'on', 'add', 'fix', 'remove', 'update', 'from', 'when', 'use', 'is'],
}

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
}

function leerTexto(ruta) {
  try {
    return readFileSync(ruta, 'utf8')
  } catch {
    return ''
  }
}

function version(orden) {
  // En Windows, orca es un .cmd: hace falta la shell, y con ella la orden va entera en un texto.
  const r = spawnSync(`${orden} --version`, { encoding: 'utf8', timeout: 15000, shell: true, windowsHide: true })
  if (r.error || r.status !== 0) return ''
  return (r.stdout || r.stderr).trim().split(/\r?\n/)[0]
}

/** La rama principal: la de origin/HEAD; si no, main o master si existen; si no, la actual. */
export function ramaPrincipal(repo) {
  const origen = git(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'], { repo, ok: [0, 1, 128] }).stdout.trim()
  if (origen) return { rama: origen.replace(/^origin\//, ''), de: 'origin/HEAD' }
  const ramas = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { repo }).stdout.split(/\s+/).filter(Boolean)
  for (const r of ['main', 'master', 'trunk', 'develop']) if (ramas.includes(r)) return { rama: r, de: 'existe' }
  const actual = git(['symbolic-ref', '-q', '--short', 'HEAD'], { repo, ok: [0, 1, 128] }).stdout.trim()
  return { rama: actual || 'main', de: 'actual' }
}

/** 'es', 'en' o '' según las palabras de los asuntos. */
export function idiomaDe(asuntos) {
  const cuenta = { es: 0, en: 0 }
  for (const asunto of asuntos) {
    const palabras = asunto.toLowerCase().split(/[^a-záéíóúñü]+/)
    for (const [idioma, lista] of Object.entries(PALABRAS)) cuenta[idioma] += palabras.filter(p => lista.includes(p)).length
  }
  if (cuenta.es === 0 && cuenta.en === 0) return ''
  if (cuenta.es >= 2 * cuenta.en) return 'es'
  if (cuenta.en >= 2 * cuenta.es) return 'en'
  return ''
}

/** Prefijo de las decisiones numeradas de un documento («### D12. …», «## ADR-3: …»), o ''. */
export function prefijoDecisiones(texto) {
  const cuenta = new Map()
  for (const m of texto.matchAll(/^#{2,4} +([A-Z]{1,4}-?)(\d+)\b/gm)) cuenta.set(m[1], (cuenta.get(m[1]) ?? 0) + 1)
  const [mejor] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  return mejor && mejor[1] >= 2 ? mejor[0] : ''
}

/** Cuántas filas de tabla empiezan con un código («| T12 |»). */
export const filasConCodigo = texto => [...texto.matchAll(/^\| *~*[A-Z]{1,4}\d+~* *\|/gm)].length

export function explorar(repo = '.') {
  const r = raiz(repo)
  const nombre = basename(r)
  const archivos = git(['ls-files'], { repo: r }).stdout.split(/\r?\n/).filter(Boolean)
  const hay = ruta => archivos.includes(ruta)
  const hechos = { raiz: r, nombre }

  hechos.copiaPrincipal = existsSync(join(r, '.git')) && statSync(join(r, '.git')).isDirectory()
  hechos.ajustesExisten = existsSync(join(r, AJUSTES))
  hechos.ramaPrincipal = ramaPrincipal(r)
  hechos.worktrees = git(['worktree', 'list', '--porcelain'], { repo: r }).stdout.split(/\r?\n/).filter(l => l.startsWith('worktree ')).length

  // Node: gestor, scripts, pruebas, monorepo.
  const paquete = leerJson(join(r, 'package.json'))
  hechos.node = null
  if (paquete) {
    const [lock, gestor] = GESTORES.find(([archivo]) => hay(archivo)) ?? [null, (paquete.packageManager ?? 'npm').split('@')[0]]
    const scripts = paquete.scripts ?? {}
    const dependencias = { ...paquete.dependencies, ...paquete.devDependencies }
    hechos.node = {
      gestor: EJECUTAR[gestor] ? gestor : 'npm',
      lockfile: lock,
      scripts: Object.fromEntries(Object.entries(scripts).filter(([k]) => /^(build|typecheck|check|tsc|compile|lint|test|tests|e2e|vitest|jest|dev|generate|codegen|format)(:|$)/.test(k))),
      ejecutor: EJECUTORES.find(([n]) => n in dependencias)?.[0] ?? '',
      e2e: ['@playwright/test', 'cypress'].filter(n => n in dependencias),
      monorepo: Boolean(paquete.workspaces) || hay('pnpm-workspace.yaml') || hay('turbo.json') || hay('nx.json') || hay('lerna.json'),
    }
  }
  hechos.otros = Object.entries(OTROS).filter(([archivo]) => hay(archivo)).map(([archivo, que]) => `${que} (${archivo})`)

  // Generados con seguimiento.
  hechos.generados = archivos.filter(a => GENERADO.test(a)).slice(0, 20)

  // Documentos.
  const md = archivos.filter(a => /\.md$/i.test(a) && !a.includes('node_modules/') && a.split('/').length <= 3)
  hechos.documentos = { decisiones: [], backlog: [], changelog: [], pendientes: [] }
  for (const a of md) {
    const base = basename(a).toLowerCase()
    const texto = leerTexto(join(r, a))
    const prefijo = prefijoDecisiones(texto)
    if (prefijo) hechos.documentos.decisiones.push({ archivo: a, prefijo, cuantas: [...texto.matchAll(new RegExp(`^#{2,4} +${prefijo}\\d+`, 'gm'))].length })
    const filas = filasConCodigo(texto)
    if (filas >= 2) hechos.documentos.backlog.push({ archivo: a, filas })
    if (/^(changelog|changes|history)\.md$/.test(base)) hechos.documentos.changelog.push(a)
    if (/pendiente|todo/.test(base)) hechos.documentos.pendientes.push(a)
  }
  const adr = archivos.filter(a => /(^|\/)(adr|adrs|decisions)\/[^/]+\.md$/i.test(a))
  hechos.documentos.carpetaAdr = adr.length > 0 ? adr[0].replace(/\/[^/]+$/, '') : ''

  // Lo que no debería entrar en un commit: sensibles y salidas de compilar que no están ignoradas.
  const ignorado = ruta => git(['check-ignore', '-q', ruta], { repo: r, ok: [0, 1, 128] }).status === 0
  const sensiblesConSeguimiento = archivos.filter(a => SENSIBLES.test(a) && !/\.example$|\.sample$|\.template$/.test(a))
  const sueltos = git(['ls-files', '--others', '--exclude-standard'], { repo: r }).stdout.split(/\r?\n/).filter(Boolean)
  hechos.sinIgnorar = {
    sensibles: [...new Set([...sensiblesConSeguimiento, ...sueltos.filter(a => SENSIBLES.test(a))])],
    salidas: SALIDAS.filter(d => existsSync(join(r, d)) && !ignorado(`${d}/`)),
  }

  // Commits.
  const asuntos = git(['log', '-40', '--no-merges', '--format=%s'], { repo: r, ok: [0, 128] }).stdout.split(/\r?\n/).filter(Boolean)
  hechos.commits = { idioma: idiomaDe(asuntos), ejemplos: asuntos.slice(0, 5) }

  // Instrucciones para agentes.
  hechos.instrucciones = ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md'].filter(a => existsSync(join(r, a)))
  hechos.herramientas = { node: process.version, git: version('git'), orca: version('orca') }

  return { hechos, ...proponer(hechos) }
}

/** Los ajustes que se deducen y lo que hay que preguntar. */
export function proponer(h) {
  const propuesta = {}
  const preguntas = []
  if (h.ramaPrincipal.rama !== POR_DEFECTO.ramaPrincipal) propuesta.ramaPrincipal = h.ramaPrincipal.rama
  if (h.ramaPrincipal.de === 'actual') preguntas.push(`¿La rama principal es «${h.ramaPrincipal.rama}»? (no hay origin/HEAD ni main/master)`)
  if (h.commits.idioma && h.commits.idioma !== POR_DEFECTO.idioma) propuesta.idioma = h.commits.idioma
  if (!h.commits.idioma) preguntas.push('¿En qué idioma escriben los agentes commits, avisos y documentos? (los commits no lo dejan claro)')

  const comandos = {}
  if (h.node) {
    const x = EJECUTAR[h.node.gestor]
    const compilar = COMPILAR.find(s => s in h.node.scripts)
    const probar = PROBAR.find(s => s in h.node.scripts)
    comandos.compilar = compilar ? x.script(compilar) : ''
    comandos.probar = probar ? x.script(probar) : ''
    const ejecutor = EJECUTORES.find(([n]) => n === h.node.ejecutor)
    if (ejecutor) comandos.probarArchivos = `${x.bin} ${ejecutor[1]}`
    if (h.node.lockfile) {
      propuesta.generados = [h.node.lockfile]
      comandos.regenerar = x.instalar
    }
    if (!compilar) preguntas.push('No hay script de build ni de typecheck: ¿cómo se comprueba que compila? (vacío si no hace falta)')
    if (!probar) preguntas.push('No hay script de test: ¿cómo se pasan las pruebas?')
    if (h.node.e2e.length > 0) preguntas.push(`Hay pruebas de extremo a extremo (${h.node.e2e.join(', ')}): ¿se pasan al comprobar el lote o solo a mano?`)
    if (h.node.monorepo) preguntas.push('Es un monorepo: ¿los comandos se pasan desde la raíz o por paquete?')
  } else {
    comandos.compilar = ''
    comandos.probar = ''
    preguntas.push(`No hay package.json${h.otros.length > 0 ? ` (es ${h.otros.join(', ')})` : ''}: ¿cómo se compila y cómo se pasan las pruebas?`)
  }
  for (const [clave, valor] of Object.entries(comandos)) if (valor !== POR_DEFECTO.comandos[clave]) (propuesta.comandos ??= {})[clave] = valor

  if (h.generados.length > 0) preguntas.push(`¿Son generados (se rehacen tras subir) estos archivos? ${h.generados.join(', ')}`)

  const prohibidos = [...h.sinIgnorar.sensibles, ...h.sinIgnorar.salidas.map(d => `${d}/`)]
  if (prohibidos.length > 0) {
    propuesta.prohibidos = prohibidos
    preguntas.push(`Sin ignorar en git: ${prohibidos.join(', ')}. ¿Van a «prohibidos» (o mejor al .gitignore)?`)
  }

  const [decisiones] = h.documentos.decisiones.sort((a, b) => b.cuantas - a.cuantas)
  if (decisiones) {
    propuesta.decisiones = { activo: true, documento: decisiones.archivo, prefijo: decisiones.prefijo }
    preguntas.push(`${decisiones.archivo} tiene ${decisiones.cuantas} decisiones numeradas (${decisiones.prefijo}1, ${decisiones.prefijo}2…): ¿se reservan bloques de números por rama?`)
  } else if (h.documentos.carpetaAdr) {
    preguntas.push(`Hay ADR en ${h.documentos.carpetaAdr}/, un archivo por decisión: no hacen falta bloques, pero ¿quieres que los agentes registren ahí sus decisiones?`)
  } else {
    preguntas.push('¿Quieres que las decisiones de diseño se registren numeradas en un documento (DESIGN.md), con un bloque de números por rama?')
  }
  const [backlog] = h.documentos.backlog.sort((a, b) => b.filas - a.filas)
  if (backlog) {
    propuesta.backlog = { activo: true, documento: backlog.archivo }
    preguntas.push(`${backlog.archivo} tiene una tabla con códigos (T1, T2…): ¿la usan los agentes como backlog, con los códigos renumerados al subir?`)
  }
  if (h.documentos.changelog.length > 0) propuesta.unir = h.documentos.changelog
  if (h.documentos.pendientes.length > 0 && !h.documentos.pendientes.includes(POR_DEFECTO.pendientes)) {
    preguntas.push(`¿Lo pendiente se apunta en ${h.documentos.pendientes[0]} o en uno nuevo (${POR_DEFECTO.pendientes})?`)
  }
  if (!h.herramientas.orca) preguntas.push('Orca no está en el PATH: sin él no se lanzan encargos ni se cierran worktrees. ¿Está instalado?')
  if (h.instrucciones.length > 0) preguntas.push(`¿Añado a ${h.instrucciones[0]} el apartado del flujo de trabajo con worktrees?`)
  return { propuesta, preguntas }
}

function texto({ hechos: h, propuesta, preguntas }) {
  const l = []
  l.push(`Proyecto ${h.nombre} (${h.raiz})${h.copiaPrincipal ? '' : ' · OJO: no es la copia principal'}`)
  if (h.ajustesExisten) l.push(`Ya tiene ${AJUSTES}.`)
  l.push(`Rama principal: ${h.ramaPrincipal.rama} (${h.ramaPrincipal.de}) · worktrees: ${h.worktrees}`)
  if (h.node) {
    l.push(`Node con ${h.node.gestor}${h.node.lockfile ? ` (${h.node.lockfile})` : ''}${h.node.monorepo ? ', monorepo' : ''}`)
    for (const [k, v] of Object.entries(h.node.scripts)) l.push(`  ${k}: ${v}`)
    if (h.node.ejecutor) l.push(`  pruebas con ${h.node.ejecutor}`)
  }
  if (h.otros.length > 0) l.push(`Otros: ${h.otros.join(', ')}`)
  if (h.generados.length > 0) l.push(`Parecen generados: ${h.generados.join(', ')}`)
  const d = h.documentos
  for (const x of d.decisiones) l.push(`Decisiones: ${x.archivo} (${x.cuantas} con ${x.prefijo})`)
  for (const x of d.backlog) l.push(`Backlog: ${x.archivo} (${x.filas} filas con código)`)
  if (d.changelog.length > 0) l.push(`Changelog: ${d.changelog.join(', ')}`)
  if (d.carpetaAdr) l.push(`ADR: ${d.carpetaAdr}/`)
  l.push(`Commits en ${h.commits.idioma || '¿?'}: ${h.commits.ejemplos.map(s => `«${s}»`).join(' ')}`)
  l.push(`Instrucciones: ${h.instrucciones.join(', ') || 'ninguna'}`)
  l.push(`Herramientas: node ${h.herramientas.node}, ${h.herramientas.git || 'sin git'}, ${h.herramientas.orca ? `orca ${h.herramientas.orca}` : 'sin orca'}`)
  l.push('', `Propuesta de ${AJUSTES}:`, JSON.stringify(propuesta, null, 2), '', 'Preguntas:')
  for (const p of preguntas) l.push(`- ${p}`)
  return l.join('\n')
}

export function main(argv) {
  const a = argumentos(argv, ['--json'], ['--repo'])
  const salida = explorar(a.repo ?? '.')
  imprimir(a.json ? JSON.stringify(salida, null, 2) : texto(salida))
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
