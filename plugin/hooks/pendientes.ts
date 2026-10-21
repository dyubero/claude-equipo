// /pendiente: apunta una línea en el documento de pendientes (ajuste «pendientes»), en la sección «Apuntes rápidos»
// (se crea antes de «## En marcha», o de la primera sección, si no está), con la fecha y la rama, y pone al día
// «Actualizado el …».

export const SECCION = '## Apuntes rápidos'
const INTRO = 'Lo apuntado con `/pendiente`. Al hacerlo o lanzarlo, se quita de aquí o se pasa a su sección.'

export function apuntar(documento: string, texto: string, fecha: string, rama: string): string {
  const linea = `- ${fecha}${rama ? ` (${rama})` : ''}: ${texto.trim()}`
  let doc = documento.replace(/\r\n/g, '\n')
  doc = doc.replace(/^Actualizado el \d{4}-\d{2}-\d{2}\./m, `Actualizado el ${fecha}.`)
  const inicio = doc.indexOf(`\n${SECCION}\n`)
  if (inicio >= 0) {
    // Al final de la sección: antes del siguiente «## » o del final del documento.
    const cuerpo = inicio + SECCION.length + 2
    const siguiente = doc.indexOf('\n## ', cuerpo)
    const fin = siguiente < 0 ? doc.length : siguiente
    const antes = doc.slice(0, fin).replace(/\n+$/, '')
    return `${antes}\n${linea}\n${siguiente < 0 ? '' : '\n'}${doc.slice(fin).replace(/^\n+/, '')}`
  }
  const bloque = `${SECCION}\n\n${INTRO}\n\n${linea}\n\n`
  const enMarcha = doc.indexOf('\n## En marcha')
  if (enMarcha >= 0) return `${doc.slice(0, enMarcha + 1)}${bloque}${doc.slice(enMarcha + 1)}`
  const primera = doc.indexOf('\n## ')
  if (primera >= 0) return `${doc.slice(0, primera + 1)}${bloque}${doc.slice(primera + 1)}`
  return `${doc.replace(/\n*$/, '\n\n')}${bloque}`
}

/** Las líneas de «Apuntes rápidos», para /pendiente sin texto. */
export function apuntes(documento: string): string[] {
  const doc = documento.replace(/\r\n/g, '\n')
  const inicio = doc.indexOf(`\n${SECCION}\n`)
  if (inicio < 0) return []
  const cuerpo = doc.slice(inicio + SECCION.length + 2)
  const fin = cuerpo.indexOf('\n## ')
  return (fin < 0 ? cuerpo : cuerpo.slice(0, fin)).split('\n').filter(l => l.startsWith('- '))
}
