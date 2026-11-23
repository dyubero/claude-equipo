// resultado_lote: lo que Claude devuelve tras comprobar el lote. A cada rama se le avisa y, si está bien, se cierra
// su worktree.

import { atom, read } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import { ajustesDe, avisar, script, scripts, SUBIDAS_INICIAL } from './base'
import { borrar, poner } from './cola'
import { tr } from './idioma'
import { misma, rutasDeGit } from './ramas'
import { codigosSinRenumerar, corto, textoFalla, textoSubida } from './subidas'

/** Las ramas de la franja (ver base.ts). */
const subidas = atom({ plugin: 'equipo', key: 'subidas' } as const, SUBIDAS_INICIAL)

/**
 * Lo que llega por la herramienta del lote: avisa al agente y, si está bien, cierra su worktree. La rama puede venir con
 * su nombre largo o corto, y puede no estar en la franja (fusionada a mano): se busca en git y en los worktrees.
 */
export async function resultado($: EngineInterface, nombre: string, ok: boolean, motivo: string, sesionDada: string): Promise<string> {
  const a = await ajustesDe($)
  const t = tr()
  const principal = a.ramaPrincipal
  const lista = await read($, subidas)
  const subida = lista.find(s => s.rama === nombre) ?? lista.find(s => corto(s.rama) === nombre)
  const raiz = await $.session.root()
  const git = async (...args: string[]) =>
    $.process.run(['git', ...args], { cwd: raiz, timeoutMs: 20000 }).catch(() => ({ exitCode: 1, stdout: '', stderr: '' }))
  const copias = rutasDeGit((await git('worktree', 'list', '--porcelain')).stdout)
  let rama = subida?.rama ?? ''
  if (!rama) {
    const copia = copias.find(w => w.rama !== '' && (w.rama === nombre || corto(w.rama) === nombre || corto(w.ruta.replace(/\\/g, '/')) === nombre))
    rama = copia?.rama ?? ((await git('rev-parse', '-q', '--verify', `refs/heads/${nombre}`)).exitCode === 0 ? nombre : '')
  }
  if (!rama) return t('resultado.noEsta', { rama: nombre })
  const sesion = sesionDada || subida?.sesion || ''
  const fusion = (subida?.fusion || subida?.commit || (await git('rev-parse', '--short', 'HEAD')).stdout.trim()).slice(0, 9)
  const sinSesion = sesion ? '' : t('resultado.sinSesion')
  if (!ok) {
    const enviado = await avisar($, sesion, textoFalla(rama, fusion, motivo || t('agente.sinMotivo'), principal, t))
    if (subida) await poner($, rama, { estado: 'falla', detalle: motivo })
    return enviado ? t('resultado.fallida', { rama }) : t('resultado.fallidaSinAvisar', { rama, sinSesion })
  }
  // Solo se cierra lo que ya está entero en la principal. Con squash los commits de la rama no están en la principal:
  // vale si la rama no se ha movido desde que se subió.
  const entera = (await git('merge-base', '--is-ancestor', `refs/heads/${rama}`, 'HEAD')).exitCode === 0
  if (!entera) {
    // …y si el commit con el que entró sigue en la principal (no se ha deshecho).
    const quieta =
      a.fusion.estrategia === 'squash' &&
      Boolean(subida?.punta) &&
      Boolean(subida?.fusion) &&
      (await git('rev-parse', '--verify', `refs/heads/${rama}`)).stdout.trim() === subida?.punta &&
      (await git('merge-base', '--is-ancestor', subida?.fusion ?? '', `refs/heads/${principal}`)).exitCode === 0
    if (!quieta) return t('resultado.noEntera', { rama, principal })
  }
  let aviso = ''
  if (a.backlog.activo) {
    const quedan = codigosSinRenumerar(rama, (await git('show', `HEAD:${a.backlog.documento}`)).stdout)
    if (quedan.length > 0) {
      aviso = t('resultado.sinRenumerar', { documento: a.backlog.documento, codigos: quedan.join(', '), orden: `node "${scripts($)}/renumerar.mjs" --aplicar ${corto(rama)}` })
    }
  }
  const enviado = await avisar($, sesion, textoSubida(rama, fusion, principal, a.worktrees.cerrarAlSubir, t))
  const avisado = enviado ? t('resultado.avisado') : t('resultado.sinAvisar', { sinSesion })
  if (!a.worktrees.cerrarAlSubir) {
    if (subida) await borrar($, rama)
    return t('resultado.abierto', { rama, avisado, aviso })
  }
  const ruta = copias.find(w => w.rama === rama)?.ruta ?? ''
  const abierto = ruta !== '' && !misma(ruta, raiz)
  // worktree.mjs quita el worktree (con Orca o con git; lo que quede sin confirmar allí ya no hace falta: la rama está
  // entera en la principal), el registro que pueda quedar en git, la rama y su reserva de bloque.
  const cierre = (await script($, 'worktree.mjs', ['cerrar', rama, ...(entera ? [] : ['--forzar', '--punta', subida?.punta ?? ''])], 180000)) as { cerrado?: boolean; motivo?: string } | null
  if (!cierre?.cerrado) {
    const porque = (cierre?.motivo ?? t('resultado.sinRespuesta')).slice(0, 200)
    if (subida) await poner($, rama, { estado: 'fusionada', detalle: t('subida.comprobadaSinCerrar', { motivo: porque }) })
    return t('resultado.noCerrado', { rama, avisado, motivo: porque, aviso })
  }
  if (subida) await borrar($, rama)
  return t(abierto ? 'resultado.cerrado' : 'resultado.sinWorktree', { rama, avisado, aviso })
}
