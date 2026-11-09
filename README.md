# Nexo HTTP

PWA para consultar una fuente M3U propia y reproducir enlaces **HTTP/HLS/MPEG-TS**
en el navegador.

**Nexo HTTP no incluye ni proporciona listas, canales, enlaces ni contenido.**
El usuario configura la URL de una lista M3U propia o autorizada. La fuente se
guarda en `localStorage` y se usa en cada actualización.

Proyecto local, versión `0.2.0`.

## Funciones

- Configurar y cambiar la URL de la fuente M3U.
- Guardar la fuente y la última lista válida en `localStorage`.
- Botón de recarga para descargar la fuente de nuevo.
- Pestaña **Canales** con buscador y agrupación por categoría.
- Pestaña **Eventos** cuando la lista contiene entradas con hora y `vs`.
- Cada enlace ofrece:
  - **▶ Reproducir** dentro de la PWA.
  - **Abrir** en una pestaña nueva.
  - **Copiar** la URL para VLC, mpv u otro reproductor.
- Reproductor HLS con `hls.js`, incluido localmente.
- Reproductor MPEG-TS directo con `mpegts.js`, incluido localmente.
- Soporte nativo de HLS en Safari/iOS.
- Reproducción directa de MP4/WebM.
- Detección de códecs H.264, HEVC, AAC, AC-3, E-AC-3 y MP2.
- Aviso si un códec no está soportado por el navegador.
- Botón **VLC M3U** que descarga una entrada M3U con las opciones
  `#EXTVLCOPT` originales (User-Agent, Cookie, Authorization).
- Mensajes específicos para 429, 503, `provider-cap`, DNS/VPN y contenido mixto.
- Caché local, recarga y aviso de errores.
- Diseño oscuro responsive.

## Primera ejecución

Al abrir la app sin fuente configurada se muestra una pantalla para pegar la URL
de la lista M3U. Ejemplo de formato:

```
https://ejemplo.com/lista.m3u
```

La URL debe empezar por `http://` o `https://`. La app no trae ninguna fuente por
defecto.

## Formatos

- **HLS**: enlaces `.m3u8` con segmentos MPEG-TS o fMP4, mediante `hls.js`.
- **MPEG-TS directo**: enlaces `.ts` o `extension=ts`, mediante `mpegts.js`.
- **Vídeo directo**: `.mp4`, `.m4v`, `.webm`, `.ogg`, `.ogv`, `.mov`.
- **Otros formatos**: se ofrece Abrir, Copiar o VLC M3U como alternativa.

En Chrome/Firefox/Edge, HLS se reproduce con `hls.js` y MPEG-TS con
`mpegts.js`. En Safari/iOS se usa el soporte nativo de HLS cuando está
disponible.

## Códecs

- H.264/AVC + AAC: soportado de forma amplia.
- H.265/HEVC: depende del navegador y del sistema; en Firefox suele no estar
  disponible.
- AC-3 / E-AC-3: soporte limitado; depende de la plataforma.
- MP2: no está garantizado en navegadores.

Si el navegador no puede decodificar el canal, la app muestra un aviso y ofrece
**VLC M3U** para abrirlo en un reproductor externo.

## Limitaciones

- **CORS**: la fuente y los segmentos deben permitir CORS. El navegador no puede
  saltarse esa restricción.
- **HTTPS**: si Nexo HTTP se sirve por HTTPS, la fuente y los enlaces deben usar
  HTTPS. Una URL HTTP se bloquea por contenido mixto.
- **Códecs**: HEVC, AC-3/E-AC-3 y MP2 pueden no estar disponibles en el
  navegador.
- **DNS/VPN**: un dominio bloqueado o mal resuelto puede impedir la conexión.
  La app muestra un aviso.
- **Tokens**: algunos enlaces caducan. Usa el botón de recarga para obtener una
  lista nueva.
- **Reproductor externo**: para VLC/mpv usa **VLC M3U**, que conserva las
  cabeceras necesarias. Abrir o Copiar entrega solo la URL.

## Ejecutar en local

No hay build ni dependencias de producción. Solo necesitas Python 3 o cualquier
servidor estático:

```bash
cd NexoHttp
python3 -m http.server 8080
```

Abre `http://localhost:8080`.

También puedes usar:

```bash
npm run dev
```

Para que funcione el service worker y la instalación como PWA se necesita HTTPS
o `localhost`.

## Tests

```bash
npm test
```

Los tests cubren:

- Validación de la URL de la fuente.
- Lectura de la cabecera `Last Updated`.
- Horas, cambio de día y desfase −6 h.
- Nombres con números y acentos.
- Canales con números y banderas.
- Agrupación de fuentes por evento.
- Detección de HLS, MPEG-TS y vídeo directo.
- Normalización y aviso de códecs HEVC/E-AC-3/AC-3/MP2.
- Conservación de opciones `#EXTVLCOPT`.
- Generación de M3U para VLC y nombres de archivo seguros.

Comprobación de sintaxis:

```bash
npm run check
```

## Estructura

```
NexoHttp/
├── index.html
├── css/styles.css
├── js/
│   ├── app.js          # UI, fuente, pestañas, acciones y reproductor
│   ├── codecs.js       # detección H.264/HEVC/AAC/AC-3/E-AC-3/MP2
│   ├── parser.js       # parser M3U, opciones VLC y agrupación
│   ├── player.js       # HLS.js, mpegts.js y vídeo nativo
│   ├── source.js       # validación de la URL de la fuente
│   ├── time.js         # fechas, desfase −6 h y etiquetas
│   ├── storage.js      # fuente y caché en localStorage
│   ├── vlc.js          # generación de M3U para VLC
│   └── vendor/
│       ├── hls.min.js     # hls.js 1.7.4, Apache-2.0
│       └── mpegts.min.js  # mpegts.js 1.8.2, Apache-2.0
├── icons/
├── manifest.webmanifest
├── sw.js
├── tests/
│   ├── parser.test.js
│   ├── source.test.js
│   ├── media.test.js
│   ├── vlc.test.js
│   └── fixtures/tricky.m3u
├── LICENSE
├── DISCLAIMER.md
├── THIRD_PARTY_NOTICES.md
└── package.json
```

## Formato que interpreta

Cada entrada de la lista tiene esta forma:

```
#EXTINF:-1 group-title="Directos" tvg-logo="...",19h30 EQUIPO C vs EQUIPO D 2 CANAL 1
https://example.com/stream/1.m3u8
```

El parser obtiene:

- `19h30` → hora original.
- `EQUIPO C vs EQUIPO D` → nombre del evento.
- `2` → número de la fuente (no se muestra).
- `CANAL 1` → nombre del canal/emisión.

Las entradas sin hora o sin `vs` se muestran en la pestaña **Canales**. Las
líneas `#EXTGRP` y otros comentarios se ignoran. Las líneas `#EXTVLCOPT` se
conservan por entrada para generar el M3U de VLC.

## Licencia y aviso legal

El código original de este repositorio está bajo licencia MIT. Consulta
[LICENSE](LICENSE).

Nexo HTTP no aloja ni distribuye contenido audiovisual y no está afiliado a
emisoras, ligas o proveedores de contenido. El uso de fuentes y enlaces de
terceros es responsabilidad del usuario. Consulta
[DISCLAIMER.md](DISCLAIMER.md) y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
