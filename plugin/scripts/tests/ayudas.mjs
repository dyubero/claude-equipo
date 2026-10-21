// Ayudas de las pruebas: repositorios temporales de git con ramas de prueba. Nunca tocan este repositorio.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function sh(repo, args, ok = [0]) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true })
  if (!ok.includes(r.status)) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`)
  return r
}

export function escribir(repo, ruta, texto) {
  const p = join(repo, ruta)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, texto)
}

export const leer = (repo, ruta) => readFileSync(join(repo, ruta), 'utf8')

export function añadir(repo, ruta, texto) {
  escribir(repo, ruta, leer(repo, ruta) + texto)
}

export function cambiar(repo, ruta, de, a) {
  const t = leer(repo, ruta)
  if (!t.includes(de)) throw new Error(`${ruta} no tiene «${de}»`)
  escribir(repo, ruta, t.replace(de, a))
}

export function commit(repo, mensaje) {
  sh(repo, ['add', '-A'])
  sh(repo, ['commit', '-q', '-m', mensaje])
}

/** Un repositorio vacío con la rama main, sin fines de línea cambiados. */
export function repoNuevo(prefijo = 'equipo-') {
  const repo = mkdtempSync(join(tmpdir(), prefijo))
  sh(repo, ['init', '-q', '-b', 'main'])
  for (const [clave, valor] of [['user.email', 't@t'], ['user.name', 't'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) {
    sh(repo, ['config', clave, valor])
  }
  return repo
}

export const borrar = ruta => rmSync(ruta, { recursive: true, force: true })
