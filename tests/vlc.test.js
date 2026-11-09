import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVlcPlaylist, safeFileName } from '../js/vlc.js';

test('genera una entrada M3U con las opciones VLC', () => {
  const output = buildVlcPlaylist(
    'Canal de prueba',
    'http://example.com/live.ts',
    [
      'http-user-agent=TestUA',
      'http-cookie=mac=00:11:22:33:44:55; stb_lang=en',
      'http-header=Authorization: Bearer TESTTOKEN',
    ],
  );

  assert.equal(
    output,
    [
      '#EXTM3U',
      '#EXTINF:-1,Canal de prueba',
      '#EXTVLCOPT:http-user-agent=TestUA',
      '#EXTVLCOPT:http-cookie=mac=00:11:22:33:44:55; stb_lang=en',
      '#EXTVLCOPT:http-header=Authorization: Bearer TESTTOKEN',
      'http://example.com/live.ts',
      '',
    ].join('\n'),
  );
});

test('limpia saltos de línea en nombre y opciones', () => {
  const output = buildVlcPlaylist('Canal\nmalo', 'http://example.com/live.ts', [
    'http-user-agent=UA\nhttp-cookie=evil',
  ]);

  assert.equal(output.includes('Canal malo'), true);
  assert.equal(output.includes('http-user-agent=UA http-cookie=evil'), true);
  assert.equal(output.split('\n').length, 5);
});

test('genera nombres de archivo seguros', () => {
  assert.equal(safeFileName('┃UK┃ BBC 1 HEVC HD'), 'UK BBC 1 HEVC HD');
  assert.equal(safeFileName('Canal / con : caracteres ?'), 'Canal con caracteres');
  assert.equal(safeFileName(''), 'canal');
});
