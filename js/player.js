const HLS_EXTENSION = /\.m3u8$/i;
const TS_EXTENSION = /\.ts$/i;
const VIDEO_EXTENSION = /\.(mp4|m4v|webm|ogg|ogv|mov)$/i;

/**
 * @param {string} url
 * @returns {'hls'|'ts'|'video'|'unknown'}
 */
export function detectMediaKind(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'unknown';
  }

  const pathname = parsed.pathname.toLowerCase();
  const search = parsed.search.toLowerCase();

  if (
    HLS_EXTENSION.test(pathname) ||
    search.includes('.m3u8') ||
    /(?:^|[?&])extension=m3u8(?:&|$)/.test(search)
  ) {
    return 'hls';
  }
  if (TS_EXTENSION.test(pathname) || /(?:^|[?&])extension=ts(?:&|$)/.test(search)) {
    return 'ts';
  }
  if (VIDEO_EXTENSION.test(pathname)) return 'video';
  return 'unknown';
}

/**
 * Reproductor de un único enlace.
 * - HLS (.m3u8) con hls.js o soporte nativo.
 * - MPEG-TS directo (.ts / extension=ts) con mpegts.js.
 * - MP4/WebM con el elemento <video>.
 */
export class MediaPlayer {
  /**
   * @param {HTMLVideoElement} video
   * @param {{
   *   onError?: (message: string) => void,
   *   onCodecInfo?: (info: {videoCodec?: string, audioCodec?: string, mimeType?: string}) => void
   * }} [options]
   */
  constructor(video, options = {}) {
    this.video = video;
    this.onError = options.onError || (() => {});
    this.onCodecInfo = options.onCodecInfo || (() => {});
    this.hls = null;
    this.mpegtsPlayer = null;
  }

  /**
   * @param {string} url
   * @returns {Promise<{kind: string, engine: string}>}
   */
  async play(url) {
    this.stop();

    const kind = detectMediaKind(url);

    try {
      if (kind === 'hls') {
        if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
          this.video.src = url;
          await this.tryNativePlay();
          return { kind, engine: 'native' };
        }

        if (window.Hls && window.Hls.isSupported()) {
          await this.attachHls(url);
          await this.tryNativePlay();
          return { kind, engine: 'hls.js' };
        }

        throw new Error('Este navegador no puede reproducir HLS. Usa Abrir o Copiar.');
      }

      if (kind === 'ts') {
        if (window.mpegts && window.mpegts.isSupported()) {
          await this.attachMpegts(url);
          return { kind, engine: 'mpegts.js' };
        }

        throw new Error('Este navegador no puede reproducir MPEG-TS. Usa Abrir o Copiar.');
      }

      if (kind === 'video') {
        this.video.src = url;
        await this.tryNativePlay();
        return { kind, engine: 'native' };
      }

      throw new Error('Formato no compatible con el reproductor del navegador. Usa Abrir o Copiar.');
    } catch (error) {
      this.stop();
      this.onError(error.message || 'No se pudo reproducir el enlace.');
      throw error;
    }
  }

  attachHls(url) {
    return new Promise((resolve, reject) => {
      const Hls = window.Hls;
      let settled = false;

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      this.hls = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const level = data.levels && data.levels[0];
        const codecs = level?.attrs?.CODECS || '';

        this.onCodecInfo({
          videoCodec: level?.videoCodec || codecs,
          audioCodec: level?.audioCodec || codecs,
          mimeType: 'application/vnd.apple.mpegurl',
        });

        if (settled) return;
        settled = true;
        resolve();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        const message = describeHlsError(data);

        if (!settled) {
          settled = true;
          reject(new Error(message));
          return;
        }

        this.onError(message);
      });

      hls.loadSource(url);
      hls.attachMedia(this.video);
      this.tryNativePlay();
    });
  }

  attachMpegts(url) {
    return new Promise((resolve, reject) => {
      const mpegts = window.mpegts;
      let settled = false;

      const player = mpegts.createPlayer(
        {
          type: 'mpegts',
          isLive: true,
          url,
        },
        {
          enableWorker: true,
          liveBufferLatencyChasing: true,
        },
      );

      this.mpegtsPlayer = player;

      player.on(mpegts.Events.MEDIA_INFO, (info) => {
        this.onCodecInfo({
          videoCodec: info?.videoCodec,
          audioCodec: info?.audioCodec,
          mimeType: info?.mimeType,
        });

        if (!settled) {
          settled = true;
          resolve();
        }
      });

      player.on(mpegts.Events.ERROR, (type, detail, info) => {
        const message = describeMpegtsError(type, detail, info);

        if (!settled) {
          settled = true;
          reject(new Error(message));
          return;
        }

        this.onError(message);
      });

      player.attachMediaElement(this.video);
      player.load();
      player.play().catch(() => {
        // El navegador puede bloquear el autoplay; los controles siguen visibles.
      });
    });
  }

  async tryNativePlay() {
    try {
      await this.video.play();
    } catch {
      // El navegador puede bloquear el autoplay. Los controles siguen visibles.
    }
  }

  stop() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.pause();
        this.mpegtsPlayer.unload();
        this.mpegtsPlayer.detachMediaElement();
        this.mpegtsPlayer.destroy();
      } catch {
        // El reproductor ya puede estar destruido.
      }
      this.mpegtsPlayer = null;
    }

    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
}

export function describeHlsError(data) {
  const status = Number(data?.response?.code);
  const responseText = String(data?.response?.text || '').toLowerCase();
  const details = String(data?.details || '').toLowerCase();

  if (status === 429) {
    return 'Demasiadas solicitudes al proveedor. Espera unos minutos y reintenta.';
  }

  if (status === 503 || responseText.includes('provider-cap')) {
    return 'Canal no disponible en el proveedor. Prueba otro canal o usa VLC.';
  }

  if (details.includes('manifestparsingerror') || details.includes('manifestloaderror')) {
    if (responseText.includes('provider-cap')) {
      return 'Canal no disponible en el proveedor. Prueba otro canal o usa VLC.';
    }
    return 'El proveedor no devolvió un manifiesto HLS válido. Puede que el canal no esté disponible.';
  }

  if (details.includes('codec') || details.includes('mediaerror')) {
    return 'Este canal usa un códec que el navegador no puede decodificar. Ábrelo en VLC.';
  }

  if (details.includes('fragloaderror')) {
    return 'No se pudo descargar el segmento del canal. Puede haber caducado o estar limitado. Usa VLC si persiste.';
  }

  return 'No se pudo reproducir el canal en el navegador. Usa Abrir o VLC.';
}

export function describeMpegtsError(type, detail, info) {
  const code = info?.code;
  const typeText = String(type || '').toLowerCase();
  const detailText = String(detail || '').toLowerCase();
  const infoText = String(info?.msg || info?.message || '').toLowerCase();

  if (Number(code) === 429) {
    return 'Demasiadas solicitudes al proveedor. Espera unos minutos y reintenta.';
  }

  if (Number(code) === 503) {
    return 'Canal no disponible temporalmente en el proveedor.';
  }

  if (
    typeText.includes('network') ||
    detailText.includes('network') ||
    infoText.includes('network') ||
    infoText.includes('connection')
  ) {
    return 'No se pudo conectar con el canal. Revisa DNS/VPN o usa VLC.';
  }

  if (typeText.includes('media') || detailText.includes('media') || detailText.includes('codec')) {
    return 'Este canal usa un códec que el navegador no puede decodificar. Ábrelo en VLC.';
  }

  return 'No se pudo reproducir el canal con mpegts.js. Usa Abrir o VLC.';
}
