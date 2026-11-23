// The plugin's texts in English. Same keys and the same {placeholders} as es.mjs (the tests check it). Any key can be
// replaced from the settings: "textos": { "fusion.mensaje": "merge({rama}): {resumen}" }.

export default {
  // ------------------------------------------------------------ numbers
  'numero.decimal': '.',

  // ------------------------------------------------------------ context bar
  'contexto.compactando': '◐ Context: compacting…',
  'contexto.sinDatos': '◌ Context: known after the first reply',
  'contexto.linea': '{icono} Context: {usados} of {ventana} used ({porcentaje}%) · {libres} free',
  'contexto.compactado': ' · compacted (the figure updates with the next reply)',
  'contexto.boton': 'Compact',
  'contexto.noCompactado': 'Not compacted: {motivo}',
  'contexto.hecho': 'Compacted',
  'contexto.hechoCifras': 'Compacted: from {antes} to {despues}',
  'contexto.fallo': 'Could not compact (is a turn in progress?): {error}',

  // ------------------------------------------------------------ merge bar
  'estado.lista': 'ready to merge',
  'estado.listaPorRevisar': 'ready to merge · {n} to review',
  'estado.sinEnsayo': ' · no dry run (cannot tell what it would conflict with)',
  'estado.enCola': 'queued',
  'estado.fusionando': 'merging…',
  'estado.fusionada': 'merged ({commit}) · {detalle}',
  'estado.faltaLote': 'batch check pending',
  'estado.conflicto': 'conflict, agent notified: {detalle}',
  'estado.apartada': 'left out of the batch: {detalle}',
  'estado.error': 'not merged: {detalle}',
  'estado.falla': 'merged, but failing: {detalle}',
  'estado.nota': 'Fix: type a note or press Enter',
  'estado.solucionPedida': 'fix requested from the agent',
  'franja.subir': 'Merge',
  'franja.solucionar': 'Fix',
  'franja.cancelar': 'Cancel',
  'franja.borrar': 'Dismiss',
  'franja.subirMarcadas': 'Merge checked ({n})',
  'franja.subirTodas': 'Merge all ({n})',
  'franja.chocaria': 'would conflict with {con}: {archivos}',
  'franja.notaEtiqueta': '  Note for the agent (optional):',
  'franja.notaAyuda': 'Enter sends the "To review" items as they are',
  'franja.notaMandar': 'send',
  'subida.recibida': '{rama} ready to merge',
  'subida.recibidaPorRevisar': '{rama} ready to merge · {n} to review',
  'subida.consumida': 'equipo: {rama} ready to merge, shown in the bar',
  'subida.chocariaLuego': 'would conflict with {con}: its agent is told once they are in',
  'subida.choca': 'conflicts with {con} in {archivos}',
  'subida.sinAvisar': ' · could not notify the agent',
  'subida.ninguna': 'No branch was merged: {ramas}',
  'subida.mediaFusion': 'there is an unfinished merge in {principal}',
  'subida.otraRama': 'the main copy is on {actual}, not on {principal}',
  'subida.noExiste': 'branch {rama} does not exist in this copy',
  'subida.indiceSucio': 'the main copy has staged changes (git add): commit or unstage them before a squash merge',
  'subida.mergeFallo': 'git merge failed',
  'subida.commitFallo': 'git commit failed (did the branch bring no changes?)',
  'subida.sinMensaje': 'could not send the message to the agent',
  'subida.codigosLuego': '• {n} codes in {documento} carry the branch prefix: they are renumbered after the batch',
  'subida.comprobadaSinCerrar': 'checked; could not close the worktree: {motivo}',

  // ------------------------------------------------------------ the merge commit
  'fusion.mensaje': 'Merge {rama} into {principal}: {resumen}',
  'fusion.mensajeSinResumen': 'Merge {rama} into {principal}',

  // ------------------------------------------------------------ messages to the agents
  'agente.volver':
    'When it is done, follow the skill equipo:lista-para-subir: commit, bring the main branch in (`git merge {principal}`), build, ' +
    'rerun the tests of yours that may have changed, and notify again with the line "equipo:lista {rama} <commit>". ' +
    'Do not merge into {principal} yourself.',
  'agente.solucionar': 'The user pressed "Fix" for branch {rama} in the main session.',
  'agente.solucionarPorRevisar': 'Fix in your branch what you left under "To review":\n{lista}',
  'agente.solucionarMotivo': 'What failed when merging or checking in {principal}:\n{motivo}',
  'agente.solucionarNota': 'Note from the user: {nota}',
  'agente.conflicto': 'Merging branch {rama} into {principal} conflicted with what was already in (merge aborted; {principal} is unchanged).',
  'agente.conflictoArchivos': 'Conflicting files: {archivos}.',
  'agente.sinLista': '(git did not list them)',
  'agente.traer': 'Bring {principal} into your branch and resolve the conflicts. {volver}',
  'agente.apartadaPrincipal': 'The dry run of merging branch {rama} conflicts with {principal} (not merged; {principal} is unchanged).',
  'agente.apartadaUna': 'The dry run of merging branch {rama} together with others conflicts with {con}, which is already in {principal}. Your branch was left out of the batch.',
  'agente.apartadaVarias': 'The dry run of merging branch {rama} together with others conflicts with {con}, which are already in {principal}. Your branch was left out of the batch.',
  'agente.apartadaArchivos': 'Files with a real conflict: {archivos}.',
  'agente.apartadaSolos': 'What resolves on its own (append-only "unir" documents and "generados" files) is not in the list.',
  'agente.apartadaTraer': 'Bring {principal} into your branch and resolve those conflicts. {volver}',
  'agente.subida': 'Branch {rama} is merged into {principal} ({commit}) and the main session has checked it. Your worktree is being closed: there is nothing else for you to do.',
  'agente.subidaAbierta': 'Branch {rama} is merged into {principal} ({commit}) and the main session has checked it. Your worktree stays open: there is nothing else for you to do.',
  'agente.falla': 'Branch {rama} is in {principal} ({commit}), but the check in the main session failed:',
  'agente.fallaArreglar': 'Fix it in your branch. {volver}',
  'agente.sinMotivo': 'no reason given',

  // ------------------------------------------------------------ batch-check request to Claude
  'lote.cabecera': 'Check together in {principal} the branches the equipo plugin has just merged: {ramas}. Follow the skill equipo:comprobar-lote.',
  'lote.rama': '## {rama} — merge {fusion}',
  'lote.distinta': '  • the branch tip was not the commit in the notice: the agent kept working after notifying',
  'lote.aviso': 'The agent\'s notice said:\n{aviso}',
  'lote.apartadas': 'Left out by the dry run (their agents have been told):\n{lista}',
  'lote.apartada': '- {rama}: conflicts with {con} in {archivos}',
  'lote.fallidas': 'Not merged (their agents were told, or they wait for the user): {ramas}.',
  'lote.queHacer': '## What to do',
  'lote.generados': 'These touch generated files: {ramas}. Where they conflicted, the merge kept them as they were in {principal}: ',
  'lote.generadosCon': 'rebuild them once with `{orden}` and make a commit "Batch: generated files rebuilt" with only the generated files that change, added one by one.',
  'lote.generadosSin': 'rebuild them by hand (comandos.regenerar is not set in .claude/equipo.json) and make a commit with only that.',
  'lote.renumerar':
    'Renumber in {principal} these codes of {documento}, and wherever they are cited, with {aplicar}: {codigos}. ' +
    'Check it with {comprobar} (it must exit with 0) and make a commit "Batch: codes renumbered (…)" ' +
    'with only the files the script names, added one by one. Pressing "Merge" is the user\'s permission for that commit.',
  'lote.sinCodigos': 'There are no codes in {documento} to renumber.',
  'lote.pruebas': 'Tests for the batch, once: ',
  'lote.pruebasCompilar': '`{compilar}`; then {acotadas}. ',
  'lote.pruebasSinCompilar': '{acotadas}. ',
  'lote.acotadas': 'the tests of what they touch (the ones under "Test:" in each notice; a proposal with {propuesta})',
  'lote.todas': 'If you cannot narrow them down, `{probar}`. ',
  'lote.todasSin': 'If you cannot narrow them down, run the project\'s whole suite (comandos.probar is not set in .claude/equipo.json). ',
  'lote.noRepetir': 'Do not repeat what already passed in the agent unless it overlaps with another branch.',
  'lote.resultado':
    'Tell the user the result and call {herramienta} with every branch: ok if it is fine, or the reason it fails. ' +
    'The mod notifies the agents and closes the worktrees of the ones that are fine. Note anything left untested in {pendientes}.',

  // ------------------------------------------------------------ review of each merge (part of the batch request)
  'revision.noExiste': 'the commit does not exist in this copy (was it merged in another folder?)',
  'revision.squash': 'it is a single commit with the whole branch (squash)',
  'revision.noSquash': 'the commit is not the branch in one (squash): it has more than one parent',
  'revision.noFusion': 'the commit is not a merge (--no-ff)',
  'revision.fusion': 'it is a merge',
  'revision.prohibidos': 'forbidden files got in: {archivos}',
  'revision.archivos': '{n} files',
  'revision.archivosSinProhibidos': '{n} files, none forbidden',
  'revision.sinDecisiones': 'no new decisions in {documento}',
  'revision.fueraDeBloque': 'decisions outside the block {bloque}: {decisiones}',
  'revision.enBloque': 'decisions {decisiones}, inside its block',
  'revision.sinBloque': 'decisions {decisiones} (the branch\'s block is unknown)',
  'revision.codigos': '{documento} has {n} codes with the branch name in front: {codigos}',
  'revision.sinCodigos': 'no code in {documento} with the branch name in front',
  'revision.generados': 'it touches generated files: they must be rebuilt with {orden}',
  'revision.sucia': 'the main copy has {n} uncommitted changes: {archivos}',

  // ------------------------------------------------------------ resultado_lote
  'herramienta.descripcion':
    'equipo plugin: result of checking the batch of branches the mod has just merged into the main branch. ' +
    'One entry per branch: ok=true if it builds and its tests pass (the mod notifies the agent and closes its worktree), ' +
    'ok=false with the reason if something fails (the mod sends it to the agent, who fixes it and notifies again). ' +
    'The branch can be given by its long name (user/x) or short one (x); a branch merged by hand that is not in the bar ' +
    'works too: then give its agent\'s session (ListAgents) in sesion so it can be notified.',
  'herramienta.motivo': 'What failed (only when ok is false).',
  'herramienta.sesion': 'The agent\'s session (ListAgents), if the branch is not in the bar.',
  'resultado.ninguna': 'No branch was given.',
  'resultado.noEsta': '{rama}: not in the bar, and there is no branch or worktree by that name.',
  'resultado.sinSesion': ' (its agent\'s session is unknown: notify it yourself with SendMessage, or pass it in sesion)',
  'resultado.fallida': '{rama}: marked as failing; agent notified.',
  'resultado.fallidaSinAvisar': '{rama}: marked as failing; could not notify the agent{sinSesion}.',
  'resultado.noEntera': '{rama}: not fully in {principal} (it has commits {principal} lacks); its worktree stays open.',
  'resultado.sinRenumerar': ' ⚠ Still not renumbered in {documento}: {codigos} ({orden}).',
  'resultado.avisado': ', agent notified',
  'resultado.sinAvisar': ', agent not notified{sinSesion}',
  'resultado.abierto': '{rama}: checked{avisado}; its worktree stays open (worktrees.cerrarAlSubir is off).{aviso}',
  'resultado.noCerrado': '{rama}: checked{avisado}; the worktree could not be closed ({motivo}).{aviso}',
  'resultado.sinRespuesta': 'worktree.mjs did not answer',
  'resultado.cerrado': '{rama}: checked{avisado} and worktree closed.{aviso}',
  'resultado.sinWorktree': '{rama}: checked{avisado}; it had no open worktree.{aviso}',

  // ------------------------------------------------------------ /ramas, /reservar and /pendiente
  'ramas.descripcion': 'Panel with the worktrees, their decision block and their agents (equipo)',
  'ramas.titulo': 'Branches',
  'ramas.error': 'Could not read the branches: {error}',
  'ramas.gitFallo': 'git worktree list failed',
  'ramas.principal': 'main copy',
  'ramas.todoDentro': 'all in the main branch',
  'ramas.todoDentroDetras': 'all in the main branch (−{n})',
  'ramas.agente': 'agent {estado}',
  'ramas.siguiente': 'Next free block: {bloque}',
  'ramas.actualizar': 'Refresh',
  'ramas.leyenda': '+n: commits the main branch lacks · −n: commits of the main branch the branch lacks · ✔ everything is in the main branch',
  'reservar.descripcion': 'Next free block of decision numbers; with a worktree name, reserves it (equipo)',
  'reservar.apagadas': 'Numbered decisions are off (decisiones.activo in .claude/equipo.json): there are no blocks to reserve.',
  'reservar.siguiente': 'Next free block: {bloque} (after the highest decision in the branches and copies and the reserved blocks).',
  'reservar.noHay': 'There is no worktree "{nombre}". Next free block: {bloque}.',
  'reservar.yaTiene': '{nombre} already has the block {suyo}. Next free: {bloque}.',
  'reservar.desdePrincipal': 'Blocks are reserved from the main copy. Next free block: {bloque}.',
  'reservar.fallo': 'Could not reserve the block: {motivo}',
  'reservar.sinRespuesta': 'bloque.mjs did not answer',
  'reservar.hecho': 'Reserved {bloque} for {nombre}.',
  'pendiente.descripcion': 'Notes a pending item in the pending-work document (equipo)',
  'pendiente.argumento': '<text>',
  'pendiente.lista': 'Quick notes in {documento}:\n{lista}',
  'pendiente.vacio': 'There are no quick notes in {documento}. Usage: /pendiente <text>',
  'pendiente.apuntado': 'Noted in {documento} (Quick notes): {texto}',
  'pendiente.docTitulo': '# Pending',
  'pendiente.docActualizado': 'Updated on {fecha}.',
  'pendiente.docSeccion': '## Quick notes',
  'pendiente.docIntro': 'Noted with `/pendiente`. Once done or launched, remove it from here or move it to its section.',
  'pendiente.docEnMarcha': '## In progress',

  // ------------------------------------------------------------ at session start
  'inicio.sinAjustes': 'equipo: this project has no .claude/equipo.json yet. Ask Claude to adapt it (/equipo:adapt-to-project).',
  'inicio.unProblema': 'equipo: {archivo} has a problem: {problema} ({orden})',
  'inicio.problemas': 'equipo: {archivo} has {n} problems: {problema}… ({orden})',
  'inicio.falta': 'equipo: {linea}.',
  'inicio.sinNode': 'node is not in PATH: without it there is no dry run of merges and no merge drivers (Node 22 or later is needed)',
  'inicio.sinGit': 'git is not in PATH',
  'inicio.gitViejo': 'git {version} is older than {minimo}: the dry run of merges (git merge-tree) does not work',

  // ------------------------------------------------------------ guards
  'guarda.fusion':
    'equipo: a worktree does not merge into the main copy{duda}. Branches are merged by the user from the ' +
    'main session. Follow the skill equipo:lista-para-subir: commit, bring the main branch in (`git merge {principal}`) and ' +
    'notify the main session with SendMessage, with the first line "equipo:lista {rama} <commit>" followed by ' +
    '"Session:", "Summary:" and, if there is anything, "To review:". Then wait. Do not try it any other way.',
  'guarda.duda': ' (I cannot tell which folder that is, and it could be the main copy)',
  'guarda.tuRama': '<your-branch>',
  'guarda.barridoAdd':
    'equipo: In the main copy there is no git {orden} of everything (-A, ., -u): add files one by one. ' +
    'Only merges and what is added by hand go in there.',
  'guarda.barridoCommit': 'equipo: In the main copy there is no git commit -a / --all nor git commit .: only merges and what is added by hand go in there.',
  'guarda.prohibido': 'equipo: {ruta} never goes into a commit (it is in "prohibidos" in .claude/equipo.json). Add your files one by one.',
  'guarda.fallo': 'equipo: the merge guard failed ({error}); a merge does not pass without being looked at.',

  // ------------------------------------------------------------ the task (scripts/worktree.mjs)
  'encargo.prompt': 'Read the file {archivo} in this folder and do the task it describes. If it is missing, it is the same as {copia}',
  'encargo.pieBloque': 'Your reserved block of decision numbers is {bloque}.',
  'encargo.pieEntrega': 'When you finish, follow the skill equipo:lista-para-subir. Do not merge into {principal} yourself.',
}
