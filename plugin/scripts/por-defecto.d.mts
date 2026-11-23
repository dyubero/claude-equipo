// Tipos de por-defecto.mjs, para el mod (hooks/ajustes.ts).

export type Ajustes = {
  ramaPrincipal: string
  idioma: string
  comandos: { compilar: string; probar: string; probarArchivos: string; regenerar: string }
  prohibidos: string[]
  decisiones: { activo: boolean; documento: string; prefijo: string; bloque: number }
  backlog: { activo: boolean; documento: string }
  unir: string[]
  generados: string[]
  pruebas: { patron: string }
  pendientes: string
  fusion: { estrategia: 'merge' | 'squash' }
  contexto: { aviso: number; peligro: number }
  guardas: { barridos: boolean }
  worktrees: { gestor: string; carpeta: string; prefijoRama: string; cerrarAlSubir: boolean }
  lanzar: { preajuste: string; orden: string[] }
  orca: { repo: string }
  sesionPrincipal: string
  textos: Record<string, string>
}

export declare const PATRONES_DE_PRUEBAS: readonly string[]
export declare const POR_DEFECTO: Readonly<Ajustes>
export declare const OPCIONES: Readonly<Record<string, readonly string[]>>
export declare function mezclar(base: Readonly<Ajustes>, ...capas: unknown[]): Ajustes
export declare function comprobar(propios: unknown): string[]
