// Lo que el plugin necesita en el PATH: node (los scripts y el driver de fusión) y git 2.38 o posterior
// (`git merge-tree --write-tree`, para el ensayo). Aquí se decide qué decir si falta algo; lanzarlos, en register.tsx.

/** Lo que ha contestado `<programa> --version`: null si no se ha podido lanzar. */
export type Version = { exitCode: number; stdout: string } | null

const GIT_MINIMO: [number, number] = [2, 38]

/** «git version 2.52.0.windows.1» → [2, 52]; null si no se entiende. */
export function versionGit(salida: string): [number, number] | null {
  const m = /(\d+)\.(\d+)/.exec(salida)
  return m ? [Number(m[1]), Number(m[2])] : null
}

/** Una línea por cosa que falta, con lo que deja de funcionar; vacío si está todo. */
export function faltan(x: { node: Version; git: Version }): string[] {
  const lineas: string[] = []
  if (x.node === null || x.node.exitCode !== 0) {
    lineas.push('no encuentro node en el PATH: sin él no hay ensayo de las subidas ni drivers de fusión (hace falta Node 22 o posterior)')
  }
  if (x.git === null || x.git.exitCode !== 0) {
    lineas.push('no encuentro git en el PATH')
  } else {
    const v = versionGit(x.git.stdout)
    if (v && (v[0] < GIT_MINIMO[0] || (v[0] === GIT_MINIMO[0] && v[1] < GIT_MINIMO[1]))) {
      lineas.push(`git ${v[0]}.${v[1]} es anterior a ${GIT_MINIMO.join('.')}: el ensayo de las subidas (git merge-tree) no funciona`)
    }
  }
  return lineas
}
