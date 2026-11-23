// Cómo se escriben las subidas y las ramas en la franja y en /ramas.

import type { EstadoSubida, PanelRamas, Subida } from '../types'
import type { T } from './idioma'
import { ES } from './idioma'

export function textoEstado(s: Subida, t: T = ES): string {
  switch (s.estado) {
    case 'lista':
      return (s.porRevisar.length > 0 ? t('estado.listaPorRevisar', { n: s.porRevisar.length }) : t('estado.lista')) + (s.sinEnsayo ? t('estado.sinEnsayo') : '')
    case 'en-cola':
      return t('estado.enCola')
    case 'fusionando':
      return t('estado.fusionando')
    case 'fusionada':
      return t('estado.fusionada', { commit: s.fusion.slice(0, 9), detalle: s.detalle || t('estado.faltaLote') })
    case 'conflicto':
      return t('estado.conflicto', { detalle: s.detalle })
    case 'apartada':
      return t('estado.apartada', { detalle: s.detalle })
    case 'error':
      return t('estado.error', { detalle: s.detalle })
    case 'falla':
      return t('estado.falla', { detalle: s.detalle })
    case 'nota':
      return t('estado.nota')
    case 'solucion-pedida':
      return t('estado.solucionPedida')
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

export function resumenRamas(datos: PanelRamas, t: T = ES): string {
  if (datos.error) return t('ramas.error', { error: datos.error })
  const filas = datos.ramas.map(
    r =>
      `${r.principal ? '★' : r.delante === 0 ? '✔' : '●'} ${r.nombre}${r.comentario ? ` · ${r.comentario}` : ''} · ` +
      `${r.principal ? t('ramas.principal') : r.delante === 0 ? t('ramas.todoDentro') : `+${r.delante}/−${r.detras}`}${r.agente ? ` · ${t('ramas.agente', { estado: r.agente })}` : ''}`,
  )
  return [...filas, ...(datos.siguiente ? [t('ramas.siguiente', { bloque: datos.siguiente })] : [])].join('\n')
}

/** Fecha local AAAA-MM-DD. */
export function hoy(ms: number): string {
  const d = new Date(ms)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}
