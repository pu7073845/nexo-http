import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCE_ERRORS,
  normalizeSourceUrl,
  sourceErrorMessage,
  sourceHost,
} from '../js/source.js';

test('acepta una URL HTTPS', () => {
  assert.deepEqual(normalizeSourceUrl('https://example.com/list.m3u', 'https:'), {
    url: 'https://example.com/list.m3u',
    error: null,
  });
});

test('acepta HTTP si la página no es HTTPS', () => {
  assert.deepEqual(normalizeSourceUrl('http://example.com/list.m3u', 'http:'), {
    url: 'http://example.com/list.m3u',
    error: null,
  });
});

test('recorta espacios alrededor de la URL', () => {
  assert.equal(
    normalizeSourceUrl('  https://example.com/list.m3u  ', 'https:').url,
    'https://example.com/list.m3u',
  );
});

test('rechaza una URL vacía', () => {
  assert.deepEqual(normalizeSourceUrl('   ', 'https:'), {
    url: null,
    error: SOURCE_ERRORS.EMPTY,
  });
});

test('rechaza esquemas que no sean HTTP o HTTPS', () => {
  assert.equal(
    normalizeSourceUrl('ftp://example.com/list.m3u', 'https:').error,
    SOURCE_ERRORS.SCHEME,
  );
  assert.equal(
    normalizeSourceUrl('not-a-url', 'https:').error,
    SOURCE_ERRORS.INVALID,
  );
});

test('rechaza HTTP cuando la página usa HTTPS', () => {
  assert.equal(
    normalizeSourceUrl('http://example.com/list.m3u', 'https:').error,
    SOURCE_ERRORS.MIXED_CONTENT,
  );
});

test('extrae el host para mostrarlo en la interfaz', () => {
  assert.equal(sourceHost('https://example.com/list.m3u'), 'example.com');
  assert.equal(sourceHost('no-es-una-url'), '');
});

test('traduce los errores de fuente a mensajes', () => {
  assert.match(sourceErrorMessage(SOURCE_ERRORS.MIXED_CONTENT), /HTTPS/);
  assert.match(sourceErrorMessage(SOURCE_ERRORS.INVALID), /no es válida/);
});
