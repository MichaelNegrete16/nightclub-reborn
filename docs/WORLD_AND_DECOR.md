# Mundo, parcelas y decoración (propuesta de diseño)

> Estado: borrador para decidir. Todo lo marcado como **propuesta** son números a balancear con pruebas de juego.
> El inventario de qué traía el Nightclub City original va en la sección 6 (se completa con la investigación).

## 1. Idea central
Cada jugador tiene **una parcela** (su terreno) dentro de **una ciudad** compartida.
- **Dentro de la parcela** construye y decora su discoteca (interior + fachada).
- **La ciudad** es el mapa donde se ven las parcelas de los vecinos, plazas, arenas de duelo DJ y eventos.
- La parcela **crece por fases** (como el original, donde el club se ampliaba al subir de nivel) y además se puede
  comprar terreno extra para que decorar no se sienta encerrado por el sistema.

## 2. Fases de la parcela (propuesta)
Una "fase" es una etapa de tamaño y estilo del local. Al completar los requisitos, la parcela se expande
automáticamente y se desbloquean nuevos objetos y zonas.

| Fase | Local | Rejilla interior (tiles) | Niveles | Se desbloquea |
|---|---|---|---|---|
| 1 | Sótano | 8 × 8 | 1–5 | Pista pequeña, barra, 1 cabina DJ |
| 2 | Bar de barrio | 10 × 10 | 6–12 | Sofás, 2.º bartender, primera vitrina de trofeos |
| 3 | Club | 12 × 14 | 13–22 | Zona VIP, bouncer, pantallas/TV |
| 4 | Club grande (2 plantas) | 14 × 18 + 10 × 10 planta alta | 23–35 | Segunda planta, escenario, efectos de humo |
| 5 | Mega club | 18 × 22 + terraza | 36–50 | Terraza, backstage, láseres |
| 6 | Rooftop | 20 × 24 + azotea | 51–70 | Piscina/lounge, pantallas gigantes |
| 7 | Festival / Arena | 28 × 32 | 71–100 | Escenario principal, zona de público |
| ∞ | Prestigio | — | — | Nueva ciudad con tema propio (reinicia con bonos permanentes) |

El progreso nunca termina: después de la fase 7 se pasa a **prestigio** y a **temporadas** (ver roadmap).

## 3. La ciudad y las parcelas
- **Mapa de ciudad:** vista cenital/isométrica con distritos (por ejemplo Centro, Puerto, Zona Rosa, Colinas). Cada distrito
  tiene su estilo visual y su género musical dominante.
- **Parcela:** cuadrado base (por ejemplo 32 × 32 tiles de terreno) en el que el edificio ocupa solo una parte al inicio.
  El resto es terreno que se va usando con las fases.
- **Fachada visible para todos:** letrero de neón, puerta, cola de gente, banderines. Es lo que ven los vecinos en el mapa y
  es una de las cosas que más se personaliza.
- **Vecinos:** amigos y jugadores cercanos se colocan en parcelas contiguas. Se puede visitar su club (DJ invitado, dejar
  "me gusta", ver su vitrina de trofeos).
- **Lugares públicos (no son parcelas de jugador):** plaza central, arenas de duelo DJ, escenario de eventos y temporadas.
- **Instancia:** cada ciudad aloja un número limitado de parcelas (propuesta: 200–500) para que el mapa se sienta lleno y
  se pueda pasar a otra ciudad cuando se llena.

## 4. Sistema de decoración
### 4.1 Rejilla
- Un **tile** es la unidad. Los objetos ocupan una **huella** (1×1, 1×2, 2×2, 3×3, etc.) y se pueden **rotar** en 4 direcciones.
- El interior es una rejilla; las paredes tienen su propia capa de colocación.

### 4.2 Capas
| Capa | Qué va ahí | Ejemplos |
|---|---|---|
| Suelo | Baldosas y alfombras | Baldosas LED que reaccionan a la música, madera, mármol, alfombra |
| Pared | Paredes y cosas colgadas | Colores de pared, carteles, pantallas/TV, vitrinas, espejos |
| Mobiliario | Objetos con huella | Sillas, sofás, reservados, mesas, taburetes, barra |
| Funcional | Cosas con función de juego | Cabina DJ, barra de tragos, tanque de bebidas, guardarropa |
| Iluminación y efectos | Techo y ambiente | Bola disco, focos, láseres, humo, luces de color |
| Decoración libre | Adornos | Plantas, estatuas, arte, trofeos, instrumentos |
| Fachada | Exterior | Letrero, puerta, toldo, cola, banderines |

### 4.3 Reglas de colocación (propuesta)
1. Los objetos se ajustan a la rejilla y no se pueden superponer en la misma capa.
2. **Siempre debe quedar un camino** desde la puerta hasta la pista, la barra y la cabina (comprobación de rutas), porque los
   invitados caminan.
3. Hay un **máximo de objetos por fase** (evita clubes que ralenticen móviles).
4. Modo edición: mover, rotar, guardar en inventario, **vender** (propuesta: recupera el 50 %) y **deshacer**.
5. **Guardar y cargar diseños** (planos) para probar distribuciones.

### 4.4 Qué hace la decoración en el juego (no es solo estética)
- **Lujo:** suma de la calidad de los objetos. Mantiene felices a los invitados y atrae multitudes (igual que en el original).
- **Popularidad:** la suben los eventos, el DJ y las celebridades. Las peleas la bajan.
- **Capacidad:** depende del espacio libre, la pista y los asientos.
- **Sets temáticos:** completar un conjunto (por ejemplo "Neón", "Latino", "Retro 2000s") da un bonus y desbloquea un
  trofeo.
- **Trofeos y vitrinas:** los trofeos ganados en misiones, torneos y temporadas se exhiben en una pared o vitrina y aportan
  prestigio visible a quien visite el club.
- **Pantallas/TV:** muestran el visualizador de la música y logros del club. Sin contenido subido por usuarios al inicio
  (evita problemas de moderación y de derechos).

### 4.5 Cómo se vende y se consigue
- Se compran con **moneda blanda** (ganada jugando) o **premium** (cosméticos y atajos).
- Objetos **exclusivos** por temporada, por trofeo o por evento, que no vuelven.
- Los objetos más lujosos pesan en la economía como **sumidero** de dinero, para evitar inflación.

## 5. Modelo de datos (para que agregar objetos no requiera programar)
Cada objeto es un archivo 3D más una línea en un manifiesto:

```json
{
  "id": "sofa_red_2seat",
  "name": "Sofá rojo de 2 plazas",
  "layer": "furniture",
  "footprint": [2, 1],
  "rotations": [0, 90, 180, 270],
  "phase_unlock": 2,
  "price_soft": 1200,
  "price_premium": null,
  "luxury": 8,
  "capacity": 2,
  "set": "neon_lounge",
  "rarity": "common",
  "season": null,
  "model": "furniture/sofa_red_2seat.glb"
}
```

## 6. Inventario del Nightclub City original

**Aviso de fiabilidad:** no existe (o no pude abrir) un catálogo completo de la tienda. Lo de abajo sale de reseñas, guías
y capturas, y parte es de segunda mano a través del registro de evidencia del repo fan `riesources/Nightclub-City-Revive`.
Páginas como Gamezebo, GameFAQs y AOL dieron 403/404. Lo marcado "inferido" no tiene fuente.

### 6.1 Confirmado por fuentes
**Decoración y tienda**
- Tipos de artículo: barras, taburetes, sillas, sofás, reservados (booths), altavoces, pistas de baile, papel tapiz y
  "patrons" bailando.
- Pista de baile con baldosas cian brillante (otros clubes: rosa y violeta). Barra con frente naranja, encimera azul y
  taburetes rojos. Paredes de ladrillo gris y suelo carbón en el club inicial.
- Cabina DJ con tocadiscos y torres de altavoces negras. Mejores sistemas de DJ alargan el set (el inicial duraba 15 min;
  había variantes de 24 horas).
- Áreas VIP. Artículos tardíos: tubos go-go, estatuas doradas, fuentes, cuerdas de terciopelo, acuarios.
- Modo edición: tienda, inventario, limpiar club, guardar y vender. Distintivo LUXURY en objetos caros.
- Cada objeto suma **lujo**, y más lujo da más felicidad y propinas. Cada compra da puntos.
- Barra mejor: sirve más rápido y cobra más. Depósitos y barras mejoradas aumentan la capacidad de bebidas.
- Muchos artículos de gama alta solo se compraban con Facebook Credits.
- Datos sueltos de economía: estado inicial 5.000 $, cover de 5 $, reponer la barra da 100 bebidas, silla Red Sectional
  4.000 $ con lujo 60, nivel 1 pagaba 500 $.

**Tamaño y expansión**
- Se empezaba con una sola sala pequeña. El club crecía solo al subir de nivel, con más baldosas, barras y asientos. En
  niveles altos había que pagar mejoras.
- Había varios clubes con nombre y zonas del mapa (Drunken Excess, The Blue Room, Electric Dreams, Gothic Realm, Coyote
  Ugly). El mapa se desbloqueaba por nivel y había un área aparte para clubes de eventos.

**Logros y recompensas**
- Ladies Night y Sausage Night (8 clientes de un solo género y ninguno del otro). Cadena de celebridades: 5 superestrellas,
  10 celebridades, 20 visitas. Existían misiones con personajes (NPC) y tarjetas por nivel.

**Personal**
- DJ (el jugador), bartenders y bouncers. 2 espacios de trabajador al inicio y más en los niveles 9, 13, 17 y 21. Se podía
  contratar a amigos como personal. Camerino con dados para cambiar el aspecto.
- Celebridades parodia (por ejemplo "Celine Dijon", "Puff Baddy"). Tras unas 3 visitas se volvían habituales, firmaban su
  foto en el muro de estrellas y venían gratis. Las más caras llegaron a 1.000.000 $.

**Social**
- Vecinos, DJ invitado en el club de amigos (pagaba miles), dedicar canciones, y fiestas con meta de invitados ("THROW A
  PARTY": Ladies Night, Disco Dance Party, noche 80s).
- Hubo versión iOS en mayo de 2012.

### 6.2 No encontrado (no inventar)
Mesas, plantas, TVs/pantallas, trofeos físicos o vitrinas, escenarios, billar, arcade, arte, packs temáticos, artículos de
temporada, lista completa de logros, colecciones, bonus diarios, regalos, ranking, tamaño de la rejilla por nivel y tabla
de desbloqueo de personal salvo 9/13/17/21. **Eso no significa que no existieran**, solo que no hay fuente accesible.

### 6.3 Catálogo propuesto para nuestro juego (diseño nuestro, no del original)
Se parte de lo confirmado y se completa con lo que un club necesita. Cantidades orientativas para el lanzamiento.

| Categoría | Qué incluye | Objetos al lanzamiento |
|---|---|---|
| Pistas | Baldosas LED (cian, rosa, violeta, dorado), pista de madera, pista de espejo | 8 |
| Barras | Barras de distintos materiales, taburetes, estantes de botellas, tanques de bebida | 12 |
| Asientos | Sillas, sofás, reservados, taburetes, sillones VIP, puffs | 20 |
| Mesas | Mesas bajas, altas, de reservado, mesas con botellas | 8 |
| DJ y sonido | Cabinas DJ (varios niveles), altavoces, subwoofers, mezcladores | 10 |
| Iluminación | Bola disco, focos, láseres, tiras LED, luces de pared, humo | 14 |
| Paredes y suelos | Ladrillo, concreto, neón, madera, papel tapiz, cortinas | 16 |
| Pantallas | TVs de pared, pantallas gigantes, tótems con visualizador | 6 |
| Trofeos | Vitrina, estantes de pared, copas, discos de oro y platino, estatuas | 18 (por logros) |
| Decoración | Plantas, estatuas doradas, fuentes, acuarios, arte, cuerdas de terciopelo, tubos go-go | 20 |
| Zonas especiales | Guardarropa, baños, VIP, backstage, terraza | 8 |
| Fachada | Letreros de neón, puertas, toldos, banderines, cola de gente | 12 |
| Personal | Bartenders, bouncers, camareros, bailarines, fotógrafo | 8 tipos |
| Celebridades | Invitados DJ y estrellas de ficción parodia | 15 |
| Estacionales | Halloween, Navidad, aniversario, San Valentín | por temporada |

Total orientativo: unos 175 objetos fijos al lanzamiento, más lo estacional.

## 7. Decisiones tomadas (2026-11-23)
- **Ciudad compartida** con una parcela por jugador (sección 3).
- **El crecimiento es lento pero nunca se detiene.** El jugador siente avance constante, pero tener "todo al máximo" debe
  tardar muchísimo y, aun así, seguir habiendo algo por hacer.
- **Trofeos:** se consiguen por **eventos** o se **compran con la moneda oficial** del juego.
- **Moneda oficial:** más adelante irá a una billetera virtual cripto. **Eso queda para el final**; ahora solo se diseña
  para que no haya que rehacer nada después.

## 8. Ritmo de progresión
### 8.1 Principio
El progreso se estira **al final, no al principio**: las primeras fases se alcanzan en días (para enganchar) y las últimas
en meses o años. Si la curva fuera lenta desde el inicio, el jugador se iría antes de ver nada.

### 8.2 Tiempo estimado para llegar a cada fase (modelo de partida)
Modelo simple: XP por nivel ≈ 30 × nivel^1.6 y XP por día que crece con el nivel. **Son valores iniciales para calibrar con
datos reales**, no una promesa.

| Fase | Nivel | Casual (15–20 min/día) | Regular (45 min/día) | Intenso (2 h/día) |
|---|---|---|---|---|
| 2 Bar de barrio | 6 | ~4 días | ~3 días | ~1 día |
| 3 Club | 13 | ~4 semanas | ~2,5 semanas | ~1 semana |
| 4 Club grande | 23 | ~3 meses | ~2 meses | ~1 mes |
| 5 Mega club | 36 | ~8 meses | ~5 meses | ~2 meses |
| 6 Rooftop | 51 | ~1,4 años | ~10 meses | ~4,5 meses |
| 7 Festival / Arena | 71 | ~2,5 años | ~1,5 años | ~8,5 meses |
| Nivel 100 | 100 | ~4,8 años | ~2,9 años | ~1,3 años |

### 8.3 Que no se acabe
Se apilan varias capas de avance independientes, para que siempre haya una meta cerca:
1. **Nivel de club y fase** (la tabla de arriba).
2. **Nivel de DJ** (habilidad en el modo de teclas, con rangos S/A/B por canción).
3. **Colección:** objetos, ropa y trofeos. El catálogo crece cada temporada, así que **nunca se completa al 100 %**.
4. **Prestigio:** al final de la fase 7, nueva ciudad con bonos permanentes.
5. **Temporadas** de 6–8 semanas con ranking, pase y premios exclusivos.
6. **Misiones procedurales** que se generan según el nivel.

### 8.4 Cómo se mantiene lenta la parte alta
- Los costos de los objetos de lujo crecen más rápido que los ingresos (**sumideros de dinero**).
- **Rendimientos decrecientes:** cada mejora da menos que la anterior.
- **Límites diarios** en las fuentes de dinero más fáciles.
- Los objetos de mayor prestigio exigen **logros específicos**, no solo dinero.

## 9. Trofeos
Hay dos familias con una diferencia **visible**, para que un trofeo comprado no se confunda con uno ganado:

| Familia | Cómo se consigue | ¿Se compra? | Se muestra como |
|---|---|---|---|
| **Honor** | Eventos, torneos, ranking de temporada, hitos y misiones difíciles | **No** | Sello "Honor" con año y edición |
| **Colección** | Tienda, con la moneda oficial | Sí | Etiqueta "Colección" |

- **Por qué separarlos:** si un trofeo de honor también se pudiera comprar, perdería todo su valor para quien lo ganó.
- **Ediciones limitadas** por evento o temporada, con el año grabado.
- **Los trofeos de honor no se pueden transferir ni vender** (quedan ligados a la cuenta). Esto es lo más importante cuando
  llegue la cripto: evita que el estatus se compre en un mercado.
- Los trofeos de colección se pueden regalar o intercambiar solo si lo decidimos más adelante.

## 10. Moneda oficial (pensada para cripto, sin cripto todavía)
### 10.1 Dos monedas
| Moneda | Se gana | Uso | ¿Va a la billetera cripto? |
|---|---|---|---|
| **Blanda** | Jugando (propinas, cover, premios) | Objetos comunes, personal, mejoras | **Nunca** |
| **Oficial** | Eventos, ranking, compras, emisión limitada por día | Trofeos de colección, objetos exclusivos, cosméticos de lujo | **Sí, al final** |

La moneda oficial **no debe poder farmearse en grande jugando**: si se puede cambiar por dinero real, se llena de bots y
granjas de cuentas.

### 10.2 Qué se prepara desde ahora (sin tocar cripto)
1. **Libro de contabilidad en el servidor:** cada movimiento de moneda es un registro que no se edita, con saldo en enteros.
2. **Operaciones idempotentes** (que no se cobren dos veces) y con historial completo.
3. **Antifraude** antes de que la moneda valga algo: límites diarios, detección de bots y de cuentas múltiples.
4. **Depósito y retiro desactivados** detrás de un interruptor, para encenderlos al final.
5. **Asesoría legal en Colombia** antes de encenderlo (superintendencia financiera, DIAN y reglas de activos virtuales).

### 10.3 Riesgos a tener presentes
- Si la moneda oficial se puede vender y sube de precio, empieza a comportarse como un **activo financiero**, con riesgo
  regulatorio. Por eso va al final y con revisión legal.
- Si el estatus (trofeos) se compra con una moneda que tiene valor real, el juego puede volverse "pagar para ganar". Por eso
  los trofeos de honor no se compran.

## 11. Economía y ritmo medidos con un simulador (2026-11-23)
`web/scripts/economy-sim.mjs` juega con un bot usando las reglas reales (invitados, ingresos, XP, tienda y colocación) y
mide cuántos **minutos activos** tarda cada nivel. Curva elegida: XP para pasar del nivel L al siguiente = 155 × L^1,6.

| Nivel (fase) | Objetivo, jugador regular (45 min/día) | Simulador, regular |
|---|---|---|
| 6 (fase 2) | 3 días | ~2,4 días |
| 13 (fase 3) | 17 días | ~17 días |
| 23 (fase 4) | 59 días | ~59 días |
| 36 (fase 5) | 150 días | ~166 días |
| 51+ | 298 días y más | **no medible todavía** |

**Límites honestos de esta medición**
- Es un bot, no una persona: compra con una regla simple y juega minutos seguidos. Los jugadores reales tendrán otro ritmo.
- Solo cuenta tiempo activo. Los ingresos mientras el jugador no está (offline) aún no existen.
- Con solo 24 objetos, hacia el nivel 25 el bot ya no tiene en qué gastar y acumula cientos de miles de monedas.
  **Faltan sumideros de dinero** (más objetos caros, mejoras, personal) antes de dar por buena la economía alta.
- Los niveles 51+ dependen del catálogo y de las salas grandes, que aún no existen.
- Ingresos y XP salen de los invitados; la XP también sube la primera vez que se compra cada objeto (no se puede
  fabricar comprando y vendiendo).

## 12. Historia, tienda e inventario (2026-11-23)
**Argumento.** Heredas "El Sótano", el club de tu difunto Tío Beto, que soñó toda la vida con tocar en Neón Fest, el festival más
grande del mundo. Su antiguo socio, Zeta (dueño de los clubes Eclipse), le cerró esas puertas. Rosa, la reina de la barra, te guía.
Tu meta: llenar el Sótano, crecer club a club y subir al escenario de Neón Fest como el DJ número uno del mundo. El disco
*La Pista Cero* del Tío Beto se toca solo allí. Después del festival el juego sigue: nuevas ciudades (prestigio) y temporadas.

**Cómo enseña el juego.** El capítulo 1 es el tutorial en forma de misiones: encender la pista (tienda), colocar la cabina del tío
(inventario), abrir la barra, ver llegar a los primeros invitados, poner asientos, vender tragos, subir de nivel y colocar el
primer trofeo. Cada misión explica en una frase qué hacer y qué botón usar; el botón correcto late.

**Tienda / inventario.** Se compra al inventario o se compra y coloca de una vez; un objeto colocado se puede girar, mover,
guardar o vender (50 %). La primera compra de cada objeto da XP de "descubrimiento" una sola vez, para que comprar y vender no se
pueda usar para subir de nivel.

**Texto de la historia = borrador.** Los nombres (Beto, Rosa, Zeta, Neón Fest, Ciudad Neón) y los diálogos los propuse yo; conviene
que los revises y los cambies a tu gusto antes de darlos por buenos.

## 13. Prólogo en cómic y primeros pasos guiados (2026-11-23)
Pedido del jugador: que el prólogo se cuente con **imágenes tipo cómic** (antes: texto abajo y el club vacío de fondo) y que la historia le dé
**los primeros pasos para construir su propia discoteca**.
- El prólogo son 11 viñetas ilustradas (3D con el personaje del jugador, estilo cómic) con globos y cajas de narración. Incluye la carta del Tío Beto
  con el nombre del jugador, el flashback del sueño de Beto en Neón Fest y la fiesta imaginada de Rosa como recuadro.
- Después, Rosa guía en 17 pasos: Tienda → baldosas → Inventario → colocar → cabina del tío → barra, señalando cada botón. Termina entregando el relevo a las misiones.
- Las ilustraciones son un primer intento hecho por código. Para un acabado profesional conviene un ilustrador; el sistema de viñetas ya tiene el hueco.

## Economía v2 (2026-11-24)

**Qué se descubrió.** El bot del simulador nunca compraba la barra, así que medía una economía sin tragos (110 monedas/min). Un jugador real con barra, música, VIP y personal gana 700-850 monedas/min desde el nivel ~15 y subía de nivel 30-40% más rápido que la meta.

**Qué se cambió.**
- Curva de XP: `XP_A = 285`, `XP_B = 1.5` (antes 155 y 1.6). Con el modelo real, un jugador regular (45 min/día) llega al nivel 6 en 2.6 días (meta 3), al 13 en 14 (meta 17), al 23 en 57 (meta 59) y al 36 en 174 (meta 150).
- Gastos del local (`core/renovation.ts`): cobro por minuto con el club abierto, según capacidad y lujo, multiplicado por la fase (0.6 en la 1 hasta 8 en la 7). Al final del juego son ~300 monedas/min (35% del ingreso).
- Reformas: 5 niveles (60k, 240k, 800k, 2.4M, 6.4M; desbloqueo en los niveles 8, 16, 26, 38 y 52). Cada una da +12% de lujo, +10% de cover y +2 de ánimo.
- Propina del DJ bajada de 4 a 1 por baile (inflaba el ingreso un 40%).
- Ingreso sin conexión (`core/offline.ts`): 35% de lo que gana el club abierto, hasta 8 horas, y solo si estaba abierto y ganando.
- El simulador ahora juega como un jugador real: ahorra para la barra, pone música para el público, contrata personal, mejora la fachada, investiga VIP y compra reformas.

**Lo que sigue pendiente.** Hacia el nivel 12 el dinero deja de ser una limitante: la tienda tiene 35 objetos y el más caro cuesta 6.500. Con 9000 minutos jugados el bot aún termina con ~3.7M. Falta profundidad de catálogo (más objetos con precios que escalen hasta el millón), personal de mayor nivel (DJ estrella) y campañas de publicidad como gasto recurrente.
