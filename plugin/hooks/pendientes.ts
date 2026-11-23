// /pendiente: apunta una línea en el documento de pendientes (ajuste «pendientes»), en la sección de apuntes rápidos
// (se crea antes de la de «en marcha», o de la primera sección, si no está), con la fecha y la rama, y pone al día la
// línea «Actualizado el …». Los títulos de las secciones son los del idioma de los ajustes (textos «pendiente.doc…»).

import type { T } from './idioma'
import { ES } from './idioma'

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function apuntar(documento: string, texto: string, fecha: string, rama: string, t: T = ES): string {
  const seccion = t('pendiente.docSeccion')
  const linea = `- ${fecha}${rama ? ` (${rama})` : ''}: ${texto.trim()}`
  let doc = documento.replace(/\r\n/g, '\n')
  // «Actualizado el 2026-01-01.» con la fecha que sea, escrito como lo escribe este idioma.
  const actualizado = new RegExp(`^${escapar(t('pendiente.docActualizado', { fecha: '\u0000' })).replace('\u0000', '\\d{4}-\\d{2}-\\d{2}')}`, 'm')
  doc = doc.replace(actualizado, t('pendiente.docActualizado', { fecha }))
  const inicio = doc.indexOf(`\n${seccion}\n`)
  if (inicio >= 0) {
    // Al final de la sección: antes del siguiente «## » o del final del documento.
    const cuerpo = inicio + seccion.length + 2
    const siguiente = doc.indexOf('\n## ', cuerpo)
    const fin = siguiente < 0 ? doc.length : siguiente
    const antes = doc.slice(0, fin).replace(/\n+$/, '')
    return `${antes}\n${linea}\n${siguiente < 0 ? '' : '\n'}${doc.slice(fin).replace(/^\n+/, '')}`
  }
  const bloque = `${seccion}\n\n${t('pendiente.docIntro')}\n\n${linea}\n\n`
  const enMarcha = doc.indexOf(`\n${t('pendiente.docEnMarcha')}`)
  if (enMarcha >= 0) return `${doc.slice(0, enMarcha + 1)}${bloque}${doc.slice(enMarcha + 1)}`
  const primera = doc.indexOf('\n## ')
  if (primera >= 0) return `${doc.slice(0, primera + 1)}${bloque}${doc.slice(primera + 1)}`
  return `${doc.replace(/\n*$/, '\n\n')}${bloque}`
}

/** Un documento de pendientes nuevo, vacío. */
export function nuevo(fecha: string, t: T = ES): string {
  return `${t('pendiente.docTitulo')}\n\n${t('pendiente.docActualizado', { fecha })}\n`
}

/** Las líneas de la sección de apuntes rápidos, para /pendiente sin texto. */
export function apuntes(documento: string, t: T = ES): string[] {
  const seccion = t('pendiente.docSeccion')
  const doc = documento.replace(/\r\n/g, '\n')
  const inicio = doc.indexOf(`\n${seccion}\n`)
  if (inicio < 0) return []
  const cuerpo = doc.slice(inicio + seccion.length + 2)
  const fin = cuerpo.indexOf('\n## ')
  return (fin < 0 ? cuerpo : cuerpo.slice(0, fin)).split('\n').filter(l => l.startsWith('- '))
}
