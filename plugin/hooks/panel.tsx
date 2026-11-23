// /ramas (el panel con los worktrees), /reservar (bloques de decisiones) y /pendiente (apuntes rápidos).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput, RenderNode } from 'claude-code'

import type { PanelRamas, Rama } from '../types'
import { ajustesDe, enPrincipal, PANEL_INICIAL, script } from './base'
import { apuntar, apuntes } from './pendientes'
import { cuentas, misma, montarRamas, rutasDeGit } from './ramas'
import { hoy, resumenRamas } from './vista'

/** Lo que enseña el panel (ver base.ts). */
const panel = atom({ plugin: 'equipo', key: 'panel' } as const, PANEL_INICIAL)

/** El identificador del panel de /ramas. */
export const PANE = 'ramas'

export async function cargarRamas($: EngineInterface): Promise<PanelRamas> {
  const raiz = await $.session.root()
  const a = await ajustesDe($)
  const ahora = await $.clock.now()
  const git = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: raiz, timeoutMs: 10000 }).catch(() => null)
  if (!git || git.exitCode !== 0) {
    const fallo: PanelRamas = { ...PANEL_INICIAL, leido: ahora, error: 'git worktree list ha fallado' }
    await update($, panel, () => fallo)
    return fallo
  }
  const ramas: Rama[] = montarRamas(git.stdout, await script($, 'worktree.mjs', ['lista'], 30000), a.decisiones.prefijo)
  for (const r of ramas) {
    if (r.principal || !r.rama) continue
    const cuenta = await $.process
      .run(['git', 'rev-list', '--left-right', '--count', `${a.ramaPrincipal}...${r.rama}`], { cwd: raiz, timeoutMs: 10000 })
      .catch(() => null)
    if (cuenta && cuenta.exitCode === 0) [r.detras, r.delante] = cuentas(cuenta.stdout)
  }
  const libre = a.decisiones.activo ? ((await script($, 'bloque.mjs', ['--json'], 30000)) as { bloque?: string } | null) : null
  const siguiente = libre?.bloque ?? ''
  const datos: PanelRamas = { ramas, siguiente, leido: ahora, error: '' }
  await update($, panel, () => datos)
  return datos
}

/** /ramas: lee las ramas, abre el panel y contesta con el resumen. */
export async function ordenRamas($: EngineInterface): Promise<string> {
  const datos = await cargarRamas($)
  await $.ui.open({ id: PANE, title: 'Ramas' })
  return resumenRamas(datos)
}

/** /reservar [worktree]: el siguiente bloque libre o, con un nombre, se lo reserva. */
export async function ordenReservar($: EngineInterface, args: string): Promise<string> {
  const a = await ajustesDe($)
  if (!a.decisiones.activo) return 'Las decisiones numeradas están apagadas (decisiones.activo en .claude/equipo.json): no hay bloques que reservar.'
  const datos = await cargarRamas($)
  if (datos.error) return `No he podido leer las ramas: ${datos.error}`
  const nombre = args.trim()
  if (nombre === '') return `Siguiente bloque libre: ${datos.siguiente} (tras la mayor decisión de las ramas y copias y de los bloques reservados).`
  const rama = datos.ramas.find(r => r.nombre === nombre || r.rama === nombre)
  if (!rama) return `No hay ningún worktree «${nombre}». Siguiente bloque libre: ${datos.siguiente}.`
  if (rama.comentario) return `${rama.nombre} ya tiene el bloque ${rama.comentario}. Siguiente libre: ${datos.siguiente}.`
  if (!(await enPrincipal($))) return `Las reservas se apuntan desde la copia principal. Siguiente bloque libre: ${datos.siguiente}.`
  // La reserva la apunta el script en el .git común (y en el comentario del worktree si hay Orca).
  const hecho = (await script($, 'bloque.mjs', ['--reservar', rama.rama, '--json'], 30000)) as { bloque?: string; error?: string } | null
  if (!hecho?.bloque) return `No he podido reservar el bloque: ${hecho?.error ?? 'bloque.mjs no ha contestado'}`
  await cargarRamas($)
  return `Reservado ${hecho.bloque} para ${rama.nombre}.`
}

/** /pendiente [texto]: apunta el texto en el documento de pendientes o, sin texto, lista lo apuntado. */
export async function ordenPendiente($: EngineInterface, args: string): Promise<string> {
  const raiz = await $.session.root()
  const documento = (await ajustesDe($)).pendientes
  const ruta = `${raiz}/${documento}`
  const actual = await $.fs.read(ruta).catch(() => null)
  const texto = args.trim()
  if (texto === '') {
    const lista = typeof actual === 'string' ? apuntes(actual) : []
    return lista.length > 0 ? `Apuntes rápidos de ${documento}:\n${lista.join('\n')}` : `No hay apuntes rápidos en ${documento}. Uso: /pendiente <texto>`
  }
  const fecha = hoy(await $.clock.now())
  const base = typeof actual === 'string' ? actual : `# Pendientes\n\nActualizado el ${fecha}.\n`
  const porcelana = await $.process.run(['git', 'worktree', 'list', '--porcelain'], { cwd: raiz, timeoutMs: 10000 }).catch(() => null)
  const rama = rutasDeGit(porcelana?.stdout ?? '').find(w => misma(w.ruta, raiz))?.rama ?? ''
  await $.fs.write(ruta, apuntar(base, texto, fecha, rama))
  return `Apuntado en ${documento} (Apuntes rápidos): ${texto}`
}

/** El dibujo del panel de /ramas. */
export async function dibujarPanel($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderNode> {
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
}
