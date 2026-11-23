// Textos del plugin en español. Cada clave es una plantilla: lo que va entre llaves ({rama}, {principal}…) se cambia
// al usarla. en.mjs tiene las mismas claves con los mismos huecos (lo comprueban las pruebas), y cualquier clave se
// puede cambiar desde los ajustes: "textos": { "fusion.mensaje": "merge({rama}): {resumen}" }.

export default {
  // ------------------------------------------------------------ números
  'numero.decimal': ',',

  // ------------------------------------------------------------ franja del contexto
  'contexto.compactando': '◐ Contexto: compactando…',
  'contexto.sinDatos': '◌ Contexto: se sabrá tras la primera respuesta',
  'contexto.linea': '{icono} Contexto: {usados} de {ventana} usados ({porcentaje} %) · libres {libres}',
  'contexto.compactado': ' · compactado (la cifra se pone al día con la próxima respuesta)',
  'contexto.boton': 'Compactar',
  'contexto.noCompactado': 'No se ha compactado: {motivo}',
  'contexto.hecho': 'Compactado',
  'contexto.hechoCifras': 'Compactado: de {antes} a {despues}',
  'contexto.fallo': 'No se ha podido compactar (¿hay un turno en marcha?): {error}',

  // ------------------------------------------------------------ franja de las subidas
  'estado.lista': 'lista para subir',
  'estado.listaPorRevisar': 'lista para subir · {n} por revisar',
  'estado.sinEnsayo': ' · sin ensayo (no sé con qué chocaría)',
  'estado.enCola': 'en cola',
  'estado.fusionando': 'fusionando…',
  'estado.fusionada': 'dentro ({commit}) · {detalle}',
  'estado.faltaLote': 'falta comprobar el lote',
  'estado.conflicto': 'conflicto, agente avisado: {detalle}',
  'estado.apartada': 'apartada del lote: {detalle}',
  'estado.error': 'no ha entrado: {detalle}',
  'estado.falla': 'dentro, pero falla: {detalle}',
  'estado.nota': 'Solucionar: escribe una indicación o pulsa Enter',
  'estado.solucionPedida': 'arreglo pedido al agente',
  'franja.subir': 'Subir',
  'franja.solucionar': 'Solucionar',
  'franja.cancelar': 'Cancelar',
  'franja.borrar': 'Borrar',
  'franja.subirMarcadas': 'Subir marcadas ({n})',
  'franja.subirTodas': 'Subir todas ({n})',
  'franja.chocaria': 'chocaría con {con}: {archivos}',
  'franja.notaEtiqueta': '  Indicación para el agente (opcional):',
  'franja.notaAyuda': 'Enter manda lo de «Por revisar» tal cual',
  'franja.notaMandar': 'mandar',
  'subida.recibida': '{rama} lista para subir',
  'subida.recibidaPorRevisar': '{rama} lista para subir · {n} por revisar',
  'subida.consumida': 'equipo: {rama} lista para subir, en la franja',
  'subida.chocariaLuego': 'chocaría con {con}: se avisa cuando entren',
  'subida.choca': 'choca con {con} en {archivos}',
  'subida.sinAvisar': ' · no he podido avisar al agente',
  'subida.ninguna': 'No ha entrado ninguna rama: {ramas}',
  'subida.mediaFusion': 'hay una fusión a medias en {principal}',
  'subida.otraRama': 'la copia principal está en {actual}, no en {principal}',
  'subida.noExiste': 'la rama {rama} no existe en esta copia',
  'subida.indiceSucio': 'la copia principal tiene cambios añadidos sin confirmar (git add): confírmalos o quítalos antes de subir con squash',
  'subida.mergeFallo': 'git merge ha fallado',
  'subida.commitFallo': 'git commit ha fallado (¿la rama no traía cambios?)',
  'subida.sinMensaje': 'no he podido mandar el mensaje al agente',
  'subida.codigosLuego': '• {n} códigos de {documento} con prefijo: se renumeran tras el lote',
  'subida.comprobadaSinCerrar': 'comprobada; no he podido cerrar el worktree: {motivo}',

  // ------------------------------------------------------------ el commit de la fusión
  'fusion.mensaje': 'Fusión de {rama} en {principal}: {resumen}',
  'fusion.mensajeSinResumen': 'Fusión de {rama} en {principal}',

  // ------------------------------------------------------------ mensajes a los agentes
  'agente.volver':
    'Cuando esté, sigue la skill equipo:lista-para-subir: commit, trae la principal (`git merge {principal}`), compila, ' +
    'repite las pruebas de lo tuyo que pueda haber cambiado y vuelve a avisar con la línea «equipo:lista {rama} <commit>». ' +
    'No fusiones tú en {principal}.',
  'agente.solucionar': 'El usuario ha pulsado «Solucionar» para la rama {rama} en la sesión principal.',
  'agente.solucionarPorRevisar': 'Arregla en tu rama lo que dejaste «Por revisar»:\n{lista}',
  'agente.solucionarMotivo': 'Lo que ha fallado al subir o al comprobar en {principal}:\n{motivo}',
  'agente.solucionarNota': 'Indicación del usuario: {nota}',
  'agente.conflicto': 'Al subir la rama {rama} a {principal} ha chocado con lo que ya había entrado (fusión abortada; {principal} no ha cambiado).',
  'agente.conflictoArchivos': 'Archivos con conflicto: {archivos}.',
  'agente.sinLista': '(git no los ha listado)',
  'agente.traer': 'Trae {principal} a tu rama y resuelve los conflictos. {volver}',
  'agente.apartadaPrincipal': 'Al ensayar la subida de la rama {rama}, choca con {principal} (no ha entrado; {principal} no ha cambiado).',
  'agente.apartadaUna': 'Al ensayar la subida de la rama {rama} junto a otras, choca con {con}, que ya ha entrado en {principal}. Tu rama se ha apartado del lote.',
  'agente.apartadaVarias': 'Al ensayar la subida de la rama {rama} junto a otras, choca con {con}, que ya han entrado en {principal}. Tu rama se ha apartado del lote.',
  'agente.apartadaArchivos': 'Archivos con choque de verdad: {archivos}.',
  'agente.apartadaSolos': 'Lo que se resuelve solo (documentos de «unir» con solo añadidos, y los «generados») no está en la lista.',
  'agente.apartadaTraer': 'Trae {principal} a tu rama y resuelve esos choques. {volver}',
  'agente.subida': 'La rama {rama} está subida a {principal} ({commit}) y la sesión principal la ha comprobado. Se cierra tu worktree: no hace falta que hagas nada más.',
  'agente.subidaAbierta': 'La rama {rama} está subida a {principal} ({commit}) y la sesión principal la ha comprobado. Tu worktree sigue abierto: no hace falta que hagas nada más.',
  'agente.falla': 'La rama {rama} está en {principal} ({commit}), pero la comprobación en la sesión principal ha fallado:',
  'agente.fallaArreglar': 'Arréglalo en tu rama. {volver}',
  'agente.sinMotivo': 'sin motivo',

  // ------------------------------------------------------------ petición del lote a Claude
  'lote.cabecera': 'Comprueba juntas en {principal} las ramas que acaba de subir el plugin equipo: {ramas}. Sigue la skill equipo:comprobar-lote.',
  'lote.rama': '## {rama} — fusión {fusion}',
  'lote.distinta': '  • la punta de la rama no era el commit del aviso: el agente siguió después de avisar',
  'lote.aviso': 'El aviso del agente decía:\n{aviso}',
  'lote.apartadas': 'Apartadas por el ensayo (sus agentes ya tienen el aviso):\n{lista}',
  'lote.apartada': '- {rama}: choca con {con} en {archivos}',
  'lote.fallidas': 'No han entrado (se les ha avisado o esperan al usuario): {ramas}.',
  'lote.queHacer': '## Qué hacer',
  'lote.generados': 'Tocan archivos generados: {ramas}. Al fusionar se han quedado como estaban en {principal} donde chocaban: ',
  'lote.generadosCon': 'rehazlos una vez con `{orden}` y haz un commit «Lote de subidas: generados rehechos» con solo lo generado que cambie, añadido uno a uno.',
  'lote.generadosSin': 'rehazlos a mano (comandos.regenerar no está puesto en .claude/equipo.json) y haz un commit con solo eso.',
  'lote.renumerar':
    'Renumera en {principal} estos códigos de {documento} y donde se citen con {aplicar}: {codigos}. ' +
    'Compruébalo con {comprobar} (debe salir con 0) y haz un commit «Lote de subidas: códigos renumerados (…)» ' +
    'con solo los archivos que dice el script, añadidos uno a uno. Pulsar «Subir» es el permiso del usuario para ese commit.',
  'lote.sinCodigos': 'No hay códigos de {documento} que renumerar.',
  'lote.pruebas': 'Pruebas del lote, una sola vez: ',
  'lote.pruebasCompilar': '`{compilar}`; después {acotadas}. ',
  'lote.pruebasSinCompilar': '{acotadas}. ',
  'lote.acotadas': 'las pruebas de lo que tocan (las del «Probar:» de cada aviso; propuesta con {propuesta})',
  'lote.todas': 'Si no sabes acotarlas, `{probar}`. ',
  'lote.todasSin': 'Si no sabes acotarlas, pasa todas las del proyecto (comandos.probar no está puesto en .claude/equipo.json). ',
  'lote.noRepetir': 'No repitas lo que ya pasó en el agente si no se cruza con otra rama.',
  'lote.resultado':
    'Cuenta el resultado al usuario y llama a {herramienta} con cada rama: ok si está bien, o el motivo del fallo. ' +
    'El mod avisa a los agentes y cierra los worktrees de las que están bien. Apunta lo que quede sin probar en {pendientes}.',

  // ------------------------------------------------------------ revisión de cada fusión (va en la petición del lote)
  'revision.noExiste': 'el commit no existe en esta copia (¿se ha fusionado en otra carpeta?)',
  'revision.squash': 'es un solo commit con toda la rama (squash)',
  'revision.noSquash': 'el commit no es el de la rama en uno (squash): tiene más de un padre',
  'revision.noFusion': 'el commit no es una fusión (--no-ff)',
  'revision.fusion': 'es una fusión',
  'revision.prohibidos': 'han entrado archivos prohibidos: {archivos}',
  'revision.archivos': '{n} archivos',
  'revision.archivosSinProhibidos': '{n} archivos, ninguno prohibido',
  'revision.sinDecisiones': 'sin decisiones nuevas en {documento}',
  'revision.fueraDeBloque': 'decisiones fuera del bloque {bloque}: {decisiones}',
  'revision.enBloque': 'decisiones {decisiones}, dentro de su bloque',
  'revision.sinBloque': 'decisiones {decisiones} (no sé qué bloque tenía la rama)',
  'revision.codigos': '{documento} tiene {n} códigos con el nombre de la rama delante: {codigos}',
  'revision.sinCodigos': 'ningún código de {documento} con el nombre de la rama delante',
  'revision.generados': 'toca archivos generados: hay que rehacerlos con {orden}',
  'revision.sucia': 'la copia principal tiene {n} cambios sin confirmar: {archivos}',

  // ------------------------------------------------------------ resultado_lote
  'herramienta.descripcion':
    'Plugin equipo: resultado de la comprobación del lote de ramas que el mod acaba de subir a la rama principal. ' +
    'Una entrada por rama: ok=true si compila y sus pruebas pasan (el mod avisa al agente y cierra su worktree), ' +
    'ok=false con el motivo si algo falla (el mod se lo manda al agente para que lo arregle y vuelva a avisar). ' +
    'La rama puede ir con su nombre largo (usuario/x) o corto (x), y también vale una rama fusionada a mano que no ' +
    'está en la franja: entonces conviene dar la sesión de su agente (ListAgents) en sesion para avisarle.',
  'herramienta.motivo': 'Qué ha fallado (solo si ok es false).',
  'herramienta.sesion': 'Sesión del agente (ListAgents), si la rama no está en la franja.',
  'resultado.ninguna': 'No ha llegado ninguna rama.',
  'resultado.noEsta': '{rama}: no está en la franja ni hay una rama o un worktree con ese nombre.',
  'resultado.sinSesion': ' (no sé la sesión de su agente: avísale tú con SendMessage o pásala en sesion)',
  'resultado.fallida': '{rama}: marcada como fallida; agente avisado.',
  'resultado.fallidaSinAvisar': '{rama}: marcada como fallida; no he podido avisar al agente{sinSesion}.',
  'resultado.noEntera': '{rama}: no está entera en {principal} (tiene commits que {principal} no tiene); no cierro su worktree.',
  'resultado.sinRenumerar': ' ⚠ Quedan en {documento} sin renumerar: {codigos} ({orden}).',
  'resultado.avisado': ', agente avisado',
  'resultado.sinAvisar': ', sin avisar al agente{sinSesion}',
  'resultado.abierto': '{rama}: comprobada{avisado}; su worktree sigue abierto (worktrees.cerrarAlSubir está apagado).{aviso}',
  'resultado.noCerrado': '{rama}: comprobada{avisado}; el worktree no se ha podido cerrar ({motivo}).{aviso}',
  'resultado.sinRespuesta': 'worktree.mjs no ha contestado',
  'resultado.cerrado': '{rama}: comprobada{avisado} y worktree cerrado.{aviso}',
  'resultado.sinWorktree': '{rama}: comprobada{avisado}; no tenía worktree abierto.{aviso}',

  // ------------------------------------------------------------ /ramas, /reservar y /pendiente
  'ramas.descripcion': 'Panel con los worktrees, su bloque de decisiones y sus agentes (equipo)',
  'ramas.titulo': 'Ramas',
  'ramas.error': 'No he podido leer las ramas: {error}',
  'ramas.gitFallo': 'git worktree list ha fallado',
  'ramas.principal': 'copia principal',
  'ramas.todoDentro': 'todo en la principal',
  'ramas.todoDentroDetras': 'todo en la principal (−{n})',
  'ramas.agente': 'agente {estado}',
  'ramas.siguiente': 'Siguiente bloque libre: {bloque}',
  'ramas.actualizar': 'Actualizar',
  'ramas.leyenda': '+n: commits que la principal no tiene · −n: commits de la principal que la rama no tiene · ✔ todo está en la principal',
  'reservar.descripcion': 'Siguiente bloque libre de decisiones; con el nombre de un worktree, se lo reserva (equipo)',
  'reservar.apagadas': 'Las decisiones numeradas están apagadas (decisiones.activo en .claude/equipo.json): no hay bloques que reservar.',
  'reservar.siguiente': 'Siguiente bloque libre: {bloque} (tras la mayor decisión de las ramas y copias y de los bloques reservados).',
  'reservar.noHay': 'No hay ningún worktree «{nombre}». Siguiente bloque libre: {bloque}.',
  'reservar.yaTiene': '{nombre} ya tiene el bloque {suyo}. Siguiente libre: {bloque}.',
  'reservar.desdePrincipal': 'Las reservas se apuntan desde la copia principal. Siguiente bloque libre: {bloque}.',
  'reservar.fallo': 'No he podido reservar el bloque: {motivo}',
  'reservar.sinRespuesta': 'bloque.mjs no ha contestado',
  'reservar.hecho': 'Reservado {bloque} para {nombre}.',
  'pendiente.descripcion': 'Apunta un pendiente en el documento de pendientes (equipo)',
  'pendiente.argumento': '<texto>',
  'pendiente.lista': 'Apuntes rápidos de {documento}:\n{lista}',
  'pendiente.vacio': 'No hay apuntes rápidos en {documento}. Uso: /pendiente <texto>',
  'pendiente.apuntado': 'Apuntado en {documento} (Apuntes rápidos): {texto}',
  'pendiente.docTitulo': '# Pendientes',
  'pendiente.docActualizado': 'Actualizado el {fecha}.',
  'pendiente.docSeccion': '## Apuntes rápidos',
  'pendiente.docIntro': 'Lo apuntado con `/pendiente`. Al hacerlo o lanzarlo, se quita de aquí o se pasa a su sección.',
  'pendiente.docEnMarcha': '## En marcha',

  // ------------------------------------------------------------ al empezar la sesión
  'inicio.sinAjustes': 'equipo: este proyecto aún no tiene .claude/equipo.json. Pide a Claude que lo adapte (/equipo:adapt-to-project).',
  'inicio.unProblema': 'equipo: {archivo} tiene un problema: {problema} ({orden})',
  'inicio.problemas': 'equipo: {archivo} tiene {n} problemas: {problema}… ({orden})',
  'inicio.falta': 'equipo: {linea}.',
  'inicio.sinNode': 'no encuentro node en el PATH: sin él no hay ensayo de las subidas ni drivers de fusión (hace falta Node 22 o posterior)',
  'inicio.sinGit': 'no encuentro git en el PATH',
  'inicio.gitViejo': 'git {version} es anterior a {minimo}: el ensayo de las subidas (git merge-tree) no funciona',

  // ------------------------------------------------------------ guardas
  'guarda.fusion':
    'equipo: desde un worktree no se fusiona en la copia principal{duda}. Las ramas las sube el usuario desde la ' +
    'sesión principal. Sigue la skill equipo:lista-para-subir: haz commit, trae la rama principal (`git merge {principal}`) y ' +
    'avisa a la sesión principal con SendMessage, con la primera línea «equipo:lista {rama} <commit>» y debajo ' +
    '«Session:», «Summary:» y, si hay algo, «To review:». Después espera. No lo intentes de otra forma.',
  'guarda.duda': ' (no sé qué carpeta es esa, y podría ser la copia principal)',
  'guarda.tuRama': '<tu-rama>',
  'guarda.barridoAdd':
    'equipo: En la copia principal no se hace git {orden} de todo (-A, ., -u): se añaden los archivos uno a uno. ' +
    'Allí solo entran las fusiones y lo que se añade a mano.',
  'guarda.barridoCommit': 'equipo: En la copia principal no se hace git commit -a / --all ni git commit .: allí solo entran las fusiones y lo que se añade a mano.',
  'guarda.prohibido': 'equipo: {ruta} no entra en los commits (está en «prohibidos» de .claude/equipo.json). Añade tus archivos uno a uno.',
  'guarda.fallo': 'equipo: la guarda de fusiones ha fallado ({error}); no dejo pasar una fusión sin mirarla.',

  // ------------------------------------------------------------ el encargo (scripts/worktree.mjs)
  'encargo.prompt': 'Lee el archivo {archivo} de esta carpeta y haz el encargo que describe. Si no está, es el mismo que {copia}',
  'encargo.pieBloque': 'Tu bloque de decisiones reservado es {bloque}.',
  'encargo.pieEntrega': 'Al acabar, sigue la skill equipo:lista-para-subir. No fusiones tú en {principal}.',
}
