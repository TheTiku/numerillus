# Numerillus

App móvil (web app instalable / PWA) para controlar ingresos, gastos y ahorro.
Funciona sin conexión y guarda los datos solo en el dispositivo (localStorage).

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

## Probar en el ordenador
```bash
cd "/Users/vrl/Desktop/App Numerillus" && python3 -m http.server 8765
```
Abre http://localhost:8765

## Usarla en el móvil
Las PWA necesitan HTTPS, así que hay que publicar la carpeta en un hosting estático
(GitHub Pages, Netlify, Cloudflare Pages…). Después, en el móvil:
- **iPhone (Safari):** Compartir → «Añadir a pantalla de inicio» (necesario para recibir notificaciones).
- **Android (Chrome):** menú ⋮ → «Instalar aplicación».

## Sobre las notificaciones
Una web app no puede programar avisos exactos con la app cerrada. Numerillus avisa al abrirla
(o si está abierta) cuando ya pasó la hora y no has apuntado nada; en Android instalada usa además
sincronización periódica en segundo plano. Para un aviso exacto todos los días, usa
**Ajustes → Añadir aviso al calendario**.

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
