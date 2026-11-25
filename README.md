# Nightclub Reborn

Remake web de *Nightclub City*: administras tu discoteca, la ciudad es compartida con otros jugadores (ranking, visitas, robos, prisión), y todo corre en el navegador (también en celular / webview).

## Estructura
- `web/` — el juego (Vite + TypeScript + Three.js). Reglas puras en `web/src/core/` (se usan también en el servidor), dibujo en `web/src/render/`, pantallas en `web/src/ui/`.
- `server/` — el servidor de la ciudad (Node + `ws`): presencia, chat, partidas guardadas, robos, policía, ranking, clubes "sombra" que validan la economía.
- `docs/` — diseño: `OPEN_WORLD.md`, `ROBOS_Y_POLICIA.md`, `WORLD_AND_DECOR.md`, y la propuesta visual en `docs/redesign/`.
- `art/` — fuentes de arte (Blender) y modelos exportados.
- `songs/` — canciones del juego (no van en el repositorio, ver `songs/README.md`).

## Desarrollo
```bash
cd web && npm install && npm run dev            # el juego en http://localhost:5173 (con --host para la red)
cd server && npm install && node --experimental-strip-types index.mjs   # la ciudad en el puerto 8787
cd web && npm run test:club                     # pruebas de las reglas (sin navegador)
cd server && node --experimental-strip-types test.mjs   # pruebas del servidor
```
Node 22 o superior (el servidor importa los módulos `.ts` de `web/src/core` directamente).

## Puesta en marcha en una VPS
1. `cd web && npm ci && npm run build` (genera `web/dist/`).
2. `cd server && npm ci`, copiar los `.mp3` a `songs/` y arrancar:
   `HOST=0.0.0.0 PORT=8787 MAX_PER_IP=50 node --experimental-strip-types index.mjs`
   El servidor también entrega `web/dist/` (una sola dirección para el juego y la ciudad).
3. Variables: `PORT`, `HOST`, `MAX_PER_IP` (conexiones por IP), `STATIC_DIR` (otra carpeta del juego), `SONGS_DIR`.
4. Base de datos: todo (partidas, ciudad, cuentas) vive en `server/data/nightclub.db` (SQLite, sin instalar nada; Node 22.13+). Variables: `DB_FILE` (otra ruta). Cada 6 horas se guarda una copia en `data/db-backups/` (las últimas 14). La primera vez que arranca importa los JSON viejos (`data/world.json`, `data/saves/`) sin borrarlos.
5. Cuentas con passkey: una passkey queda atada al nombre del sitio. Antes de salir a internet, define `AUTH_ORIGINS` con la dirección exacta del juego (por ejemplo `https://mijuego.com`); el valor por defecto solo sirve para `localhost`. Las passkeys exigen https (o localhost): en un celular por http de la red local solo funcionan los códigos de enlace.
4. Detrás de HTTPS (nginx o Caddy) el juego usa `wss://` solo; los datos de los jugadores quedan en `server/data/` (hacer respaldo, y **no** subirlos al repositorio).
5. Cada versión nueva: agregar su entrada al principio de `NEWS` en `web/src/core/news.ts` y reiniciar el servidor (el catálogo y las reglas se comparten con él).

## Notas
- Las rutas `/admin/*` del servidor solo responden desde `127.0.0.1`.
- La economía la valida el servidor (libro de cuentas y simulación "sombra"); ver `server/vault.mjs` y `server/shadow.mjs`.
