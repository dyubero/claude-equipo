// Rutas escritas de cualquier forma (C:\…, C:/…, /c/… de Git Bash, /home/…, ~/…, relativas) llevadas a una sola:
// minúsculas, barras normales y sin barra final, para poder compararlas. Devuelve null cuando la ruta depende de algo
// que no se sabe sin ejecutar (una variable que no es $HOME ni $PWD).

const UNIDAD = /^[a-zA-Z]:/

export function normalizar(ruta: string, base: string | null, home: string): string | null {
  let texto = ruta.trim().replace(/^["']|["']$/g, '')
  if (texto === '' || texto === '.' || /^\$\(pwd\)$|^\$pwd$|^\(get-location\)$/i.test(texto)) return base
  texto = texto
    .replace(/^(~|\$HOME|\$\{HOME\}|\$env:USERPROFILE|%USERPROFILE%)(?=$|[\\/])/i, home)
    .replace(/^(\$PWD|\$\(pwd\))(?=[\\/])/i, base ?? '\u0000')
  if (texto.includes('\u0000') || /[$%]/.test(texto)) return null
  // En Windows, «/c/Users/…» de Git Bash es «C:/Users/…».
  const ventanas = UNIDAD.test(home) || UNIDAD.test(base ?? '')
  texto = texto.replace(/\\/g, '/')
  if (ventanas) texto = texto.replace(/^\/([a-zA-Z])(\/|$)/, '$1:/')
  const conUnidad = /^[a-zA-Z]:(\/|$)/.test(texto)
  const absoluta = conUnidad || texto.startsWith('/')
  if (!absoluta) {
    if (base === null) return null
    texto = `${base}/${texto}`
  }
  const raizPosix = !/^[a-zA-Z]:(\/|$)/.test(texto)
  const partes: string[] = []
  for (const parte of texto.toLowerCase().split('/')) {
    if (parte === '' || parte === '.') continue
    if (parte === '..') {
      // No se sube por encima de la unidad (C:) ni de la raíz.
      if (partes.length > (raizPosix ? 0 : 1)) partes.pop()
      continue
    }
    partes.push(parte)
  }
  return raizPosix ? `/${partes.join('/')}` : partes.join('/')
}

/** `ruta` es `carpeta` o está dentro de ella (las dos ya normalizadas). */
export function dentroDe(ruta: string, carpeta: string): boolean {
  return ruta === carpeta || ruta.startsWith(`${carpeta}/`)
}
