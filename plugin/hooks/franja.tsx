// La franja sobre el prompt: la línea del contexto con «Compactar» y, debajo, las ramas listas para subir con sus
// botones. register.tsx las junta con lo que dibujen los demás plugins.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderNode } from 'claude-code'

import { ajustesDe, CONTEXTO_INICIAL, SUBIDAS_INICIAL } from './base'
import { borrar, mandarSolucion, marcar, poner, subir } from './cola'
import { color, miles, texto } from './contexto'
import type { FranjaEvento } from './dibujo'
import { corto } from './subidas'
import { borrable, colorSubida, puedeSolucionar, textoEstado } from './vista'

/** El estado que dibuja la franja (ver base.ts). */
const contexto = atom({ plugin: 'equipo', key: 'contexto' } as const, CONTEXTO_INICIAL)
const subidas = atom({ plugin: 'equipo', key: 'subidas' } as const, SUBIDAS_INICIAL)

// ---------------------------------------------------------------- contexto

export async function leerContexto($: EngineInterface): Promise<void> {
  const a = await ajustesDe($).catch(() => null)
  if (a) await update($, contexto, actual => ({ ...actual, aviso: a.contexto.aviso, peligro: a.contexto.peligro }))
  const uso = await $.session.usage().catch(() => null)
  if (!uso) return
  await update($, contexto, actual => ({
    ...actual,
    tokens: uso.context.tokens ?? actual.tokens,
    ventana: uso.context.window || actual.ventana,
  }))
}

export async function compactar($: EngineInterface): Promise<void> {
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
export async function lineaContexto($: EngineInterface, e: FranjaEvento): Promise<RenderNode | null> {
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

// ---------------------------------------------------------------- subidas

/** La franja de las subidas, o null si no hay ninguna (register.tsx la junta con las demás). */
export async function franjaSubidas($: EngineInterface, e: FranjaEvento): Promise<RenderNode | null> {
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
