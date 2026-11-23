// Plugin equipo: mods para trabajar con varios agentes, cada uno en su worktree (con Orca o con git a secas).
//   contexto — franja con el contexto usado y libre, y el botón «Compactar».
//   subidas  — en la copia principal, el aviso de un agente («equipo:lista <rama> <commit>») sale en la franja con «Subir»,
//              «Solucionar» y «Borrar»; el mod ensaya con git merge-tree, fusiona en cola y pide a Claude una sola
//              comprobación del lote, que devuelve con la herramienta resultado_lote.
//   /ramas, /reservar y /pendiente — panel de worktrees, bloques de decisiones y apuntes.
//   guardas  — desde un worktree, niega fusionar en la copia principal; en la principal, niega git add/commit de todo;
//              en cualquier copia, los «prohibidos» de los ajustes no entran en un commit.
// Cada pieza se apaga con su interruptor en /config.
//
// Este archivo es solo el cableado: qué evento llama a qué. Cada pieza está en el suyo:
//   base.ts     el estado, los ajustes, los scripts de Node y los mensajes a otras sesiones
//   franja.tsx  el dibujo de la franja (contexto y subidas)
//   cola.ts     la cola de «Subir»: ensayo, fusiones y petición del lote
//   lote.ts     resultado_lote: avisos a los agentes y cierre de worktrees
//   panel.tsx   /ramas, /reservar y /pendiente
//   guarda.ts   la guarda de las órdenes de git
// Lo que no necesita `$` (leer avisos, escribir textos, juzgar una orden) está en los demás archivos de la carpeta.
// Ver el README del repositorio.

import { atom, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { ARCHIVO, problemasDeTexto } from './ajustes'
import { ajustesDe, CONTEXTO_INICIAL, enPrincipal, scripts } from './base'
import { recibirSubida } from './cola'
import { esDibujo } from './dibujo'
import { franjaSubidas, leerContexto, lineaContexto } from './franja'
import { guardar } from './guarda'
import { faltan } from './herramientas'
import { tr } from './idioma'
import { resultado } from './lote'
import { dibujarPanel, ordenPendiente, ordenRamas, ordenReservar, PANE } from './panel'
import { avisoDeSubida, HERRAMIENTA } from './subidas'

/** El estado de la franja del contexto (ver base.ts). */
const contexto = atom({ plugin: 'equipo', key: 'contexto' } as const, CONTEXTO_INICIAL)

export const register: Register = (on, options) => {
  const conContexto = options.contexto !== false
  const conSubidas = options.subidas !== false
  const activas = { fusiones: options.fusiones !== false, commits: options.commits !== false }

  on('session.start', async ($, e, next) => {
    const hecho = await next(e)
    if (conContexto) await leerContexto($)
    await empezarEquipo($, conSubidas)
    return hecho
  })

  // ------------------------------------------------------------ contexto
  if (conContexto) {
    on('session.measure', async ($, e, next) => {
      const hecho = await next(e)
      const { tokens, window } = e.context
      await update($, contexto, actual => ({
        ...actual,
        tokens: tokens ?? actual.tokens,
        ventana: window || actual.ventana,
        compactado: tokens === undefined ? actual.compactado : false,
      }))
      return hecho
    })
  }

  // ------------------------------------------------------------ la franja sobre el prompt
  // El contexto, debajo las subidas y debajo lo de los demás plugins.
  if (conContexto || conSubidas) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if (e.props.hasSurvey) return next(e)
      const propias = [conContexto ? await lineaContexto($, e) : null, conSubidas ? await franjaSubidas($, e) : null].filter(x => x !== null)
      if (propias.length === 0) return next(e)
      const { Box } = $.ui.resolve(e)
      const debajo = await next(e)
      return (
        <Box flexDirection="column" width={e.props.bodyColumns}>
          {propias}
          {esDibujo(debajo) ? debajo : null}
        </Box>
      )
    })
  }

  // ------------------------------------------------------------ subidas desde la principal
  if (conSubidas) {
    on('tool.call', { tool: 'mcp__equipo__resultado_lote' }, async ($, e) => {
      // Los argumentos de la herramienta llegan sueltos en el evento, junto a `tool`.
      const entrada = e as unknown as { ramas?: { rama?: string; ok?: boolean; motivo?: string; sesion?: string }[] }
      const lineas: string[] = []
      for (const r of entrada.ramas ?? []) {
        if (!r.rama) continue
        lineas.push(await resultado($, r.rama.trim(), r.ok === true, (r.motivo ?? '').trim(), (r.sesion ?? '').trim()))
      }
      return { result: lineas.length > 0 ? lineas.join('\n') : tr()('resultado.ninguna') }
    })

    on('session.receive', async ($, e, next) => {
      const lista = avisoDeSubida(e.text)
      if (!lista || !(await enPrincipal($))) return next(e)
      await recibirSubida($, lista, e.text)
      return { consumed: tr()('subida.consumida', { rama: lista.rama }) }
    }).catch(($, e, next) => next(e))
  }

  // ------------------------------------------------------------ /ramas, /reservar y /pendiente
  on('command.run', { command: 'ramas' }, async $ => ({ text: await ordenRamas($) }))
  on('command.run', { command: 'reservar' }, async ($, e) => ({ text: await ordenReservar($, e.args) }))
  on('command.run', { command: 'pendiente' }, async ($, e) => ({ text: await ordenPendiente($, e.args) }))
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => dibujarPanel($, e))

  // ------------------------------------------------------------ guardas sobre las órdenes de git
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const orden = String((e as { command?: unknown }).command ?? '')
    if (!/\bgit\b/.test(orden)) return next(e)
    const motivo = await guardar($, orden, activas)
    return motivo === null ? next(e) : { deny: motivo }
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    // Si la guarda falla, una fusión no pasa sin mirarla; lo demás sigue, para no bloquear la sesión entera.
    const orden = String((e as { command?: unknown }).command ?? '')
    return activas.fusiones && /\bgit\b[\s\S]*\b(merge|pull)\b/.test(orden)
      ? { deny: tr()('guarda.fallo', { error: next.error.message }) }
      : next(e)
  })
}

// ---------------------------------------------------------------- al empezar la sesión

/** Al empezar la sesión: los comandos y, con las subidas, los drivers de fusión y resultado_lote (en la principal). */
async function empezarEquipo($: EngineInterface, conSubidas: boolean): Promise<void> {
  // Lo primero, los ajustes: dejan puesto el idioma de todo lo que se escribe después.
  await ajustesDe($).catch(() => null)
  const t = tr()
  await $.command.register({ name: 'ramas', description: t('ramas.descripcion') })
  await $.command.register({
    name: 'reservar',
    description: t('reservar.descripcion'),
    argumentHint: '[worktree]',
  })
  await $.command.register({ name: 'pendiente', description: t('pendiente.descripcion'), argumentHint: t('pendiente.argumento') })
  // Sin ajustes valen los de por defecto (npm): en la principal se le recuerda al usuario que lo adapte a su proyecto.
  const propios = await $.fs.read(`${await $.session.root()}/${ARCHIVO}`).catch(() => null)
  if (await enPrincipal($)) {
    if (typeof propios !== 'string') {
      await $.ui.toast(t('inicio.sinAjustes'))
    } else {
      const problemas = problemasDeTexto(propios)
      if (problemas.length > 0) {
        const orden = `node "${scripts($)}/ajustes.mjs" --comprobar`
        await $.ui.toast(t(problemas.length === 1 ? 'inicio.unProblema' : 'inicio.problemas', { archivo: ARCHIVO, n: problemas.length, problema: problemas[0] ?? '', orden }))
      }
    }
  }
  if (!conSubidas) return
  await comprobarHerramientas($)
  // Los drivers de fusión van al .git común: en cualquier copia, para que valgan también al traer la principal.
  await instalarDrivers($)
  if (await enPrincipal($)) {
    await $.tool.register({
      name: HERRAMIENTA,
      description: t('herramienta.descripcion'),
      inputSchema: {
        type: 'object',
        properties: {
          ramas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rama: { type: 'string' },
                ok: { type: 'boolean' },
                motivo: { type: 'string', description: t('herramienta.motivo') },
                sesion: { type: 'string', description: t('herramienta.sesion') },
              },
              required: ['rama', 'ok'],
            },
          },
        },
        required: ['ramas'],
      },
    })
  }
}

/** Avisa de lo que falta en el PATH: sin node o con un git viejo, las subidas fallarían sin decir por qué. */
async function comprobarHerramientas($: EngineInterface): Promise<void> {
  const version = (programa: string) => $.process.run([programa, '--version'], { timeoutMs: 10000 }).catch(() => null)
  const t = tr()
  for (const linea of faltan({ node: await version('node'), git: await version('git') }, t)) await $.ui.toast(t('inicio.falta', { linea }))
}

/** Apunta en el .git común los drivers de fusión y los atributos de .claude/equipo.json. */
async function instalarDrivers($: EngineInterface): Promise<void> {
  const raiz = await $.session.root()
  await $.process.run(['node', `${scripts($)}/fusion.mjs`, 'instalar'], { cwd: raiz, timeoutMs: 20000 }).catch(() => null)
}
