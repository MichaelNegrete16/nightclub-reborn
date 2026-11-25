# El Banco del Ruido

Un préstamo para comprar antes. Las reglas viven en `web/src/core/bank.ts` (puras, las usan el servidor y el juego); el servidor lleva los libros reales en `server/bank.mjs`.

## Reglas
- Desde el **nivel 15**, **un préstamo a la vez**, hasta un tope que crece con el nivel (`loanLimit`).
- **Comisión fija del 15 %** (sin interés compuesto). Se debe `prestado + comisión`, en **12 cuotas por hora**.
- Una "hora" son **60 minutos con el servidor encendido** y el dueño libre: apagado o en prisión, el reloj se detiene.
- Cada hora el banco cobra la cuota de la caja del club. Lo que no alcanza queda atrasado:

| Horas de atraso | Qué pasa |
|---|---|
| 1 | Carta de cuota atrasada |
| 3 | Mora: recargo del 5 % sobre lo atrasado y mal crédito 48 h (sin préstamos nuevos) |
| 6 | Embargo: el banco se lleva la pieza más valiosa que no sea esencial (suelos, barras, cabinas, seguridad, mesas y asientos nunca se tocan); vuelve a la bolsa al terminar de pagar |
| 10 | Clausura: el club queda cerrado hasta ponerse al día |

- Pagar todo antes **perdona la mitad de la comisión que quede**.
- La deuda **resta de la riqueza** del club en el libro de cuentas (`core/ledger.ts`): un préstamo nunca hace parecer más rico a nadie.
- El préstamo, lo embargado y el mal crédito los manda el servidor: una partida subida desde el navegador **no puede** cambiarlos (`server/saves.mjs`).

## Piezas
- `core/bank.ts`: reglas puras (`takeLoan`, `repay`, `bankMinute`, `payoffPrice`).
- `core/mail.ts`: carta `bank` (el servidor la manda, el juego la aplica una sola vez).
- `server/bank.mjs`: `lend`, `payback`, `bankTick` (cada minuto); el cierre del club se refleja en el expediente (`closedUntil`).
- WebSocket: `{ t: 'loan', amount }` y `{ t: 'repay', amount | 'all' }`; respuesta `{ t: 'bank', ok, error }`.
- UI: `ui/bank.ts` (ventana) y la sección "Banco" de la Oficina.

## Escenas
Don Bruno, el cobrador (`NPC_LOOKS.bruno`), sale en cuatro escenas (`core/bank-scenes.ts`, viñetas `bankdesk`, `bankdoor`, `embargo|piezas` y `shut` en `render/comic.ts`): el primer préstamo (una sola vez), la mora, el embargo y la clausura. Se arman con la carta del servidor, así que muestran las piezas embargadas y lo que se debe.

## Pendiente
- Ajustar comisión y topes mirando la economía real.
