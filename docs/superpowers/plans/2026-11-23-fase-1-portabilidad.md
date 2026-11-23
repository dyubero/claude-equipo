# Fase 1. Portabilidad — plan de implementación

**Objetivo:** que el plugin se comporte igual en macOS, Linux y Windows, y que se compruebe en los tres con cada cambio.

**Diseño:** `docs/superpowers/specs/2026-11-23-portable-y-modificable-design.md`, fase 1.

**Cómo se comprueba cada tarea:** `npm run test:plugin` (mods) y `npm run test:scripts` (scripts). Las dos tandas
parten en verde: 57 y 31 pruebas.

---

### Tarea 1. Mayúsculas según el sistema de archivos

**Archivos:** `plugin/hooks/rutas.ts`, `shell.ts`, `copia.ts`, `commits.ts`, `fusiones.ts`, `register.tsx`,
`plugin/scripts/comun.mjs`; pruebas en `plugin/tests/guardas.test.ts` y `plugin/tests/comun.ts`.

- [ ] Prueba que falla: en una escena POSIX, `git -C /home/ana/proyectos/Tienda merge x` (otra carpeta, solo cambia
      una mayúscula) **no** se niega; con `core.ignorecase=true` (macOS por defecto) **sí**. Y `normalizar(…, plegar
      = false)` conserva las mayúsculas.
- [ ] `normalizar(ruta, base, home, plegar = true)`: solo pasa a minúsculas si `plegar`. `pasos` y `llamadasGit`
      reciben y pasan `plegar`.
- [ ] `Copia.plegar`: `montarCopia` recibe `ignoraMayusculas: boolean | null`; con `null` vale `true` si la raíz o
      la carpeta del usuario llevan unidad (`C:`), y `false` si no.
- [ ] `register.tsx` lee `git config --get core.ignorecase` una vez por raíz y se lo pasa a `montarCopia`.
- [ ] `commits.ts` y `fusiones.ts` usan `c.plegar`; `normalizarProhibidos` recibe `plegar`.
- [ ] `comun.mjs`: `misma` pliega solo en `win32` y `darwin`.

### Tarea 2. Shells de macOS y Linux

**Archivos:** `plugin/hooks/shell.ts`; pruebas en `plugin/tests/guardas.test.ts`.

- [ ] Prueba que falla: `zsh -c "git -C <principal> merge x"`, `bash -lc "cd <principal> && git merge x"` y
      `fish -c "…"` se niegan; `powershell -exec bypass -Command "git -C <principal> merge x"` sigue negándose.
- [ ] `SHELLS` añade `zsh`, `fish`, `dash` y `ksh`. En los shells POSIX la opción de orden es `-c` o un grupo que
      acaba en `c` (`-lc`, `-ic`); en `cmd`, `powershell` y `pwsh` sigue como está.

### Tarea 3. Fallos visibles

**Archivos:** `plugin/hooks/register.tsx`, `plugin/hooks/herramientas.ts` (nuevo), `plugin/hooks/vista.ts`,
`plugin/types/index.d.ts`; pruebas en `plugin/tests/subidas.test.ts`.

- [ ] Prueba que falla: sin `node` (`process.run` de `node` devuelve error), al empezar sale un aviso que nombra
      `node`; con git 2.30, uno que dice que hace falta 2.38. Con todo en orden, ningún aviso nuevo.
- [ ] `herramientas.ts`: `versionGit(salida)` y `faltan({ node, git })` devuelven las líneas del aviso (sin `$`).
- [ ] `empezarEquipo` lanza `node --version` y `git --version` y avisa con lo que diga `faltan`.
- [ ] Si el ensayo de las ramas en espera falla, la franja lo dice: `Subida.sinEnsayo` y «· sin ensayo» en
      `textoEstado`.

### Tarea 4. CI en los tres sistemas

**Archivos:** `.github/workflows/pruebas.yml` (nuevo).

- [ ] Matriz `ubuntu-latest`, `macos-latest`, `windows-latest`, Node 22: `npm run test:scripts`.
- [ ] Un trabajo aparte, `continue-on-error`, instala Claude Code y pasa `npm run test:plugin`: dirá si
      `claude plugin test` funciona sin credenciales. Según salga, se queda fijo o se quita.

### Tarea 5. README y versión

- [ ] «Requisitos»: lo probado en cada sistema y cómo. «Lo que no hace»: shells que se siguen.
- [ ] `plugin.json` a `0.1.1`.
