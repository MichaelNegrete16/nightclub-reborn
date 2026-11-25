# Mundo abierto: la calle, los vecinos, los asaltos y la policía (propuesta de diseño)

> Estado: **diseño para decidir**. Lo único ya construido de esto es: el club se abre y se cierra (nadie entra si está cerrado),
> la ciudad alrededor del club (calles, edificios, discotecas vecinas) y los límites de zoom. Todo número de abajo es una propuesta.

## 1. Lo que pediste (en tus palabras)
- La discoteca hay que **abrirla** para que entre gente. *(hecho)*
- Salir al **mundo** y ver las discotecas de los compañeros, **entrar a robar y dañar**, pero **no siempre**: espera larga, de **horas**.
- La **tienda va en la calle**, y lo demás también.
- Lo robado se puede **poner en tu discoteca**, pero la **policía** puede **cerrarte, quitarte el objeto, y quitarte prestigio, dinero, etc.**

## 2. La ciudad (el "mundo")
Un mapa de ciudad que se recorre con tu personaje. Lugares:

| Lugar | Para qué sirve |
|---|---|
| **Tu club** | Entras para decorar y ver la fiesta. Tiene la fachada con el letrero ABIERTO/CERRADO. |
| **Tienda** (local en la calle) | Comprar. Sigue habiendo atajo desde el menú para no obligar a caminar con 175 objetos. |
| **Clubes vecinos** | Los de otros jugadores (al principio, simulados). Se visitan, se miran, se asaltan. |
| **Comisaría** | Ver tu nivel de "calor", pagar multas y fianza, recuperar un club clausurado. |
| **Receptador** (prestamista) | Limpia objetos robados (cuesta una comisión y tiempo) o los compra sin preguntas. |
| **Plaza** | Eventos, torneos de DJ, temporadas. |

Cada distrito tiene su estilo y su género musical (ver `WORLD_AND_DECOR.md`).

## 2b. Urbanismo: cómo crece sin chocar con el vecino

- **Rejilla de lotes.** Cada jugador tiene un lote fijo de 34×38 casillas; entre lotes hay una calle de 10. Nunca se solapan (probado en `scripts/world-test.mjs`).
- **El lote se dimensiona para la fase 7.** El club crece dentro de su lote y nunca toca al vecino. El terreno que aún no se usa es una zona de obra reservada (valla, conos, cartel "PRÓXIMA AMPLIACIÓN").
- **Espiral.** Los lotes se reparten desde el centro hacia afuera sin huecos; el que entra después queda pegado al anterior.
- **Si quieres más espacio** (a elegir): comprar un lote vacío contiguo ("SE VENDE"), mudarse a un distrito nuevo por prestigio, o construir pisos hacia arriba.
- **Lotes abandonados** se reciclan como "SE VENDE". Para muchos jugadores, la ciudad se divide en distritos de N lotes y solo se dibujan los cercanos (LOD).
- **Clima y hora** (`render/environment.ts`): día, atardecer, noche, nublado, lluvia y niebla. En "auto" usa el reloj del jugador, con bloques de clima de 3 horas.

## 2c. La puerta, el VIP, la calle y el personal (implementado)

- **Aforo y fila.** Dentro caben tantos como asientos + baldosas (mín. 3, máx. 40). Los demás esperan en una fila en la calle (máx. 10; si está llena, se van). Llegan desde la calle, entran por el portón de la valla y se acomodan en columna. Pierden la paciencia con el tiempo; al cerrar el club la fila se disuelve.
- **VIP.** Cada tanto llega alguien que dice ser famoso (nombres inventados). Se puede investigar (30 monedas), dejar pasar o rechazar. Si es real: +150 monedas, XP, gasta más y atrae más gente por 2 minutos. Si es farsante: se cuela y cuesta 100 monedas. Un guardia contratado los reconoce solo.
- **Calle.** El personaje del jugador camina con clic, adentro (por casillas) y afuera (rodea el edificio). Clic en el edificio o en la calle = entrar o salir; el botón Salir/Entrar hace lo mismo. Afuera se ve el club cerrado con su fachada; adentro, el corte de siempre.
- **Fachada** (`core/exterior.ts`): pinturas, toldo, cordón (+30% paciencia), letreros (+10% / +20% de llegadas), reflectores (+5%).
- **Personal** (`core/staff.ts`): bartender (tragos +25% c/u), DJ (propina por baile), guardia (reconoce VIPs, +20% paciencia; con dos, la puerta va 1.5× más rápido). Hay un pago único y un sueldo por minuto con el club abierto; sin cabina o sin barra, el DJ/bartender no trabaja ni cobra. Los sueldos son el primer sumidero de monedas de la economía.
- **Oficina.** Es el botón Oficina de la barra de abajo: aforo, fila, ingresos, sueldos y contratación. No hay cuarto ni objeto en el mapa.
- **Andén y acceso.** Hay andén con bordillo en el sur y el este de cada lote; la gente llega y se va caminando por él, y una alfombra con cordones lleva de la acera a la puerta.

## 2d. Música y ambiente (implementado)

- **Sonido.** `src/audio/`: cinco pistas que genera el propio juego (Web Audio: reggaetón, pop, house, salsa, rock), más los links del jugador: YouTube con su reproductor oficial y Spotify con su embed (fragmento de 30 s sin sesión). Un reproductor pequeño aparece en la esquina. El audio de YouTube/Spotify no se puede analizar: las animaciones siguen el BPM que indique el jugador. Afuera del club la música suena apagada.
- **Animación.** Parlantes y cabina laten al compás, salen ondas y notas de los parlantes, la cabina tiene ecualizador y las luces van al ritmo.
- **Gustos.** Cada invitado ama un género (reggaetón 30%, pop 25%, house 20%, salsa 15%, rock 10%). Muestra globos: ♥ le encanta, ♪ le gusta, ✖ no lo soporta, z z se aburre. Sin música, todos se aburren y se van.
- **Ambiente (0-100).** Es el ánimo medio de la gente adentro; también suma el lujo y tener un DJ. Con ambiente alto llega más gente; por encima de 78 pueden venir los famosos. La ventana Música muestra qué le gusta al público.

## 3. Asaltos
**Flujo:** elegir un club → ver su seguridad (guardias, alarma, caja fuerte, vitrinas con candado, popularidad) → decidir si vale la pena →
resolverlo (una prueba corta de habilidad o por probabilidades) → botín o fracaso → informe para la víctima.

**Qué se puede llevar:** parte de la **moneda blanda en caja** y **un objeto de colección** (nunca el más protegido).
**Qué NO se puede robar jamás:** los **trofeos de honor** (están ligados a la cuenta), la **moneda oficial / cripto**, y nada comprado con ella.

**Daño:** un objeto roto hay que repararlo (monedas y horas). Un club puede quedar "en reparación" unas horas.

### Tiempos de espera (propuesta)
| Regla | Valor |
|---|---|
| Entre asaltos del mismo jugador | 3 h |
| Mismo objetivo otra vez | 12 h |
| Escudo del club tras ser asaltado | 8 h |
| Tope de pérdida por día de una víctima | 10 % de la caja y 1 objeto |
| Protección para novatos | hasta nivel 10 nadie puede asaltarte (y tú tampoco a otros) |
| Rivales posibles | solo jugadores de nivel parecido (±5) |

Los tiempos corren aunque estés desconectado (reloj del servidor). La víctima ve un **informe** al volver y tiene la opción de **venganza** durante 24 h con espera reducida.

## 4. Policía y "calor"
Cada jugador tiene un **calor** de 0 a 100 que baja solo con las horas.
- **Sube** con: cada asalto, **tener objetos robados ("calientes") a la vista** (por hora), y asaltos fallidos.
- **Baja** con: el paso del tiempo, **pagar a la comisaría** (sumidero de dinero), o **limpiar** el objeto con el receptador.

| Calor | Qué puede pasar |
|---|---|
| 0–30 | Nada. |
| 30–60 | Patrullas: pueden inspeccionar tu club abierto. Si hay objetos calientes: **decomiso** + multa. |
| 60–85 | Inspecciones frecuentes, multa mayor y **cierre de 1–6 h** (letrero CLAUSURADO). |
| 85+ | Redada: decomiso de todos los objetos calientes, cierre largo (hasta 12 h), **pérdida de prestigio**. |

**Asalto fallido:** salta la alarma, la policía llega y **te arresta**: pierdes dinero y quedas **detenido unas horas** (no puedes asaltar), con opción de pagar fianza.

**Lo que no pierdes por la policía:** tus trofeos de honor ni tu moneda oficial.

## 5. Por qué hay que cuidar esto (riesgos)
1. **Acoso (griefing):** el PvP asíncrono con cosas valiosas hace que los jugadores abandonen si les roban sin control. Por eso: escudos, topes diarios, protección de novatos, rivales de nivel parecido, informes y venganza limitada.
2. **Cripto y robo:** si la moneda oficial se puede vender por dinero real, que un jugador pierda "valor" por un asalto tiene consecuencias legales y de confianza. Por eso el robo **solo toca moneda blanda y objetos no tokenizados**.
3. **Clasificación por edad y tiendas de apps:** temas de delito y policía pueden afectar la clasificación en Apple/Google. Se mantiene en tono de caricatura, sin violencia a personas.
4. **Trampas:** los asaltos tienen que resolverse **en el servidor**, nunca en el cliente.

## 6. Qué cambia en la arquitectura
- Hoy el juego es de **un solo jugador, todo en el navegador**. Los clubes de otros jugadores, los asaltos con espera de horas y la policía **necesitan un servidor**: cuentas, relojes del servidor, la foto del club de cada jugador (distribución + seguridad), resolución de asaltos, informes y límites de uso.
- Antes de construir el servidor, se puede **probar el diseño con vecinos simulados** (NPC con clubes generados) para afinar el bucle y los números sin infraestructura.

## 7. Plan por fases
| Fase | Qué se construye | Necesita servidor |
|---|---|---|
| A | Mapa de ciudad con tu club, la tienda como local en la calle y **clubes vecinos simulados** (solo visitar) | No |
| B | Asaltos contra vecinos simulados: seguridad, botín, daño, tiempos de espera de horas | No |
| C | Policía y calor: decomisos, multas, cierres, fianza, receptador | No |
| D | Jugadores reales: cuentas, asaltos asíncronos con reloj del servidor, informes, venganza | **Sí** |
| E | Equilibrio, temporadas y eventos, antiabuso | Sí |

## 8. Decisiones que necesito de ti
1. **¿Empezamos con vecinos simulados (fases A–C) y los jugadores reales después (fase D)?** Es lo que recomiendo: se puede jugar y afinar ya.
2. **¿Qué se puede robar?** Propongo caja (moneda blanda) y un objeto de colección; nunca trofeos de honor ni moneda oficial.
3. **¿Qué tan dura es la policía?** (cierres cortos y multas, o castigos fuertes). Propongo los de la tabla.
4. **¿La tienda es solo un local en la calle, o también mantiene el botón del menú?** Recomiendo ambos.
5. **¿Tu personaje camina por la ciudad (como un juego de mundo abierto) o se viaja tocando un lugar en el mapa?** Recomiendo tocar el lugar al principio; caminar después.
