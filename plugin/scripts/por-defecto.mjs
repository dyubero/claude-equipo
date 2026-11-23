// Valores por defecto de los ajustes del plugin, cómo se mezclan con los del usuario y los del proyecto, y cómo se
// comprueban. Lo usan los scripts (comun.mjs) y el mod (hooks/ajustes.ts), así que no importa nada: el mod corre sin
// Node.
//
// Los ajustes salen de dos archivos, y lo que no diga ninguno vale lo de aquí:
//   ~/.claude/equipo.json          lo de la persona, para todos sus repositorios (su lanzador, sus umbrales…)
//   <copia>/.claude/equipo.json    lo del proyecto, que va encima

/** Qué archivos son pruebas, en los ecosistemas que conoce inspect-project.mjs (cada trozo es una alternativa). */
export const PATRONES_DE_PRUEBAS = Object.freeze([
  '\\.(test|spec)\\.[cm]?[jt]sx?$',
  '(^|/)(test_[^/]*|[^/]*_test)\\.py$',
  '(^|/)tests/[^/]*\\.rs$',
  '_test\\.go$',
  '(Test|Tests|IT|Spec)\\.(java|kt|scala|groovy)$',
  '(Test|Tests)\\.(cs|fs|vb)$',
  'Test\\.php$',
  '(_spec|_test)\\.rb$',
  '_test\\.exs$',
  '_test\\.dart$',
  'Tests?\\.swift$',
])

export const POR_DEFECTO = Object.freeze({
  /** Rama a la que se suben las demás. */
  ramaPrincipal: 'main',
  /** Idioma de los commits, documentos y avisos que escriben los agentes. */
  idioma: 'es',
  comandos: Object.freeze({
    /** Compila o comprueba tipos; '' si no hay. Depende del proyecto: lo pone adapt-to-project. */
    compilar: '',
    /** Pasa todas las pruebas; '' si no se sabe todavía. */
    probar: '',
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
  pruebas: Object.freeze({ patron: PATRONES_DE_PRUEBAS.map(p => `(?:${p})`).join('|') }),
  /** Documento donde /pendiente apunta cosas y las skills apuntan lo que queda sin probar. */
  pendientes: 'docs/pendientes.md',
  /** Cómo entra una rama en la principal: 'merge' (una fusión, --no-ff) o 'squash' (un solo commit con toda la rama). */
  fusion: Object.freeze({ estrategia: 'merge' }),
  /** La franja del contexto: porcentajes desde los que avisa en amarillo y en rojo. */
  contexto: Object.freeze({ aviso: 60, peligro: 80 }),
  guardas: Object.freeze({
    /** En la copia principal, negar `git add -A` / `.` / `-u` y `git commit -a`. */
    barridos: true,
  }),
  worktrees: Object.freeze({
    /** Quién crea y cierra los worktrees: 'orca', 'git' o 'auto' (Orca si está en el PATH, si no git). */
    gestor: 'auto',
    /** Con git: carpeta de cada worktree, desde la copia principal; {repo} y {nombre} se cambian. */
    carpeta: '../{repo}-worktrees/{nombre}',
    /** Con git: lo que va delante del nombre para formar la rama (p. ej. 'ana/'). Orca pone el suyo. */
    prefijoRama: '',
    /** Cerrar el worktree de una rama cuando la comprobación del lote la da por buena. */
    cerrarAlSubir: true,
  }),
  /**
   * Con git: cómo se abre la sesión del agente. `preajuste`: 'auto' (lo que haya en la máquina), 'tmux', 'wt',
   * 'terminal', 'iterm', 'manual' (no abre nada: da la orden para pegarla) o 'propio' (la lista de `orden`, con
   * {ruta}, {nombre} y {prompt}).
   */
  lanzar: Object.freeze({ preajuste: 'auto', orden: Object.freeze([]) }),
  /** Nombre del repositorio en Orca; '' para el de la carpeta de la copia principal. */
  orca: Object.freeze({ repo: '' }),
  /** Principio del nombre de la sesión de la copia principal en ListAgents; '' para el de su carpeta. */
  sesionPrincipal: '',
  /** Textos del plugin que se cambian por otros: { "<clave>": "<plantilla con {huecos}>" }. */
  textos: Object.freeze({}),
})

/** Valores que solo pueden ser unos cuantos. */
export const OPCIONES = Object.freeze({
  'fusion.estrategia': ['merge', 'squash'],
  'worktrees.gestor': ['auto', 'orca', 'git'],
  'lanzar.preajuste': ['auto', 'tmux', 'wt', 'terminal', 'iterm', 'manual', 'propio'],
})

const esObjeto = x => typeof x === 'object' && x !== null && !Array.isArray(x)

function encima(base, capa) {
  if (!esObjeto(capa)) return base
  for (const [clave, valor] of Object.entries(capa)) {
    if (clave.startsWith('$')) continue
    base[clave] = esObjeto(valor) && esObjeto(base[clave]) ? encima(base[clave], valor) : valor
  }
  return base
}

/** Los valores por defecto con cada capa encima de la anterior (los objetos se mezclan clave a clave). */
export function mezclar(base, ...capas) {
  return capas.reduce(encima, JSON.parse(JSON.stringify(base)))
}

const TIPOS = { string: 'texto', number: 'número', boolean: 'true o false' }
const tipo = x => (Array.isArray(x) ? 'lista' : x === null ? 'null' : esObjeto(x) ? 'objeto' : (TIPOS[typeof x] ?? typeof x))

/**
 * Lo que está mal en un archivo de ajustes ya leído: claves que no existen, tipos equivocados y valores que no valen.
 * Devuelve una línea por problema; vacío si está bien. Las claves que empiezan por `$` no cuentan.
 */
export function comprobar(propios, base = POR_DEFECTO, ruta = '') {
  if (!esObjeto(propios)) return [`${ruta || 'el archivo'} tiene que ser un objeto { … }`]
  const problemas = []
  for (const [clave, valor] of Object.entries(propios)) {
    if (clave.startsWith('$')) continue
    const donde = ruta ? `${ruta}.${clave}` : clave
    if (!(clave in base)) {
      const parecida = Object.keys(base).find(k => k.toLowerCase() === clave.toLowerCase())
      problemas.push(`«${donde}» no es un ajuste${parecida ? ` (¿«${ruta ? `${ruta}.` : ''}${parecida}»?)` : ''}`)
      continue
    }
    const esperado = base[clave]
    if (tipo(valor) !== tipo(esperado)) {
      problemas.push(`«${donde}» tiene que ser ${tipo(esperado)}, y es ${tipo(valor)}`)
      continue
    }
    if (donde === 'textos') {
      for (const [k, v] of Object.entries(valor)) if (typeof v !== 'string') problemas.push(`«textos.${k}» tiene que ser texto`)
    } else if (esObjeto(valor)) {
      problemas.push(...comprobar(valor, esperado, donde))
    } else if (Array.isArray(valor)) {
      if (valor.some(x => typeof x !== 'string')) problemas.push(`«${donde}» tiene que ser una lista de textos`)
    } else if (OPCIONES[donde] && !OPCIONES[donde].includes(valor)) {
      problemas.push(`«${donde}» vale ${OPCIONES[donde].map(o => `"${o}"`).join(', ')}; no "${valor}"`)
    }
  }
  if (!ruta) {
    const patron = propios.pruebas?.patron
    if (typeof patron === 'string') {
      try {
        new RegExp(patron)
      } catch (error) {
        problemas.push(`«pruebas.patron» no es una expresión regular: ${error.message}`)
      }
    }
    const c = propios.contexto
    if (esObjeto(c)) {
      for (const k of ['aviso', 'peligro']) if (typeof c[k] === 'number' && (c[k] < 0 || c[k] > 100)) problemas.push(`«contexto.${k}» es un porcentaje: de 0 a 100`)
      const aviso = typeof c.aviso === 'number' ? c.aviso : base.contexto.aviso
      const peligro = typeof c.peligro === 'number' ? c.peligro : base.contexto.peligro
      if (aviso > peligro) problemas.push('«contexto.aviso» no puede ser mayor que «contexto.peligro»')
    }
    if (typeof propios.decisiones?.bloque === 'number' && propios.decisiones.bloque < 1) problemas.push('«decisiones.bloque» tiene que ser 1 o más')
    if (propios.lanzar?.preajuste === 'propio' && !(Array.isArray(propios.lanzar.orden) && propios.lanzar.orden.length > 0)) {
      problemas.push('con «lanzar.preajuste» "propio" hace falta «lanzar.orden»: la orden como lista, p. ej. ["tmux", "new-window", "-c", "{ruta}", "claude", "{prompt}"]')
    }
  }
  return problemas
}
