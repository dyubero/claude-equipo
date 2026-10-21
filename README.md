# claude-equipo

Un plugin de [Claude Code](https://code.claude.com) para trabajar con **varios agentes a la vez, cada uno en su
worktree de Orca**, y subir sus ramas a la rama principal sin pisarse: tú hablas con
una sesión en la copia principal, ella lanza cada encargo a un worktree nuevo con su agente, y cuando un agente acaba,
su rama sale en una franja sobre el prompt con un botón **Subir**.

Sale de las herramientas de un proyecto que lleva meses trabajando así, con hasta diez ramas en paralelo. Esta copia es
genérica: lo que cambia de un proyecto a otro (comandos de compilar y probar, archivos que no se suben…) va en un
archivo de ajustes, y **no hace falta escribirlo a mano: lo prepara tu agente**, estudiando tu proyecto y preguntándote
lo que no pueda deducir.

## Cómo empezar: dáselo a tu agente

Abre Claude Code en la carpeta de tu proyecto (la copia principal, en la rama principal) y dile:

> Instala el plugin de https://github.com/<usuario>/claude-equipo (o: de la carpeta `<ruta>`) y adáptalo a este
> proyecto. Lee su README, estudia cómo compila, prueba y documenta el proyecto, y pregúntame lo que necesites antes de
> dejarlo configurado.

El agente:

1. instala el plugin (ver «Instalar»);
2. sigue la skill **`preparar`**: un script estudia el proyecto (gestor de paquetes, scripts de `package.json`, ejecutor
   de pruebas, lockfiles y archivos generados, documentos de diseño, backlog o changelog, archivos sensibles sin ignorar,
   idioma de los commits, CLAUDE.md) y propone los ajustes; el agente lee además lo que haga falta (README, CI,
   configuración de las pruebas);
3. te pregunta, en un bloque con opciones y una recomendación, solo lo dudoso: qué se pasa para comprobar que compila,
   qué pruebas al subir, qué archivos son generados o no deben entrar nunca, si quieres decisiones numeradas o backlog…;
4. escribe `.claude/equipo.json`, prueba los comandos, instala los drivers de fusión y, si quieres, añade a tu
   CLAUDE.md el apartado del flujo (para que el agente de la copia principal no implemente allí y los de los worktrees
   sepan avisar);
5. te cuenta qué ha quedado y cómo se lanza el primer encargo.

**Si eres el agente que lo instala:** hazlo como dice «Instalar» y después sigue la skill `equipo:preparar` (si aún no
sale en tu lista de skills, lee directamente `plugin/skills/preparar/SKILL.md` de este repositorio y síguela, con los
scripts de `plugin/scripts`). No escribas los ajustes sin preguntar al usuario lo que no se deduce del proyecto.

## Qué lleva

| Pieza | Dónde | Qué hace |
|---|---|---|
| **Franja del contexto** | todas las sesiones | Una línea sobre el prompt: «● Contexto: 84k de 200k usados (42 %) · libres 116k», en amarillo desde el 60 % y en rojo desde el 80 %, y el botón **Compactar** (lo mismo que `/compact`), que no sale mientras Claude trabaja. |
| **Subidas** | copia principal | El aviso «La rama X está lista para subir (commit)» que manda un agente no le llega a Claude: sale en la franja con **Subir**, **Solucionar** y **Borrar**, más casillas con **Subir marcadas** y **Subir todas**. Ver «Cómo se sube». |
| **Ensayo** | copia principal | Al llegar cada aviso y al pulsar «Subir», ensaya la subida con `git merge-tree`, sin tocar nada: la franja dice «⚠ chocaría con X: archivos» antes de pulsar, y al subir entra primero lo que menos choca. |
| **Drivers de fusión** | todas las copias | Los documentos donde dos ramas suelen añadir al final (un CHANGELOG, el documento de diseño, el backlog) se unen solos si los dos lados solo añaden; los archivos generados (`package-lock.json`) se quedan como estaban y se rehacen después. |
| **`resultado_lote`** | copia principal | Una herramienta que Claude llama tras comprobar el lote: a las ramas que están bien les avisa y les cierra el worktree; a las que fallan les manda el motivo. |
| **`/ramas`** | todas | Un panel con cada worktree: su comentario de Orca, cuánto lleva que la principal no tiene y al revés, y el estado de su agente. |
| **`/reservar`** | principal | Solo con decisiones numeradas: el siguiente bloque libre; con el nombre de un worktree, se lo apunta en su comentario de Orca. |
| **`/pendiente`** | todas | `/pendiente <texto>` lo apunta, con fecha y rama, en «Apuntes rápidos» del documento de pendientes. Sin texto, lista lo apuntado. |
| **Freno a las fusiones** | worktrees | Una orden que fusiona en la copia principal desde un worktree (`git -C <principal> merge …`, `cd <principal> && git merge …`, `pull`) se niega, explicando al agente cómo avisar. |
| **Guarda de los commits** | todas | En la copia principal niega `git add -A`, `git add .`, `git add -u`, `git commit -a` / `--all` y `git commit .`. En cualquier copia niega que entren los `prohibidos` de los ajustes (por ejemplo `.env.local` o `dist/`). |
| **Skill `preparar`** | principal | Adapta el plugin a tu proyecto: lo estudia, te pregunta lo dudoso, escribe `.claude/equipo.json`, prueba los comandos, instala los drivers y añade el flujo a tu CLAUDE.md. Si la copia principal no tiene ajustes, el plugin te lo recuerda al empezar la sesión. |
| **Skill `encargo`** | principal | Lanza un encargo: nombre de la rama, bloque de decisiones si se usan, `orca worktree create` con el texto del usuario tal cual y la fila en el documento de pendientes. |
| **Skill `lista-para-subir`** | worktree | Commit, traer la principal, repetir solo las pruebas que se cruzan y el aviso a la sesión principal con el formato exacto que lee la franja. |
| **Skill `comprobar-lote`** | principal | Lo que hace Claude cuando la franja le pide comprobar un lote: rehacer lo generado, renumerar el backlog, una sola tanda de pruebas y `resultado_lote`. |
| **Skill `estado-ramas`** | principal | Cómo va cada worktree (en marcha, esperando al usuario, a media fusión, al día para subir) y con qué chocaría si se subiera ahora. |

Los textos de los mods y las skills están en español.

## Requisitos

- **Claude Code 2.1.292** o posterior (los mods usan la API de *function hooks*, que aún es de acceso anticipado y
  puede cambiar entre versiones).
- **Node 22** o posterior en el `PATH`: los scripts y el driver de fusión son `.mjs` sin dependencias.
- **git 2.38** o posterior (`git merge-tree --write-tree`).
- **Orca**, con la CLI `orca` en el `PATH`, para los worktrees y sus agentes. Sin Orca funcionan la franja del contexto,
  las guardas, las subidas y `/ramas` (sin comentarios ni estado de agentes), pero no `encargo` ni el cierre de worktrees.

Probado en Windows; las guardas entienden también rutas de Linux y macOS, pero ahí solo se han probado con las pruebas
del repositorio.

## Instalar

En una terminal con Claude Code (si el repositorio está en GitHub):

```
/plugin install equipo --marketplace <usuario>/claude-equipo
```

Responde `y` para añadir el marketplace, elige el ámbito (el de usuario vale para todos tus proyectos) y deja los
interruptores como están. Si lo tienes en una carpeta en vez de en GitHub:

```sh
claude plugin marketplace add /ruta/a/claude-equipo
claude plugin install equipo@claude-equipo
```

Con la carpeta como marketplace, una sesión lee el plugin de esa carpeta: si cambias algo, basta `/reload-plugins`.

Las skills nuevas salen en la sesión siguiente (o tras `/reload-plugins`). Después, en cada proyecto:

1. **Prepáralo:** en la sesión de la copia principal, pide «prepara el plugin equipo para este proyecto» (skill
   `preparar`, ver «Cómo empezar»). Deja `.claude/equipo.json` con commit: cada worktree lee el suyo.

   A mano también se puede: `node <carpeta del plugin>/scripts/explorar.mjs` dice lo que se deduce del proyecto y
   propone los ajustes; `node <carpeta del plugin>/scripts/ajustes.mjs --crear` escribe uno con los valores por defecto
   (`claude plugin list` dice dónde está el plugin); o copia `ejemplos/equipo.json`.
2. Abre la sesión de la copia principal **en la raíz del repositorio**. Al empezar, el plugin instala los drivers de
   fusión en el `.git` del repositorio (ver «Qué toca en tu repositorio»).

## Ajustes: `.claude/equipo.json`

Todo es opcional; lo que no está vale lo de por defecto. `node <plugin>/scripts/ajustes.mjs` enseña lo que vale en esa
copia.

| Clave | Por defecto | Para qué |
|---|---|---|
| `ramaPrincipal` | `"main"` | La rama a la que se suben las demás. |
| `idioma` | `"es"` | Idioma de los commits, documentos y avisos que escriben los agentes (lo leen las skills). |
| `comandos.compilar` | `"npm run build"` | Lo primero que se pasa en el lote y al traer la principal. `""` si no hay. |
| `comandos.probar` | `"npm test"` | Todas las pruebas. |
| `comandos.probarArchivos` | `""` | Solo unas pruebas: `{archivos}` se cambia por la lista (p. ej. `"npx vitest run {archivos}"`). Vacío: siempre `probar`. |
| `comandos.regenerar` | `""` | Rehace los `generados` tras subir (p. ej. `"npm install"` para `package-lock.json`). |
| `prohibidos` | `[]` | Archivos o carpetas (rutas desde la raíz, sin comodines) que nunca entran en un commit. |
| `generados` | `[]` | Patrones (como en `.gitattributes`) de archivos generados: al fusionar se queda el de la copia actual y luego se rehacen. |
| `unir` | `[]` | Documentos en los que, si dos ramas solo añaden líneas en el mismo sitio, se conservan las dos. |
| `decisiones.activo` | `false` | Decisiones numeradas en un documento de diseño (`### D12. Título`), con un bloque de números reservado por rama. |
| `decisiones.documento` / `prefijo` / `bloque` | `"DESIGN.md"` / `"D"` / `10` | Dónde están, cómo empiezan (`"ADR-"` vale) y cuántas por bloque. |
| `backlog.activo` | `false` | Backlog con códigos en la primera celda de cada fila (`\| T12 \| … \|`): en las ramas se apuntan con el nombre de la rama delante (`carrito-T1`) y la principal los renumera al subir. |
| `backlog.documento` | `"BACKLOG.md"` | El backlog. |
| `pendientes` | `"docs/pendientes.md"` | Donde `/pendiente`, `encargo` y `comprobar-lote` apuntan lo que está en marcha y lo que queda sin probar. |
| `orca.repo` | `""` | Nombre del repositorio en Orca; vacío, el de la carpeta de la copia principal. |
| `sesionPrincipal` | `""` | Cómo empieza el nombre de la sesión de la copia principal en `ListAgents`; vacío, el de su carpeta (con `_` → `-`). |

Los interruptores de cada pieza están en `/config`, en las filas del plugin `equipo`: *Franja del contexto*,
*Subidas desde la copia principal*, *Freno a las fusiones en la principal* y *Guarda de los commits*.

## El flujo, de un encargo a la subida

1. **Pides algo en la sesión de la copia principal.** Claude sigue la skill `encargo`: elige un nombre corto
   (`carrito-pago`), reserva un bloque de decisiones si las usas y lanza
   `orca worktree create … --agent claude --prompt "<tu encargo tal cual>"`. Desde ahí hablas con ese agente, en su
   worktree. Puedes lanzar varios a la vez.
2. **El agente trabaja en su rama.** Si intenta fusionar en la principal, la guarda se lo niega y le dice cómo avisar.
3. **Cuando acaba, sigue `lista-para-subir`:** commit, `git merge main`, compila, repite solo las pruebas que se cruzan
   con lo que ha traído main y manda a la sesión principal:
   ```
   La rama ana/carrito-pago está lista para subir (3f2a9c1)
   Sesión: carrito-pago-4e
   Resumen: pago con tarjeta en el carrito
   Qué cambia: …
   Probar: npx vitest run src/carrito.test.ts
   Por revisar:
   - sin probar en Safari
   ```
4. **En la principal, el aviso sale en la franja** (no le llega a Claude): `⇡ ana/carrito-pago (3f2a9c1) · lista para
   subir`, con el resumen, lo que hay por revisar y, si el ensayo lo ve, «⚠ chocaría con login: src/app.ts».
5. **Pulsas «Subir»** (o marcas varias y «Subir marcadas», o «Subir todas»). El mod:
   - ensaya lo que hay en cola contra la principal y ordena de menos a más choques;
   - aparta la que choca de verdad con la principal y avisa a su agente con los archivos;
   - fusiona una tras otra con `git merge --no-ff <rama> -m "Fusión de <rama> en main: <resumen>"`; si una choca pese
     al ensayo, `git merge --abort` y aviso a su agente;
   - avisa a la que chocaba con otra del lote cuando esa ya ha entrado, para que traiga main de una vez.
6. **Con la cola vacía, el mod pide a Claude una sola comprobación del lote** (skill `comprobar-lote`): rehacer lo
   generado si alguna lo toca, renumerar el backlog si lo usas, compilar una vez, las pruebas de lo que tocan una vez, y
   llamar a `resultado_lote`.
7. **`resultado_lote`** avisa a cada agente. A los que están bien les cierra el worktree (`orca worktree rm --force`,
   `git worktree prune`, `git branch -d`); a los que fallan les manda el motivo y su rama queda en la franja como
   «dentro, pero falla», con **Solucionar**.
8. **Solucionar** (sale si el aviso trae «Por revisar», o si la rama ha chocado o fallado) pide una indicación opcional
   y se la manda al agente con lo que tiene que arreglar. El agente arregla, vuelve al paso 3 y su rama vuelve a la
   franja. **Borrar** solo quita el aviso.

En cualquier momento, `estado-ramas` («¿cómo van las ramas?») dice en qué está cada worktree y con qué chocaría.

## Qué toca en tu repositorio

- **Nada que vaya en los commits.** Los drivers de fusión se instalan en el `.git` común (el de la copia principal,
  que comparten todos los worktrees):
  - `<.git>/equipo/fusion.mjs`, una copia del driver, para no depender de dónde esté instalado el plugin;
  - dos entradas `merge.equipo-docs` y `merge.equipo-generado` en `<.git>/config`;
  - un bloque marcado en `<.git>/info/attributes` con los archivos de `unir`, `generados` y, si están activos, los
    documentos de decisiones y backlog.

  Se ponen al día al empezar cada sesión con las subidas activas. Para quitarlos:
  `node <plugin>/scripts/fusion.mjs desinstalar`.
- El documento de `pendientes`, que las skills y `/pendiente` escriben (y la principal confirma solo).
- Lo que ejecuta el mod: `git` (worktree list, rev-list, merge, merge-tree, commit-tree, status, diff, show,
  branch -d), `orca worktree ps|set|rm` y `node <plugin>/scripts/*.mjs`. Manda mensajes a los agentes con
  `SendMessage` y pide a Claude la comprobación del lote con un prompt.

## Cómo se prueba

```sh
npm test            # las dos tandas
npm run test:scripts  # scripts y driver de fusión, con repositorios temporales de git (node --test)
npm run test:plugin   # los mods: claude plugin test plugin
npm run validar     # claude plugin validate --strict del marketplace y del plugin
```

Las pruebas de los scripts crean ramas que chocan de verdad (en el lockfile, en un documento y en código) en
repositorios temporales; nunca tocan este repositorio. Las de los mods simulan Claude Code y git.

Para probar un cambio en el plugin sin reinstalarlo: `claude --plugin-dir plugin`.

## Lo que no hace

- No lee un intérprete de shell entero: sigue `cd`/`Set-Location`/`pushd`, `git -C`, `--git-dir`/`--work-tree`,
  `bash -c` y `powershell -Command`. Una ruta con una variable que no es `$HOME`/`$PWD` no se puede saber: el freno la
  niega igualmente; la guarda de commits la deja pasar.
- `git push . rama:main` o `git update-ref` desde un worktree no los frena.
- La cola vive en el mod: si se recargan los plugins a mitad de una subida, las ramas quedan «en cola» sin avanzar;
  pulsa «Borrar» y que el agente vuelva a avisar.
- La franja se dibuja en la terminal y en la app de escritorio; en la extensión de VS Code y en `claude -p`, no.
- Los avisos se reconocen por su primera frase: «La rama X está lista para subir (commit)». Si un agente la escribe de
  otra forma, no sale en la franja y Claude lo recibe como un mensaje normal.
