const CODEC_MIME = {
  avc: 'video/mp4; codecs="avc1.42E01E"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L93.B0"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
  mp2: 'audio/mpeg',
};

const CODEC_LABELS = {
  avc: 'H.264',
  hevc: 'HEVC',
  aac: 'AAC',
  ac3: 'AC-3',
  eac3: 'E-AC-3',
  mp2: 'MP2',
};

export function supportsCodec(kind) {
  if (
    typeof MediaSource === 'undefined' ||
    typeof MediaSource.isTypeSupported !== 'function'
  ) {
    return false;
  }

  const mime = CODEC_MIME[kind];
  return mime ? MediaSource.isTypeSupported(mime) : false;
}

export function normalizeVideoCodec(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return null;

  if (/hvc1|hev1|hevc|h265|h\.265/.test(text)) return 'hevc';
  if (/avc|h264|h\.264/.test(text)) return 'avc';
  return null;
}

export function normalizeAudioCodec(value) {
  const text = String(value || '').toLowerCase();
  if (!text) return null;

  if (/ec-3|eac3|e-ac-3|dd\+/.test(text)) return 'eac3';
  if (/ac-3|ac3|dolby digital/.test(text)) return 'ac3';
  if (/mp4a|aac/.test(text)) return 'aac';
  if (/mp2|mpeg audio/.test(text)) return 'mp2';
  return null;
}

export function formatCodecLabel(videoCodec, audioCodec) {
  const video = normalizeVideoCodec(videoCodec);
  const audio = normalizeAudioCodec(audioCodec);
  return [CODEC_LABELS[video], CODEC_LABELS[audio]].filter(Boolean).join(' · ');
}

/**
 * @param {string} videoCodec
 * @param {string} audioCodec
 * @param {(kind: string) => boolean} [supports]
 * @returns {string|null}
 */
export function codecWarning(videoCodec, audioCodec, supports = supportsCodec) {
  const video = normalizeVideoCodec(videoCodec);
  const audio = normalizeAudioCodec(audioCodec);

  if (video === 'hevc' && !supports('hevc')) {
    return 'Este canal usa HEVC/H.265, que este navegador no puede decodificar. Ábrelo en VLC.';
  }

  if (audio === 'eac3' && !supports('eac3')) {
    return 'Este canal usa audio E-AC-3, que este navegador no puede decodificar. Ábrelo en VLC.';
  }

  if (audio === 'ac3' && !supports('ac3')) {
    return 'Este canal usa audio AC-3, que este navegador no puede decodificar. Ábrelo en VLC.';
  }

  if (audio === 'mp2' && !supports('mp2')) {
    return 'Este canal usa audio MP2, que este navegador no puede decodificar. Ábrelo en VLC.';
  }

  return null;
}
