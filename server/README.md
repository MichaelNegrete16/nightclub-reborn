# Servidor de la ciudad

Servidor multijugador mínimo. **No corre el juego**: reparte lotes y cuenta a cada jugador quién vive cerca. La economía sigue en cada cliente (el servidor confía en lo que el cliente dice de su club; eso se endurece más adelante).

## Correrlo

```bash
cd server
npm install
npm start            # ws://127.0.0.1:8787
```

Variables (todas opcionales): `PORT` (8787), `HOST` (127.0.0.1; usa `0.0.0.0` para que otros equipos de la red entren), `DATA_FILE` (data/world.json; vacío = sin guardar), `MAX_PER_IP` (20 conexiones), `ALLOWED_ORIGINS` (lista separada por comas; vacía = cualquiera).

El juego busca el servidor en `ws://<tu-host>:8787`. Se puede cambiar con `?server=ws://host:puerto` (se recuerda) o apagar con `?server=off`. Si no hay servidor, el juego sigue en solitario con vecinos simulados e intenta reconectar. Una página `https` necesita un servidor `wss` (detrás de un proxy con TLS).

## Cómo funciona

- Cada navegador tiene un **id de invitado** (en localStorage). El primer mensaje es `hello` con ese id. No hay cuentas todavía.
- Los lotes se reparten **en espiral** desde el centro, en orden de llegada: quien entra después vive al lado. Se guardan en `data/world.json`; un jugador ausente deja su club en la ciudad (con la lámpara de la puerta y el letrero apagados).
- El cliente manda cada pocos segundos la cara pública de su club: nombre, fase, nivel, ambiente, abierto/cerrado e invitados. El servidor lo limpia y acota todo, y lo reenvía a los vecinos en un radio de 3 lotes cada ~1.5 s si algo cambió.

Protocolo (JSON):

| Dirección | Mensaje |
|---|---|
| cliente → servidor | `{t:'hello', id, name}` y `{t:'club', club:{name, phase, level, rating, open, guests}}` |
| cliente → servidor | `{t:'look', look}`, `{t:'pos', x, z, m}` (dónde estoy en la calle), `{t:'layout', items}` (mis muebles, para que me visiten), `{t:'visit', n}` |
| servidor → cliente | `{t:'city', me:{i,j,n}, clubs:[{n,i,j,name,phase,level,rating,open,guests,online,color,ext}], online}` |
| servidor → cliente | `{t:'peers', p:[{n,di,dj,x,z,m,look?}]}` (gente caminando cerca, varias veces por segundo), `{t:'club', n, name, phase, ext, items}` (el club que pediste visitar), `{t:'clock', now}` (la hora de la ciudad) |

Protecciones: mensajes de máximo 2 KB, 10 mensajes por segundo, un cambio de club por segundo, una conexión por jugador (la nueva reemplaza a la vieja), límite de conexiones por IP, nombres y números acotados.

Endpoints: `GET /health`, `GET /stats` (jugadores en línea, lotes, memoria).

## Pruebas

```bash
npm test                   # lotes, validación, persistencia y abuso
npm run load -- 1000 20    # 1000 jugadores falsos durante 20 s
```

Medido en un portátil: 1000 jugadores conectados → 4% de un núcleo, 160 MB, ~2.6 KB/s por jugador, actualizaciones visibles en menos de 1.5 s.

En el proyecto web: `node scripts/net-e2e.mjs` abre dos navegadores contra un servidor real y 40 bots.

## Lo que falta

Visitas con gente adentro (hoy se ve el club vacío), ver a los amigos dentro de su propio club, cuentas reales, un servidor autoritativo (que valide la economía), visitas a otros clubes, asaltos, policía, reciclar lotes abandonados y subirlo a un servidor público con TLS.

## El cielo es de la ciudad

En línea, la hora (Colombia, UTC-5) y el clima salen del reloj del servidor y son iguales para todos; los ajustes locales de hora y clima solo valen jugando sin conexión.
