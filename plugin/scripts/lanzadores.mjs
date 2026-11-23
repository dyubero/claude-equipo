// Cómo se abre la sesión de Claude Code de un encargo cuando el worktree lo crea git y no Orca.
//
// Un lanzador es una orden en forma de lista (programa y argumentos, sin pasar por una shell) con huecos:
//   {ruta}    carpeta del worktree
//   {nombre}  nombre corto del encargo
//   {prompt}  la frase que recibe el agente (le dice que lea el archivo del encargo; no lleva comillas ni `;`)
// y, para meterlos dentro de un script de AppleScript, {ruta:as} y {prompt:as}: entre comillas simples de shell y con
// `\` y `"` escapados.
//
// El lanzador tiene que volver enseguida (abrir una pestaña o una ventana), no dejar a Claude en primer plano.

import { ejecutar, rutaEnPath } from './comun.mjs'

export const PREAJUSTES = {
  tmux: ['tmux', 'new-window', '-c', '{ruta}', '-n', '{nombre}', 'claude', '{prompt}'],
  wt: ['wt', '-w', '0', 'new-tab', '-d', '{ruta}', '--title', '{nombre}', 'cmd', '/k', 'claude', '{prompt}'],
  terminal: [
    'osascript',
    '-e',
    'tell application "Terminal" to do script "cd {ruta:as} && claude {prompt:as}"',
    '-e',
    'tell application "Terminal" to activate',
  ],
  iterm: [
    'osascript',
    '-e',
    'tell application "iTerm" to create window with default profile',
    '-e',
    'tell application "iTerm" to tell current session of current window to write text "cd {ruta:as} && claude {prompt:as}"',
  ],
}

export const NOMBRES = ['auto', ...Object.keys(PREAJUSTES), 'manual', 'propio']

/** `programa` está en el PATH (con las extensiones de Windows si hace falta). */
export function enPath(programa, env = process.env, plataforma = process.platform) {
  return rutaEnPath(programa, env, plataforma) !== ''
}

/** El preajuste que vale en esta máquina: lo que se ve desde la terminal en la que corre Claude Code. */
export function detectar({ env = process.env, plataforma = process.platform, hay = p => enPath(p, env, plataforma) } = {}) {
  if (env.TMUX && hay('tmux')) return 'tmux'
  if (plataforma === 'win32' && hay('wt')) return 'wt'
  if (plataforma === 'darwin') return env.TERM_PROGRAM === 'iTerm.app' ? 'iterm' : 'terminal'
  return 'manual'
}

const paraAppleScript = texto => `'${texto.replace(/'/g, `'\\''`)}'`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

/** La orden con los huecos puestos. */
export function sustituir(orden, datos) {
  return orden.map(parte =>
    String(parte).replace(/\{(ruta|nombre|prompt)(:as)?\}/g, (_todo, clave, as) => (as ? paraAppleScript(datos[clave] ?? '') : (datos[clave] ?? ''))),
  )
}

/** Lo que el usuario pega en una terminal nueva cuando no hay lanzador. */
export const ordenManual = datos => `cd "${datos.ruta}" && claude "${datos.prompt}"`

/**
 * Lanza la sesión del encargo según `lanzar` de los ajustes. Devuelve { lanzado, preajuste, orden, motivo }: `orden` es
 * lo que se ha ejecutado o, si no se ha lanzado nada, lo que el usuario tiene que pegar en una terminal.
 */
export function lanzar(lanzarAjuste, datos, { entorno = {} } = {}) {
  let preajuste = lanzarAjuste?.preajuste || 'auto'
  if (preajuste === 'auto') preajuste = detectar(entorno)
  const manual = motivo => ({ lanzado: false, preajuste, orden: ordenManual(datos), motivo })
  if (preajuste === 'manual') return manual('')
  const plantilla = preajuste === 'propio' ? lanzarAjuste?.orden : PREAJUSTES[preajuste]
  if (!Array.isArray(plantilla) || plantilla.length === 0) {
    return manual(preajuste === 'propio' ? 'lanzar.orden está vacío' : `no conozco el preajuste «${preajuste}» (valen: ${NOMBRES.join(', ')})`)
  }
  const orden = sustituir(plantilla, datos)
  const r = ejecutar(orden, { cwd: datos.ruta, timeout: 30000 })
  if (r.error || r.status !== 0) {
    const porque = r.error ? r.error.message : (r.stderr || r.stdout || `código ${r.status}`).trim().slice(0, 300)
    return manual(`el lanzador «${preajuste}» ha fallado: ${porque}`)
  }
  return { lanzado: true, preajuste, orden: orden.join(' '), motivo: '' }
}
