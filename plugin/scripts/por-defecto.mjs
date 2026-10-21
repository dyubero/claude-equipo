// Valores por defecto de .claude/equipo.json. Lo usan los scripts (comun.mjs) y el mod (hooks/ajustes.ts), así que no
// importa nada: el mod corre sin Node.

export const POR_DEFECTO = Object.freeze({
  /** Rama a la que se suben las demás. */
  ramaPrincipal: 'main',
  /** Idioma de los commits, documentos y avisos que escriben los agentes. */
  idioma: 'es',
  comandos: Object.freeze({
    /** Compila o comprueba tipos; '' si no hay. */
    compilar: 'npm run build',
    /** Pasa todas las pruebas. */
    probar: 'npm test',
    /** Pasa solo unas pruebas: {archivos} se cambia por la lista. '' para usar siempre `probar`. */
    probarArchivos: '',
    /** Rehace los archivos de `generados` tras subir (p. ej. «npm install» para package-lock.json). */
    regenerar: '',
  }),
  /** Rutas (archivos o carpetas, relativas a la raíz) que nunca entran en un commit. */
  prohibidos: Object.freeze([]),
  /** Decisiones numeradas en un documento de diseño («### D12. Título»), con bloques reservados por rama. */
  decisiones: Object.freeze({ activo: false, documento: 'DESIGN.md', prefijo: 'D', bloque: 10 }),
  /** Backlog con códigos («| T12 | … |»): las ramas usan su nombre delante y la principal los renumera al subir. */
  backlog: Object.freeze({ activo: false, documento: 'BACKLOG.md' }),
  /** Documentos en los que, si dos ramas solo añaden líneas, se conservan las dos (además de los dos de arriba). */
  unir: Object.freeze([]),
  /** Archivos generados: al fusionar se queda el de la copia actual, y después se rehacen con `comandos.regenerar`. */
  generados: Object.freeze([]),
  pruebas: Object.freeze({ patron: '\\.(test|spec)\\.[cm]?[jt]sx?$' }),
  /** Documento donde /pendiente apunta cosas y las skills apuntan lo que queda sin probar. */
  pendientes: 'docs/pendientes.md',
  /** Nombre del repositorio en Orca; '' para el de la carpeta de la copia principal. */
  orca: Object.freeze({ repo: '' }),
  /** Principio del nombre de la sesión de la copia principal en ListAgents; '' para el de su carpeta. */
  sesionPrincipal: '',
})

const esObjeto = x => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Los valores por defecto con lo que diga el archivo encima (un nivel de objetos anidados). */
export function mezclar(base, propios) {
  const salida = JSON.parse(JSON.stringify(base))
  if (!esObjeto(propios)) return salida
  for (const [clave, valor] of Object.entries(propios)) {
    if (clave.startsWith('$')) continue
    salida[clave] = esObjeto(valor) && esObjeto(salida[clave]) ? { ...salida[clave], ...valor } : valor
  }
  return salida
}
