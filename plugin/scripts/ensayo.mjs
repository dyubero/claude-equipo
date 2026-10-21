// Ensayo de una subida de varias ramas a la rama principal, sin tocarla.
//
//   node ensayo.mjs [--base main] [--json] [--repo <dir>] rama1 rama2 …
//
// Con `git merge-tree` (que usa los drivers de fusion.mjs) ensaya:
// 1. cada rama contra la principal: la que choca de verdad con ella se aparta;
// 2. las demás por parejas: cuántos choques de verdad tiene cada una con las otras;
// 3. la subida en orden, de menos a más choques (si empatan, en el orden en que llegaron): cada rama se ensaya contra
//    el resultado de las anteriores (commits sueltos con `git commit-tree`, sin mover ninguna rama). La que choca se
//    aparta, con las ramas del plan con las que choca.
//
// Lo que se resuelve solo (documentos de «unir» con solo añadidos, y los «generados») no cuenta como choque.
// Devuelve el plan: las ramas que entran, en orden, las apartadas con el motivo y las que tocan archivos generados.
// Lo usan el mod (botón «Subir») y la skill estado-ramas.

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ajustes, argumentos, corto, generados, git, GitError, imprimir } from './comun.mjs'

const ENTORNO = {
  ...process.env,
  GIT_AUTHOR_NAME: 'ensayo',
  GIT_AUTHOR_EMAIL: 'ensayo@equipo',
  GIT_COMMITTER_NAME: 'ensayo',
  GIT_COMMITTER_EMAIL: 'ensayo@equipo',
}

/** [árbol, archivos con choque] de fusionar b en a, sin tocar nada. */
export function mergeTree(a, b, repo = '.') {
  const r = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', a, b], { repo, ok: [0, 1] })
  const lineas = r.stdout.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')
  return [lineas[0], r.status === 1 ? [...new Set(lineas.slice(1))].sort() : []]
}

function commitSuelto(arbol, padres, repo) {
  const args = ['commit-tree', arbol, '-m', 'ensayo de subida']
  for (const p of padres) args.push('-p', p)
  return git(args, { repo, env: ENTORNO }).stdout.trim()
}

function archivosDe(base, rama, repo) {
  return git(['diff', '--name-only', `${base}...${rama}`], { repo }).stdout.split(/\r?\n/).filter(l => l.trim() !== '')
}

export function ensayar(ramas, base = 'main', repo = '.') {
  const baseCommit = git(['rev-parse', '--verify', base], { repo }).stdout.trim()
  const resultado = { base, orden: [], apartadas: [], parejas: [], generados: [], errores: [] }
  const vivas = []
  for (const rama of ramas) {
    let punta, choques
    try {
      punta = git(['rev-parse', '--verify', `refs/heads/${rama}`], { repo }).stdout.trim()
      ;[, choques] = mergeTree(baseCommit, punta, repo)
    } catch (error) {
      resultado.errores.push({ rama, motivo: error.message })
      continue
    }
    if (choques.length > 0) resultado.apartadas.push({ rama, con: [base], archivos: choques })
    else vivas.push([rama, punta])
  }

  // Choques de verdad por parejas, para el orden.
  const grado = Object.fromEntries(vivas.map(([r]) => [r, 0]))
  const pareja = new Map()
  for (let i = 0; i < vivas.length; i++) {
    for (const [b, pb] of vivas.slice(i + 1)) {
      const [a, pa] = vivas[i]
      const [, choques] = mergeTree(pa, pb, repo)
      if (choques.length > 0) {
        grado[a]++
        grado[b]++
        pareja.set(`${a}\u0000${b}`, choques)
        pareja.set(`${b}\u0000${a}`, choques)
        resultado.parejas.push({ ramas: [a, b], archivos: choques })
      }
    }
  }
  const llegada = vivas.map(([r]) => r)
  const orden = [...vivas].sort((x, y) => grado[x[0]] - grado[y[0]] || llegada.indexOf(x[0]) - llegada.indexOf(y[0]))

  // La subida en orden, cada una sobre lo que han dejado las anteriores.
  let actual = baseCommit
  for (const [rama, punta] of orden) {
    const [arbol, choques] = mergeTree(actual, punta, repo)
    if (choques.length > 0) {
      const con = resultado.orden.filter(r => pareja.has(`${rama}\u0000${r}`))
      resultado.apartadas.push({ rama, con: con.length > 0 ? con : [base], archivos: choques })
      continue
    }
    actual = commitSuelto(arbol, [actual, punta], repo)
    resultado.orden.push(rama)
    if (generados(archivosDe(baseCommit, punta, repo), repo).length > 0) resultado.generados.push(rama)
  }
  return resultado
}

export function texto(plan) {
  const lineas = []
  if (plan.orden.length > 0) lineas.push(`Entran, en este orden: ${plan.orden.map(corto).join(', ')}`)
  for (const a of plan.apartadas) lineas.push(`Apartada ${corto(a.rama)}: choca con ${a.con.map(corto).join(', ')} en ${a.archivos.join(', ')}`)
  for (const e of plan.errores) lineas.push(`Sin ensayar ${e.rama}: ${e.motivo}`)
  if (plan.orden.length > 0 && plan.apartadas.length === 0 && plan.errores.length === 0) lineas.push('Sin choques: entrarían todas.')
  if (plan.generados.length > 0) {
    lineas.push(`Tocan archivos generados: tras subirlas se rehacen con comandos.regenerar: ${plan.generados.map(corto).join(', ')}`)
  }
  return lineas.join('\n') || 'Nada que ensayar.'
}

export function main(argv) {
  const a = argumentos(argv, ['--json'], ['--base', '--repo'])
  const repo = a.repo ?? '.'
  if (a.sueltos.length === 0) {
    imprimir('Uso: node ensayo.mjs [--base <rama>] [--json] [--repo <dir>] rama1 rama2 …')
    return 2
  }
  try {
    const plan = ensayar(a.sueltos, a.base ?? ajustes(repo).ramaPrincipal, repo)
    imprimir(a.json ? JSON.stringify(plan) : texto(plan))
    return 0
  } catch (error) {
    imprimir(a.json ? JSON.stringify({ error: error.message }) : `Error: ${error.message}`)
    return error instanceof GitError ? 2 : 3
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2))
