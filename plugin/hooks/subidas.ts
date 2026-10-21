// Subidas desde la copia principal. Un agente que acaba no fusiona: avisa a la sesión principal con
// «La rama <rama> está lista para subir (<commit>)». El aviso sale en la franja de la principal con «Subir»,
// «Solucionar» (si el agente deja algo «Por revisar») y «Borrar»; varias ramas se suben en cola, una tras otra, y al
// acabar la cola se pide a Claude una sola comprobación de todo el lote. Aquí está lo que no necesita `$`.

import type { Ajustes } from './ajustes'
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

const NADA = /^(nada|ninguno|ninguna|no|—|-)\.?$/i

/**
 * «La rama <rama> está lista para subir (<commit>)», con o sin comillas invertidas, y debajo las líneas «Sesión:»,
 * «Resumen:» y el apartado «Por revisar:» (una línea por cosa, hasta una línea en blanco u otro apartado).
 */
export function avisoDeSubida(texto: string): AvisoSubida | null {
  const limpio = texto.replace(/\r/g, '')
  const m = /La rama `?([\w./-]+)`? está lista para subir \(`?([0-9a-f]{7,40})`?\)/.exec(limpio)
  if (!m) return null
  const sesion = /^\s*Sesi[oó]n:\s*`?([^\s`]+)`?/im.exec(limpio)?.[1] ?? ''
  const resumen = (/^\s*Resumen:\s*(.+)$/im.exec(limpio)?.[1] ?? '').trim()
  return { rama: m[1] as string, commit: m[2] as string, sesion, resumen, porRevisar: apartado(limpio, 'Por revisar') }
}

/** Las líneas de un apartado «<nombre>:» (también lo que va en su misma línea), sin viñetas. */
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

export function mensajeFusion(rama: string, resumen: string, principal = 'main'): string {
  const texto = resumen.replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  return `Fusión de ${rama} en ${principal}${texto ? `: ${texto}` : ''}`
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

const VOLVER = (rama: string, principal: string) =>
  `Cuando esté, sigue la skill equipo:lista-para-subir: commit, trae la principal (\`git merge ${principal}\`), compila, ` +
  `repite las pruebas de lo tuyo que pueda haber cambiado y vuelve a avisar con «La rama ${rama} está lista para subir ` +
  `(<commit>)». No fusiones tú en ${principal}.`

export function textoSolucionar(rama: string, porRevisar: string[], nota: string, motivo: string, principal = 'main'): string {
  return [
    `El usuario ha pulsado «Solucionar» para la rama ${rama} en la sesión principal.`,
    porRevisar.length > 0 ? `Arregla en tu rama lo que dejaste «Por revisar»:\n${porRevisar.map(l => `- ${l}`).join('\n')}` : '',
    motivo ? `Lo que ha fallado al subir o al comprobar en ${principal}:\n${motivo}` : '',
    nota ? `Indicación del usuario: ${nota}` : '',
    VOLVER(rama, principal),
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function textoConflicto(rama: string, archivos: string[], principal = 'main'): string {
  return [
    `Al subir la rama ${rama} a ${principal} ha chocado con lo que ya había entrado (fusión abortada; ${principal} no ha cambiado).`,
    `Archivos con conflicto: ${archivos.length > 0 ? archivos.join(', ') : '(git no los ha listado)'}.`,
    `Trae ${principal} a tu rama y resuelve los conflictos. ${VOLVER(rama, principal)}`,
  ].join('\n')
}

/** Mensaje al agente de una rama que el ensayo ha apartado del lote. */
export function textoApartada(rama: string, con: string[], archivos: string[], principal = 'main'): string {
  const conPrincipal = con.length === 0 || con.every(c => c === principal)
  return [
    conPrincipal
      ? `Al ensayar la subida de la rama ${rama}, choca con ${principal} (no ha entrado; ${principal} no ha cambiado).`
      : `Al ensayar la subida de la rama ${rama} junto a otras, choca con ${con.map(corto).join(', ')}, que ya ${con.length > 1 ? 'han entrado' : 'ha entrado'} en ${principal}. Tu rama se ha apartado del lote.`,
    `Archivos con choque de verdad: ${archivos.length > 0 ? archivos.join(', ') : '(git no los ha listado)'}.`,
    'Lo que se resuelve solo (documentos de «unir» con solo añadidos, y los «generados») no está en la lista.',
    `Trae ${principal} a tu rama y resuelve esos choques. ${VOLVER(rama, principal)}`,
  ].join('\n')
}

export function textoSubida(rama: string, commit: string, principal = 'main'): string {
  return (
    `La rama ${rama} está subida a ${principal} (${commit}) y la sesión principal la ha comprobado. ` +
    'Se cierra tu worktree: no hace falta que hagas nada más.'
  )
}

export function textoFalla(rama: string, commit: string, motivo: string, principal = 'main'): string {
  return [`La rama ${rama} está en ${principal} (${commit}), pero la comprobación en la sesión principal ha fallado:`, motivo, `Arréglalo en tu rama. ${VOLVER(rama, principal)}`].join('\n')
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
}

export function peticionLote(lote: Fusionada[], fallidas: string[], apartadas: Apartada[], generados: string[], x: Contexto): string {
  const a = x.ajustes
  const principal = a.ramaPrincipal
  const codigos = lote.flatMap(f => f.codigos)
  const conGenerados = lote.filter(f => generados.includes(f.rama) || f.revision.generados).map(f => f.rama)
  const prefijos = [...new Set(lote.filter(f => f.codigos.length > 0).map(f => corto(f.rama)))]
  const node = (script: string, args: string) => `\`node "${x.scripts}/${script}" ${args}\``
  const pasos: string[] = []
  if (conGenerados.length > 0) {
    pasos.push(
      `Tocan archivos generados: ${conGenerados.join(', ')}. Al fusionar se han quedado como estaban en ${principal} donde chocaban: ` +
        (a.comandos.regenerar
          ? `rehazlos una vez con \`${a.comandos.regenerar}\` y haz un commit «Lote de subidas: generados rehechos» con solo lo generado que cambie, añadido uno a uno.`
          : 'rehazlos a mano (comandos.regenerar no está puesto en .claude/equipo.json) y haz un commit con solo eso.'),
    )
  }
  if (a.backlog.activo) {
    pasos.push(
      codigos.length > 0
        ? `Renumera en ${principal} estos códigos de ${a.backlog.documento} y donde se citen con ${node('renumerar.mjs', `--aplicar ${prefijos.join(' ')}`)}: ${codigos.join(', ')}. ` +
            `Compruébalo con ${node('renumerar.mjs', `--comprobar ${prefijos.join(' ')}`)} (debe salir con 0) y haz un commit «Lote de subidas: códigos renumerados (…)» ` +
            'con solo los archivos que dice el script, añadidos uno a uno. Pulsar «Subir» es el permiso del usuario para ese commit.'
        : `No hay códigos de ${a.backlog.documento} que renumerar.`,
    )
  }
  const rangos = lote.map(f => `${f.fusion.slice(0, 9)}^1..${f.fusion.slice(0, 9)}`).join(' ')
  pasos.push(
    'Pruebas del lote, una sola vez: ' +
      (a.comandos.compilar ? `\`${a.comandos.compilar}\`; ` : '') +
      `después las pruebas de lo que tocan (las del «Probar:» de cada aviso; propuesta con ${node('pruebas.mjs', rangos)}). ` +
      `Si no sabes acotarlas, \`${a.comandos.probar || 'la orden de pruebas del proyecto'}\`. No repitas lo que ya pasó en el agente si no se cruza con otra rama.`,
  )
  pasos.push(
    `Cuenta el resultado al usuario y llama a ${x.herramienta} con cada rama: ok si está bien, o el motivo del fallo. ` +
      `El mod avisa a los agentes y cierra los worktrees de las que están bien. Apunta lo que quede sin probar en ${a.pendientes}.`,
  )
  return [
    `Comprueba juntas en ${principal} las ramas que acaba de subir el plugin equipo: ${lote.map(f => f.rama).join(', ')}. Sigue la skill equipo:comprobar-lote.`,
    ...lote.map(f =>
      [
        `## ${f.rama} — fusión ${f.fusion}`,
        ...f.revision.lineas.map(l => `  ${l}`),
        f.distinta ? '  • la punta de la rama no era el commit del aviso: el agente siguió después de avisar' : '',
        `El aviso del agente decía:\n${f.aviso}`,
      ]
        .filter(Boolean)
        .join('\n'),
    ),
    apartadas.length > 0
      ? `Apartadas por el ensayo (sus agentes ya tienen el aviso):\n${apartadas.map(p => `- ${p.rama}: choca con ${p.con.map(corto).join(', ')} en ${p.archivos.join(', ')}`).join('\n')}`
      : '',
    fallidas.length > 0 ? `No han entrado (se les ha avisado o esperan al usuario): ${fallidas.join(', ')}.` : '',
    '## Qué hacer',
    pasos.map((p, i) => `${i + 1}. ${p}`).join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
}
