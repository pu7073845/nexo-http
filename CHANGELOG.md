# Changelog

## 0.2.0

- Soporte de MPEG-TS directo con mpegts.js.
- Detección de enlaces `.ts` y `extension=ts`.
- Detección de códecs H.264, HEVC, AAC, AC-3, E-AC-3 y MP2.
- Aviso cuando el navegador no puede decodificar HEVC/E-AC-3/AC-3/MP2.
- Botón VLC M3U con las opciones `#EXTVLCOPT` originales.
- Mensajes específicos para 429, 503, provider-cap, DNS/VPN y contenido mixto.
- Parser conserva User-Agent, Cookie, Referer y Authorization por entrada.
- Tests de mpegts, códecs y generación M3U.

## 0.1.0

- Versión inicial local de Nexo HTTP.
- Fuente M3U configurable y guardada en `localStorage`.
- Sin lista predeterminada: la app pide una fuente al arrancar.
- Pestaña Canales con buscador y agrupación por categoría.
- Pestaña Eventos automática cuando la lista contiene eventos.
- Reproductor HLS con hls.js local.
- Soporte nativo de HLS y vídeo directo MP4/WebM.
- Acciones Reproducir, Abrir y Copiar.
- Caché local, recarga y aviso de errores.
- Licencia MIT y aviso legal.
