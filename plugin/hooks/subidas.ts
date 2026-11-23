// Subidas desde la copia principal. Un agente que acaba no fusiona: avisa a la sesión principal con un mensaje que
// empieza por la línea «equipo:lista <rama> <commit>». El aviso sale en la franja de la principal con «Subir»,
// «Solucionar» (si el agente deja algo «Por revisar») y «Borrar»; varias ramas se suben en cola, una tras otra, y al
// acabar la cola se pide a Claude una sola comprobación de todo el lote. Aquí está lo que no necesita `$`.

import type { Ajustes } from './ajustes'
import type { T } from './idioma'
import { ES } from './idioma'
import type { Revision } from './revision'

/** Lo que dice el aviso de un agente que ha acabado. */
export type AvisoSubida = {
  rama: string
  commit: string
  /** Nombre de la sesión del agente (ListAgents), para contestarle. '' si el aviso no lo dice. */
  sesion: string
  /** Una línea para el mensaje de la fusión. */
  resumen: string
  /** Lo que el agente deja dicho que hay que revisar o que no está bien; vacío si nada. */
  porRevisar: string[]
}

const NADA = /^(nada|ninguno|ninguna|no|nothing|none|n\/a|—|-)\.?$/i

/**
 * El aviso de un agente que ha acabado. Empieza por una línea fija, igual en todos los idiomas:
 *   equipo:lista <rama> <commit>
 * y debajo lleva las líneas «Session:» y «Summary:» y el apartado «To review:» (una línea por cosa, hasta una línea en
 * blanco u otro apartado). También valen las etiquetas en español («Sesión:», «Resumen:», «Por revisar:») y la frase de
 * antes, «La rama <rama> está lista para subir (<commit>)», para los agentes que siguen con la skill anterior.
 */
export function avisoDeSubida(texto: string): AvisoSubida | null {
  const limpio = texto.replace(/\r/g, '')
  const m =
    /^[ \t>*-]*`?equipo:lista[ \t]+`?([\w./-]+)`?[ \t]+\(?`?([0-9a-f]{7,40})`?\)?/m.exec(limpio) ??
    /La rama `?([\w./-]+)`? está lista para subir \(`?([0-9a-f]{7,40})`?\)/.exec(limpio)
  if (!m) return null
  const sesion = /^\s*(?:Sesi[oó]n|Session):\s*`?([^\s`]+)`?/im.exec(limpio)?.[1] ?? ''
  const resumen = (/^\s*(?:Resumen|Summary):\s*(.+)$/im.exec(limpio)?.[1] ?? '').trim()
  return { rama: m[1] as string, commit: m[2] as string, sesion, resumen, porRevisar: apartado(limpio, '(?:Por revisar|To review)') }
}

/** Las líneas de un apartado «<nombre>:» (también lo que va en su misma línea), sin viñetas. `nombre` es un trozo de expresión regular. */
function apartado(texto: string, nombre: string): string[] {
  const lineas = texto.split('\n')
  const cabeza = new RegExp(`^\\s*[-*]?\\s*\\**${nombre}\\**:\\s*(.*)$`, 'i')
  const inicio = lineas.findIndex(l => cabeza.test(l))
  if (inicio < 0) return []
  const fuera: string[] = []
  const mismo = (cabeza.exec(lineas[inicio] as string)?.[1] ?? '').trim()
  if (mismo) fuera.push(mismo)
  for (const linea of lineas.slice(inicio + 1)) {
    const l = linea.trim()
    if (l === '') break
    // Otro apartado («Probar:», «Decisiones:»…) sin viñeta delante cierra este.
    if (!/^[-*•]/.test(l) && /^[^\s:]{2,30}( [^\s:]{1,20}){0,3}:/.test(l)) break
    fuera.push(l.replace(/^[-*•]\s*/, ''))
  }
  return fuera.filter(l => !NADA.test(l))
}

export function mensajeFusion(rama: string, resumen: string, principal = 'main', t: T = ES): string {
  const texto = resumen.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  return texto ? t('fusion.mensaje', { rama, principal, resumen: texto }) : t('fusion.mensajeSinResumen', { rama, principal })
}

/** Archivos con conflicto de `git diff --name-only --diff-filter=U`. */
export function conflictos(salida: string): string[] {
  return salida
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
}

/** «ana/carrito-pago» → «carrito-pago»: el nombre del worktree y el prefijo de sus códigos. */
export const corto = (rama: string) => rama.split('/').pop() ?? rama

/** Patrón de un código con el prefijo de la rama: vale el nombre corto (el que usan los agentes) y el largo. */
function patronCodigo(rama: string, banderas: string): RegExp {
  const nombres = [...new Set([rama, corto(rama)])].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?:^|[^\\w/-])((?:${nombres.join('|')})-[A-Za-z]*\\d+)(?![\\w-])`, banderas)
}

/** Filas de un backlog entero que aún empiezan por un código con el prefijo de la rama («| carrito-T1 |»). */
export function codigosSinRenumerar(rama: string, backlog: string): string[] {
  const codigo = patronCodigo(rama, '')
  const vistos = new Set<string>()
  for (const linea of backlog.replace(/\r/g, '').split('\n')) {
    const celda = /^\|\s*([^|]*?)\s*\|/.exec(linea)?.[1]
    const m = celda ? codigo.exec(` ${celda}`) : null
    if (m) vistos.add(m[1] as string)
  }
  return [...vistos]
}

/** Códigos del backlog con el nombre de la rama delante, en lo añadido por la fusión. */
export function codigosConPrefijo(rama: string, diff: string, documento = 'BACKLOG.md'): string[] {
  const codigo = patronCodigo(rama, 'g')
  const vistos = new Set<string>()
  let actual = ''
  for (const linea of diff.replace(/\r/g, '').split('\n')) {
    if (linea.startsWith('+++ ')) {
      actual = linea.endsWith(`/${documento}`) || linea === `+++ ${documento}` ? 'backlog' : ''
      continue
    }
    if (actual !== 'backlog' || !linea.startsWith('+')) continue
    for (const m of linea.matchAll(codigo)) vistos.add(m[1] as string)
  }
  return [...vistos]
}

// ---------------------------------------------------------------- mensajes a los agentes

const volver = (rama: string, principal: string, t: T) => t('agente.volver', { rama, principal })
const lista = (archivos: string[], t: T) => (archivos.length > 0 ? archivos.join(', ') : t('agente.sinLista'))

export function textoSolucionar(rama: string, porRevisar: string[], nota: string, motivo: string, principal = 'main', t: T = ES): string {
  return [
    t('agente.solucionar', { rama }),
    porRevisar.length > 0 ? t('agente.solucionarPorRevisar', { lista: porRevisar.map(l => `- ${l}`).join('\n') }) : '',
    motivo ? t('agente.solucionarMotivo', { principal, motivo }) : '',
    nota ? t('agente.solucionarNota', { nota }) : '',
    volver(rama, principal, t),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function textoConflicto(rama: string, archivos: string[], principal = 'main', t: T = ES): string {
  return [
    t('agente.conflicto', { rama, principal }),
    t('agente.conflictoArchivos', { archivos: lista(archivos, t) }),
    t('agente.traer', { principal, volver: volver(rama, principal, t) }),
  ].join('\n')
}

/** Mensaje al agente de una rama que el ensayo ha apartado del lote. */
export function textoApartada(rama: string, con: string[], archivos: string[], principal = 'main', t: T = ES): string {
  const conPrincipal = con.length === 0 || con.every(c => c === principal)
  return [
    conPrincipal
      ? t('agente.apartadaPrincipal', { rama, principal })
      : t(con.length > 1 ? 'agente.apartadaVarias' : 'agente.apartadaUna', { rama, con: con.map(corto).join(', '), principal }),
    t('agente.apartadaArchivos', { archivos: lista(archivos, t) }),
    t('agente.apartadaSolos'),
    t('agente.apartadaTraer', { principal, volver: volver(rama, principal, t) }),
  ].join('\n')
}

export function textoSubida(rama: string, commit: string, principal = 'main', cierra = true, t: T = ES): string {
  return t(cierra ? 'agente.subida' : 'agente.subidaAbierta', { rama, principal, commit })
}

export function textoFalla(rama: string, commit: string, motivo: string, principal = 'main', t: T = ES): string {
  return [t('agente.falla', { rama, principal, commit }), motivo, t('agente.fallaArreglar', { volver: volver(rama, principal, t) })].join('\n')
}

// ---------------------------------------------------------------- petición del lote a Claude

export type Fusionada = {
  rama: string
  /** Commit de la fusión en la principal. */
  fusion: string
  aviso: string
  revision: Revision
  /** Códigos del backlog con el prefijo de la rama, que hay que renumerar. */
  codigos: string[]
  /** La punta de la rama no era el commit del aviso (el agente siguió después de avisar). */
  distinta: boolean
}

export const HERRAMIENTA = 'resultado_lote'

/** Una rama que el ensayo ha dejado fuera del lote, con quién choca y en qué archivos. */
export type Apartada = { rama: string; con: string[]; archivos: string[] }

/** Lo que devuelve `node scripts/ensayo.mjs --json`. */
export type Plan = {
  orden: string[]
  apartadas: Apartada[]
  parejas: { ramas: [string, string]; archivos: string[] }[]
  generados: string[]
  errores: { rama: string; motivo: string }[]
}

export function leerPlan(salida: string): Plan | null {
  try {
    const p = JSON.parse(salida.trim().split('\n').pop() ?? '') as Partial<Plan> & { error?: string }
    if (p.error || !Array.isArray(p.orden)) return null
    return { orden: p.orden, apartadas: p.apartadas ?? [], parejas: p.parejas ?? [], generados: p.generados ?? [], errores: p.errores ?? [] }
  } catch {
    return null
  }
}

/** Con qué chocaría una rama de la franja, según un ensayo de todas las listas (para verlo antes de pulsar). */
export function choquesDe(plan: Plan, rama: string, principal = 'main'): Apartada[] {
  const fuera: Apartada[] = []
  const conPrincipal = plan.apartadas.find(a => a.rama === rama && a.con.includes(principal))
  if (conPrincipal) fuera.push({ rama, con: [principal], archivos: conPrincipal.archivos })
  for (const p of plan.parejas) {
    const otra = p.ramas[0] === rama ? p.ramas[1] : p.ramas[1] === rama ? p.ramas[0] : ''
    if (otra) fuera.push({ rama, con: [otra], archivos: p.archivos })
  }
  return fuera
}

export type Contexto = {
  ajustes: Ajustes
  /** Carpeta de los scripts del plugin, con barras normales. */
  scripts: string
  /** Nombre completo de la herramienta resultado_lote (mcp__<plugin>__resultado_lote). */
  herramienta: string
  /** El que escribe los textos en el idioma de la sesión; en español si no se da. */
  t?: T
}

export function peticionLote(lote: Fusionada[], fallidas: string[], apartadas: Apartada[], generados: string[], x: Contexto): string {
  const a = x.ajustes
  const t = x.t ?? ES
  const principal = a.ramaPrincipal
  const codigos = lote.flatMap(f => f.codigos)
  const conGenerados = lote.filter(f => generados.includes(f.rama) || f.revision.generados).map(f => f.rama)
  const prefijos = [...new Set(lote.filter(f => f.codigos.length > 0).map(f => corto(f.rama)))]
  const node = (script: string, args: string) => `\`node "${x.scripts}/${script}" ${args}\``
  const pasos: string[] = []
  if (conGenerados.length > 0) {
    pasos.push(
      t('lote.generados', { ramas: conGenerados.join(', '), principal }) +
        (a.comandos.regenerar ? t('lote.generadosCon', { orden: a.comandos.regenerar }) : t('lote.generadosSin')),
    )
  }
  if (a.backlog.activo) {
    pasos.push(
      codigos.length > 0
        ? t('lote.renumerar', {
            principal,
            documento: a.backlog.documento,
            aplicar: node('renumerar.mjs', `--aplicar ${prefijos.join(' ')}`),
            codigos: codigos.join(', '),
            comprobar: node('renumerar.mjs', `--comprobar ${prefijos.join(' ')}`),
          })
        : t('lote.sinCodigos', { documento: a.backlog.documento }),
    )
  }
  const rangos = lote.map(f => `${f.fusion.slice(0, 9)}^1..${f.fusion.slice(0, 9)}`).join(' ')
  const acotadas = t('lote.acotadas', { propuesta: node('pruebas.mjs', rangos) })
  pasos.push(
    t('lote.pruebas') +
      (a.comandos.compilar ? t('lote.pruebasCompilar', { compilar: a.comandos.compilar, acotadas }) : t('lote.pruebasSinCompilar', { acotadas })) +
      (a.comandos.probar ? t('lote.todas', { probar: a.comandos.probar }) : t('lote.todasSin')) +
      t('lote.noRepetir'),
  )
  pasos.push(t('lote.resultado', { herramienta: x.herramienta, pendientes: a.pendientes }))
  return [
    t('lote.cabecera', { principal, ramas: lote.map(f => f.rama).join(', ') }),
    ...lote.map(f =>
      [t('lote.rama', { rama: f.rama, fusion: f.fusion }), ...f.revision.lineas.map(l => `  ${l}`), f.distinta ? t('lote.distinta') : '', t('lote.aviso', { aviso: f.aviso })]
        .filter(Boolean)
        .join('\n'),
    ),
    apartadas.length > 0
      ? t('lote.apartadas', { lista: apartadas.map(p => t('lote.apartada', { rama: p.rama, con: p.con.map(corto).join(', '), archivos: p.archivos.join(', ') })).join('\n') })
      : '',
    fallidas.length > 0 ? t('lote.fallidas', { ramas: fallidas.join(', ') }) : '',
    t('lote.queHacer'),
    pasos.map((p, i) => `${i + 1}. ${p}`).join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}
