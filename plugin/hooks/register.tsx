// Plugin equipo: mods para trabajar con varios agentes en worktrees de Orca.
//   contexto — franja con el contexto usado y libre, y el botón «Compactar».
//   subidas  — en la copia principal, el aviso «La rama X está lista para subir» sale en la franja con «Subir»,
//              «Solucionar» y «Borrar»; el mod ensaya con git merge-tree, fusiona en cola y pide a Claude una sola
//              comprobación del lote, que devuelve con la herramienta resultado_lote.
//   /ramas, /reservar y /pendiente — panel de worktrees, bloques de decisiones y apuntes.
//   guardas  — desde un worktree, niega fusionar en la copia principal; en la principal, niega git add/commit de todo;
//              en cualquier copia, los «prohibidos» de .claude/equipo.json no entran en un commit.
// Cada pieza se apaga con su interruptor en /config. Lo que no usa `$` está en los demás archivos de esta carpeta.
// Ver el README del repositorio.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { Contexto, PanelRamas, Rama, Subida } from '../types'
import type { Ajustes } from './ajustes'
import { ajustesDeTexto, ARCHIVO } from './ajustes'
import type { Modo } from './commits'
import { juzgar, motivoProhibido, prohibidosConCambios } from './commits'
import { color, miles, texto } from './contexto'
import type { Copia } from './copia'
import { montarCopia } from './copia'
import type { FranjaEvento } from './dibujo'
import { esDibujo } from './dibujo'
import { fusionEnPrincipal, negativa } from './fusiones'
import { apuntar, apuntes } from './pendientes'
import { cuentas, mayorDecision, misma, montarRamas, rutasDeGit, siguienteBloque, textoBloque } from './ramas'
import { revisar } from './revision'
import { normalizar } from './rutas'
import { llamadasGit } from './shell'
import {
  avisoDeSubida,
  choquesDe,
  codigosConPrefijo,
  codigosSinRenumerar,
  conflictos,
  corto,
  HERRAMIENTA,
  leerPlan,
  mensajeFusion,
  peticionLote,
  textoApartada,
  textoConflicto,
  textoFalla,
  textoSolucionar,
  textoSubida,
} from './subidas'
import type { Apartada, AvisoSubida, Fusionada, Plan } from './subidas'
import { borrable, colorSubida, hoy, puedeSolucionar, resumenRamas, textoEstado } from './vista'

const CONTEXTO_INICIAL: Contexto = { tokens: null, ventana: 0, compactando: false, compactado: false }
const contexto = atom({ plugin: 'equipo', key: 'contexto' } as const, CONTEXTO_INICIAL)
const PANEL_INICIAL: PanelRamas = { ramas: [], siguiente: '', leido: 0, error: '' }
const panel = atom({ plugin: 'equipo', key: 'panel' } as const, PANEL_INICIAL)
const subidas = atom({ plugin: 'equipo', key: 'subidas' } as const, [] as Subida[])

// Cola de «Subir»: una rama tras otra, nunca dos fusiones a la vez. Vive en el módulo: una recarga la vacía.
const cola: string[] = []
let procesando = false
/** Nombre completo de resultado_lote: mcp__<plugin>__<nombre>. */
const HERRAMIENTA_COMPLETA = `mcp__equipo__${HERRAMIENTA}`

const PANE = 'ramas'

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
      return { result: lineas.length > 0 ? lineas.join('\n') : 'No ha llegado ninguna rama.' }
    })

    on('session.receive', async ($, e, next) => {
      const lista = avisoDeSubida(e.text)
      if (!lista || !(await enPrincipal($))) return next(e)
      await recibirSubida($, lista, e.text)
      return { consumed: `equipo: ${lista.rama} lista para subir, en la franja` }
    }).catch(($, e, next) => next(e))
  }

  // ------------------------------------------------------------ ramas y reservas
  on('command.run', { command: 'ramas' }, async $ => {
    const datos = await cargarRamas($)
    await $.ui.open({ id: PANE, title: 'Ramas' })
    return { text: resumenRamas(datos) }
  })

  on('command.run', { command: 'reservar' }, async ($, e) => {
    const a = await ajustesDe($)
    if (!a.decisiones.activo) {
      return { text: 'Las decisiones numeradas están apagadas (decisiones.activo en .claude/equipo.json): no hay bloques que reservar.' }
    }
    const datos = await cargarRamas($)
    if (datos.error) return { text: `No he podido leer las ramas: ${datos.error}` }
    const nombre = e.args.trim()
    if (nombre === '') return { text: `Siguiente bloque libre: ${datos.siguiente} (tras la mayor decisión de las copias y de los bloques reservados).` }
    const rama = datos.ramas.find(r => r.nombre === nombre || r.rama === nombre)
    if (!rama) return { text: `No hay ningún worktree «${nombre}». Siguiente bloque libre: ${datos.siguiente}.` }
    if (rama.bloque) return { text: `${rama.nombre} ya tiene el bloque ${textoBloque(rama.bloque, a.decisiones.prefijo)}. Siguiente libre: ${datos.siguiente}.` }
    if (!(await enPrincipal($))) return { text: `Las reservas se apuntan desde la copia principal. Siguiente bloque libre: ${datos.siguiente}.` }
    const comentario = rama.comentario ? `${datos.siguiente} · ${rama.comentario}` : datos.siguiente
    const hecho = await $.process
      .run(['orca', 'worktree', 'set', '--worktree', `path:${rama.ruta}`, '--comment', comentario], { timeoutMs: 20000 })
      .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
    if (hecho.exitCode !== 0) return { text: `No he podido apuntarlo en Orca: ${hecho.stderr.trim().slice(0, 200)}` }
    await cargarRamas($)
    return { text: `Reservado ${datos.siguiente} para ${rama.nombre} (comentario de Orca).` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const datos = await read($, panel)
    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {datos.error ? <Text color="error">No he podido leer las ramas: {datos.error}</Text> : null}
        {datos.ramas.map(r => (
          <Box key={`rama-${r.nombre}`} flexDirection="row" gap={1}>
            <Text color={r.principal ? 'claude' : r.delante === 0 ? 'inactive' : 'text'} wrap="truncate-end">
              {r.principal ? '★' : r.delante === 0 ? '✔' : '●'} {r.nombre.padEnd(22)} {(r.comentario || '—').slice(0, 14).padEnd(14)}{' '}
              {r.principal ? 'copia principal' : r.delante === 0 ? `todo en la principal (−${r.detras})` : `+${r.delante} / −${r.detras}`}
              {r.agente ? `  · agente ${r.agente}` : ''}
            </Text>
          </Box>
        ))}
        <Box flexDirection="row" gap={1} marginTop={1}>
          {datos.siguiente ? <Text bold>Siguiente bloque libre: {datos.siguiente}</Text> : null}
          <Button key="actualizar" label="Actualizar" onPress={() => void cargarRamas($)} />
        </Box>
        <Text dimColor>+n: commits que la principal no tiene · −n: commits de la principal que la rama no tiene · ✔ todo está en la principal</Text>
      </Box>
    )
  })

  // ------------------------------------------------------------ /pendiente
  on('command.run', { command: 'pendiente' }, async ($, e) => {
    const raiz = await $.session.root()
    const documento = (await ajustesDe($)).pendientes
    const ruta = `${raiz}/${documento}`
    const actual = await $.fs.read(ruta).catch(() => null)
    const texto = e.args.trim()
    if (texto === '') {
      const lista = typeof actual === 'string' ? apuntes(actual) : []
      return { text: lista.length > 0 ? `Apuntes rápidos de ${documento}:\n${lista.join('\n')}` : `No hay apuntes rápidos en ${documento}. Uso: /pendiente <texto>` }
    }
    const fecha = hoy(await $.clock.now())
    const base = typeof actual === 'string' ? actual : `# Pendientes\n\nActualizado el ${fecha}.\n`
    const porcelana = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: raiz, timeoutMs: 10000 }).catch(() => null)
    const rama = rutasDeGit(porcelana?.stdout ?? '').find(w => misma(w.ruta, raiz))?.rama ?? ''
    await $.fs.write(ruta, apuntar(base, texto, fecha, rama))
    return { text: `Apuntado en ${documento} (Apuntes rápidos): ${texto}` }
  })

  // ------------------------------------------------------------ guardas sobre las órdenes de git
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const orden = String((e as { command?: unknown }).command ?? '')
    if (!/\bgit\b/.test(orden)) return next(e)
    const c = await copia($)
    const carpeta = await carpetaActual($, c)

    if (activas.fusiones) {
      const fusion = fusionEnPrincipal(orden, carpeta, c)
      if (fusion) {
        const { ramaPrincipal } = await leerAjustes($, c.raizOriginal)
        return { deny: negativa(fusion, ramaPrincipal) }
      }
    }

    if (activas.commits) {
      const { prohibidos } = await leerAjustes($, c.raizOriginal)
      for (const git of llamadasGit(orden, carpeta, c.home)) {
        const juicio = juzgar(git, c, prohibidos)
        if (juicio.tipo === 'niega') return { deny: `equipo: ${juicio.motivo}` }
        if (juicio.tipo === 'mirar') {
          // Las rutas normalizadas van en minúsculas: git, con la ruta tal como es (en Linux importa).
          const carpetaGit = juicio.copia === c.raiz ? c.raizOriginal : juicio.copia === c.principal ? c.principalOriginal : juicio.copia
          const entran = await prohibidosQueEntran($, carpetaGit, juicio.modo, prohibidos)
          if (entran.length > 0) return { deny: `equipo: ${motivoProhibido(entran.join(', '))}` }
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    // Si la guarda falla, una fusión no pasa sin mirarla; lo demás sigue, para no bloquear la sesión entera.
    const orden = String((e as { command?: unknown }).command ?? '')
    return activas.fusiones && /\bgit\b[\s\S]*\b(merge|pull)\b/.test(orden)
      ? { deny: `equipo: la guarda de fusiones ha fallado (${next.error.message}); no dejo pasar una fusión sin mirarla.` }
      : next(e)
  })
}

// ---------------------------------------------------------------- ajustes

async function leerAjustes($: EngineInterface, raiz: string): Promise<Ajustes> {
  return ajustesDeTexto(await $.fs.read(`${raiz}/${ARCHIVO}`).catch(() => null))
}

// ---------------------------------------------------------------- contexto

async function leerContexto($: EngineInterface): Promise<void> {
  const uso = await $.session.usage().catch(() => null)
  if (!uso) return
  await update($, contexto, actual => ({
    ...actual,
    tokens: uso.context.tokens ?? actual.tokens,
    ventana: uso.context.window || actual.ventana,
  }))
}

async function compactar($: EngineInterface): Promise<void> {
  await update($, contexto, actual => ({ ...actual, compactando: true }))
  try {
    const hecho = await $.session.compact()
    if ('skip' in hecho) {
      $.ui.toast(`No se ha compactado: ${hecho.skip}`)
    } else {
      // Con tokensAfter la cifra se pone al día ya; si no, con la próxima respuesta.
      const despues = hecho.tokensAfter
      await update($, contexto, actual =>
        despues === undefined ? { ...actual, compactado: true } : { ...actual, tokens: despues, compactado: false },
      )
      $.ui.toast(`Compactado${hecho.tokensBefore !== undefined && despues !== undefined ? `: de ${miles(hecho.tokensBefore)} a ${miles(despues)}` : ''}`)
    }
  } catch (error) {
    $.ui.toast(`No se ha podido compactar (¿hay un turno en marcha?): ${String(error).slice(0, 120)}`)
  } finally {
    await update($, contexto, actual => ({ ...actual, compactando: false }))
  }
}

/** La línea del contexto en la franja (register.tsx la junta con las demás). */
async function lineaContexto($: EngineInterface, e: FranjaEvento): Promise<RenderNode | null> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const c = await read($, contexto)
  return (
    <Box key="contexto" flexDirection="row" gap={1} width={e.props.bodyColumns}>
      <Text color={color(c)} wrap="truncate-end">
        {texto(c)}
      </Text>
      {c.tokens !== null && !c.compactando && !e.props.isWorking ? (
        <Button key="compactar" label="Compactar" onPress={() => compactar($)} />
      ) : null}
    </Box>
  )
}

// ---------------------------------------------------------------- equipo y subidas

const scripts = ($: EngineInterface) => `${$.plugin.root.replace(/\\/g, '/')}/scripts`

type Salida = { exitCode: number; stdout: string; stderr: string }

/** Al empezar la sesión: los comandos y, con las subidas, los drivers de fusión y resultado_lote (en la principal). */
async function empezarEquipo($: EngineInterface, conSubidas: boolean): Promise<void> {
  await $.command.register({ name: 'ramas', description: 'Panel con los worktrees, su bloque de decisiones y sus agentes (equipo)' })
  await $.command.register({
    name: 'reservar',
    description: 'Siguiente bloque libre de decisiones; con el nombre de un worktree, se lo apunta en Orca (equipo)',
    argumentHint: '[worktree]',
  })
  await $.command.register({ name: 'pendiente', description: 'Apunta un pendiente en el documento de pendientes (equipo)', argumentHint: '<texto>' })
  // Sin ajustes valen los de por defecto (npm): en la principal se le recuerda al usuario que lo adapte a su proyecto.
  const propios = await $.fs.read(`${await $.session.root()}/${ARCHIVO}`).catch(() => null)
  if (typeof propios !== 'string' && (await enPrincipal($))) {
    await $.ui.toast('equipo: este proyecto aún no tiene .claude/equipo.json. Pide a Claude que lo adapte (/equipo:adapt-to-project).')
  }
  if (!conSubidas) return
  // Los drivers de fusión van al .git común: en cualquier copia, para que valgan también al traer la principal.
  await instalarDrivers($)
  if (await enPrincipal($)) {
    await $.tool.register({
      name: HERRAMIENTA,
      description:
        'Plugin equipo: resultado de la comprobación del lote de ramas que el mod acaba de subir a la rama principal. ' +
        'Una entrada por rama: ok=true si compila y sus pruebas pasan (el mod avisa al agente y cierra su worktree), ' +
        'ok=false con el motivo si algo falla (el mod se lo manda al agente para que lo arregle y vuelva a avisar). ' +
        'La rama puede ir con su nombre largo (usuario/x) o corto (x), y también vale una rama fusionada a mano que no ' +
        'está en la franja: entonces conviene dar la sesión de su agente (ListAgents) en sesion para avisarle.',
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
                motivo: { type: 'string', description: 'Qué ha fallado (solo si ok es false).' },
                sesion: { type: 'string', description: 'Sesión del agente (ListAgents), si la rama no está en la franja.' },
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

/** La franja de las subidas, o null si no hay ninguna (register.tsx la junta con las demás). */
async function franjaSubidas($: EngineInterface, e: FranjaEvento): Promise<RenderNode | null> {
  const listas = await read($, subidas)
  if (listas.length === 0) return null
  const tabla = $.ui.resolve(e)
  const { Box, Text, Button } = tabla
  // El campo de texto no está en todas las superficies; donde no está, «Solucionar» manda sin indicación.
  const Input = 'Input' in tabla ? tabla.Input : null
  const pendientes = listas.filter(s => s.estado === 'lista')
  const marcadas = pendientes.filter(s => s.marcada)
  return (
    <Box key="subidas" flexDirection="column" width={e.props.bodyColumns}>
      {listas.map(s => (
        <Box key={`subida-${s.rama}`} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            {s.estado === 'lista' ? (
              <Button key={`marcar-${s.rama}`} label={s.marcada ? '[x]' : '[ ]'} plain onPress={() => marcar($, s.rama)} />
            ) : null}
            <Text bold color={colorSubida(s.estado)} wrap="truncate-end">
              ⇡ {s.rama} ({s.commit.slice(0, 9)}) · {textoEstado(s)}
            </Text>
            {s.estado === 'lista' || s.estado === 'error' ? (
              <Button key={`subir-${s.rama}`} label="Subir" variant="primary" onPress={() => subir($, [s.rama])} />
            ) : null}
            {puedeSolucionar(s) ? (
              <Button
                key={`solucionar-${s.rama}`}
                label="Solucionar"
                onPress={() => (Input ? poner($, s.rama, { estado: 'nota', previo: s.estado }) : mandarSolucion($, s.rama, ''))}
              />
            ) : null}
            {s.estado === 'nota' ? (
              <Button key={`cancelar-${s.rama}`} label="Cancelar" onPress={() => poner($, s.rama, { estado: s.previo || 'lista' })} />
            ) : null}
            {borrable(s.estado) ? <Button key={`borrar-${s.rama}`} label="Borrar" onPress={() => borrar($, s.rama)} /> : null}
          </Box>
          {s.resumen ? (
            <Text dimColor wrap="truncate-end">
              {'  '}
              {s.resumen}
            </Text>
          ) : null}
          {s.estado === 'lista'
            ? (s.choques ?? []).map((c, i) => (
                <Text key={`choque-${s.rama}-${i}`} color="error" wrap="truncate-end">
                  {'  ⚠ '}chocaría con {c.con.map(corto).join(', ')}: {c.archivos.join(', ')}
                </Text>
              ))
            : null}
          {s.porRevisar.map((l, i) => (
            <Text key={`revisar-${s.rama}-${i}`} color="claude" wrap="truncate-end">
              {'  ! '}
              {l}
            </Text>
          ))}
          {s.estado === 'nota' && Input ? (
            <Input
              key={`nota-${s.rama}`}
              label="  Indicación para el agente (opcional):"
              placeholder="Enter manda lo de «Por revisar» tal cual"
              submitLabel="mandar"
              autoFocus
              onSubmit={(valor: string) => void mandarSolucion($, s.rama, valor)}
            />
          ) : null}
        </Box>
      ))}
      {pendientes.length > 0 ? (
        <Box flexDirection="row" gap={1}>
          {marcadas.length > 0 ? (
            <Button
              key="subir-marcadas"
              label={`Subir marcadas (${marcadas.length})`}
              variant="primary"
              onPress={() => subir($, marcadas.map(s => s.rama))}
            />
          ) : null}
          {pendientes.length > 1 ? (
            <Button key="subir-todas" label={`Subir todas (${pendientes.length})`} onPress={() => subir($, pendientes.map(s => s.rama))} />
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}

async function enPrincipal($: EngineInterface): Promise<boolean> {
  const raiz = await $.session.root()
  const git = await $.fs.stat(`${raiz}/.git`).catch(() => undefined)
  return git?.kind === 'dir'
}

async function ajustesDe($: EngineInterface): Promise<Ajustes> {
  return leerAjustes($, await $.session.root())
}

async function cargarRamas($: EngineInterface): Promise<PanelRamas> {
  const raiz = await $.session.root()
  const a = await ajustesDe($)
  const ahora = await $.clock.now()
  const git = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: raiz, timeoutMs: 10000 }).catch(() => null)
  if (!git || git.exitCode !== 0) {
    const fallo: PanelRamas = { ...PANEL_INICIAL, leido: ahora, error: 'git worktree list ha fallado' }
    await update($, panel, () => fallo)
    return fallo
  }
  const orca = await $.process.run(['orca', 'worktree', 'ps', '--json'], { cwd: raiz, timeoutMs: 20000 }).catch(() => null)
  const ramas: Rama[] = montarRamas(git.stdout, orca && orca.exitCode === 0 ? orca.stdout : '', a.decisiones.prefijo)
  const mayores: number[] = []
  for (const r of ramas) {
    if (a.decisiones.activo) {
      const design = await $.fs.read(`${r.ruta}/${a.decisiones.documento}`).catch(() => null)
      if (typeof design === 'string') mayores.push(mayorDecision(design, a.decisiones.prefijo))
    }
    if (r.principal || !r.rama) continue
    const cuenta = await $.process
      .run(['git', 'rev-list', '--left-right', '--count', `${a.ramaPrincipal}...${r.rama}`], { cwd: raiz, timeoutMs: 10000 })
      .catch(() => null)
    if (cuenta && cuenta.exitCode === 0) [r.detras, r.delante] = cuentas(cuenta.stdout)
  }
  const siguiente = a.decisiones.activo ? textoBloque(siguienteBloque(mayores, ramas, a.decisiones.bloque), a.decisiones.prefijo) : ''
  const datos: PanelRamas = { ramas, siguiente, leido: ahora, error: '' }
  await update($, panel, () => datos)
  return datos
}

async function revisarFusion($: EngineInterface, rama: string, commit: string, a: Ajustes) {
  const raiz = await $.session.root()
  const git = async (...args: string[]) => {
    const r = await $.process.run(['git', ...args], { cwd: raiz, timeoutMs: 20000 }).catch(() => null)
    return r && r.exitCode === 0 ? r.stdout : ''
  }
  let bloque: [number, number] | null = null
  if (a.decisiones.activo) {
    const orca = await $.process.run(['orca', 'worktree', 'ps', '--json'], { cwd: raiz, timeoutMs: 20000 }).catch(() => null)
    const ramas = montarRamas(await git('worktree', 'list', '--porcelain'), orca && orca.exitCode === 0 ? orca.stdout : '', a.decisiones.prefijo)
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

async function recibirSubida($: EngineInterface, aviso: AvisoSubida, texto: string): Promise<void> {
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

async function poner($: EngineInterface, rama: string, cambios: Partial<Subida>): Promise<void> {
  await update($, subidas, lista => lista.map(s => (s.rama === rama ? { ...s, ...cambios } : s)))
}

async function marcar($: EngineInterface, rama: string): Promise<void> {
  await update($, subidas, lista => lista.map(s => (s.rama === rama ? { ...s, marcada: !s.marcada } : s)))
}

async function borrar($: EngineInterface, rama: string): Promise<void> {
  const i = cola.indexOf(rama)
  if (i >= 0) cola.splice(i, 1)
  await update($, subidas, lista => lista.filter(s => s.rama !== rama))
}

async function subir($: EngineInterface, ramas: string[]): Promise<void> {
  for (const rama of ramas) {
    if (cola.includes(rama)) continue
    cola.push(rama)
    await poner($, rama, { estado: 'en-cola', marcada: false, detalle: '' })
  }
  if (!procesando) void procesar($)
}

/** Fusiona la cola en la principal una rama tras otra y, al vaciarla, pide a Claude la comprobación del lote. */
async function procesar($: EngineInterface): Promise<void> {
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

/** Aparta una rama del lote y se lo dice a su agente con las ramas o la principal con las que choca. */
async function apartar($: EngineInterface, p: Apartada, a: Ajustes): Promise<Apartada> {
  const subida = (await read($, subidas)).find(s => s.rama === p.rama)
  const enviado = subida ? await avisar($, subida.sesion, textoApartada(p.rama, p.con, p.archivos, a.ramaPrincipal)) : false
  const detalle = `choca con ${p.con.map(corto).join(', ')} en ${p.archivos.join(', ')}${enviado ? '' : ' · no he podido avisar al agente'}`
  await poner($, p.rama, { estado: 'apartada', detalle })
  return p
}

/** `node scripts/ensayo.mjs --json` en la copia principal; null si falla. */
async function ensayar($: EngineInterface, ramas: string[], a: Ajustes): Promise<Plan | null> {
  if (ramas.length === 0) return null
  const raiz = await $.session.root()
  const r = await $.process
    .run(['node', `${scripts($)}/ensayo.mjs`, '--json', '--base', a.ramaPrincipal, ...ramas], { cwd: raiz, timeoutMs: 180000 })
    .catch(() => null)
  return r && r.exitCode === 0 ? leerPlan(r.stdout) : null
}

/** Ensaya juntas las ramas que esperan en la franja y apunta con qué chocaría cada una (se ve antes de pulsar). */
async function ensayarListas($: EngineInterface): Promise<void> {
  const listas = (await read($, subidas)).filter(s => s.estado === 'lista').map(s => s.rama)
  if (listas.length === 0) return
  const a = await ajustesDe($)
  const plan = await ensayar($, listas, a)
  if (!plan) return
  await update($, subidas, lista =>
    lista.map(s => (listas.includes(s.rama) ? { ...s, choques: choquesDe(plan, s.rama, a.ramaPrincipal).map(c => ({ con: c.con, archivos: c.archivos })) } : s)),
  )
}

/** Apunta en el .git común los drivers de fusión y los atributos de .claude/equipo.json. */
async function instalarDrivers($: EngineInterface): Promise<void> {
  const raiz = await $.session.root()
  await $.process.run(['node', `${scripts($)}/fusion.mjs`, 'instalar'], { cwd: raiz, timeoutMs: 20000 }).catch(() => null)
}

async function fusionar($: EngineInterface, rama: string, a: Ajustes): Promise<Fusionada | null> {
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

  const hecho = await git(['merge', '--no-ff', rama, '-m', mensajeFusion(rama, subida.resumen, a.ramaPrincipal)], 120000)
  if (hecho.exitCode !== 0) {
    const archivos = conflictos((await git(['diff', '--name-only', '--diff-filter=U'])).stdout)
    if ((await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).exitCode === 0) await git(['merge', '--abort'])
    if (archivos.length > 0 || /CONFLICT/.test(hecho.stdout)) {
      const enviado = await avisar($, subida.sesion, textoConflicto(rama, archivos, a.ramaPrincipal))
      await poner($, rama, { estado: 'conflicto', detalle: `${archivos.join(', ')}${enviado ? '' : ' · no he podido avisar al agente'}` })
      return null
    }
    return fallo((hecho.stderr || hecho.stdout).trim().slice(0, 300) || 'git merge ha fallado')
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
  await poner($, rama, { estado: 'fusionada', fusion, detalle: '' })
  return { rama, fusion, aviso: subida.texto, revision, codigos, distinta }
}

/**
 * Lo que llega por la herramienta del lote: avisa al agente y, si está bien, cierra su worktree. La rama puede venir con
 * su nombre largo o corto, y puede no estar en la franja (fusionada a mano): se busca en git y en los worktrees.
 */
async function resultado($: EngineInterface, nombre: string, ok: boolean, motivo: string, sesionDada: string): Promise<string> {
  const a = await ajustesDe($)
  const principal = a.ramaPrincipal
  const lista = await read($, subidas)
  const subida = lista.find(s => s.rama === nombre) ?? lista.find(s => corto(s.rama) === nombre)
  const raiz = await $.session.root()
  const git = async (...args: string[]) =>
    $.process.run(['git', ...args], { cwd: raiz, timeoutMs: 20000 }).catch(() => ({ exitCode: 1, stdout: '', stderr: '' }))
  const copias = rutasDeGit((await git('worktree', 'list', '--porcelain')).stdout)
  let rama = subida?.rama ?? ''
  if (!rama) {
    const copia = copias.find(w => w.rama !== '' && (w.rama === nombre || corto(w.rama) === nombre || corto(w.ruta.replace(/\\/g, '/')) === nombre))
    rama = copia?.rama ?? ((await git('rev-parse', '-q', '--verify', `refs/heads/${nombre}`)).exitCode === 0 ? nombre : '')
  }
  if (!rama) return `${nombre}: no está en la franja ni hay una rama o un worktree con ese nombre.`
  const sesion = sesionDada || subida?.sesion || ''
  const fusion = (subida?.fusion || subida?.commit || (await git('rev-parse', '--short', 'HEAD')).stdout.trim()).slice(0, 9)
  const sinSesion = sesion ? '' : ' (no sé la sesión de su agente: avísale tú con SendMessage o pásala en sesion)'
  if (!ok) {
    const enviado = await avisar($, sesion, textoFalla(rama, fusion, motivo || 'sin motivo', principal))
    if (subida) await poner($, rama, { estado: 'falla', detalle: motivo })
    return `${rama}: marcada como fallida${enviado ? '; agente avisado' : `; no he podido avisar al agente${sinSesion}`}.`
  }
  // Solo se cierra lo que ya está entero en la principal.
  if ((await git('merge-base', '--is-ancestor', `refs/heads/${rama}`, 'HEAD')).exitCode !== 0) {
    return `${rama}: no está entera en ${principal} (tiene commits que ${principal} no tiene); no cierro su worktree.`
  }
  let aviso = ''
  if (a.backlog.activo) {
    const quedan = codigosSinRenumerar(rama, (await git('show', `HEAD:${a.backlog.documento}`)).stdout)
    if (quedan.length > 0) {
      aviso = ` ⚠ Quedan en ${a.backlog.documento} sin renumerar: ${quedan.join(', ')} (node "${scripts($)}/renumerar.mjs" --aplicar ${corto(rama)}).`
    }
  }
  const enviado = await avisar($, sesion, textoSubida(rama, fusion, principal))
  const avisado = enviado ? ', agente avisado' : `, sin avisar al agente${sinSesion}`
  const ruta = copias.find(w => w.rama === rama)?.ruta ?? ''
  if (ruta === '' || misma(ruta, raiz)) {
    if (subida) await borrar($, rama)
    await git('branch', '-d', rama)
    return `${rama}: comprobada${avisado}; no tenía worktree abierto.${aviso}`
  }
  // --force: lo que haya quedado sin confirmar en el worktree (dependencias, compilados) ya no hace falta: la rama está
  // entera en la principal.
  const rm = await $.process
    .run(['orca', 'worktree', 'rm', '--worktree', `branch:${rama}`, '--force', '--json'], { cwd: raiz, timeoutMs: 120000 })
    .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  if (rm.exitCode !== 0) {
    const porque = (rm.stderr || rm.stdout).trim().slice(0, 200)
    if (subida) await poner($, rama, { estado: 'fusionada', detalle: `comprobada; no he podido cerrar el worktree: ${porque}` })
    return `${rama}: comprobada${avisado}; el worktree no se ha podido cerrar (${porque}).${aviso}`
  }
  // Lo que Orca pueda dejar a medias: el registro del worktree en git y la rama (ya en la principal).
  await git('worktree', 'prune')
  await git('branch', '-d', rama)
  if (subida) await borrar($, rama)
  return `${rama}: comprobada${avisado} y worktree cerrado.${aviso}`
}

async function mandarSolucion($: EngineInterface, rama: string, nota: string): Promise<void> {
  const subida = (await read($, subidas)).find(s => s.rama === rama)
  if (!subida) return
  const a = await ajustesDe($)
  const motivo = subida.previo === 'conflicto' || subida.previo === 'falla' || subida.previo === 'error' || subida.previo === 'apartada' ? subida.detalle : ''
  const enviado = await avisar($, subida.sesion, textoSolucionar(rama, subida.porRevisar, nota.trim(), motivo, a.ramaPrincipal))
  await poner($, rama, enviado ? { estado: 'solucion-pedida' } : { estado: 'error', detalle: 'no he podido mandar el mensaje al agente' })
}

async function avisar($: EngineInterface, sesion: string, texto: string): Promise<boolean> {
  if (!sesion) return false
  const r = await $.session.send({ to: sesion, text: texto }).catch(() => ({ isDelivered: false as const, reason: 'error' }))
  return r.isDelivered === true
}

// ---------------------------------------------------------------- guardas

const copias = new Map<string, Copia>()

/** La copia de la sesión (se lee una vez por raíz). */
async function copia($: EngineInterface): Promise<Copia> {
  const raiz = await $.session.root()
  const guardada = copias.get(raiz)
  if (guardada) return guardada
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? ''
  const git = await $.fs.stat(`${raiz}/.git`).catch(() => undefined)
  const lista = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: raiz, timeoutMs: 10000 }).catch(() => undefined)
  const leida = montarCopia(raiz, home, git?.kind === 'file', lista && lista.exitCode === 0 ? lista.stdout : '')
  copias.set(raiz, leida)
  return leida
}

/** Carpeta de la sesión ahora mismo, normalizada. */
async function carpetaActual($: EngineInterface, c: Copia): Promise<string> {
  return normalizar(await $.session.cwd(), null, c.home) ?? c.raiz
}

async function prohibidosQueEntran($: EngineInterface, carpeta: string, modo: Modo, prohibidos: readonly string[]): Promise<string[]> {
  if (prohibidos.length === 0) return []
  const estado = await $.process
    .run(['git', '-C', carpeta, 'status', '--porcelain', '--untracked-files=all', '--', ...prohibidos], { timeoutMs: 15000 })
    .catch(() => undefined)
  return estado && estado.exitCode === 0 ? prohibidosConCambios(estado.stdout, modo) : []
}
