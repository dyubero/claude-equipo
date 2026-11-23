// Los textos del plugin: un catálogo por idioma (es.mjs, en.mjs) y, encima, los que cambien los ajustes («textos»).
// Lo usan el mod y los scripts, así que no importa nada más que los catálogos.
//
//   const t = textos(ajustes.idioma, ajustes.textos)
//   t('fusion.mensaje', { rama: 'ana/carrito', principal: 'main', resumen: 'descuentos' })
//
// El idioma es el de `idioma` de los ajustes; si no hay catálogo para él, inglés.

import en from './en.mjs'
import es from './es.mjs'

export const CATALOGOS = Object.freeze({ es, en })

/** El idioma del catálogo que vale para un `idioma` de los ajustes («es-MX» → es; «fr» → en). */
export function idiomaDe(idioma) {
  const corto = String(idioma ?? '').toLowerCase().split(/[-_]/)[0]
  return corto in CATALOGOS ? corto : 'en'
}

/** Los huecos de una plantilla: «{rama} en {principal}» → ['principal', 'rama']. */
export const huecos = plantilla => [...new Set([...String(plantilla).matchAll(/\{([A-Za-z]+)\}/g)].map(m => m[1]))].sort()

/**
 * La función que escribe los textos en un idioma, con los `propios` de los ajustes por encima del catálogo. Una clave
 * que no existe sale tal cual, para que se vea.
 */
export function textos(idioma = 'es', propios = {}) {
  const catalogo = CATALOGOS[idiomaDe(idioma)]
  const cambiados = typeof propios === 'object' && propios !== null ? propios : {}
  return (clave, datos = {}) => {
    const propia = cambiados[clave]
    const plantilla = typeof propia === 'string' ? propia : (catalogo[clave] ?? clave)
    return plantilla.replace(/\{([A-Za-z]+)\}/g, (todo, nombre) => (nombre in datos ? String(datos[nombre]) : todo))
  }
}

/** Lo que está mal en los «textos» de unos ajustes: claves que no existen y huecos que la plantilla no tiene. */
export function comprobarTextos(propios) {
  if (typeof propios !== 'object' || propios === null || Array.isArray(propios)) return []
  const problemas = []
  for (const [clave, plantilla] of Object.entries(propios)) {
    if (!(clave in es)) {
      problemas.push(`«textos.${clave}» no es un texto del plugin (las claves están en textos/es.mjs)`)
      continue
    }
    if (typeof plantilla !== 'string') continue
    const validos = huecos(es[clave])
    const sobran = huecos(plantilla).filter(h => !validos.includes(h))
    if (sobran.length > 0) {
      problemas.push(`«textos.${clave}» usa ${sobran.map(h => `{${h}}`).join(', ')}, que ese texto no tiene (tiene: ${validos.map(h => `{${h}}`).join(', ') || 'ninguno'})`)
    }
  }
  return problemas
}
