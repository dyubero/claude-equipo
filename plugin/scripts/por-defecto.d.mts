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
  orca: { repo: string }
  sesionPrincipal: string
}

export declare const POR_DEFECTO: Readonly<Ajustes>
export declare function mezclar(base: Readonly<Ajustes>, propios: unknown): Ajustes
