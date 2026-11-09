/**
 * Parser de listas M3U.
 *
 * Formato de interés:
 *   #EXTINF:-1 group-title="Directos" tvg-logo="...",6h00 Equipo Á vs Equipo B 1 SEÑAL 3
 *   https://example.com/stream/1.m3u8
 *
 * Cada evento puede tener varias "emisiones" (canales alternativos). Las
 * entradas sin hora o sin "vs" se consideran canales sueltos.
 */

import {
  DISPLAY_OFFSET_MS,
  assignSourceDates,
  parseUpdatedAt,
  nowWallClockTs,
} from './time.js';

const TRAILING_FLAGS_RE = /(?:\p{Regional_Indicator}{2}\s*)+$/u;
const IGNORED_CHANNEL_RE = /^thanks for upload\b/i;

export class PlaylistParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlaylistParseError';
  }
}

/**
 * @param {string} line
 * @returns {number} índice de la coma que separa atributos y nombre, o -1
 */
function findNameComma(line) {
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      return i;
    }
  }

  return -1;
}

/**
 * @param {string} line
 * @returns {{name:string, group:string, logo:string, tvgId:string}}
 */
function parseExtinf(line) {
  const body = line.replace(/^#EXTINF:\s*/i, '');
  const commaIndex = findNameComma(body);

  const attrPart = commaIndex >= 0 ? body.slice(0, commaIndex) : body;
  const name = commaIndex >= 0 ? body.slice(commaIndex + 1).trim() : '';

  const attrs = {};
  const attrRe = /([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"/g;
  let match;

  while ((match = attrRe.exec(attrPart)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }

  return {
    name: normalizeSpaces(name),
    group: normalizeSpaces(attrs['group-title'] || 'Sin categoría'),
    logo: (attrs['tvg-logo'] || '').trim(),
    tvgId: (attrs['tvg-id'] || '').trim(),
  };
}

function normalizeSpaces(value) {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extrae la hora inicial del nombre: "6h00 ...", "19h30 ...", "0h00 ...".
 *
 * @param {string} name
 * @returns {{hour:number, minute:number, minutes:number, rest:string}|null}
 */
export function parseTimePrefix(name) {
  const match = /^(\d{1,2})h(\d{2})\s+(.+)$/.exec(name);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return {
    hour,
    minute,
    minutes: hour * 60 + minute,
    rest: match[3].trim(),
  };
}

/**
 * Separa "Equipo Á vs Equipo B 2 CANAL 5 50FPS" en equipos y canal.
 *
 * El número que precede al canal es el índice de la fuente. Se busca el primer
 * número cuyo texto posterior empiece por letra, lo que evita romper nombres de
 * equipo como "Equipo 98" o canales como "CANAL 1 4K".
 *
 * @param {string} rest
 * @returns {{teams:string, channel:string, channelLabel:string, flags:string, number:number|null}|null}
 */
export function splitMatchName(rest) {
  const original = normalizeSpaces(rest);

  const flagsMatch = original.match(TRAILING_FLAGS_RE);
  const flags = flagsMatch ? normalizeSpaces(flagsMatch[0]) : '';
  const clean = normalizeSpaces(original.replace(TRAILING_FLAGS_RE, ''));

  const vsMatch = /\bvs\.?\b/i.exec(clean);
  if (!vsMatch) return null;

  const teamsEnd = vsMatch.index + vsMatch[0].length;
  const tail = clean.slice(teamsEnd);

  let selected = null;
  let fallback = null;

  // No se consume el espacio anterior al número, para poder detectar números
  // consecutivos separados por un solo espacio ("Equipo 98 2 CANAL").
  const numberRe = /\d+\s+/g;
  let match;

  while ((match = numberRe.exec(tail)) !== null) {
    const numberIndex = match.index;
    if (numberIndex > 0 && !/\s/.test(tail[numberIndex - 1])) continue;

    const after = tail.slice(match.index + match[0].length).trim();

    if (!after) continue;

    const candidate = {
      number: Number(match[0].trim()),
      index: numberIndex,
      channel: after,
    };

    // El canal real empieza por letra ("CANAL 1 4K", "CANAL 5 50FPS").
    // Si el texto posterior empieza por un número, ese número forma parte del
    // nombre del equipo ("Equipo 98") o del propio canal ("1 4K").
    if (/^\p{L}/u.test(after)) {
      selected = candidate;
      break;
    }

    if (!fallback) fallback = candidate;
  }

  selected = selected || fallback;

  if (!selected) {
    return {
      teams: clean,
      channel: '',
      channelLabel: flags,
      flags,
      number: null,
    };
  }

  const teams = clean.slice(0, teamsEnd + selected.index).trim();
  const channelLabel = [selected.channel, flags].filter(Boolean).join(' ');

  if (!teams) return null;

  return {
    teams,
    channel: selected.channel,
    channelLabel,
    flags,
    number: selected.number,
  };
}

/**
 * @param {string} text contenido completo del M3U
 * @param {{now?: Date}} [options]
 * @returns {{
 *   updatedAt:number,
 *   updatedAtDisplay:number,
 *   matches:Array<object>,
 *   channels:Array<object>,
 *   channelGroups:Array<{title:string, channels:Array<object>}>,
 *   stats:{totalEntries:number, matchCount:number, sourceCount:number, channelCount:number}
 * }}
 */
export function parsePlaylist(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new PlaylistParseError('La lista está vacía.');
  }

  if (!/#EXTM3U/i.test(text) && !/#EXTINF/i.test(text)) {
    throw new PlaylistParseError('La respuesta no parece una lista M3U.');
  }

  const lines = text.split(/\r?\n/);
  const entries = [];
  let pending = null;
  let order = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^#EXTINF/i.test(line)) {
      pending = parseExtinf(line);
      pending.vlcOptions = [];
      continue;
    }

    if (/^#EXTVLCOPT:/i.test(line) && pending) {
      const option = line.replace(/^#EXTVLCOPT:\s*/i, '').trim();
      if (option) pending.vlcOptions.push(option);
      continue;
    }

    if (line.startsWith('#')) continue;

    if (pending) {
      pending.url = line;
      pending.order = order;
      order += 1;
      entries.push(pending);
      pending = null;
    }
  }

  if (entries.length === 0) {
    throw new PlaylistParseError('La lista no contiene emisiones.');
  }

  const parsedUpdatedAt = parseUpdatedAt(text);
  const updatedAt = parsedUpdatedAt ?? nowWallClockTs(options.now || new Date());

  const timedEntries = [];
  const channelEntries = [];

  for (const entry of entries) {
    const time = parseTimePrefix(entry.name);
    const split = time ? splitMatchName(time.rest) : null;

    if (time && split && split.teams) {
      timedEntries.push({
        ...entry,
        ...time,
        ...split,
      });
    } else if (entry.name && !IGNORED_CHANNEL_RE.test(entry.name)) {
      channelEntries.push({
        name: entry.name,
        group: entry.group,
        logo: entry.logo,
        tvgId: entry.tvgId,
        url: entry.url,
        order: entry.order,
        vlcOptions: entry.vlcOptions,
      });
    }
  }

  assignSourceDates(timedEntries, updatedAt);

  const matchesByKey = new Map();

  for (const entry of timedEntries) {
    const teamsKey = entry.teams.toLocaleLowerCase('es');
    const key = `${entry.sourceTs}|${teamsKey}`;
    let match = matchesByKey.get(key);

    if (!match) {
      match = {
        id: key,
        teams: entry.teams,
        sourceTs: entry.sourceTs,
        displayTs: entry.sourceTs + DISPLAY_OFFSET_MS,
        order: entry.order,
        sources: [],
      };
      matchesByKey.set(key, match);
    }

    const alreadyPresent = match.sources.some(
      (source) => source.url === entry.url && source.channelLabel === entry.channelLabel,
    );

    if (!alreadyPresent) {
      match.sources.push({
        url: entry.url,
        channel: entry.channel,
        channelLabel: entry.channelLabel || entry.channel || 'Enlace',
        number: entry.number,
        logo: entry.logo,
        group: entry.group,
        vlcOptions: entry.vlcOptions,
      });
    }
  }

  const matches = [...matchesByKey.values()].sort(
    (a, b) => a.sourceTs - b.sourceTs || a.order - b.order,
  );

  const channelsByGroup = new Map();

  for (const entry of channelEntries) {
    if (!channelsByGroup.has(entry.group)) {
      channelsByGroup.set(entry.group, []);
    }

    const groupChannels = channelsByGroup.get(entry.group);
    const duplicate = groupChannels.some(
      (channel) => channel.name === entry.name && channel.url === entry.url,
    );

    if (!duplicate) {
      groupChannels.push({
        name: entry.name,
        group: entry.group,
        logo: entry.logo,
        tvgId: entry.tvgId,
        url: entry.url,
        vlcOptions: entry.vlcOptions,
      });
    }
  }

  const channelGroups = [...channelsByGroup.entries()].map(([title, channels]) => ({
    title,
    channels,
  }));

  const channels = channelGroups.flatMap((group) => group.channels);

  return {
    updatedAt,
    hasUpdatedAt: parsedUpdatedAt !== null,
    updatedAtDisplay: updatedAt + DISPLAY_OFFSET_MS,
    matches,
    channels,
    channelGroups,
    stats: {
      totalEntries: entries.length,
      matchCount: matches.length,
      sourceCount: matches.reduce((total, match) => total + match.sources.length, 0),
      channelCount: channels.length,
    },
  };
}
