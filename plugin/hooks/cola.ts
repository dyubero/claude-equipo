// La cola de «Subir»: las ramas que avisan entran en la franja, se ensayan juntas, se fusionan una tras otra en la
// principal y, con la cola vacía, se pide a Claude una sola comprobación del lote.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Subida } from '../types'
import type { Ajustes } from './ajustes'
import { ajustesDe, avisar, script, scripts, SUBIDAS_INICIAL } from './base'
import type { Salida } from './base'
import { montarRamas } from './ramas'
import { revisar } from './revision'
import {
  choquesDe,
  codigosConPrefijo,
  conflictos,
  corto,
  HERRAMIENTA,
  leerPlan,
  mensajeFusion,
  peticionLote,
  textoApartada,
  textoConflicto,
  textoSolucionar,
} from './subidas'
import type { Apartada, AvisoSubida, Fusionada, Plan } from './subidas'

/** Las ramas de la franja (ver base.ts). */
const subidas = atom({ plugin: 'equipo', key: 'subidas' } as const, SUBIDAS_INICIAL)

// Una rama tras otra, nunca dos fusiones a la vez. Vive en el módulo: una recarga la vacía.
const cola: string[] = []
let procesando = false
/** Nombre completo de resultado_lote: mcp__<plugin>__<nombre>. */
const HERRAMIENTA_COMPLETA = `mcp__equipo__${HERRAMIENTA}`

// ---------------------------------------------------------------- la franja

export async function recibirSubida($: EngineInterface, aviso: AvisoSubida, texto: string): Promise<void> {
  const nueva: Subida = { ...aviso, texto, hora: await $.clock.now(), estado: 'lista', marcada: false, fusion: '', detalle: '' }
  const enCurso = cola.includes(aviso.rama)
  await update($, subidas, lista => {
    const antes = lista.find(s => s.rama === aviso.rama)
    // Un aviso nuevo de una rama que ya está en cola o fusionándose no la saca de ahí.
    if (antes && (enCurso || antes.estado === 'fusionando')) return lista
    return [...lista.filter(s => s.rama !== aviso.rama), nueva]
  })
  $.ui.toast(`${aviso.rama} lista para subir${aviso.porRevisar.length > 0 ? ` · ${aviso.porRevisar.length} por revisar` : ''}`)
  if (!procesando) await ensayarListas($)
}

export async function poner($: EngineInterface, rama: string, cambios: Partial<Subida>): Promise<void> {
  await update($, subidas, lista => lista.map(s => (s.rama === rama ? { ...s, ...cambios } : s)))
}

export async function marcar($: EngineInterface, rama: string): Promise<void> {
  await update($, subidas, lista => lista.map(s => (s.rama === rama ? { ...s, marcada: !s.marcada } : s)))
}

export async function borrar($: EngineInterface, rama: string): Promise<void> {
  const i = cola.indexOf(rama)
  if (i >= 0) cola.splice(i, 1)
  await update($, subidas, lista => lista.filter(s => s.rama !== rama))
}

export async function subir($: EngineInterface, ramas: string[]): Promise<void> {
  for (const rama of ramas) {
    if (cola.includes(rama)) continue
    cola.push(rama)
    await poner($, rama, { estado: 'en-cola', marcada: false, detalle: '' })
  }
  if (!procesando) void procesar($)
}

export async function mandarSolucion($: EngineInterface, rama: string, nota: string): Promise<void> {
  const subida = (await read($, subidas)).find(s => s.rama === rama)
  if (!subida) return
  const a = await ajustesDe($)
  const motivo = subida.previo === 'conflicto' || subida.previo === 'falla' || subida.previo === 'error' || subida.previo === 'apartada' ? subida.detalle : ''
  const enviado = await avisar($, subida.sesion, textoSolucionar(rama, subida.porRevisar, nota.trim(), motivo, a.ramaPrincipal))
  await poner($, rama, enviado ? { estado: 'solucion-pedida' } : { estado: 'error', detalle: 'no he podido mandar el mensaje al agente' })
}

// ---------------------------------------------------------------- el ensayo

/** `node scripts/ensayo.mjs --json` en la copia principal; null si falla. */
export async function ensayar($: EngineInterface, ramas: string[], a: Ajustes): Promise<Plan | null> {
  if (ramas.length === 0) return null
  const raiz = await $.session.root()
  const r = await $.process
    .run(['node', `${scripts($)}/ensayo.mjs`, '--json', '--base', a.ramaPrincipal, ...ramas], { cwd: raiz, timeoutMs: 180000 })
    .catch(() => null)
  return r && r.exitCode === 0 ? leerPlan(r.stdout) : null
}

/** Ensaya juntas las ramas que esperan en la franja y apunta con qué chocaría cada una (se ve antes de pulsar). */
export async function ensayarListas($: EngineInterface): Promise<void> {
  const listas = (await read($, subidas)).filter(s => s.estado === 'lista').map(s => s.rama)
  if (listas.length === 0) return
  const a = await ajustesDe($)
  const plan = await ensayar($, listas, a)
  if (!plan) {
    // Sin ensayo no se sabe con qué chocaría: se dice, en vez de dejar la franja como si no chocara con nada.
    await update($, subidas, lista => lista.map(s => (listas.includes(s.rama) ? { ...s, sinEnsayo: true, choques: [] } : s)))
    return
  }
  await update($, subidas, lista =>
    lista.map(s => (listas.includes(s.rama) ? { ...s, sinEnsayo: false, choques: choquesDe(plan, s.rama, a.ramaPrincipal).map(c => ({ con: c.con, archivos: c.archivos })) } : s)),
  )
}

/** Aparta una rama del lote y se lo dice a su agente con las ramas o la principal con las que choca. */
export async function apartar($: EngineInterface, p: Apartada, a: Ajustes): Promise<Apartada> {
  const subida = (await read($, subidas)).find(s => s.rama === p.rama)
  const enviado = subida ? await avisar($, subida.sesion, textoApartada(p.rama, p.con, p.archivos, a.ramaPrincipal)) : false
  const detalle = `choca con ${p.con.map(corto).join(', ')} en ${p.archivos.join(', ')}${enviado ? '' : ' · no he podido avisar al agente'}`
  await poner($, p.rama, { estado: 'apartada', detalle })
  return p
}

// ---------------------------------------------------------------- las fusiones

/** Fusiona la cola en la principal una rama tras otra y, al vaciarla, pide a Claude la comprobación del lote. */
export async function procesar($: EngineInterface): Promise<void> {
  if (procesando) return
  procesando = true
  const a = await ajustesDe($)
  const lote: Fusionada[] = []
  const fallidas: string[] = []
  const apartadas: Apartada[] = []
  const generados: string[] = []
  try {
    while (cola.length > 0) {
      // Ensayo de lo que hay en cola contra la principal tal como está ahora: orden de menos a más choques, y fuera lo
      // que chocaría de verdad. Sin ensayo (git que falla), en el orden de la cola.
      const tanda = cola.splice(0, cola.length)
      const plan = await ensayar($, tanda, a)
      const orden = plan ? plan.orden : tanda
      const tarde: Apartada[] = []
      if (plan) {
        generados.push(...plan.generados)
        for (const e of plan.errores) {
          await poner($, e.rama, { estado: 'error', detalle: e.motivo.slice(0, 300) })
          fallidas.push(e.rama)
        }
        for (const p of plan.apartadas) {
          if (p.con.includes(a.ramaPrincipal)) apartadas.push(await apartar($, p, a))
          else {
            tarde.push(p)
            await poner($, p.rama, { estado: 'apartada', detalle: `chocaría con ${p.con.map(corto).join(', ')}: se avisa cuando entren` })
          }
        }
      }
      for (const rama of orden) {
        const hecho = await fusionar($, rama, a).catch(async (error: unknown) => {
          await poner($, rama, { estado: 'error', detalle: String(error).slice(0, 300) })
          return null
        })
        if (hecho) lote.push(hecho)
        else fallidas.push(rama)
      }
      // Las que chocan con otras del lote se avisan cuando esas ya están dentro, para que traigan la principal de una
      // vez. Si ninguna de aquellas ha entrado, la rama vuelve a «lista para subir».
      for (const p of tarde) {
        const con = p.con.filter(c => lote.some(f => f.rama === c))
        if (con.length > 0) apartadas.push(await apartar($, { ...p, con }, a))
        else await poner($, p.rama, { estado: 'lista', detalle: '' })
      }
    }
  } finally {
    procesando = false
  }
  if (lote.length > 0) {
    await $.prompt.submit({ text: peticionLote(lote, fallidas, apartadas, generados, { ajustes: a, scripts: scripts($), herramienta: HERRAMIENTA_COMPLETA }) })
  } else if (fallidas.length + apartadas.length > 0) {
    $.ui.toast(`No ha entrado ninguna rama: ${[...fallidas, ...apartadas.map(p => p.rama)].join(', ')}`)
  }
  await ensayarListas($)
}

export async function fusionar($: EngineInterface, rama: string, a: Ajustes): Promise<Fusionada | null> {
  const subida = (await read($, subidas)).find(s => s.rama === rama)
  if (!subida) return null
  const raiz = await $.session.root()
  const git = (args: string[], timeoutMs = 30000): Promise<Salida> =>
    $.process.run(['git', ...args], { cwd: raiz, timeoutMs }).catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  const fallo = async (detalle: string) => {
    await poner($, rama, { estado: 'error', detalle })
    return null
  }

  await poner($, rama, { estado: 'fusionando' })
  if ((await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).exitCode === 0) return fallo(`hay una fusión a medias en ${a.ramaPrincipal}`)
  const actual = (await git(['symbolic-ref', '--short', 'HEAD'])).stdout.trim()
  if (actual !== '' && actual !== a.ramaPrincipal) return fallo(`la copia principal está en ${actual}, no en ${a.ramaPrincipal}`)
  const punta = await git(['rev-parse', '--verify', `refs/heads/${rama}`])
  if (punta.exitCode !== 0) return fallo(`la rama ${rama} no existe en esta copia`)
  const distinta = !punta.stdout.trim().startsWith(subida.commit)
  const squash = a.fusion.estrategia === 'squash'
  const mensaje = mensajeFusion(rama, subida.resumen, a.ramaPrincipal)
  // Con squash, el commit se lleva todo el índice: no puede haber nada añadido de antes.
  if (squash && (await git(['diff', '--cached', '--quiet'])).exitCode !== 0) {
    return fallo(`la copia principal tiene cambios añadidos sin confirmar (git add): confírmalos o quítalos antes de subir con squash`)
  }

  const hecho = squash ? await git(['merge', '--squash', rama], 120000) : await git(['merge', '--no-ff', rama, '-m', mensaje], 120000)
  if (hecho.exitCode !== 0) {
    const archivos = conflictos((await git(['diff', '--name-only', '--diff-filter=U'])).stdout)
    if (squash) await git(['reset', '--merge'])
    else if ((await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).exitCode === 0) await git(['merge', '--abort'])
    if (archivos.length > 0 || /CONFLICT/.test(hecho.stdout)) {
      const enviado = await avisar($, subida.sesion, textoConflicto(rama, archivos, a.ramaPrincipal))
      await poner($, rama, { estado: 'conflicto', detalle: `${archivos.join(', ')}${enviado ? '' : ' · no he podido avisar al agente'}` })
      return null
    }
    return fallo((hecho.stderr || hecho.stdout).trim().slice(0, 300) || 'git merge ha fallado')
  }
  if (squash) {
    const confirmado = await git(['commit', '-m', mensaje], 60000)
    if (confirmado.exitCode !== 0) {
      await git(['reset', '--merge'])
      return fallo((confirmado.stderr || confirmado.stdout).trim().slice(0, 300) || 'git commit ha fallado (¿la rama no traía cambios?)')
    }
  }

  const fusion = (await git(['rev-parse', 'HEAD'])).stdout.trim()
  const revision = await revisarFusion($, rama, fusion, a)
  let codigos: string[] = []
  if (a.backlog.activo) {
    const diff = await git(['diff', '-U0', `${fusion}^1`, fusion, '--', a.backlog.documento])
    codigos = codigosConPrefijo(rama, diff.stdout, a.backlog.documento)
    if (codigos.length > 0) {
      // Los códigos con prefijo son lo esperado ahora: se renumeran todos juntos tras el lote.
      revision.lineas = revision.lineas.map(l =>
        l.startsWith(`✖ ${a.backlog.documento}`) ? `• ${codigos.length} códigos de ${a.backlog.documento} con prefijo: se renumeran tras el lote` : l,
      )
      revision.problemas = revision.lineas.filter(l => l.startsWith('✖')).length
    }
  }
  await poner($, rama, { estado: 'fusionada', fusion, punta: punta.stdout.trim(), detalle: '' })
  return { rama, fusion, aviso: subida.texto, revision, codigos, distinta }
}

export async function revisarFusion($: EngineInterface, rama: string, commit: string, a: Ajustes) {
  const raiz = await $.session.root()
  const git = async (...args: string[]) => {
    const r = await $.process.run(['git', ...args], { cwd: raiz, timeoutMs: 20000 }).catch(() => null)
    return r && r.exitCode === 0 ? r.stdout : ''
  }
  let bloque: [number, number] | null = null
  if (a.decisiones.activo) {
    const ramas = montarRamas(await git('worktree', 'list', '--porcelain'), await script($, 'worktree.mjs', ['lista'], 30000), a.decisiones.prefijo)
    bloque = ramas.find(r => r.rama === rama || r.nombre === rama)?.bloque ?? null
  }
  const documentos = [a.decisiones.activo ? a.decisiones.documento : '', a.backlog.activo ? a.backlog.documento : ''].filter(Boolean)
  return revisar(
    {
      rama,
      bloque,
      padres: await git('rev-list', '--parents', '-n', '1', commit),
      archivos: await git('diff', '--name-status', `${commit}^1`, commit),
      diff: documentos.length > 0 ? await git('diff', '-U0', `${commit}^1`, commit, '--', ...documentos) : '',
      estado: await git('status', '--porcelain'),
      backlog: a.backlog.activo ? await git('show', `${commit}:${a.backlog.documento}`) : undefined,
    },
    a,
  )
}
