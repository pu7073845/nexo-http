import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PlaylistParseError,
  parsePlaylist,
  parseTimePrefix,
  splitMatchName,
} from '../js/parser.js';
import {
  DISPLAY_OFFSET_MS,
  formatKickoff,
  formatUpdated,
  localDayKeys,
  parseUpdatedAt,
  wallClockParts,
} from '../js/time.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(here, 'fixtures', 'tricky.m3u'), 'utf8');

const playlist = parsePlaylist(fixture);

test('lee la fecha de la cabecera', () => {
  assert.equal(
    parseUpdatedAt('# 🕒 Last Updated: 2026-11-07 07:38:42 AM'),
    Date.UTC(2026, 10, 7, 7, 38, 42),
  );
});

test('interpreta correctamente AM y PM', () => {
  assert.equal(
    parseUpdatedAt('Last Updated: 2026-11-07 12:05:00 AM'),
    Date.UTC(2026, 10, 7, 0, 5, 0),
  );
  assert.equal(
    parseUpdatedAt('Last Updated: 2026-11-07 12:05:00 PM'),
    Date.UTC(2026, 10, 7, 12, 5, 0),
  );
});

test('parsea la hora inicial del nombre', () => {
  assert.deepEqual(parseTimePrefix('6h00 Equipo Á vs Equipo B 1 SEÑAL 3'), {
    hour: 6,
    minute: 0,
    minutes: 360,
    rest: 'Equipo Á vs Equipo B 1 SEÑAL 3',
  });
  assert.equal(parseTimePrefix('CANAL NOTICIAS'), null);
  assert.equal(parseTimePrefix('25h00 algo'), null);
});

test('separa equipos y canal sin romper nombres con números', () => {
  assert.deepEqual(splitMatchName('Equipo Á vs Equipo B 2 CANAL 5 50FPS'), {
    teams: 'Equipo Á vs Equipo B',
    channel: 'CANAL 5 50FPS',
    channelLabel: 'CANAL 5 50FPS',
    flags: '',
    number: 2,
  });

  assert.deepEqual(splitMatchName('Equipo Ñ vs Equipo 98 2 CANAL 1 4K'), {
    teams: 'Equipo Ñ vs Equipo 98',
    channel: 'CANAL 1 4K',
    channelLabel: 'CANAL 1 4K',
    flags: '',
    number: 2,
  });

  assert.deepEqual(splitMatchName('Equipo 05 vs Equipo E 1 CANAL 2'), {
    teams: 'Equipo 05 vs Equipo E',
    channel: 'CANAL 2',
    channelLabel: 'CANAL 2',
    flags: '',
    number: 1,
  });
});

test('conserva las banderas en la etiqueta del canal', () => {
  const parsed = splitMatchName('EQUIPO C vs EQUIPO D 2 CANAL 1 🇵🇹');
  assert.equal(parsed.teams, 'EQUIPO C vs EQUIPO D');
  assert.equal(parsed.channel, 'CANAL 1');
  assert.equal(parsed.flags, '🇵🇹');
  assert.equal(parsed.channelLabel, 'CANAL 1 🇵🇹');
});

test('agrupa las emisiones por evento', () => {
  assert.equal(playlist.stats.totalEntries, 13);
  assert.equal(playlist.stats.matchCount, 7);
  assert.equal(playlist.stats.sourceCount, 9);
  assert.equal(playlist.stats.channelCount, 3);

  const first = playlist.matches.find((match) => match.teams === 'Equipo Á vs Equipo B');
  assert.ok(first);
  assert.equal(first.sources.length, 2);
  assert.deepEqual(
    first.sources.map((source) => source.channelLabel),
    ['SEÑAL 3', 'CANAL 5 50FPS'],
  );

  const second = playlist.matches.find((match) => match.teams === 'Equipo Ñ vs Equipo 98');
  assert.ok(second);
  assert.deepEqual(
    second.sources.map((source) => source.channelLabel),
    ['CANAL 1', 'CANAL 1 4K'],
  );
});

test('conserva las opciones VLC de cada entrada', () => {
  const first = playlist.matches.find((match) => match.teams === 'Equipo Á vs Equipo B');
  assert.deepEqual(first.sources[0].vlcOptions, [
    'http-user-agent=TestUA',
    'http-cookie=mac=00:11:22:33:44:55; stb_lang=en',
    'http-header=Authorization: Bearer TESTTOKEN',
  ]);

  const channel = playlist.channels.find((item) => item.name === 'CANAL NOTICIAS');
  assert.deepEqual(channel.vlcOptions, [
    'http-user-agent=FixtureUA',
    'http-referrer=https://example.com/ref',
  ]);
});

test('ordena los eventos por hora real y asigna el cambio de día', () => {
  const expected = [
    ['Equipo Á vs Equipo B', '00:00'],
    ['Equipo Ñ vs Equipo 98', '13:00'],
    ['EQUIPO C vs EQUIPO D', '13:30'],
    ['Equipo 05 vs Equipo E', '15:30'],
    ['Equipo F vs Equipo G', '17:30'],
    ['Equipo H vs Equipo I', '18:00'],
    ['Equipo J vs Equipo K', '21:00'],
  ];

  const actual = playlist.matches.map((match) => {
    const parts = wallClockParts(match.displayTs);
    return [
      match.teams,
      `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`,
    ];
  });

  assert.deepEqual(actual, expected);
});

test('aplica el desfase de -6 horas', () => {
  const first = playlist.matches[0];
  assert.equal(first.displayTs - first.sourceTs, DISPLAY_OFFSET_MS);

  const p = wallClockParts(first.displayTs);
  assert.equal(p.hour, 0);
  assert.equal(p.minute, 0);
});

test('genera etiquetas Hoy, Mañana y fecha corta', () => {
  const todayKey = '2026-11-07';
  const tomorrowKey = '2026-11-08';

  const today = formatKickoff(Date.UTC(2026, 10, 7, 20, 30), todayKey, tomorrowKey);
  assert.equal(today.dayLabel, 'Hoy');
  assert.equal(today.time, '20:30');

  const tomorrow = formatKickoff(Date.UTC(2026, 10, 8, 0, 30), todayKey, tomorrowKey);
  assert.equal(tomorrow.dayLabel, 'Mañana');
  assert.equal(tomorrow.time, '00:30');

  const later = formatKickoff(Date.UTC(2026, 10, 9, 3, 5), todayKey, tomorrowKey);
  assert.equal(later.dayLabel, 'lun 9 nov');
  assert.equal(later.time, '03:05');
});

test('localDayKeys devuelve claves consecutivas', () => {
  const keys = localDayKeys(new Date(2026, 10, 7, 10, 0, 0));
  assert.deepEqual(keys, { today: '2026-11-07', tomorrow: '2026-11-08' });
});

test('formatea la actualización con el desfase aplicado', () => {
  assert.equal(formatUpdated(playlist.updatedAt), '07/11 · 01:38');
});

test('separa canales sueltos y respeta el orden de grupos', () => {
  assert.deepEqual(
    playlist.channelGroups.map((group) => group.title),
    ['General', '4K'],
  );
  assert.deepEqual(
    playlist.channelGroups.map((group) => group.channels.length),
    [2, 1],
  );
  assert.equal(playlist.channels[0].name, 'CANAL NOTICIAS');
  assert.equal(playlist.channels[1].name, 'CANAL 2 🇨🇿');
});

test('indica si la lista trae fecha de actualización', () => {
  assert.equal(playlist.hasUpdatedAt, true);

  const withoutHeader = parsePlaylist(
    '#EXTM3U\n#EXTINF:-1 group-title="General",CANAL 1\nhttps://example.com/stream/1.m3u8',
  );
  assert.equal(withoutHeader.hasUpdatedAt, false);
});

test('rechaza contenido que no es M3U', () => {
  assert.throws(
    () => parsePlaylist('<html>no soy una lista</html>'),
    (error) => error instanceof PlaylistParseError,
  );
  assert.throws(() => parsePlaylist(''), PlaylistParseError);
});
