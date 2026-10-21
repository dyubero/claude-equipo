// Valores que el plugin equipo guarda en $.state.

/** La franja del contexto. */
export type Contexto = {
  /** Tokens de entrada de la última respuesta (lo que ocupa el contexto); null antes de la primera. */
  tokens: number | null
  /** Tamaño de la ventana de contexto del modelo. */
  ventana: number
  /** Se está compactando ahora (por el botón). */
  compactando: boolean
  /** Tras compactar, la cifra no se pone al día hasta la siguiente respuesta. */
  compactado: boolean
}

/** Una copia del repositorio en el panel de ramas. */
export type Rama = {
  nombre: string
  rama: string
  ruta: string
  /** Comentario de Orca (el bloque de decisiones reservado, si se usan). */
  comentario: string
  bloque: [number, number] | null
  /** Estado de sus agentes en Orca (working, done…), separados por comas. */
  agente: string
  principal: boolean
  /** Última actividad según Orca (ms). */
  actividad: number
  /** Commits de la rama que no están en la principal, y de la principal que no están en la rama. */
  delante: number
  detras: number
}

export type PanelRamas = { ramas: Rama[]; siguiente: string; leido: number; error: string }

/**
 * Una rama que su agente da por acabada, en la franja de la copia principal.
 *   lista: esperando a que el usuario pulse; marcada para «Subir marcadas» con `marcada`.
 *   en-cola, fusionando: «Subir» pulsado.
 *   fusionada: en la principal, esperando la comprobación del lote.
 *   conflicto: chocó con la principal; fusión abortada y agente avisado.
 *   apartada: el ensayo la ha dejado fuera del lote porque choca de verdad con la principal o con otra del lote.
 *   error: no se pudo fusionar por otra cosa (detalle).
 *   falla: en la principal, pero la comprobación del lote falló; agente avisado.
 *   nota: «Solucionar» pulsado, escribiendo la indicación para el agente.
 *   solucion-pedida: se le ha pedido al agente que lo arregle.
 */
export type EstadoSubida =
  | 'lista'
  | 'en-cola'
  | 'fusionando'
  | 'fusionada'
  | 'conflicto'
  | 'apartada'
  | 'error'
  | 'falla'
  | 'nota'
  | 'solucion-pedida'

export type Subida = {
  rama: string
  commit: string
  sesion: string
  resumen: string
  porRevisar: string[]
  /** El aviso entero, para la petición del lote. */
  texto: string
  hora: number
  estado: EstadoSubida
  marcada: boolean
  /** Commit de la fusión en la principal, cuando ha entrado. */
  fusion: string
  /** Por qué no ha entrado o qué ha fallado. */
  detalle: string
  /** Con qué chocaría al subirla ahora, según el último ensayo: la principal u otra rama de la franja. */
  choques?: { con: string[]; archivos: string[] }[]
  /** El estado de antes de pulsar «Solucionar», para volver con «Cancelar». */
  previo?: EstadoSubida
}

declare module 'claude-code' {
  interface PluginState {
    equipo: {
      contexto: Contexto
      panel: PanelRamas
      subidas: Subida[]
    }
  }
}
