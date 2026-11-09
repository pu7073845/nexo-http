export function safeFileName(name) {
  const cleaned = String(name || 'canal')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .replace(/[.\s]+$/g, '');

  return cleaned || 'canal';
}

/**
 * Genera una entrada M3U para abrir en VLC, conservando las opciones
 * #EXTVLCOPT de la lista original.
 */
export function buildVlcPlaylist(name, url, options = []) {
  const title = String(name || 'Canal').replace(/[\r\n]+/g, ' ').trim() || 'Canal';
  const lines = ['#EXTM3U', `#EXTINF:-1,${title}`];

  for (const option of options) {
    const clean = String(option || '').replace(/[\r\n]+/g, ' ').trim();
    if (clean && !clean.startsWith('#')) {
      lines.push(`#EXTVLCOPT:${clean}`);
    }
  }

  lines.push(String(url).trim());
  return `${lines.join('\n')}\n`;
}
