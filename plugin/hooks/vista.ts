// Cómo se escriben las subidas y las ramas en la franja y en /ramas.

import type { EstadoSubida, PanelRamas, Subida } from '../types'

export function textoEstado(s: Subida): string {
  switch (s.estado) {
    case 'lista':
      return s.porRevisar.length > 0 ? `lista para subir · ${s.porRevisar.length} por revisar` : 'lista para subir'
    case 'en-cola':
      return 'en cola'
    case 'fusionando':
      return 'fusionando…'
    case 'fusionada':
      return `dentro (${s.fusion.slice(0, 9)}) · ${s.detalle || 'falta comprobar el lote'}`
    case 'conflicto':
      return `conflicto, agente avisado: ${s.detalle}`
    case 'apartada':
      return `apartada del lote: ${s.detalle}`
    case 'error':
      return `no ha entrado: ${s.detalle}`
    case 'falla':
      return `dentro, pero falla: ${s.detalle}`
    case 'nota':
      return 'Solucionar: escribe una indicación o pulsa Enter'
    case 'solucion-pedida':
      return 'arreglo pedido al agente'
  }
}

export function colorSubida(estado: EstadoSubida): string {
  if (estado === 'conflicto' || estado === 'apartada' || estado === 'error' || estado === 'falla') return 'error'
  if (estado === 'fusionada') return 'success'
  if (estado === 'lista' || estado === 'nota') return 'claude'
  return 'inactive'
}

export function puedeSolucionar(s: Subida): boolean {
  if (s.estado === 'lista') return s.porRevisar.length > 0
  return s.estado === 'conflicto' || s.estado === 'apartada' || s.estado === 'falla' || s.estado === 'solucion-pedida' || s.estado === 'error'
}

export function borrable(estado: EstadoSubida): boolean {
  return estado !== 'en-cola' && estado !== 'fusionando'
}

export function resumenRamas(datos: PanelRamas): string {
  if (datos.error) return `No he podido leer las ramas: ${datos.error}`
  const filas = datos.ramas.map(
    r =>
      `${r.principal ? '★' : r.delante === 0 ? '✔' : '●'} ${r.nombre}${r.comentario ? ` · ${r.comentario}` : ''} · ` +
      `${r.principal ? 'copia principal' : r.delante === 0 ? 'todo en la principal' : `+${r.delante}/−${r.detras}`}${r.agente ? ` · agente ${r.agente}` : ''}`,
  )
  return [...filas, ...(datos.siguiente ? [`Siguiente bloque libre: ${datos.siguiente}`] : [])].join('\n')
}

/** Fecha local AAAA-MM-DD. */
export function hoy(ms: number): string {
  const d = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}
