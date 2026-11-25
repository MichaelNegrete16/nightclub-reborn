# Nightclub Reborn — contexto del proyecto

Remake web de *Nightclub City*. El jugador administra su discoteca dentro de una ciudad compartida (ranking, visitas, robos, policía, prisión). Corre en navegador y celular (PWA; Capacitor previsto). Un solo commit en el repo; todo el texto del juego está en español, los comentarios del código en inglés.

## Estructura

| Carpeta | Qué es |
|---|---|
| `web/` | El juego: Vite 8 + TypeScript 7 + Three.js 0.187. Sin framework de UI (DOM a mano). |
| `web/src/core/` | Reglas puras sin Three.js (club, invitados, economía, robos, historia). **El servidor importa estos `.ts` directamente.** |
| `web/src/render/` | Todo lo 3D (ver abajo). |
| `web/src/ui/` | Pantallas y paneles (HUD, tienda, oficina, diálogo, tutorial). |
| `web/src/audio/` | Música generada con Web Audio + reproductores de YouTube/Spotify/archivos. |
| `web/src/net/` | Cliente WebSocket (`client.ts`) y guardado en la nube (`cloud.ts`). |
| `web/scripts/` | Pruebas de reglas (`*-test.mjs`), e2e con Playwright, simulador de economía, capturas. |
| `server/` | Node 22+ con `ws`, puerto 8787. Presencia, chat, partidas, robos (`heists.mjs`), policía (`police.mjs`), libro de cuentas (`vault.mjs`), clubes sombra (`shadow.mjs`). Datos en `server/data/` (no se suben). |
| `docs/` | Diseño: `OPEN_WORLD.md`, `ROBOS_Y_POLICIA.md`, `WORLD_AND_DECOR.md`, `redesign/`. |
| `art/` | Blender (`build_characters.py`) y exportados. Los `.glb` se copian a `web/public/models/`. |
| `songs/` | mp3 del juego, fuera del repo. |

## Comandos

```bash
cd web && npm install && npm run dev        # http://localhost:5173
cd web && npm run build                     # tsc --noEmit + vite build
cd web && npm run test:club                 # 19 suites de reglas, sin navegador
cd web && npm run e2e:club                  # recorrido completo en Chrome sin interfaz
cd web && npm run economy -- 6000           # simulador de economía
cd server && npm install && npm start       # ws://127.0.0.1:8787
cd server && npm test
```

No hay linter ni test runner formal: las pruebas son scripts de Node con `--experimental-strip-types`.

## Reglas del proyecto que conviene no romper

- `core/` no puede importar Three.js ni DOM: lo ejecuta el servidor.
- Los ids del catálogo (`core/catalog.ts`) son estables: están en las partidas guardadas.
- La simulación de invitados es determinista (misma semilla, misma noche); el servidor la repite en los clubes sombra para validar ingresos (tope 1.7×).
- Cada versión nueva: entrada al principio de `NEWS` en `core/news.ts` y reiniciar el servidor.
- `tsconfig` tiene `noUnusedLocals` y `noUnusedParameters`: el build falla con código sin usar.
- Ganchos de prueba solo con `?e2e` en la URL (`window.__nc`).

## Cómo se dibuja (render)

- **Un `WebGLRenderer` principal** (`main.ts`) + `OutlineEffect` de Three (contorno de tinta: vuelve a recorrer la escena con las caras traseras infladas). Otros **dos renderers aparte**: `Thumbs` (miniaturas 200 px de la tienda) y `ComicStudio` (viñetas del prólogo), ambos creados al arrancar.
- **Estilo toon**: `MeshToonMaterial` con un gradiente de 4 bandas (`toon.ts`). Los materiales lisos se comparten por color; los que tienen brillo o transparencia son únicos por pieza.
- **Sin sombras** (ni `shadowMap`): solo una mancha bajo el personaje del creador. **Sin post-proceso.**
- **Luces del club**: hemisférica + direccional + 2 puntuales de neón.
- **Objetos** (`props.ts`, 980 líneas): hechos por código con primitivas (`RoundedBoxGeometry`, cilindros, icosaedros). Cada parte es un `Mesh` con **su propia geometría**. Un objeto tiene de 3 a 15 partes; una baldosa de pista, 3.
- **Club** (`club.ts`, 2020 líneas): `rebuildItems()` destruye y reconstruye **todos** los objetos colocados ante cualquier cambio de diseño. Límite de objetos por fase: 40 (fase 1) a 400 (fase 7).
- **Suelo y ciudad**: el suelo del local, las líneas de la calle, árboles y farolas ya usan `InstancedMesh`. Aceras, bordillos, pavimento, torres y los clubes vecinos son mallas sueltas. La ciudad usa `MeshStandardMaterial`.
- **Personajes**: `base_male.glb` / `base_female.glb` (650 KB cada uno, sin comprimir, sin texturas, 17 huesos, 5 animaciones, ~18.900 triángulos contando los 10 peinados). Cada personaje es un clon completo (`SkeletonUtils.clone`) con **18 mallas con esqueleto**, de las que se ven unas 9; las demás quedan ocultas. Cada uno tiene sus propios materiales y su `AnimationMixer`, y `frustumCulled = false`.
- **`loadModel()` no tiene caché**: cada `PlayerActor` (jugador, personal, cada peatón de `NeighborCrowd`, jugadores remotos), `Thumbs`, `ComicStudio` y `GuestCrowd` vuelve a descargar y **analizar el GLB** y sube otra copia de la geometría a la tarjeta gráfica.
- **Calidad** (`quality.ts`): tres niveles (alto/medio/bajo) y un gobernador que baja de nivel si el promedio pasa de ~36 ms por cuadro; nunca sube solo. Los niveles bajos quitan resolución, contorno, luces, clima y gente.

## Dónde se va el rendimiento (análisis estático, sin medir en un equipo real)

1. **Llamadas de dibujo de los objetos.** Un club de fase alta con 400 objetos son miles de mallas sueltas, cada una con geometría propia; el contorno las dibuja otra vez. Es el cuello de botella previsible.
2. **Multitud.** 60 invitados × ~9 mallas visibles con esqueleto × 2 pasadas, más 60 mixers y cientos de materiales propios.
3. **GLB sin caché**: tirones al aparecer peatones o personal y memoria de vídeo duplicada.
4. **Reconstrucción total** del mobiliario en cada edición (pausas al colocar con el club lleno).
5. **Tres contextos WebGL** vivos desde el arranque (en móvil pesa y hay límite de contextos).
6. Ciudad: unas 250 mallas sueltas de aceras y bordillos que podrían ser 3 o 4.

## Plan de optimización propuesto (sin tocar la calidad visual)

Orden por beneficio/riesgo. Ninguno cambia cómo se ve el juego.

1. Caché de `loadModel()` por sexo (una promesa compartida). Pequeño y seguro.
2. Caché de geometrías de `props.ts` por parámetros, y agrupar las partes iguales de todos los objetos en `InstancedMesh` / `BatchedMesh` (empezando por las baldosas de pista, que son el objeto más repetido).
3. `rebuildItems()` incremental: tocar solo el objeto que cambió.
4. Personajes: quitar del clon las mallas ocultas (peinados y ropa no elegidos), compartir materiales entre invitados con el mismo color, y actualizar el mixer solo de quien está en pantalla.
5. Contorno: que la segunda pasada recorra solo lo que lleva contorno (capas), en vez de toda la escena.
6. Unir aceras, bordillos y pavimento de la ciudad en mallas instanciadas o fusionadas.
7. Crear `Thumbs` y `ComicStudio` solo cuando hagan falta y soltarlos al terminar.
8. Comprimir los GLB con meshopt (misma malla, menos descarga).

Antes de empezar: medir con `renderer.info` (llamadas, triángulos, geometrías) y tiempo por cuadro en un club de fase 5+ con 60 invitados, para tener cifras de antes y después.

## Estado del juego según los docs

Hecho: club con 7 fases, invitados, VIP, personal, fachada, música y ambiente, historia con prólogo en cómic y tutorial, multijugador con ciudad en espiral y visitas, robos resueltos en el servidor, policía en el servidor, defensas, economía validada por el servidor, ingreso sin conexión, reformas.

Pendiente: compras y simulación 100 % en el servidor; policía visible en pantalla; catálogo más profundo (35 objetos, el dinero sobra hacia el nivel 12); misiones de los capítulos 4-7; viñetas de los capítulos 2-7; cuentas reales (hoy es un id de invitado en `localStorage`); moneda oficial/cripto (al final, con revisión legal).

Ojo: la tabla de estado de `docs/ROBOS_Y_POLICIA.md` §10 se contradice (defensas y minijuego aparecen como "Hecho" y como "Pendiente").
