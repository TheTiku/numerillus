# Numerillus

App móvil (web app instalable / PWA) para controlar ingresos, gastos y ahorro.
Funciona sin conexión y guarda los datos solo en el dispositivo (localStorage).

👉 **Abrir la app:** https://thetiku.github.io/numerillus/

## Funcionalidades
- **Saldo inicial** (bienvenida y Ajustes) → el saldo actual se calcula a partir de él.
- **Ingresos**, **gastos variables** y **ahorro** (aportar / retirar) con categoría, nota y **fecha**.
- **Gastos fijos** mensuales con día de cobro: se marcan ✓ como cobrados y se descuentan del saldo.
  Tocando un fijo cobrado se puede cambiar la fecha o el importe de ese mes.
- **Ahorro mensual** con objetivo y barra de progreso.
- **Estadísticas por meses** (3/6/12 meses, gráfico y tabla) y **por categorías** (mes o año).
- **Categorías** editables (nombre, icono, color) para gastos e ingresos.
- **Recordatorio diario** a la hora elegida + opción de añadirlo al calendario (.ics).
- **Ajustes**: moneda, tema claro/oscuro, copias de seguridad (exportar/importar), borrar datos.

## Probar en local
Desde la carpeta del proyecto:
```bash
python3 -m http.server 8765
```
Y abre http://localhost:8765

## Usarla en el móvil
Abre https://thetiku.github.io/numerillus/ en el móvil y añádela a la pantalla de inicio:
- **iPhone (Safari):** Compartir → «Añadir a pantalla de inicio» (necesario para recibir notificaciones).
- **Android (Chrome):** menú ⋮ → «Instalar aplicación».

## Sobre las notificaciones
Los recordatorios diarios llegan como **notificaciones push** desde un pequeño servidor en
Cloudflare Workers (`push-server/`), gratuito:
- Al activar «Recordatorio diario», el móvil se suscribe y el servidor guarda solo la suscripción,
  la hora y la zona horaria (ningún dato de gastos).
- Cada 5 minutos el servidor envía el aviso a quien ya haya llegado a su hora, salvo que ese día
  ya haya apuntado algo (la app se lo comunica).
- En iPhone hace falta iOS 16.4+ y abrir la app desde el icono de la pantalla de inicio.

Si no hay conexión con el servidor, la app avisa solo cuando está abierta. Alternativa siempre
fiable: **Ajustes → Añadir aviso al calendario**.

### Servidor (`push-server/`)
- `worker.js` – API (`/subscribe`, `/unsubscribe`, `/logged`, `/test`) y cron.
- `webpush.js` – cifrado aes128gcm y firma VAPID con WebCrypto (sin dependencias).
- `selftest.html` – autotest del cifrado en el navegador.
- `deploy.sh` – despliegue con la API de Cloudflare. Necesita, fuera del repositorio,
  `~/.numerillus/cf-token` (token «Edit Cloudflare Workers») y `~/.numerillus/vapid.json`.

## Estructura
```
index.html            Página y barra de pestañas
css/styles.css        Estilos (claro/oscuro)
js/app.js             Vistas, formularios y eventos
js/store.js           Datos, cálculos y persistencia
js/charts.js          Gráficos SVG
js/notify.js          Recordatorios y calendario
js/utils.js           Fechas, formato de dinero
sw.js                 Service worker (offline + avisos)
manifest.webmanifest  Datos de instalación
icons/                Iconos
```
