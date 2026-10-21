// Lo que comparten los tests de las guardas: una copia de mentira (el worktree «carrito» o la principal) con las
// respuestas de Claude Code que la guarda pide (raíz, carpeta, git, ajustes del proyecto).

import type { On } from 'claude-code'

export const PRINCIPAL = 'C:/Users/ana/proyectos/tienda'
export const WORKTREE = 'C:\\Users\\ana\\orca\\workspaces\\tienda\\carrito'
export const PRINCIPAL_POSIX = '/home/ana/proyectos/tienda'
export const WORKTREE_POSIX = '/home/ana/orca/workspaces/tienda/carrito'

export type Escena = {
  /** La sesión está en el worktree (por defecto) o en la copia principal. */
  enPrincipal?: boolean
  /** Rutas de Linux o macOS en vez de las de Windows. */
  posix?: boolean
  /** Salida de `git status --porcelain` de los archivos prohibidos. */
  estado?: string
  /** El .claude/equipo.json del proyecto (texto), o nada. */
  ajustes?: string
}

export type Registro = { ordenes: string[][]; toasts: string[] }

export function preparar(on: On, escena: Escena = {}): Registro {
  const registro: Registro = { ordenes: [], toasts: [] }
  const principal = escena.posix ? PRINCIPAL_POSIX : PRINCIPAL
  const worktree = escena.posix ? WORKTREE_POSIX : WORKTREE
  const raiz = escena.enPrincipal ? principal : worktree
  on('session.root', () => ({ value: raiz }))
  on('session.cwd', () => ({ value: raiz }))
  on('env.get', ($, e) => {
    if (escena.posix) return { value: e.name === 'HOME' ? '/home/ana' : undefined }
    return { value: e.name === 'USERPROFILE' ? 'C:\\Users\\ana' : undefined }
  })
  on('fs.stat', () => ({ value: { kind: escena.enPrincipal ? 'dir' : 'file', size: 0, mtimeMs: 0, isLink: false } }))
  on('fs.read', ($, e) => {
    if (e.path.replace(/\\/g, '/').endsWith('.claude/equipo.json') && escena.ajustes !== undefined) return { value: escena.ajustes }
    return { deny: 'no existe' }
  })
  on('ui.toast', ($, e) => {
    registro.toasts.push(e.text)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    registro.ordenes.push(argv)
    const sale = (exitCode: number, stdout = '') => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[1] === 'worktree') {
      return sale(0, `worktree ${principal}\nHEAD 1111\nbranch refs/heads/main\n\nworktree ${worktree.replace(/\\/g, '/')}\nHEAD 2222\nbranch refs/heads/ana/carrito\n`)
    }
    if (argv.includes('status')) return sale(0, escena.estado ?? '')
    return sale(1)
  })
  // Claude Code: las herramientas, «hecho».
  on('tool.call', () => ({ result: 'hecho' }))
  return registro
}

type Resultado = { deny?: string; isError?: boolean; text?: string }
export const negado = (r: Resultado) => r.deny ?? (r.isError ? r.text : undefined)
