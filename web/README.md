# Nightclub Reborn · visor / creador de personaje (web)

Three.js + Vite + TypeScript. Modelos glTF generados desde `../art` (Blender).

## Comandos
```
npm install
npm run dev      # servidor de desarrollo (lo corres tú)
npm run build    # comprueba tipos y genera dist/
npm run shot     # visor de personaje en Chrome sin interfaz (requiere `npm run build` antes)
npm run test:club   # reglas del club, invitados, historia y misiones (40 pruebas): sin navegador
npm run e2e:club    # recorrido completo como jugador en Chrome sin interfaz (título, historia, tienda, colocar, misiones, subir de nivel) + capturas en ../art/previews
npm run economy -- 6000   # simulador de economía: un bot juega N minutos activos y mide cuánto tarda cada nivel
```
Para actualizar los modelos: regenerar en `../art` y copiar `base_male.glb` / `base_female.glb` a `public/models/`.

## Estructura
- `src/core/`   datos y reglas sin Three.js (personaje, catálogo, club): válidos para web, móvil y servidor.
- `src/render/` escena (`stage.ts`), avatar toon con contorno (`avatar.ts`).
- `src/ui/`     paneles (personaje y club).

## Club (parcela y rejilla)
- Parcela 34×38 con el local dentro; la rejilla crece por fases (8×8 … 28×32). El contorno violeta marca la siguiente fase.
- Colocar: elegir en el catálogo y hacer clic (en móvil: un toque previsualiza y otro confirma). `R` gira, `Esc` cancela, `Supr` vende, `Ctrl+Z` deshace, `Q`/`E` giran la vista.
- Reglas (en `core/club.ts`): dentro del local, sin solapes en la misma capa, no tapar la entrada, la barra y la cabina deben seguir siendo alcanzables a pie, límites por fase y por objeto, venta al 50 %.
- Los objetos son modelos provisionales hechos con primitivas (`render/props.ts`); se reemplazan por arte final sin cambiar los ids del catálogo.

## Pensado para web + móvil con el mismo código
- Un solo proyecto: PWA hoy; el móvil después con Capacitor (envuelve este mismo build para iOS y Android).
- Controles táctiles y de ratón ya funcionan (OrbitControls); el panel pasa a hoja inferior en pantallas estrechas.
- Resolución limitada (DPR ≤ 2) y un solo peinado visible a la vez; falta aún cargar solo el peinado elegido.
- Guardado en `localStorage` por ahora; luego cuenta en servidor (`sanitize()` ya valida lo que llega).

## Invitados (vida del club)
- `src/core/guests.ts`: simulación determinista (misma semilla = misma noche). Entran por la puerta (cover 5), caminan por caminos libres (BFS),
  bailan en baldosas, beben en la barra o en taburetes junto a ella (25 + propina) y descansan frente a sillas y sofás. Se van tras 60–120 s.
- Llegan más invitados con más lujo; el aforo lo marca la capacidad (asientos + baldosas), con tope de 40.
- Si editas el club con gente dentro, se les vuelve a planear la ruta; nadie queda atrapado ni dentro de un objeto.
- `render/guests.ts`: cada invitado es un personaje propio (colores aleatorios, animación caminar/bailar/reposo, bailarines al compás).
- Los ingresos suben las monedas cada 0,5 s, salen "+25" sobre la barra, y el panel muestra invitados e ingreso/min.
- Números (cover, precio de bebida, ritmo de llegada) son propuestas: ahora el club rinde ~300 monedas/min, **demasiado rápido** para el ritmo lento previsto; hay que equilibrarlo.

## Interfaz de juego, tienda e inventario
- Barra superior: nivel, XP, monedas, lujo e invitados; debajo, la misión actual (que es también el tutorial). Barra inferior: Tienda, Inventario, Misiones, Personaje; menú con engranaje.
- **Tienda:** comprar al inventario o "Comprar y colocar", con miniaturas 3D de cada objeto (`render/thumbs.ts`). Lo bloqueado muestra su nivel.
- **Inventario:** colocar o vender (50 %). Un objeto colocado se puede girar, mover, **guardar** en el inventario o vender.
- La colocación continúa mientras haya otra copia en el inventario o alcance el dinero para comprarla; luego termina sola.
- Deshacer devuelve el diseño y el inventario, pero **no** quita lo ganado ni las misiones ya cobradas.
- Teclas: `T` tienda, `I` inventario, `M` misiones, `R` girar, `Esc` cancelar, `Supr` vender, `Ctrl+Z` deshacer, `Q`/`E` girar la vista.
- Las herramientas de desarrollo (cambiar fase, +monedas, +niveles) están escondidas en Menú.

## Historia y misiones
- `core/story.ts`: escenas por fase (prólogo + capítulos 2 a 7) y misiones. Las 9 del capítulo 1 enseñan el juego paso a paso.
- Flujo de una partida nueva: título (nombre) → creador de personaje → escena de apertura (con una elección de motivo) → juego.
- Las escenas de capítulo se reproducen solas cuando el local sube de fase.
- **Pendiente:** misiones para los capítulos 4 a 7 (hoy solo tienen escena), más personajes de historia, sonido.

## Prólogo en cómic y tutorial de Rosa
- **Cómic (`render/comic.ts`):** cada línea del prólogo puede nombrar una viñeta (`shot`) y una viñeta pequeña (`inset`). Las viñetas son escenas 3D con tu propio
  personaje, luces y contorno grueso, dibujadas una vez en un lienzo y mostradas con borde, trama de puntos, cajas de narración y globos (`ui/dialogue.ts`).
  Hay 11: ciudad bajo la lluvia, la puerta, la carta, el sueño de Beto (sepia), el disco, el sótano por dentro, Rosa en la barra, la pista vacía,
  la fiesta imaginada (recuadro), Zeta y Neón Fest. Una línea sin viñeta muestra al que habla sobre un fondo de color.
  `node scripts/shots.mjs` dibuja todas a `art/previews/comic/` para revisarlas.
- **Tutorial guiado (`ui/coach.ts`):** tras el prólogo, Rosa te lleva por tus primeros pasos con 17 pasos: un aro late sobre el botón exacto y el paso avanza solo al hacerlo
  (abrir la Tienda, elegir la baldosa, comprar 4, ir al Inventario, colocarlas, la cabina del Tío Beto, la barra). Si ya hiciste algo, ese paso se salta.
  El avance se guarda (`story.tutorial`); "Saltar tutorial" lo cancela. El club está en pausa durante el título, el creador de personaje y las escenas.
- **Pendiente:** viñetas para los capítulos 2 a 7 (hoy usan el retrato sobre un fondo de color); las viñetas son 16:9, en un teléfono vertical se ven pequeñas.

## Abrir y cerrar el club, y la ciudad alrededor
- El club **empieza cerrado** y solo se abre con una **cabina DJ** colocada. Cerrado no entra nadie; al cerrar, los invitados se van caminando. Botón de la puerta en la barra inferior (rojo = cerrado, verde = abierto) y letrero ABIERTO/CERRADO sobre la entrada.
- `render/city.ts`: calles, aceras, farolas, autos, edificios y las discotecas vecinas (ECLIPSE, VOLTAJE, MAGENTA). Sirve de base del mundo abierto (ver `../docs/OPEN_WORLD.md`).
- El zoom y el desplazamiento están limitados alrededor del club.
