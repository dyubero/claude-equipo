// Lectura aproximada de una orden de Bash o de PowerShell: la parte en órdenes sueltas, sigue los `cd` y saca las
// llamadas a git con la carpeta en la que se ejecutan. No es un intérprete: basta para las formas que usan los
// agentes (`git -C <ruta> …`, `cd <ruta> && git …`, heredocs y here-strings en los mensajes).

import { normalizar } from './rutas'

/** Una orden con los cuerpos de sus heredocs y here-strings sacados aparte (en su sitio queda `__HEREDOC_n__`). */
export type Orden = { texto: string; cuerpos: string[] }

export function quitarHeredocs(orden: string): Orden {
  const cuerpos: string[] = []
  let texto = orden.replace(/\r\n/g, '\n')
  // Here-strings de PowerShell: @'…'@ y @"…"@, con el cierre al principio de línea.
  texto = texto.replace(/@(['"])\n([\s\S]*?)\n\1@/g, (_todo, _comilla, cuerpo: string) => {
    cuerpos.push(cuerpo)
    return `__HEREDOC_${cuerpos.length - 1}__`
  })
  // Heredocs de Bash: <<EOF, <<'EOF', <<"EOF", <<-EOF.
  for (;;) {
    const inicio = /<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/.exec(texto)
    if (!inicio) break
    const finDeLinea = texto.indexOf('\n', inicio.index)
    if (finDeLinea < 0) break
    const delimitador = inicio[3] as string
    const resto = texto.slice(finDeLinea + 1)
    const cierre = new RegExp(`(^|\\n)[ \\t]*${delimitador}[ \\t]*(?=\\n|$)`).exec(resto)
    const cuerpo = cierre ? resto.slice(0, cierre.index) : resto
    const despues = cierre ? resto.slice(cierre.index + cierre[0].length) : ''
    cuerpos.push(cuerpo)
    texto = `${texto.slice(0, inicio.index)}__HEREDOC_${cuerpos.length - 1}__${texto.slice(inicio.index + inicio[0].length, finDeLinea)}${despues}`
  }
  return { texto, cuerpos }
}

/** Parte la orden por `&&`, `||`, `;`, `|` y saltos de línea que no están entre comillas. */
export function segmentos(texto: string): string[] {
  const salida: string[] = []
  let actual = ''
  let comilla: string | null = null
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i] as string
    if (comilla) {
      if (c === '\\' && comilla === '"' && texto[i + 1] === '"') {
        actual += '\\"'
        i++
        continue
      }
      if (c === comilla) comilla = null
      actual += c
      continue
    }
    if (c === '"' || c === "'") {
      comilla = c
      actual += c
      continue
    }
    const dos = texto.slice(i, i + 2)
    if (dos === '&&' || dos === '||') {
      salida.push(actual)
      actual = ''
      i++
      continue
    }
    if (c === ';' || c === '|' || c === '\n') {
      salida.push(actual)
      actual = ''
      continue
    }
    actual += c
  }
  salida.push(actual)
  return salida.map(s => s.trim()).filter(s => s !== '')
}

/** Palabras de una orden suelta, sin las comillas. */
export function palabras(segmento: string): string[] {
  const salida: string[] = []
  let actual = ''
  let hay = false
  let comilla: string | null = null
  for (let i = 0; i < segmento.length; i++) {
    const c = segmento[i] as string
    if (comilla) {
      if (c === '\\' && comilla === '"' && segmento[i + 1] === '"') {
        actual += '"'
        i++
      } else if (c === comilla) {
        comilla = null
      } else {
        actual += c
      }
      continue
    }
    if (c === '"' || c === "'") {
      comilla = c
      hay = true
      continue
    }
    if (/\s/.test(c)) {
      if (hay) salida.push(actual)
      actual = ''
      hay = false
      continue
    }
    actual += c
    hay = true
  }
  if (hay) salida.push(actual)
  return salida
}

/** Nombre del programa sin carpeta ni `.exe`, en minúsculas. */
export function programa(palabra: string): string {
  return (palabra.replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase().replace(/\.exe$/, '')
}

const PREFIJOS = new Set(['&', '.', 'command', 'exec', 'time', 'nohup', 'call', 'sudo', 'env'])
const SHELLS = new Set(['bash', 'sh', 'cmd', 'powershell', 'pwsh'])
const CAMBIOS_DE_CARPETA = new Set(['cd', 'chdir', 'set-location', 'sl', 'pushd', 'push-location'])
const VUELTAS_DE_CARPETA = new Set(['popd', 'pop-location'])

/** Una orden suelta con la carpeta en la que se ejecuta (null si no se sabe). */
export type Paso = { palabras: string[]; carpeta: string | null; segmento: string }

/**
 * Las órdenes sueltas de una orden, con la carpeta de cada una tras seguir los `cd`. Entra en `bash -c "…"` y
 * `powershell -Command "…"`. `carpeta` es la de la sesión, ya normalizada.
 */
export function pasos(orden: string, carpeta: string, home: string): Paso[] {
  const { texto } = quitarHeredocs(orden)
  const salida: Paso[] = []
  const pila: (string | null)[] = []
  let actual: string | null = carpeta
  for (const segmento of segmentos(texto)) {
    let p = palabras(segmento)
    while (p.length > 0 && (PREFIJOS.has((p[0] as string).toLowerCase()) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(p[0] as string))) {
      p = p.slice(1)
    }
    if (p.length === 0) continue
    const nombre = programa(p[0] as string)
    if (SHELLS.has(nombre)) {
      const i = p.findIndex(x => /^(-c|-command|\/c|\/k)$/i.test(x))
      if (i >= 0 && i + 1 < p.length) {
        salida.push(...pasos(p.slice(i + 1).join(' '), actual ?? carpeta, home))
        continue
      }
    }
    if (CAMBIOS_DE_CARPETA.has(nombre)) {
      const destino = p.slice(1).find(x => !/^(-path|-literalpath|\/d)$/i.test(x))
      pila.push(actual)
      actual = destino === undefined ? normalizar(home, null, home) : normalizar(destino, actual, home)
      continue
    }
    if (VUELTAS_DE_CARPETA.has(nombre)) {
      actual = pila.length > 0 ? (pila.pop() ?? null) : actual
      continue
    }
    salida.push({ palabras: p, carpeta: actual, segmento })
  }
  return salida
}

/** Una llamada a git: la carpeta en la que actúa, la orden (`merge`, `add`…) y sus argumentos. */
export type Git = { carpeta: string | null; orden: string; args: string[]; segmento: string }

const OPCIONES_CON_VALOR = new Set(['-c', '--namespace', '--exec-path', '--config-env'])

export function llamadasGit(orden: string, carpeta: string, home: string): Git[] {
  const salida: Git[] = []
  for (const paso of pasos(orden, carpeta, home)) {
    if (programa(paso.palabras[0] as string) !== 'git') continue
    const p = paso.palabras
    let dir = paso.carpeta
    let i = 1
    while (i < p.length && (p[i] as string).startsWith('-')) {
      const opcion = p[i] as string
      if (opcion === '-C') {
        dir = normalizar(p[i + 1] ?? '', dir, home)
        i += 2
      } else if (opcion === '--git-dir' || opcion === '--work-tree') {
        dir = carpetaDeGit(p[i + 1] ?? '', dir, home)
        i += 2
      } else if (opcion.startsWith('--git-dir=') || opcion.startsWith('--work-tree=')) {
        dir = carpetaDeGit(opcion.slice(opcion.indexOf('=') + 1), dir, home)
        i += 1
      } else if (OPCIONES_CON_VALOR.has(opcion)) {
        i += 2
      } else {
        i += 1
      }
    }
    if (i >= p.length) continue
    salida.push({ carpeta: dir, orden: (p[i] as string).toLowerCase(), args: p.slice(i + 1), segmento: paso.segmento })
  }
  return salida
}

function carpetaDeGit(ruta: string, base: string | null, home: string): string | null {
  const dir = normalizar(ruta, base, home)
  return dir === null ? null : dir.replace(/\/\.git$/, '')
}
