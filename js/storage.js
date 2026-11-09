const SOURCE_KEY = 'nexo-http.source.v1';
const CACHE_KEY = 'nexo-http.playlist.v1';
const LEGACY_CACHE_KEY = 'canales.playlist.v1';

/**
 * @returns {string|null}
 */
export function loadSource() {
  try {
    const value = window.localStorage.getItem(SOURCE_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function saveSource(url) {
  try {
    window.localStorage.setItem(SOURCE_KEY, url);
    return true;
  } catch {
    return false;
  }
}

export function clearSource() {
  try {
    window.localStorage.removeItem(SOURCE_KEY);
  } catch {
    // Sin localStorage no hay nada que borrar.
  }
}

/**
 * @returns {{text:string, fetchedAt:number}|null}
 */
export function loadCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== 'string' || !parsed.text.includes('#EXTINF')) {
      return null;
    }

    return {
      text: parsed.text,
      fetchedAt: Number(parsed.fetchedAt) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @param {number} [fetchedAt]
 * @returns {boolean}
 */
export function saveCache(text, fetchedAt = Date.now()) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ text, fetchedAt }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearCache() {
  try {
    window.localStorage.removeItem(CACHE_KEY);
    window.localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // Sin localStorage (modo privado muy restrictivo): no hay nada que borrar.
  }
}
