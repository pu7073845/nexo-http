export const SOURCE_ERRORS = Object.freeze({
  EMPTY: 'EMPTY',
  INVALID: 'INVALID',
  SCHEME: 'SCHEME',
  MIXED_CONTENT: 'MIXED_CONTENT',
});

/**
 * Valida y normaliza la URL de una lista M3U.
 *
 * @param {string} raw
 * @param {string} [pageProtocol] Protocolo de la página, por ejemplo "https:".
 * @returns {{url: string|null, error: string|null}}
 */
export function normalizeSourceUrl(raw, pageProtocol = 'https:') {
  const value = String(raw ?? '').trim();

  if (!value) {
    return { url: null, error: SOURCE_ERRORS.EMPTY };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, error: SOURCE_ERRORS.INVALID };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: null, error: SOURCE_ERRORS.SCHEME };
  }

  if (!parsed.hostname) {
    return { url: null, error: SOURCE_ERRORS.INVALID };
  }

  if (pageProtocol === 'https:' && parsed.protocol === 'http:') {
    return { url: null, error: SOURCE_ERRORS.MIXED_CONTENT };
  }

  return { url: parsed.toString(), error: null };
}

export function sourceHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function sourceErrorMessage(error) {
  switch (error) {
    case SOURCE_ERRORS.EMPTY:
      return 'Introduce la URL de tu lista M3U.';
    case SOURCE_ERRORS.SCHEME:
      return 'La fuente debe empezar por http:// o https://.';
    case SOURCE_ERRORS.MIXED_CONTENT:
      return 'Esta página usa HTTPS. La fuente también debe usar HTTPS.';
    case SOURCE_ERRORS.INVALID:
    default:
      return 'La URL de la fuente no es válida.';
  }
}
