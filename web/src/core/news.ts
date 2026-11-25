// "Novedades": what is new in each version of the game, shown once to every player with pictures and where to find it.
// Add a new entry at the TOP of NEWS for every release: players who have not seen its id get the window on their next visit.

export interface NewsEntry {
  /** an object of the catalog (its picture is drawn) or an icon name from ui/icons.ts */
  kind: 'item' | 'icon';
  /** catalog id or icon name */
  ref: string;
  /** version of the object to draw */
  tier?: number;
  title: string;
  text: string;
  /** where to find it in the game */
  where?: string;
}

export interface News {
  id: string;
  date: string;
  title: string;
  intro: string;
  entries: NewsEntry[];
}

export const NEWS: News[] = [
  {
    id: '2026-11-25t',
    date: '25 de noviembre de 2026',
    title: 'Mover por bloques y sofás donde sí se sienta la gente',
    intro: 'Ya no hay que mover las baldosas de una en una.',
    entries: [
      { kind: 'icon', ref: 'move', title: 'Seleccionar y mover por bloques', text: 'Pulsa el botón de seleccionar (el cuadrito punteado a la derecha), toca una esquina de la zona y luego la esquina contraria: se seleccionan todas las piezas de adentro (por defecto solo los suelos, o todo si prefieres). Luego «Mover todo» y haz clic donde quieras el bloque: se mueve entero, con su forma y sus mejoras. También puedes guardarlo o venderlo todo junto. Esc cancela.', where: 'Botón de seleccionar, en el club' },
      { kind: 'item', ref: 'dj_booth_pro', title: 'El DJ va a la mejor cabina', text: 'Si tienes dos cabinas, tu primer DJ trabaja en la profesional y el segundo en la normal (cada cabina necesita el suyo). Y si la cabina queda pegada a una pared, el DJ se para a un lado o al frente en vez de quedarse sin puesto.', where: 'Oficina › Tu equipo' },
      { kind: 'item', ref: 'sofa_corner', title: 'Nadie se sienta en el aire', text: 'En el sofá de esquina y en el reservado, un invitado se sentaba en la esquina donde no hay cojín (o sobre la mesa). Ahora usan solo los asientos de verdad, sea cual sea la rotación.', where: 'Sofás y reservados' },
    ],
  },
  {
    id: '2026-11-25s',
    date: '25 de noviembre de 2026',
    title: 'Llega el Banco del Ruido',
    intro: 'Pide plata prestada para comprar antes y págala por horas.',
    entries: [
      { kind: 'icon', ref: 'coin', title: 'Préstamos desde el nivel 15', text: 'Elige cuánto pedir (hasta un tope que crece con tu nivel). Pagas una comisión fija del 15% y lo devuelves en 12 cuotas, una por cada hora de juego. Sin intereses que se disparen.', where: 'Oficina › Banco › Abrir el banco' },
      { kind: 'icon', ref: 'lock', title: 'Qué pasa si no pagas', text: 'Si no alcanza la cuota queda atrasada. A las 3 horas: recargo y mal crédito por 2 días. A las 6: embargo de tu pieza más valiosa que no sea esencial (vuelve cuando termines de pagar). A las 10: el banco clausura tu club hasta que te pongas al día. Nunca pierdes la cuenta ni tus objetos para siempre.', where: 'Oficina › Banco' },
      { kind: 'icon', ref: 'star', title: 'Conoce a Don Bruno', text: 'El cobrador del banco aparece en escenas de cómic: cuando te aprueban tu primer préstamo, cuando llegas a la mora, cuando te embarga una pieza (la ves con su sello rojo) y cuando clausura tu club.', where: 'Cuando el banco actúa' },
      { kind: 'icon', ref: 'check', title: 'Justo con el reloj', text: 'Una hora son 60 minutos con el servidor encendido: si está apagado, o estás en prisión, el reloj del banco se detiene. Pagar todo antes te perdona la mitad de la comisión que quede.', where: 'Banco' },
    ],
  },
  {
    id: '2026-11-25r',
    date: '25 de noviembre de 2026',
    title: 'Más empleados y botones que responden',
    intro: 'Todas las barras tienen quien las atienda, hay un puesto nuevo y los clics ya no se pierden.',
    entries: [
      { kind: 'icon', ref: 'check', title: 'Los botones ya responden a la primera', text: 'La barra de acciones (Mejorar, Mover, Guardar, Vender) se reconstruía varias veces por segundo y se llevaba el clic. Ahora solo cambia cuando hace falta y nunca mientras la estás pulsando.', where: 'Al seleccionar un objeto' },
      { kind: 'icon', ref: 'guests', title: 'Hasta 6 bartenders', text: 'Cada barra (recta, de cócteles, larga o de esquina) tiene sitio para su bartender. Los dos primeros suben el precio de los tragos un 25% cada uno; los siguientes, un 10%.', where: 'Oficina › Tu equipo' },
      { kind: 'icon', ref: 'music', title: 'Segundo DJ', text: 'Con una segunda cabina (la normal y la profesional) puedes tener dos DJs: las propinas del baile se duplican.', where: 'Oficina › Tu equipo' },
      { kind: 'icon', ref: 'star', title: 'Puesto nuevo: Mesero', text: 'Atiende sofás, reservados, camas lounge y mesas VIP: cuando alguien se sienta, le lleva un trago a la mesa. Hasta 4 meseros, uno por mueble de esos (nivel 14).', where: 'Oficina › Tu equipo' },
    ],
  },
  {
    id: '2026-11-25q',
    date: '25 de noviembre de 2026',
    title: 'Robos sin límite de nivel',
    intro: 'Desde el nivel 10 puedes asaltar a cualquier club, sin importar su nivel.',
    entries: [
      { kind: 'icon', ref: 'lock', title: 'Ya no hay rango de niveles', text: 'Se quitó la regla de «solo a 5 niveles de diferencia». Desde el nivel 10 todos pueden robar y ser robados; protegerse depende de tu alarma, caja fuerte, cámaras, vitrina blindada y protector antirrobos.', where: 'Ciudad › tarjeta de un club › Asaltar' },
    ],
  },
  {
    id: '2026-11-25p',
    date: '25 de noviembre de 2026',
    title: 'Más de 80 misiones nuevas, piezas mejoradas que se guardan y aviso del DJ',
    intro: 'Ya no te quedas sin qué hacer entre el nivel 17 y el 100.',
    entries: [
      { kind: 'icon', ref: 'missions', title: 'El hueco del nivel 19 al 23', text: 'Faltaban misiones en esa parte. Ahora el capítulo 4 abre en el nivel 17 y trae una por cada objeto nuevo que se desbloquea: luces móviles, tótem LED, subwoofer, sofá VIP, pared LED, estatua dorada, cabina profesional y más.', where: 'Misiones' },
      { kind: 'icon', ref: 'music', title: 'El DJ te avisa', text: 'Los navegadores no dejan sonar nada hasta que tocas la página. Ahora, si recargas y la música aún no suena, aparece «Tu DJ está listo: toca la pantalla». Un toque en cualquier parte y empieza.', where: 'Al abrir o recargar el juego' },
      { kind: 'icon', ref: 'stash', title: 'Guarda tus piezas mejoradas', text: 'Ya puedes guardar un objeto mejorado: se queda con su versión (Premium, Élite…) y no pierdes lo que pagaste. Aparece en el Inventario, en «Piezas mejoradas guardadas», para colocarlo otra vez o venderlo por lo que vale.', where: 'Seleccionar objeto › Guardar · Inventario' },
      { kind: 'icon', ref: 'star', title: 'Capítulos 5, 6 y 7', text: 'Del nivel 36 al 100 hay metas de invitados, tragos, bailes, famosos, asaltos, objetos Élite, sonido, fachada, reformas y ampliaciones, con recompensas que crecen hasta un millón de monedas por la última.', where: 'Misiones' },
    ],
  },
  {
    id: '2026-11-25o',
    date: '25 de noviembre de 2026',
    title: 'Ganas el doble y misiones arregladas',
    intro: 'Tus invitados gastan mucho más, así que tu club rinde casi el doble.',
    entries: [
      { kind: 'icon', ref: 'coin', title: 'Entrada y tragos al doble', text: 'La entrada pasa de 5 a 10 monedas y el trago de 25 a 50. Los bailes también dejan el doble de propina.', where: 'Tu club abierto' },
      { kind: 'icon', ref: 'missions', title: 'Misiones arregladas', text: '«Todo el lujo» ahora cuenta los 20 acabados que ves en Decoración (los 5 básicos también cuentan), y la ventana te dice cuántos llevas. Se quitaron las misiones de subir canciones: puedes seguir poniendo tu música cuando quieras.', where: 'Misiones › Oficina › Decorar' },
      { kind: 'icon', ref: 'star', title: 'Los famosos pagan el doble', text: 'Un famoso de verdad deja 300 monedas de entrada y 120 por trago. Investigarlo ahora cuesta 60, y un farsante te cuesta 200.', where: 'La puerta del club' },
    ],
  },
  {
    id: '2026-11-25n',
    date: '25 de noviembre de 2026',
    title: 'Cuenta con passkey y tu club en todos tus dispositivos',
    intro: 'Protege tu club con tu huella o tu cara y juega con el mismo progreso en el celular y el computador.',
    entries: [
      { kind: 'icon', ref: 'lock', title: 'Passkey: sin contraseñas', text: 'Crea tu passkey con la huella, la cara o el PIN del dispositivo. Desde ese momento solo tú puedes abrir tu club: saber tu código ya no basta.', where: 'Menú › Cuenta › Mi cuenta' },
      { kind: 'icon', ref: 'move', title: 'Otro dispositivo', text: 'Entra con tu passkey o genera un código de 8 dígitos en un dispositivo y escríbelo en el otro. Tu club baja con todo su progreso.', where: 'Menú › Cuenta › Vincular otro dispositivo' },
      { kind: 'icon', ref: 'stash', title: 'Código de recuperación', text: 'Al crear la cuenta recibes un código largo. Guárdalo: es tu salvavidas si pierdes todos tus dispositivos.', where: 'Se muestra al crear la passkey' },
      { kind: 'icon', ref: 'city', title: 'Todo en una base de datos', text: 'Las partidas, la ciudad y las cuentas ahora viven en una base de datos con copias automáticas cada 6 horas.', where: 'Servidor' },
      { kind: 'icon', ref: 'star', title: 'La Brigada también arresta', text: 'Si la policía clausura tu club y encuentra piezas robadas, te arrestan: vas a prisión, haces tus tareas y ves la escena del arresto.', where: 'Robos y policía' },
    ],
  },
  {
    id: '2026-11-25m',
    date: '25 de noviembre de 2026',
    title: '12 canciones nuevas y arreglos de robos',
    intro: 'Más dancehall, champeta y salsa para tu pista, y varios arreglos con las piezas robadas.',
    entries: [
      { kind: 'icon', ref: 'music', title: '12 canciones nuevas', text: 'Vybz Kartel (Fever y Conjugal Visit con Spice), Charly Black, Gyptian, Alkaline, Lil Silvio, Mosta Man, Kevin Florez, Reyes On The Mic, Jose Mc y Maelo Ruiz (salsa).', where: 'Música › Biblioteca' },
      { kind: 'icon', ref: 'stash', title: 'Guardar objetos funciona', text: 'Si una pieza no se puede guardar (porque está mejorada) ahora te lo dice. Una pieza robada que sigue caliente vuelve a tu bolsa en vez de limpiarse gratis.', where: 'Seleccionar un objeto › Guardar' },
      { kind: 'icon', ref: 'coin', title: 'Limpiar piezas robadas', text: 'Al pagar a Zeta, la pieza queda limpia de verdad y se te descuenta la plata. Ahora también puedes limpiar las piezas que ya tienes puestas, con el botón Limpiar al seleccionarlas.', where: 'Oficina › Botín, o al seleccionar la pieza' },
    ],
  },
  {
    id: '2026-11-25l',
    date: '25 de noviembre de 2026',
    title: 'Famosos con cara y más plata por decorar',
    intro: 'Llegan estrellas criollas con su caricatura, y los shows, trofeos y la decoración pagan mucho más.',
    entries: [
      { kind: 'icon', ref: 'star', title: 'Famosos en caricatura', text: 'Ahora llegan 14 estrellas con sabor colombiano: el rey del vallenato con su sombrero vueltiao, una salsera caleña, el rey de la champeta, un goleador de la selección, un ciclista de montaña, una reina de la cumbia y más. En la puerta ves su caricatura y, si los investigas, el sello REAL o FALSO. Cuando entra uno de verdad, aparece su foto en grande.', where: 'La puerta del club (ambiente 78 o más)' },
      { kind: 'item', ref: 'dance_cage', title: 'Los shows pagan el doble', text: 'La jaula y el podio dan el doble de propinas, y ahora pagan completo con solo 4 personas mirando (antes hacían falta 8).', where: 'Tienda › Shows' },
      { kind: 'item', ref: 'gold_statue', title: 'Trofeos casi 3 veces más', text: 'Cada trofeo paga 8 por punto de lujo al minuto (antes 3), con gente cerca.', where: 'Tienda › Trofeos' },
      { kind: 'item', ref: 'aquarium', title: 'La decoración también paga', text: 'Plantas, palmeras, acuarios, fuentes, arcades, neones y esculturas ahora generan monedas por minuto cuando hay gente cerca. Mira cuánto en la tienda.', where: 'Tienda › Decoración' },
    ],
  },
  {
    id: '2026-11-25k',
    date: '25 de noviembre de 2026',
    title: 'Los objetos cobran vida',
    intro: 'Parlantes, humo, láseres y bailarinas ahora se mueven con la música.',
    entries: [
      { kind: 'item', ref: 'dance_cage', tier: 2, title: 'Las bailarinas bailan de verdad', text: 'Ya no giran como figurita de caja de música: dan vueltas al tubo, bailan de frente al público con los brazos arriba, bajan y suben por el tubo y hacen ondas con el cuerpo, al ritmo de la canción.', where: 'Jaula de baile y podio con tubo' },
      { kind: 'item', ref: 'laser_tower', title: 'La torre láser dispara', text: 'Un abanico de rayos que barre la pista, cambia de color y brilla más en cada golpe del bajo.', where: 'Tienda › Luces' },
      { kind: 'item', ref: 'fog_machine', title: 'La máquina de humo echa humo', text: 'Nubes que salen de la boquilla, crecen y se desvanecen; sopla más fuerte con el bajo.', where: 'Tienda › Luces' },
      { kind: 'item', ref: 'speaker_tower', title: 'Los parlantes retumban', text: 'Los conos de todos los parlantes, la torre de sonido y el subwoofer bombean con cada golpe de la música.', where: 'Tienda › DJ' },
    ],
  },
  {
    id: '2026-11-25j',
    date: '25 de noviembre de 2026',
    title: 'Un exterior de lujo',
    intro: 'Tu club se ve mucho mejor desde la calle.',
    entries: [
      { kind: 'icon', ref: 'facade', title: 'Adiós a la cinta amarilla', text: 'El terreno de la ampliación ahora tiene un seto bajo y ya no tapa la discoteca. Las cajas y los conos también se fueron.', where: 'Afuera del club' },
      { kind: 'icon', ref: 'star', title: 'Letreros de verdad', text: 'El nombre del club es un cartel de madera pintada, una caja de neón con marco de metal o, con el letrero gigante, una marquesina dorada con bombillos y estrella.', where: 'Encima de la puerta' },
      { kind: 'icon', ref: 'city', title: 'Valla de la próxima ampliación', text: 'Un cartel con patas y luces que dice qué local sigue, en qué nivel se abre y cuánto cuesta.', where: 'En el terreno, al lado del club' },
      { kind: 'icon', ref: 'luxury', title: 'Fachada más elegante y 3 mejoras nuevas', text: 'Todos los clubes tienen zócalo, columnas en las esquinas, moldura y faroles en la puerta. Nuevas: Jardineras y palmeras (nivel 6), Luces en la fachada (nivel 8) y Entrada de mármol con columnas doradas (nivel 12).', where: 'Oficina › Fachada' },
    ],
  },
  {
    id: '2026-11-25i',
    date: '25 de noviembre de 2026',
    title: 'El aforo ya no se queda en 40',
    intro: 'Tu club puede llenarse más a medida que sube de nivel y se expande.',
    entries: [
      { kind: 'icon', ref: 'guests', title: 'Más gente con el nivel', text: 'El máximo de personas dentro crece con tu nivel: unas 50 en el nivel 13, 75 en el 23, 115 en el 36 y más adelante cientos. Antes se quedaba pegado en 40.', where: 'Píldora de invitados (arriba)' },
      { kind: 'icon', ref: 'city', title: 'La ampliación lo desbloquea', text: 'Cada edificio tiene su techo: el Bar de barrio llega a 52, el Club a 64, el Club grande a 100 y el Mega club a 150. Para llenar más hay que ampliar el local y tener pista y asientos para todos.', where: 'Oficina › Ampliación del local' },
    ],
  },
  {
    id: '2026-11-25h',
    date: '25 de noviembre de 2026',
    title: 'Una prisión con más vida',
    intro: 'La cárcel se ve mejor y ya no estás solo.',
    entries: [
      { kind: 'icon', ref: 'guests', title: 'Ves a los otros presos', text: 'Los demás jugadores presos aparecen en la cárcel con su traje naranja y su nombre, caminando a sus tareas y trabajando. También hay un guardia vigilando desde su escritorio.', where: 'Cuando estás preso' },
      { kind: 'icon', ref: 'star', title: 'Una cárcel más cuidada', text: 'Paredes de dos colores, pisos distintos para cada zona, letreros (PRISIÓN, BAÑOS, COCINA), ventanas con barrotes, faroles, el patio con césped y alambre de púas.', where: 'Prisión' },
    ],
  },
  {
    id: '2026-11-25g',
    date: '25 de noviembre de 2026',
    title: 'La prisión ahora es un edificio',
    intro: 'Caminas por la cárcel y trabajas de verdad.',
    entries: [
      { kind: 'icon', ref: 'street', title: 'Un edificio con sus rincones', text: 'La cámara se va a la prisión: una celda, el baño con tres inodoros, la cocina, la lavandería, un pasillo con charcos, una pared por pintar y un patio lleno de hojas. Tu personaje va con traje naranja.', where: 'Cuando estás preso' },
      { kind: 'icon', ref: 'check', title: 'Tu personaje hace las tareas', text: 'Eliges la tarea y camina hasta su lugar: friega los inodoros, trapea, lava platos, dobla ropa, pinta la pared o barre el patio, cada una con su animación. La suciedad de cada lugar va desapareciendo.', where: 'Botones de tareas abajo' },
      { kind: 'icon', ref: 'guests', title: 'Aviso a toda la ciudad', text: 'Al conectarte te cuentan quién está preso, por intentar asaltar a quién y cuántas tareas lleva. También se avisa cuando cae uno nuevo y cuando sale.', where: 'Chat y avisos' },
    ],
  },
  {
    id: '2026-11-25f',
    date: '25 de noviembre de 2026',
    title: 'La prisión: tareas para salir',
    intro: 'Quien falla un asalto ya no pasea por la ciudad: va a una celda y se gana la salida.',
    entries: [
      { kind: 'icon', ref: 'lock', title: 'Tareas para salir', text: 'En prisión hay que limpiar baños, trapear, lavar platos, doblar ropa, pintar y barrer. Son 20 tareas (30 si el objetivo tenía alarma o la pieza era pesada); entre más haces, más rápido sales. Si no las haces, sales solo a las 6 horas. Tu club queda cerrado mientras estés dentro.', where: 'Cuando te atrapan asaltando' },
      { kind: 'icon', ref: 'guests', title: 'Todos se enteran', text: 'Cuando alguien cae preso, la ciudad lo anuncia: quién fue y a quién intentó asaltar. También avisa cuando sale. La lista de presos está en el Ranking.', where: 'Chat, avisos y Ranking' },
      { kind: 'icon', ref: 'check', title: 'Solo van presos los que fallan', text: 'Un robo que nadie vio no se castiga. Corregimos un castigo que se había aplicado a quienes robaron con éxito: se les levantó la prisión y se les devolvió la multa.', where: 'Asaltos' },
    ],
  },
  {
    id: '2026-11-25e',
    date: '25 de noviembre de 2026',
    title: 'La Brigada se lleva a los ladrones',
    intro: 'Cuando te atrapan robando, ahora lo ves como en una película.',
    entries: [
      { kind: 'icon', ref: 'street', title: 'Escena de arresto', text: 'Llegan las patrullas, el comisario Ferro te esposa y te muestra las pruebas sobre la mesa: qué te llevaste (o ibas a llevarte), a quién y con qué equipo. Después, la celda.', where: 'Cuando falla un asalto' },
      { kind: 'icon', ref: 'lock', title: 'Robos antiguos castigados', text: 'Quien robó antes de que existiera la cárcel ya fue a prisión: el club cierra 15 minutos y paga una multa del 5% de sus monedas, con su propia escena de arresto.', where: 'Al volver a entrar al juego' },
    ],
  },
  {
    id: '2026-11-25d',
    date: '25 de noviembre de 2026',
    title: 'Ajustes: protector más barato y shows que sí pagan',
    intro: 'Hicimos caso a lo que dijeron los jugadores.',
    entries: [
      { kind: 'icon', ref: 'lock', title: 'Protector antirrobos más barato', text: 'Ahora cuesta 400 monedas por nivel y por hora (antes 700). A nivel 11, 2 horas valen 8.800.', where: 'Oficina › Protector antirrobos' },
      { kind: 'item', ref: 'dance_cage', tier: 4, title: 'Shows que pagan 5 veces más', text: 'La jaula de baile deja 300 monedas por minuto en la versión 1 y 1.250 en la Élite; el podio, un 40% de eso. La bailarina cobra más, pero sigue valiendo la pena.', where: 'Tienda › Shows' },
      { kind: 'item', ref: 'gold_statue', tier: 4, title: 'Trofeos que pagan 5 veces más', text: 'La Estatua dorada deja 120 por minuto en la versión 1 y 480 en la Élite. Cada trofeo muestra en su descripción lo que gana.', where: 'Tienda › Trofeos' },
    ],
  },
  {
    id: '2026-11-25c',
    date: '25 de noviembre de 2026',
    title: 'Robos más estrictos',
    intro: 'Protégete de verdad, y los ladrones atrapados lo pagan caro. Además, ahora ves cuánto ganan tus trofeos y shows.',
    entries: [
      { kind: 'icon', ref: 'lock', title: 'Protector antirrobos', text: 'Compra 2, 6, 12 o 24 horas en las que nadie puede asaltar tu club. Cuesta más cuanto más nivel tienes, no pasa de 24 horas seguidas y lo pierdes si tú asaltas a alguien.', where: 'Oficina › Protector antirrobos' },
      { kind: 'icon', ref: 'street', title: 'Prisión para los ladrones', text: 'Si te atrapan asaltando: vas a prisión, tu propio club cierra 10 minutos (15 si el objetivo tenía alarma o la pieza era pesada), pagas una multa del 5% de tus monedas y no puedes asaltar en unas horas.', where: 'Asaltos' },
      { kind: 'item', ref: 'gold_statue', tier: 4, title: 'Trofeos que ganan monedas', text: 'Cada trofeo paga por minuto con el club abierto, música y gente dentro, y más cuanto mejor la versión. Ahora la tienda dice cuánto gana cada uno.', where: 'Tienda › Trofeos' },
      { kind: 'item', ref: 'dance_cage', tier: 4, title: 'Shows con ingresos a la vista', text: 'La jaula y el podio de baile muestran en su descripción cuánto dejan por minuto en cada versión y cuánto cobra la bailarina.', where: 'Tienda › Shows' },
    ],
  },
  {
    id: '2026-11-25b',
    date: '25 de noviembre de 2026',
    title: 'Competencia, reseñas y arreglos',
    intro: 'Ahora los clubes compiten por la gente, y tus invitados te dicen qué mejorar.',
    entries: [
      { kind: 'icon', ref: 'star', title: 'Ranking de la ciudad', text: 'Todos los clubes abiertos compiten por su fama: ambiente, lujo, nivel, famosos y reseñas. El primero recibe hasta 30% más gente en la puerta y el último 25% menos: la gente se va a otras discos.', where: 'Píldora "Puesto" arriba y Oficina › Ranking' },
      { kind: 'icon', ref: 'guests', title: 'Reseñas de tus invitados', text: 'Cuando se van, dejan estrellas y un comentario: música, fila, asientos, barra, pista, decoración. Te dicen qué quejas se repiten y adónde ir para arreglarlas.', where: 'Oficina › Reseñas de tus invitados' },
      { kind: 'icon', ref: 'city', title: 'El club solo gana con el servidor encendido', text: 'Si el servidor está apagado o no tienes conexión, tu club no genera nada. Mientras no estás (o con la pestaña oculta), el servidor trabaja tu club: 35% de lo normal, hasta 8 horas, y te llega una carta al volver.', where: 'Al entrar al juego' },
      { kind: 'icon', ref: 'check', title: 'Famosos arreglados', text: 'Ahora sí pagan al dejarlos pasar (antes el clic se perdía) y ya no aparece uno cada vez que recargas la página.', where: 'La puerta del club' },
      { kind: 'icon', ref: 'missions', title: 'Más misiones, y de protección', text: 'El capítulo 3 se abre desde el nivel 10: hay misiones de seguridad (alarma, cámara, club blindado) y de asaltos. "Sonido de estudio" ahora pide mejorar el equipo de sonido, como dice su texto.', where: 'Misiones' },
      { kind: 'icon', ref: 'menu', title: 'Mejor en el celular', text: 'La barra de abajo, la tienda y las ventanas se acomodan a pantallas chicas, vertical y horizontal.', where: 'Todo el juego' },
    ],
  },
  {
    id: '2026-11-25',
    date: '25 de noviembre de 2026',
    title: 'Once canciones nuevas',
    intro: 'Ahora hay 20 canciones para poner, y por primera vez suenan house y salsa de verdad.',
    entries: [
      { kind: 'icon', ref: 'music', title: 'Reggaetón y dembow', text: '6 AM de J Balvin y Farruko, Voy a amanecer, Ragga Tonseh, Carne hincha, El Tiki y Qué sientes.', where: 'Música › Canciones' },
      { kind: 'icon', ref: 'music', title: 'Latin house y afrohouse', text: 'Trabaje papi y Lomilo: ideales para el público que baila hip hop, disco y robot.', where: 'Música › Canciones' },
      { kind: 'icon', ref: 'music', title: 'Salsa y tropical', text: 'La gozadera de Gente de Zona con Marc Anthony y Vamos pa la playa: con ellas el público baila salsa y merengue.', where: 'Música › Canciones' },
      { kind: 'icon', ref: 'star', title: 'Una más para el ambiente', text: 'A lo natural, de estilo pop. Prueba géneros distintos: cada invitado tiene su favorito y el ambiente sube con lo que le gusta a la mayoría.', where: 'Música' },
    ],
  },
  {
    id: '2026-11-24e',
    date: '24 de noviembre de 2026',
    title: 'A bailar',
    intro: 'Tu personaje ya sabe bailar, y el público de tu club también.',
    entries: [
      { kind: 'icon', ref: 'dance', title: 'Doce bailes y gestos', text: 'Dancehall, reggaetón, salsa, merengue, hip hop, disco, cumbia, robot, saltos y la ola, más aplaudir y saludar. Se abren con el nivel.', where: 'Botón Bailar (o la tecla B)' },
      { kind: 'icon', ref: 'guests', title: 'Los demás te ven bailar', text: 'En tu club, en el de un vecino o en la calle: tu baile se ve igual para todos y sigue el ritmo de la canción.', where: 'Multijugador' },
      { kind: 'icon', ref: 'music', title: 'El público baila según la música', text: 'Con reggaetón bailan dancehall y perreo suave, con salsa bailan salsa y merengue, con rock saltan. Cambia la música y cambian los bailes.', where: 'Tu club' },
      { kind: 'icon', ref: 'check', title: 'Los invitados ya se sientan bien', text: 'Arreglé un fallo por el que nunca doblaban las piernas al sentarse.', where: 'Sillas, sofás y taburetes' },
    ],
  },
  {
    id: '2026-11-24d',
    date: '24 de noviembre de 2026',
    title: 'Trece objetos más',
    intro: 'Nuevas barras, una cabina DJ profesional, pantallas, un segundo show y cámaras de seguridad.',
    entries: [
      { kind: 'item', ref: 'dj_booth_pro', tier: 4, title: 'Cabina DJ profesional', text: 'Tres platos, mezclador y pantalla de luz. Cuenta como cabina y mejora el sonido.', where: 'Tienda › DJ y sonido · nivel 24' },
      { kind: 'item', ref: 'bar_long', tier: 4, title: 'Barra larga de lujo', text: 'Cinco puestos para servir tragos a la vez. Tu bartender también trabaja en ella.', where: 'Tienda › Barras · nivel 25' },
      { kind: 'item', ref: 'bar_corner', tier: 3, title: 'Barra de esquina y de cócteles', text: 'Más lugares donde pedir un trago, desde un club pequeño.', where: 'Tienda › Barras · nivel 9 y 16' },
      { kind: 'item', ref: 'pole_podium', tier: 4, title: 'Podio de baile', text: 'Un show más barato que la jaula: menos propinas, pero cabe en cualquier esquina.', where: 'Tienda › Shows · nivel 18' },
      { kind: 'item', ref: 'video_wall', tier: 4, title: 'Muro de video', text: 'Cuatro pantallas altas para toda la pista. Más pantallas: tótem LED y doble pantalla.', where: 'Tienda › Pantallas · nivel 19, 23 y 33' },
      { kind: 'item', ref: 'moving_heads', tier: 4, title: 'Luces móviles', text: 'Dos lámparas que giran sobre la pista.', where: 'Tienda › Luces · nivel 19' },
      { kind: 'item', ref: 'sofa_corner', tier: 3, title: 'Sofá de esquina', text: 'Tres plazas en L para la zona de descanso.', where: 'Tienda › Asientos · nivel 15' },
      { kind: 'item', ref: 'photo_booth', tier: 4, title: 'Cabina de fotos y arcade', text: 'Para que la gente se quede más tiempo y tu club tenga rincones con gracia.', where: 'Tienda › Decoración · nivel 13 y 17' },
      { kind: 'item', ref: 'camera', tier: 3, title: 'Cámara de seguridad', text: 'Cada cámara (hasta 3) hace más difícil que te asalten.', where: 'Tienda › Seguridad · nivel 12' },
    ],
  },
  {
    id: '2026-11-24c',
    date: '24 de noviembre de 2026',
    title: 'Reformas mucho más baratas',
    intro: 'Las cinco reformas del local costaban demasiado para lo que se gana en cada nivel.',
    entries: [
      { kind: 'icon', ref: 'monitor', title: 'Reformas del local', text: 'Ahora cuestan unas 12 veces menos: la primera pasa de 180.000 a 15.000 monedas, y las siguientes bajan en la misma proporción. Cada reforma sube el lujo, el cover y el ánimo de la gente.', where: 'Oficina › Reformas del local · desde el nivel 8' },
    ],
  },
  {
    id: '2026-11-24b',
    date: '24 de noviembre de 2026',
    title: 'Quince objetos nuevos',
    intro: 'Más para comprar entre el nivel 11 y el 31: asientos VIP, sonido, luces, premios y decoración.',
    entries: [
      { kind: 'item', ref: 'lounge_bed', tier: 4, title: 'Cama lounge', text: 'Cuatro plazas de lujo con dosel de luz. Los invitados se quedan más tiempo.', where: 'Tienda › Asientos · nivel 28' },
      { kind: 'item', ref: 'sofa_vip', tier: 3, title: 'Sofá VIP de 3 plazas', text: 'Cuero y tachuelas cromadas para la zona reservada.', where: 'Tienda › Asientos · nivel 21' },
      { kind: 'item', ref: 'table_vip', tier: 4, title: 'Mesa de botellas', text: 'Botellas, hielo y mucho lujo para que tu zona VIP se vea como tal.', where: 'Tienda › Mesas · nivel 17' },
      { kind: 'item', ref: 'speaker_tower', tier: 3, title: 'Torre de sonido y subwoofer', text: 'Mejoran el sonido de tu club, igual que los altavoces y la cabina.', where: 'Tienda › DJ y sonido · nivel 12 y 20' },
      { kind: 'item', ref: 'led_wall', tier: 4, title: 'Pared LED', text: 'Una pared de luz que late con la música.', where: 'Tienda › Luces · nivel 22' },
      { kind: 'item', ref: 'strobe', tier: 3, title: 'Luz estroboscópica y máquina de humo', text: 'Para que la pista se sienta como una noche de verdad.', where: 'Tienda › Luces · nivel 11 y 15' },
      { kind: 'item', ref: 'gold_record', tier: 4, title: 'Disco de oro y muro de premios', text: 'Presume tus logros: suben el lujo y se pueden robar, así que cuídalos.', where: 'Tienda › Trofeos · nivel 14 y 31' },
      { kind: 'item', ref: 'sculpture', tier: 4, title: 'Escultura de neón', text: 'Una cinta de luz que gira sobre su pedestal.', where: 'Tienda › Decoración · nivel 26' },
      { kind: 'item', ref: 'floor_led', tier: 4, title: 'Baldosa dorada y pista LED', text: 'Dos pistas de baile nuevas para tu pista.', where: 'Tienda › Pistas · nivel 20 y 28' },
    ],
  },
  {
    id: '2026-11-24',
    date: '24 de noviembre de 2026',
    title: 'La noche se pone seria',
    intro: 'Llegan los shows, la seguridad, la policía y una cara nueva para todo el juego.',
    entries: [
      { kind: 'item', ref: 'dance_cage', tier: 4, title: 'La jaula de baile', text: 'Una bailarina en una caja de cristal: atrae gente y deja propinas. Mejórala y gana mucho más.', where: 'Tienda › Shows · nivel 14' },
      { kind: 'item', ref: 'safe', tier: 1, title: 'Alarma, caja fuerte y vitrina blindada', text: 'Ya pueden asaltarte, incluso cuando no estás. Protege tus piezas y tu caja.', where: 'Tienda › Seguridad · nivel 10' },
      { kind: 'icon', ref: 'street', title: 'Asaltos y policía', text: 'Asalta a otros clubes con el equipo de Zeta. La Brigada del Ruido busca lo robado y puede clausurar tu club.', where: 'Toca el club de un vecino · nivel 10' },
      { kind: 'icon', ref: 'music', title: 'Canciones del juego', text: 'Ocho canciones listas para poner, y todos oyen lo mismo cuando visitas un club.', where: 'Música' },
      { kind: 'icon', ref: 'missions', title: 'Misiones con más experiencia', text: 'Cada misión da cinco veces más XP: subir de nivel es mucho más rápido.', where: 'Misiones' },
      { kind: 'icon', ref: 'shop', title: 'Todo más barato', text: 'Los precios de la tienda, la oficina y las ampliaciones bajaron a menos de la mitad.', where: 'Tienda y Oficina' },
      { kind: 'icon', ref: 'star', title: 'Una cara nueva y una guía', text: 'Rediseñamos todas las pantallas. Ahora el juego te explica cada cosa cuando la necesitas.', where: 'Menú › Guía del juego' },
    ],
  },
];

export const LATEST_NEWS = NEWS[0].id;
export const newsById = (id: string): News | undefined => NEWS.find((n) => n.id === id);
