import test from 'node:test';
import assert from 'node:assert/strict';

import { detectMediaKind, describeHlsError, describeMpegtsError } from '../js/player.js';
import {
  codecWarning,
  formatCodecLabel,
  normalizeAudioCodec,
  normalizeVideoCodec,
} from '../js/codecs.js';

test('detecta HLS por la extensión m3u8', () => {
  assert.equal(detectMediaKind('https://example.com/live/channel.m3u8'), 'hls');
  assert.equal(
    detectMediaKind('https://example.com/live/channel.m3u8?token=abc'),
    'hls',
  );
  assert.equal(detectMediaKind('https://example.com/live/channel.M3U8'), 'hls');
  assert.equal(
    detectMediaKind('http://line.example/play/live.php?stream=1&extension=m3u8'),
    'hls',
  );
});

test('detecta MPEG-TS directo', () => {
  assert.equal(detectMediaKind('http://example.com/live/channel.ts'), 'ts');
  assert.equal(
    detectMediaKind('http://line.example/play/live.php?mac=aa&stream=1&extension=ts&play_token=x'),
    'ts',
  );
  assert.equal(
    detectMediaKind('http://line.example/play/live.php?extension=TS&stream=1'),
    'ts',
  );
});

test('detecta vídeo directo', () => {
  assert.equal(detectMediaKind('https://example.com/video.mp4'), 'video');
  assert.equal(detectMediaKind('https://example.com/video.webm?x=1'), 'video');
  assert.equal(detectMediaKind('https://example.com/video.m4v'), 'video');
});

test('marca como desconocidos los formatos no soportados', () => {
  assert.equal(detectMediaKind('https://example.com/live'), 'unknown');
  assert.equal(detectMediaKind('no-es-una-url'), 'unknown');
});

test('normaliza códecs de HLS y MPEG-TS', () => {
  assert.equal(normalizeVideoCodec('avc1.64001f'), 'avc');
  assert.equal(normalizeVideoCodec('hvc1.1.6.L93.B0'), 'hevc');
  assert.equal(normalizeVideoCodec('HEVC'), 'hevc');
  assert.equal(normalizeAudioCodec('mp4a.40.2'), 'aac');
  assert.equal(normalizeAudioCodec('ec-3'), 'eac3');
  assert.equal(normalizeAudioCodec('ac-3'), 'ac3');
  assert.equal(normalizeAudioCodec('mp2'), 'mp2');
});

test('formatea la etiqueta de códecs', () => {
  assert.equal(formatCodecLabel('avc1.64001f', 'mp4a.40.2'), 'H.264 · AAC');
  assert.equal(formatCodecLabel('hvc1.1.6.L93.B0', 'ec-3'), 'HEVC · E-AC-3');
});

test('avisa cuando HEVC o E-AC-3 no están soportados', () => {
  const noCodecs = () => false;

  assert.match(codecWarning('hvc1.1.6.L93.B0', 'mp4a.40.2', noCodecs), /HEVC/);
  assert.match(codecWarning('avc1.64001f', 'ec-3', noCodecs), /E-AC-3/);
  assert.match(codecWarning('avc1.64001f', 'ac-3', noCodecs), /AC-3/);
  assert.equal(codecWarning('avc1.64001f', 'mp4a.40.2', noCodecs), null);
});

test('no avisa si el navegador soporta el códec', () => {
  const supportsEverything = () => true;
  assert.equal(codecWarning('hvc1.1.6.L93.B0', 'ec-3', supportsEverything), null);
});

test('traduce errores HLS de 429, 503 y provider-cap', () => {
  assert.match(describeHlsError({ response: { code: 429 } }), /Demasiadas solicitudes/);
  assert.match(describeHlsError({ response: { code: 503 } }), /no disponible/);
  assert.match(
    describeHlsError({ details: 'manifestParsingError', response: { text: 'provider-cap' } }),
    /no disponible/,
  );
});

test('traduce errores HLS de manifiesto y códec', () => {
  assert.match(
    describeHlsError({ details: 'manifestParsingError' }),
    /manifiesto HLS/,
  );
  assert.match(
    describeHlsError({ details: 'bufferAddCodecError' }),
    /códec/,
  );
});

test('traduce errores de red y códec de mpegts.js', () => {
  assert.match(
    describeMpegtsError('NetworkError', 'NetworkError', { msg: 'connection failed' }),
    /DNS\/VPN/,
  );
  assert.match(
    describeMpegtsError('MediaError', 'MediaMSEError', { code: 9 }),
    /códec/,
  );
  assert.match(
    describeMpegtsError('NetworkError', 'NetworkError', { code: 429 }),
    /Demasiadas solicitudes/,
  );
});
