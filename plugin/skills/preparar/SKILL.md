---
name: preparar
description: Use when the equipo plugin has just been installed in a project, the project has no .claude/equipo.json yet, or the user asks to set up, adapt or configure the equipo plugin (worktrees, subidas, Orca) for their project, or types /preparar.
---

# /preparar — adaptar el plugin equipo a este proyecto

El plugin trae un flujo hecho (encargos en worktrees de Orca, subidas desde la copia principal, guardas de git), pero
cada proyecto compila, prueba y documenta a su manera. Esta skill estudia el proyecto, **pregunta al usuario lo que no
se puede deducir** y lo deja configurado. No decidas tú lo que es del usuario: propón y pregunta.

Los scripts del plugin están en `../../scripts` respecto a la carpeta de esta skill (la «Base directory» que sale al
cargarla). Abajo se escriben como `<scripts>`. Hazlo en la **copia principal** del repositorio (`.git` es una carpeta),
en la rama principal y con el árbol limpio; si no, díselo al usuario y para.

## Pasos

1. **Estudia el proyecto.**
   - `node <scripts>/explorar.mjs`. Da lo que se deduce (rama principal, gestor de paquetes, scripts, ejecutor de
     pruebas, lockfiles y generados, documentos de decisiones, backlog y changelog, archivos sin ignorar, idioma de los
     commits, CLAUDE.md, herramientas), una **propuesta** de `.claude/equipo.json` y una lista de **preguntas**.
   - El script no lo sabe todo: lee tú lo que haga falta para entender cómo se trabaja (`package.json`, el README,
     CLAUDE.md o AGENTS.md, la configuración de las pruebas, la CI en `.github/workflows`). Si la CI pasa algo que no
     está en los scripts (lint, typecheck, e2e), tenlo en cuenta para `comandos`.
   - Si ya hay `.claude/equipo.json`, parte de él: compara con lo que ves y pregunta solo por lo que no cuadra.
   - Para qué sirve cada clave y su valor por defecto: los comentarios de `<scripts>/por-defecto.mjs`.

2. **Comprueba los requisitos:** Node 22 o posterior, git 2.38 o posterior (`git merge-tree --write-tree`) y la CLI
   `orca` en el `PATH`. Sin Orca casi todo funciona, pero no los encargos ni el cierre de worktrees: díselo.

3. **Pregunta, en un solo bloque** (`AskUserQuestion`, hasta 4 preguntas por bloque; si hay más, un segundo bloque).
   Cada pregunta con opciones concretas sacadas del proyecto, la recomendada primero y con «(Recomendado)», y una
   línea de pros y contras. Lo que el script y tu lectura dejan claro no se pregunta: se dice en el resumen del paso 4.
   Lo que suele haber que preguntar:
   - **Comandos:** qué se pasa para comprobar que compila (build, typecheck, los dos) y qué pruebas. Con varios
     tipos de pruebas (unitarias, e2e), cuáles se pasan al comprobar un lote: las lentas, mejor solo cuando el aviso
     de la rama las pida.
   - **Generados:** los lockfiles y archivos generados con seguimiento (los propone el script), y con qué se rehacen.
   - **Prohibidos:** lo sensible o de compilar que git no ignora. A veces lo correcto es el `.gitignore`: ofrécelo.
   - **Documentos:** si quiere decisiones numeradas con bloques por rama (útil con muchos agentes a la vez que
     deciden cosas; si no las usa ya, la opción recomendada es no), backlog con códigos, y qué documentos se unen
     solos cuando dos ramas añaden al final (changelog).
   - **Idioma** de commits, avisos y documentos, si los commits no lo dejan claro.
   - **CLAUDE.md:** si añades el apartado del flujo (paso 6). Recomendado: sí, sin él el agente de la copia principal
     no sabe que no debe implementar allí.

4. **Escribe `.claude/equipo.json`** con **solo** lo que cambia respecto a los valores por defecto (`node
   <scripts>/ajustes.mjs --crear` crea uno con todos, pero es más fácil de leer si solo lleva lo propio). Luego:
   - `node <scripts>/ajustes.mjs` debe enseñar los ajustes sin error;
   - prueba cada comando de `comandos` una vez (si alguno tarda mucho, pregunta antes). Si `probarArchivos` está
     puesto, pruébalo con un archivo de pruebas real. Si algo falla, corrígelo con el usuario, no lo dejes así.

5. **Instala los drivers de fusión:** `node <scripts>/fusion.mjs instalar`, y `node <scripts>/fusion.mjs instalar
   --comprobar` debe decir «al día». Van al `.git` del repositorio, no a los commits (el plugin también lo hace solo al
   empezar cada sesión). Si alguno de los documentos de `unir` o `generados` no existe aún, no pasa nada.

6. **CLAUDE.md** (si el usuario quiere): añade el apartado de `claude-md.md` (en esta carpeta) al CLAUDE.md del
   proyecto (o crea uno; si el proyecto usa AGENTS.md, ahí). Sustituye lo que va entre `<>` por lo de este proyecto
   y quita las líneas de lo que no se usa (decisiones, backlog). Respeta el estilo y el idioma del archivo. Enséñale
   al usuario el apartado antes de escribirlo.

7. **Commit**, solo si el usuario quiere, y añadiendo **uno a uno** los archivos que has cambiado
   (`.claude/equipo.json`, CLAUDE.md, `.gitignore`…): la guarda niega `git add -A` en la copia principal. Así cada
   worktree nuevo lleva los ajustes.

8. **Cuéntale al usuario**, en pocas líneas:
   - qué ha quedado en los ajustes y por qué (lo deducido y lo que eligió);
   - qué has probado (los comandos) y qué no;
   - cómo se empieza: en esta sesión, «quiero X» y la skill `encargo` lo lanza a un worktree; cuando el agente acaba,
     su rama sale en la franja con «Subir»;
   - que los interruptores de cada pieza están en `/config` (plugin `equipo`) y que si quiere cambiar algo de los
     ajustes, basta pedirlo.

## Errores comunes

| Error | Consecuencia |
|---|---|
| Copiar la propuesta sin preguntar | Ajustes que no son los del usuario: comandos que no pasan o pruebas de más en cada lote |
| Preguntar lo que el proyecto ya dice | El usuario contesta lo obvio; pregunta solo lo dudoso |
| Activar decisiones o backlog «por si acaso» | Bloques y renumeraciones que nadie usa: solo si el usuario lo quiere |
| No probar los comandos | El primer lote falla por un comando mal escrito |
| `git add -A` o `git add .` | La guarda lo niega en la principal: archivo a archivo |
| Escribir los ajustes en un worktree | Cada worktree lee el suyo: van en la principal y con commit |
