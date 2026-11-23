# equipo: portable, sin depender de Orca y modificable

Fecha: 2026-11-23. Estado: aprobado e implementado (las cuatro fases, versiones 0.1.1 a 0.4.0).

## Lo que cambió al implementarlo

- **El lanzador por defecto es `auto`, no `manual`:** se detecta en cada máquina, así que no hace falta guardarlo en
  los ajustes del proyecto ni esperar a los de usuario.
- **El encargo se escribe dentro del worktree** (`.claude/equipo-encargo.md`, que git ignora por `info/exclude`),
  además de la copia en el `.git` común: el agente lo lee sin salir de su carpeta. El script le añade al final el
  bloque de decisiones reservado y cómo se entrega, y hace él mismo la reserva al crear.
- **El estado (`atom`) se declara en cada archivo del mod que lo usa**, y todo lo que recibe `$` desde otro archivo es
  una declaración `function`: lo exige el motor de los mods. `register.tsx` quedó en el cableado, como estaba previsto.
- **Las etiquetas del aviso van en inglés** (`Session:`, `Summary:`, `To review:`) en cualquier idioma; las españolas
  y la frase antigua se siguen leyendo.
- **Los títulos de `/config` están en inglés**: son fijos, no pueden seguir al ajuste `idioma`.
- **Queda en español** lo que imprimen los scripts y los mensajes de `ajustes.mjs --comprobar`.
- **La CI encontró un fallo real en macOS** que no estaba en el diseño: con el repositorio tras un enlace simbólico,
  el driver de fusión salía sin hacer nada y se perdía lo que añadía la otra rama. Los scripts se reconocen ahora por
  su ruta real.
- **Sin probar contra terminales de verdad:** los lanzadores `tmux`, `wt`, `terminal` e `iterm`.

## Objetivo

Que el plugin funcione igual en macOS, Linux y Windows, en cualquier repositorio de git (con Orca o sin él), y que lo
que hoy está fijo en el código (textos, umbrales, forma de fusionar, reglas de las guardas) se pueda cambiar desde los
ajustes sin tocar el plugin.

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Orca obligatorio? | Opcional. Con Orca todo sigue como ahora; sin él, el plugin funciona completo salvo el estado del agente en `/ramas`. |
| ¿Cómo se lanza el agente sin Orca? | Con un lanzador configurable con preajustes; Orca es un preajuste más. Si no hay ninguno, manual. |
| ¿Hasta dónde llega lo modificable? | Ajustes y plantillas de texto, en dos niveles (usuario y proyecto). Sin enganches de órdenes propias por ahora. |
| ¿Idioma? | Catálogo de textos en español e inglés, y el aviso «lista para subir» reconocido por un marcador fijo. |

## Fuera de alcance

- Enganches de órdenes propias («antes de subir», «tras fusionar») y sustituir skills desde el proyecto. El reparto
  del código de la fase 3 deja sitio para añadirlos después.
- Fusión por rebase: reescribe la rama bajo un agente que sigue vivo en ella. Solo `merge` y `squash`.
- Flujo por pull requests en vez de fusión local.
- Renombrar las skills y los comandos (`encargo`, `lista-para-subir`, `/ramas`…): rompería lo ya instalado.
- La franja en la extensión de VS Code y en `claude -p`: depende de Claude Code, no del plugin.

## Fases

Cuatro fases, cada una con su plan, sus pruebas y su versión. Cada una deja el plugin funcionando.

| Fase | Versión | Depende de |
|---|---|---|
| 1. Portabilidad | 0.1.1 | — |
| 2. Gestor de worktrees y lanzadores | 0.2.0 | 1 |
| 3. Ajustes en dos niveles y reparto de `register.tsx` | 0.3.0 | 2 |
| 4. Catálogo de textos e idioma | 0.4.0 | 3 |

---

## Fase 1. Portabilidad

### Problemas que resuelve

1. **Nunca se ha ejecutado fuera de Windows.** No hay CI.
2. **Las rutas se comparan en minúsculas** (`rutas.ts`, `comun.mjs`, `commits.ts`). Es correcto en Windows y en un Mac
   por defecto, e incorrecto en Linux y en volúmenes de Mac que distinguen mayúsculas: `/repo/Main` y `/repo/main`
   pasarían por la misma copia.
3. **El parser de shell no conoce `zsh`** (el shell por defecto de macOS), ni `fish`, `dash` o `ksh`, ni las opciones
   juntas como `bash -lc "…"`. Una fusión envuelta así se le escapa al freno.
4. **Los fallos de las herramientas se callan.** `instalarDrivers` y `ensayar` hacen `.catch(() => null)`: sin `node`
   en el `PATH` (frecuente con nvm o Homebrew) no hay drivers ni ensayo, y nadie lo ve.

### Cambios

- **CI** (`.github/workflows/pruebas.yml`): matriz `ubuntu-latest`, `macos-latest`, `windows-latest` con Node 22, que
  pasa `npm run test:scripts`. `npm run test:plugin` entra en la matriz solo si `claude plugin test` funciona sin
  credenciales; es lo primero que comprueba el plan. Si no, se queda como prueba local y el README lo dice.
- **Mayúsculas según el sistema de archivos.** `normalizar` deja de pasar a minúsculas. `Copia` gana
  `ignoraMayusculas`, leído una vez con `git config --get core.ignorecase` (git lo fija al clonar según el sistema de
  archivos). `dentroDe` y `misma` reciben ese valor y pliegan solo si es cierto. Lo mismo en `comun.mjs`.
- **Shells:** `SHELLS` añade `zsh`, `fish`, `dash` y `ksh`; la opción de orden acepta grupos que acaban en `c`
  (`-lc`, `-ic`).
- **Fallos visibles.** Al empezar la sesión se comprueba que hay `node` y `git` 2.38 o posterior; si falta algo, un
  aviso que dice qué falta y qué deja de funcionar. Si el ensayo falla, la franja lo dice en la rama («sin ensayo:
  motivo») en vez de no mostrar nada.
- **README:** requisitos y «probado en» al día.

### Pruebas

Casos nuevos en `guardas.test.ts` y en las pruebas de `rutas`: rutas que solo difieren en mayúsculas con
`ignoraMayusculas` cierto y falso; `zsh -c`, `bash -lc`; rutas de macOS (`/Users/…`, `~/…`). La matriz de CI es la
prueba de que los scripts funcionan en los tres sistemas.

---

## Fase 2. Gestor de worktrees y lanzadores

### Qué hace Orca hoy y qué lo sustituye

| Función | Con Orca | Sin Orca |
|---|---|---|
| Crear worktree y rama | `orca worktree create` | `git worktree add -b <rama> <carpeta> <rama principal>` |
| Cerrar worktree | `orca worktree rm --force` | `git worktree remove --force`, y después `prune` y `branch -d` como ahora |
| Guardar el bloque de decisiones reservado | comentario de Orca | `<.git común>/equipo/reservas.json` |
| Abrir la sesión del agente con el encargo | `--agent claude --prompt` | lanzador (ver abajo) |
| Estado del agente en `/ramas` | `orca worktree ps` | no hay; la columna sale vacía |

### Una sola interfaz: `scripts/worktree.mjs`

El mod y las skills dejan de llamar a `orca`. Llaman a:

```
node worktree.mjs crear <nombre> --encargo <archivo>   → JSON { ruta, rama, lanzado, orden }
node worktree.mjs cerrar <rama>                        → JSON { cerrado, motivo }
node worktree.mjs lista                                → JSON [{ ruta, rama, principal, bloque, agente }]
```

Dentro, dos gestores con la misma forma (`crear`, `cerrar`, `lista`): `gestores/orca.mjs` y `gestores/git.mjs`. Se
elige por el ajuste `worktrees.gestor` (`"auto"` por defecto: Orca si `orca` está en el `PATH`, si no git).

### Lanzadores

Con el gestor de git, tras crear el worktree se ejecuta el lanzador. Es una orden en forma de lista (sin pasar por una
shell, así no hay problemas de comillas en ningún sistema) con los huecos `{ruta}`, `{nombre}` y `{prompt}`:

| Preajuste | Orden |
|---|---|
| `tmux` | `["tmux", "new-window", "-c", "{ruta}", "-n", "{nombre}", "claude", "{prompt}"]` |
| `wt` (Windows Terminal) | `["wt", "-w", "0", "new-tab", "-d", "{ruta}", "claude", "{prompt}"]` |
| `terminal` (macOS) | `osascript` que abre una pestaña de Terminal.app en `{ruta}` con `claude {prompt}` |
| `iterm` (macOS) | `osascript` equivalente para iTerm2 |
| `manual` | no ejecuta nada: devuelve la orden para que el usuario la pegue |
| `propio` | la lista que diga `lanzar.orden` |

`adapt-to-project` detecta lo que hay en la máquina y propone el preajuste. Como depende de la máquina y no del
proyecto, el lanzador se guarda en los ajustes de usuario (fase 3); hasta entonces, en los del proyecto.

### El encargo va en un archivo

Hoy el encargo viaja en `--prompt` y no puede llevar `"`, `` ` `` ni `$`. Pasa a escribirse en
`<.git común>/equipo/encargos/<nombre>.md`, y `{prompt}` es siempre una frase corta y sin caracteres especiales que
dice al agente que lea ese archivo. Vale igual para Orca, y desaparece la restricción de las comillas.

### Reservas de bloques

`reservas.json` (`{ "<rama>": [desde, hasta] }`) es la única fuente. `bloque.mjs` gana `--reservar <rama>` y lo
escribe; `/reservar` lo llama. Con Orca, además, se copia al comentario del worktree, solo para que se vea en Orca.
Durante esta versión `bloque.mjs` sigue leyendo también los comentarios de Orca, para no perder las reservas de los
worktrees que ya están abiertos.

### Ajustes nuevos

```json
"worktrees": { "gestor": "auto", "carpeta": "../{repo}-worktrees/{nombre}", "prefijoRama": "" },
"lanzar": { "preajuste": "manual", "orden": [] }
```

`orca.repo` se conserva. Las descripciones de las skills dejan de decir «Orca worktree» y dicen «worktree».

### Pruebas

`worktree.test.mjs` con repositorios temporales: crear, listar y cerrar con el gestor de git; cerrar una rama que no
está entera en la principal se niega; el lanzador `propio` recibe los huecos bien sustituidos (con un script de Node
que apunta sus argumentos en un archivo); `manual` devuelve la orden sin ejecutar. El gestor de Orca se prueba con un
`orca` falso en el `PATH` que contesta JSON fijo.

---

## Fase 3. Ajustes en dos niveles y reparto del código

### Dos niveles

`~/.claude/equipo.json` (preferencias de la persona en todos sus repositorios) y, encima, `.claude/equipo.json` del
proyecto. `mezclar` pasa a mezclar objetos en profundidad. El mod y los scripts usan la misma función.
`ajustes.mjs` enseña de dónde sale cada valor.

### Valores por defecto neutros

`comandos.compilar` y `comandos.probar` pasan a `""`, y `pruebas.patron` a uno que cubre las convenciones habituales
de varios ecosistemas. Sin ajustes, las skills dicen que el proyecto no está adaptado en vez de lanzar `npm`.
**Cambio que rompe:** un proyecto de Node que funcionaba sin `equipo.json` tendrá que adaptarse. Va en las notas de la
versión.

### Ajustes nuevos

| Clave | Por defecto | Para qué |
|---|---|---|
| `contexto.aviso` / `contexto.peligro` | `60` / `80` | Porcentajes desde los que la franja sale en amarillo y en rojo. |
| `fusion.estrategia` | `"merge"` | `"merge"` (`--no-ff`, como ahora) o `"squash"` (un commit por rama). |
| `guardas.barridos` | `true` | Negar `git add -A` / `.` / `-u` y `git commit -a` en la copia principal. |
| `worktrees.cerrarAlSubir` | `true` | Cerrar el worktree cuando el lote lo da por bueno; con `false`, solo se avisa. |
| `textos` | `{}` | Plantillas que sustituyen a las del catálogo (fase 4). |

Con `squash`, «la rama está entera en la principal» no se puede preguntar con `merge-base --is-ancestor`. Al fusionar
se apunta la punta de la rama, y al cerrar se comprueba que no se ha movido desde entonces; la rama se borra con
`branch -D`.

### Comprobar los ajustes

`plugin/equipo.schema.json` (para el autocompletado del editor mediante `$schema`, que `mezclar` ya ignora) y
`ajustes.mjs --comprobar`, que avisa de claves desconocidas y tipos equivocados. `adapt-to-project` lo pasa al acabar.

### Reparto de `register.tsx`

Hoy son 791 líneas con interfaz, cola, git y Orca. Queda así:

| Archivo | Qué lleva |
|---|---|
| `register.tsx` | Solo el cableado: qué evento llama a qué. |
| `franja.tsx` | El dibujo de la franja del contexto y de las subidas. |
| `cola.ts` | La cola de «Subir»: ensayo, orden, fusión y petición del lote. |
| `lote.ts` | `resultado_lote`: avisos a los agentes y cierre de worktrees. |
| `guarda.ts` | La guarda de las órdenes de git. |
| `panel.tsx` | `/ramas`, `/reservar` y `/pendiente`. |

El comportamiento no cambia: las pruebas de los mods que hay deben pasar sin tocarlas. Los comentarios actuales dan a
entender que `$` solo se usa en `register.tsx`; el plan comprueba primero, con un archivo, que pasar `$` a funciones
de otro módulo funciona en `claude plugin test`. Si no, el reparto se hace con funciones que no usan `$` y
`register.tsx` se queda con las llamadas.

---

## Fase 4. Catálogo de textos e idioma

### Catálogo

`plugin/textos/es.mjs` y `plugin/textos/en.mjs`: un objeto de clave a plantilla con huecos (`{rama}`, `{principal}`,
`{archivos}`…), y `t(clave, datos)`. Entran todos los textos del mod: franja, avisos, negativas de las guardas,
mensajes a los agentes, mensaje de fusión y petición del lote. El idioma es el de `idioma`; si no hay catálogo para
ese idioma, inglés. El valor por defecto de `idioma` sigue siendo `es`, y `adapt-to-project` lo escribe siempre.

El ajuste `textos` de la fase 3 sustituye cualquier clave:

```json
"textos": { "fusion.mensaje": "merge({rama}): {resumen}" }
```

Así la personalización de textos y la traducción son un solo mecanismo. `ajustes.mjs --comprobar` avisa de las claves
que no existen y de los huecos que la plantilla no tiene.

### El aviso «lista para subir»

Hoy se reconoce por la frase «La rama X está lista para subir (commit)». Pasa a reconocerse por una primera línea
fija, igual en todos los idiomas:

```
equipo:lista <rama> <commit>
Sesión: …        (o Session:)
Resumen: …       (o Summary:)
Por revisar:     (o To review:)
```

Las etiquetas se aceptan en español y en inglés. La frase antigua se sigue reconociendo, para los agentes que ya
están trabajando con la skill anterior.

### Skills y documentación

- `encargo`, `lista-para-subir`, `comprobar-lote` y `estado-ramas` se reescriben en inglés con la misma regla que
  `adapt-to-project`: hablar al usuario en su idioma y escribir commits y documentos en el de `idioma`. Los nombres
  no cambian.
- README principal en inglés y `README.es.md` con la versión en español.

### Pruebas

Que los dos catálogos tienen las mismas claves y los mismos huecos por clave; que `avisoDeSubida` reconoce el
marcador, las etiquetas en los dos idiomas y la frase antigua; que una plantilla de `textos` sustituye a la del
catálogo.
