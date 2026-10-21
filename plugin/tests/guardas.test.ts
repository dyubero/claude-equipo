// Guardas: freno a las fusiones en la principal desde un worktree, y guarda de los commits.

import { expect, test } from 'claude-code/testing'

import { normalizar } from '../hooks/rutas'
import { negado, preparar, PRINCIPAL, PRINCIPAL_POSIX } from './comun'

const PROHIBIDOS = JSON.stringify({ prohibidos: ['.env.local', 'dist/'] })

// ---------------------------------------------------------------- fusiones

test('git -C <principal> merge se niega y explica cómo avisar a la principal', async ($, on) => {
  preparar(on)
  const r = await $.tool.call({ tool: 'Bash', command: `git -C ${PRINCIPAL} merge --no-ff ana/carrito -m "Fusión de ana/carrito en main"` })
  expect(negado(r)).toMatch(/desde un worktree no se fusiona en la copia principal/)
  expect(negado(r)).toMatch(/La rama ana\/carrito está lista para subir \(<commit>\)/)
  expect(negado(r)).toMatch(/equipo:lista-para-subir/)
})

test('cd a la principal y git merge también se niega, en Bash y en PowerShell', async ($, on) => {
  preparar(on)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'cd /c/Users/ana/proyectos/tienda && git merge ana/carrito' }))).toMatch(/no se fusiona/)
  expect(
    negado(await $.tool.call({ tool: 'PowerShell', command: "Set-Location 'C:\\Users\\ana\\proyectos\\tienda'; git merge --no-ff ana/carrito" })),
  ).toMatch(/no se fusiona/)
})

test('la rama principal de los ajustes sale en el mensaje', async ($, on) => {
  preparar(on, { ajustes: '{ "ramaPrincipal": "develop" }' })
  const r = await $.tool.call({ tool: 'Bash', command: `git -C ${PRINCIPAL} merge ana/carrito` })
  expect(negado(r)).toMatch(/git merge develop/)
})

test('git merge main en el propio worktree pasa, y git merge --abort en la principal también', async ($, on) => {
  preparar(on)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git merge main' }))).toBeUndefined()
  expect(negado(await $.tool.call({ tool: 'Bash', command: `git -C ${PRINCIPAL} merge --abort` }))).toBeUndefined()
})

test('en la copia principal no se frena ninguna fusión', async ($, on) => {
  preparar(on, { enPrincipal: true })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git merge --no-ff ana/otra -m "Fusión"' }))).toBeUndefined()
})

test('una ruta con variable desconocida se niega por si es la principal', async ($, on) => {
  preparar(on)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git -C "$MAIN" merge ana/carrito' }))).toMatch(/no sé qué carpeta es esa/)
})

test('con rutas de Linux o macOS también se niega', async ($, on) => {
  preparar(on, { posix: true })
  expect(negado(await $.tool.call({ tool: 'Bash', command: `git -C ${PRINCIPAL_POSIX} merge ana/carrito` }))).toMatch(/no se fusiona/)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'cd ~/proyectos/tienda && git merge ana/carrito' }))).toMatch(/no se fusiona/)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git merge main' }))).toBeUndefined()
})

test('apagado en /config, no frena', { options: { fusiones: false } }, async ($, on) => {
  preparar(on)
  expect(negado(await $.tool.call({ tool: 'Bash', command: `git -C ${PRINCIPAL} merge ana/carrito` }))).toBeUndefined()
})

// ---------------------------------------------------------------- commits

test('en la copia principal se niegan add -A, add ., add -u, commit -a, --all y commit .', async ($, on) => {
  preparar(on, { enPrincipal: true })
  for (const command of ['git add -A', 'git add .', 'git add -u', 'git commit -am "x"', 'git commit --all -m "x"', 'git commit -m "x" .']) {
    expect(negado(await $.tool.call({ tool: 'Bash', command }))).toMatch(/copia principal/)
  }
})

test('desde un worktree, git -C <principal> add -A también se niega', async ($, on) => {
  preparar(on)
  expect(negado(await $.tool.call({ tool: 'Bash', command: `git -C ${PRINCIPAL} add -A` }))).toMatch(/copia principal/)
})

test('en un worktree, git add -A y commit -a pasan si no hay prohibidos', async ($, on) => {
  const registro = preparar(on)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add -A' }))).toBeUndefined()
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git commit -am "x"' }))).toBeUndefined()
  expect(registro.ordenes.some(o => o.includes('status'))).toBe(false)
})

test('añadir un archivo prohibido o algo de una carpeta prohibida se niega en cualquier copia', async ($, on) => {
  preparar(on, { ajustes: PROHIBIDOS })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add src/carrito.ts .env.local' }))).toMatch(/\.env\.local no entra en los commits/)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add dist/app.js' }))).toMatch(/dist\/ no entra/)
})

test('git add de archivos sueltos pasa sin mirar git status', async ($, on) => {
  const registro = preparar(on, { ajustes: PROHIBIDOS })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add src/carrito.ts src/carrito.test.ts' }))).toBeUndefined()
  expect(registro.ordenes.some(o => o.includes('status'))).toBe(false)
})

test('git add -A en un worktree se niega solo si arrastra un prohibido', async ($, on) => {
  preparar(on, { ajustes: PROHIBIDOS, estado: '?? .env.local\n' })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add -A' }))).toMatch(/\.env\.local/)
})

test('git add -A en un worktree limpio pasa', async ($, on) => {
  preparar(on, { ajustes: PROHIBIDOS, estado: '' })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add -A' }))).toBeUndefined()
})

test('git commit con un prohibido ya en el índice se niega; si solo está cambiado en el árbol, pasa', async ($, on) => {
  preparar(on, { ajustes: PROHIBIDOS, estado: 'A  .env.local\n' })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' }))).toMatch(/\.env\.local/)
})

test('git commit sin -a con un prohibido cambiado sin añadir pasa; con -a, no', async ($, on) => {
  preparar(on, { ajustes: PROHIBIDOS, estado: ' M dist/app.js\n' })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git commit -m "x"' }))).toBeUndefined()
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git commit -am "x"' }))).toMatch(/dist\/app\.js/)
})

test('un mensaje en heredoc no confunde a la guarda', async ($, on) => {
  preparar(on, { enPrincipal: true })
  const command = ['git commit -m "$(cat <<\'EOF\'', 'Añade el carrito', '', 'git add -A no va aquí', 'EOF', ')"'].join('\n')
  expect(negado(await $.tool.call({ tool: 'Bash', command }))).toBeUndefined()
})

test('apagada en /config, deja hacer git add -A en la principal', { options: { commits: false } }, async ($, on) => {
  preparar(on, { enPrincipal: true })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git add -A' }))).toBeUndefined()
})

test('las rutas se comparan igual escritas de cualquier forma', () => {
  const home = 'C:\\Users\\ana'
  expect(normalizar('/c/Users/Ana/x', null, home)).toBe('c:/users/ana/x')
  expect(normalizar('C:\\Users\\ana\\x\\..\\y', null, home)).toBe('c:/users/ana/y')
  expect(normalizar('~/x', null, home)).toBe('c:/users/ana/x')
  expect(normalizar('/home/ana/x/../y', null, '/home/ana')).toBe('/home/ana/y')
  expect(normalizar('/c/x', null, '/home/ana')).toBe('/c/x') // en Linux, /c es una carpeta
  expect(normalizar('src', '/home/ana/tienda', '/home/ana')).toBe('/home/ana/tienda/src')
  expect(normalizar('$OTRA/x', '/home/ana', '/home/ana')).toBeNull()
})
