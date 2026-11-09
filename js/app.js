import { parsePlaylist, PlaylistParseError } from './parser.js';
import { formatKickoff, formatUpdated, localDayKeys } from './time.js';
import {
  clearCache,
  clearSource,
  loadCache,
  loadSource,
  saveCache,
  saveSource,
} from './storage.js';
import {
  normalizeSourceUrl,
  sourceErrorMessage,
} from './source.js';
import { MediaPlayer } from './player.js';
import { codecWarning, formatCodecLabel } from './codecs.js';
import { buildVlcPlaylist, safeFileName } from './vlc.js';

const FETCH_TIMEOUT_MS = 20000;
const TOAST_DURATION_MS = 2600;

class HttpError extends Error {
  constructor(status, body) {
    super(`Error HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = String(body || '');
  }
}

const PLAY_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor"/>
  </svg>`;

const COPY_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="8.5" y="8.5" width="10.5" height="11.5" rx="2" stroke="currentColor" stroke-width="1.7"/>
    <path d="M15.5 8V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2H8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;

const OPEN_ICON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

const state = {
  playlist: null,
  fetchedAt: 0,
  loading: false,
  error: null,
  sourceUrl: null,
  tab: 'matches',
  search: '',
};

const elements = {
  statusLine: document.getElementById('status-line'),
  sourceBtn: document.getElementById('source-btn'),
  refreshBtn: document.getElementById('refresh-btn'),
  errorBanner: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),
  errorRetry: document.getElementById('error-retry'),
  errorClose: document.getElementById('error-close'),
  tabs: document.getElementById('tabs'),
  tabMatches: document.getElementById('tab-matches'),
  tabChannels: document.getElementById('tab-channels'),
  panelMatches: document.getElementById('panel-matches'),
  panelChannels: document.getElementById('panel-channels'),
  matchesCount: document.getElementById('matches-count'),
  channelsCount: document.getElementById('channels-count'),
  matchesList: document.getElementById('matches-list'),
  matchesEmpty: document.getElementById('matches-empty'),
  channelsList: document.getElementById('channels-list'),
  channelsEmpty: document.getElementById('channels-empty'),
  channelSearch: document.getElementById('channel-search'),
  loadingState: document.getElementById('loading-state'),
  failureState: document.getElementById('failure-state'),
  failureRetry: document.getElementById('failure-retry'),
  sourceSetup: document.getElementById('source-setup'),
  sourceSetupForm: document.getElementById('source-setup-form'),
  sourceSetupInput: document.getElementById('source-setup-input'),
  sourceSetupError: document.getElementById('source-setup-error'),
  sourceDialog: document.getElementById('source-dialog'),
  sourceForm: document.getElementById('source-form'),
  sourceInput: document.getElementById('source-input'),
  sourceError: document.getElementById('source-error'),
  sourceCancel: document.getElementById('source-cancel'),
  playerDialog: document.getElementById('player-dialog'),
  playerTitle: document.getElementById('player-title'),
  playerVideo: document.getElementById('player-video'),
  playerPlay: document.getElementById('player-play'),
  playerCodec: document.getElementById('player-codec'),
  playerError: document.getElementById('player-error'),
  playerWarning: document.getElementById('player-warning'),
  playerOpen: document.getElementById('player-open'),
  playerCopy: document.getElementById('player-copy'),
  playerVlc: document.getElementById('player-vlc'),
  playerClose: document.getElementById('player-close'),
  toast: document.getElementById('toast'),
};

let toastTimer = null;
let loadToken = 0;
let currentPlayerUrl = '';
let currentPlayerLabel = '';
let currentPlayerVlcOptions = [];

const mediaPlayer = new MediaPlayer(elements.playerVideo, {
  onError: (message) => showPlayerError(message),
  onCodecInfo: (info) => showCodecInfo(info),
});

function createIcon(svg) {
  const wrapper = document.createElement('span');
  wrapper.className = 'action-ico';
  wrapper.innerHTML = svg;
  return wrapper;
}

function normalizeSearch(value) {
  return String(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function setFormError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function clearFormError(element) {
  element.textContent = '';
  element.hidden = true;
}

function showPlayerError(message) {
  setFormError(elements.playerError, message);
  if (message) {
    elements.playerPlay.hidden = true;
  }
}

function showPlayerWarning(message) {
  setFormError(elements.playerWarning, message);
}

function showCodecInfo(info) {
  const label = formatCodecLabel(info?.videoCodec, info?.audioCodec);
  elements.playerCodec.textContent = label;
  elements.playerCodec.hidden = !label;

  const warning = codecWarning(info?.videoCodec, info?.audioCodec);
  showPlayerWarning(warning || '');
}

function syncPlayOverlay() {
  elements.playerPlay.hidden = !elements.playerDialog.open || !elements.playerVideo.paused;
}

function updateChrome() {
  const hasSource = Boolean(state.sourceUrl);
  const playlist = state.playlist;
  const hasMatches = Boolean(playlist && playlist.matches.length > 0);
  const showMatches = hasSource && hasMatches && state.tab === 'matches';

  elements.sourceSetup.hidden = hasSource;
  elements.tabs.hidden = !hasSource;
  elements.refreshBtn.disabled = !hasSource || state.loading;
  elements.refreshBtn.classList.toggle('is-loading', state.loading);
  elements.refreshBtn.setAttribute('aria-busy', String(state.loading));

  elements.matchesCount.textContent = playlist ? String(playlist.stats.matchCount) : '0';
  elements.channelsCount.textContent = playlist ? String(playlist.stats.channelCount) : '0';

  if (!hasSource) {
    elements.statusLine.textContent = 'Configura tu fuente M3U';
  } else if (state.loading) {
    elements.statusLine.textContent = playlist
      ? 'Actualizando la lista…'
      : 'Descargando la lista…';
  } else if (playlist) {
    const parts = [];
    if (hasMatches) {
      parts.push(pluralize(playlist.stats.matchCount, 'evento', 'eventos'));
      parts.push(pluralize(playlist.stats.sourceCount, 'enlace', 'enlaces'));
    }
    parts.push(pluralize(playlist.stats.channelCount, 'canal', 'canales'));
    if (playlist.hasUpdatedAt) {
      parts.push(`Lista ${formatUpdated(playlist.updatedAt)}`);
    }
    elements.statusLine.textContent = parts.join(' · ');
  } else {
    elements.statusLine.textContent = state.error
      ? 'No se pudo cargar la lista'
      : 'Sin datos';
  }

  elements.statusLine.title = elements.statusLine.textContent;

  elements.errorBanner.hidden = !hasSource || !state.error || !playlist;
  if (state.error) {
    elements.errorMessage.textContent = state.error;
  }

  elements.loadingState.hidden = !(hasSource && state.loading && !playlist);
  elements.failureState.hidden = !(hasSource && !playlist && !state.loading && !!state.error);

  elements.tabMatches.hidden = !hasMatches;
  elements.panelMatches.hidden = !showMatches;
  elements.panelChannels.hidden = !hasSource || showMatches;

  elements.tabMatches.setAttribute('aria-selected', String(showMatches));
  elements.tabChannels.setAttribute('aria-selected', String(!showMatches));
  elements.tabMatches.tabIndex = showMatches ? 0 : -1;
  elements.tabChannels.tabIndex = showMatches ? -1 : 0;

  if (!hasSource) {
    elements.matchesEmpty.hidden = true;
    elements.channelsEmpty.hidden = true;
  }
}

function buildSourceRow(label, url, vlcOptions = []) {
  const row = document.createElement('div');
  row.className = 'source-row';

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'source-btn play-source';
  play.dataset.url = url;
  play.dataset.label = label;
  play.vlcOptions = Array.isArray(vlcOptions) ? vlcOptions : [];
  play.title = `Reproducir ${label}`;
  play.setAttribute('aria-label', `Reproducir ${label}`);

  const name = document.createElement('span');
  name.className = 'source-name';
  name.textContent = label;

  const main = document.createElement('span');
  main.className = 'source-main';
  main.append(createIcon(PLAY_ICON_SVG), name);
  play.append(main);

  const open = document.createElement('a');
  open.className = 'copy-btn open-btn';
  open.href = url;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.title = `Abrir ${label} en pestaña nueva`;
  open.setAttribute('aria-label', `Abrir ${label} en pestaña nueva`);
  open.innerHTML = OPEN_ICON_SVG;

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy-btn';
  copy.dataset.url = url;
  copy.dataset.label = label;
  copy.title = `Copiar enlace de ${label}`;
  copy.setAttribute('aria-label', `Copiar enlace de ${label}`);
  copy.innerHTML = COPY_ICON_SVG;

  row.append(play, open, copy);
  return row;
}

function renderMatches() {
  elements.matchesList.replaceChildren();

  const playlist = state.playlist;
  if (!playlist) {
    elements.matchesEmpty.hidden = true;
    return;
  }

  const { today, tomorrow } = localDayKeys();
  const fragment = document.createDocumentFragment();

  for (const match of playlist.matches) {
    const kickoff = formatKickoff(match.displayTs, today, tomorrow);

    const card = document.createElement('article');
    card.className = 'match-card';

    const head = document.createElement('div');
    head.className = 'match-head';

    const kickoffBox = document.createElement('div');
    kickoffBox.className = 'kickoff';
    kickoffBox.title = `${kickoff.weekday} ${kickoff.dateLabel} · ${kickoff.time}`;

    const day = document.createElement('span');
    day.className = 'kickoff-day';
    day.textContent = kickoff.dayLabel;

    const time = document.createElement('span');
    time.className = 'kickoff-time';
    time.textContent = kickoff.time;

    kickoffBox.append(day, time);

    const title = document.createElement('h2');
    title.className = 'match-title';
    title.textContent = match.teams;

    const sourceCount = document.createElement('span');
    sourceCount.className = 'source-count';
    sourceCount.textContent = pluralize(match.sources.length, 'canal', 'canales');

    head.append(kickoffBox, title, sourceCount);

    const sources = document.createElement('div');
    sources.className = 'sources';

    for (const source of match.sources) {
      sources.append(buildSourceRow(source.channelLabel, source.url, source.vlcOptions));
    }

    card.append(head, sources);
    fragment.append(card);
  }

  elements.matchesList.append(fragment);
  elements.matchesEmpty.hidden = playlist.matches.length !== 0;
}

function renderChannels() {
  elements.channelsList.replaceChildren();

  const playlist = state.playlist;
  if (!playlist) {
    elements.channelsEmpty.hidden = true;
    return;
  }

  const query = normalizeSearch(state.search);
  const fragment = document.createDocumentFragment();
  let visibleChannels = 0;

  for (const group of playlist.channelGroups) {
    const channels = query
      ? group.channels.filter((channel) =>
          normalizeSearch(`${channel.name} ${group.title}`).includes(query),
        )
      : group.channels;

    if (channels.length === 0) continue;

    visibleChannels += channels.length;

    const section = document.createElement('section');
    section.className = 'channel-group';

    const heading = document.createElement('h2');
    heading.className = 'channel-group-title';
    heading.textContent = group.title;

    const count = document.createElement('span');
    count.className = 'channel-group-count';
    count.textContent = String(channels.length);
    heading.append(count);

    const grid = document.createElement('div');
    grid.className = 'channel-grid';

    for (const channel of channels) {
      grid.append(buildSourceRow(channel.name, channel.url, channel.vlcOptions));
    }

    section.append(heading, grid);
    fragment.append(section);
  }

  elements.channelsList.append(fragment);

  const emptyTitle = elements.channelsEmpty.querySelector('.state-title');
  const emptyText = elements.channelsEmpty.querySelector('.state-text');

  if (query) {
    emptyTitle.textContent = 'Sin resultados';
    emptyText.textContent = 'No hay canales que coincidan con tu búsqueda.';
  } else {
    emptyTitle.textContent = 'No hay canales';
    emptyText.textContent = 'La lista no contiene canales sueltos.';
  }

  elements.channelsEmpty.hidden = visibleChannels !== 0;
}

function render() {
  renderMatches();
  renderChannels();
  updateChrome();
}

function switchTab(tab) {
  const hasMatches = Boolean(state.playlist && state.playlist.matches.length > 0);
  state.tab = tab === 'matches' && hasMatches ? 'matches' : 'channels';
  updateChrome();
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);

  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.classList.add('is-visible');

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, TOAST_DURATION_MS);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Se intenta el método clásico más abajo.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';

  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) throw new Error('No se pudo copiar');
}

async function handleCopyClick(event) {
  const button = event.target.closest('button.copy-btn');
  if (!button) return;

  const url = button.dataset.url;
  const label = button.dataset.label || '';

  if (!url) return;

  try {
    await copyText(url);
    button.classList.add('copied');
    window.setTimeout(() => button.classList.remove('copied'), 900);
    showToast(`Enlace copiado${label ? ` · ${label}` : ''}`);
  } catch {
    showToast('No se pudo copiar el enlace', true);
  }
}

function handlePlayClick(event) {
  const button = event.target.closest('button.play-source');
  if (!button) return;

  const url = button.dataset.url;
  if (!url) return;

  openPlayer(
    url,
    button.dataset.label || 'Canal',
    Array.isArray(button.vlcOptions) ? button.vlcOptions : [],
  );
}

function openPlayer(url, label, vlcOptions = []) {
  currentPlayerUrl = url;
  currentPlayerLabel = label;
  currentPlayerVlcOptions = Array.isArray(vlcOptions) ? vlcOptions : [];

  elements.playerTitle.textContent = label || 'Canal';
  elements.playerOpen.href = url;
  elements.playerCodec.textContent = '';
  elements.playerCodec.hidden = true;
  showPlayerError('');
  showPlayerWarning('');

  if (typeof elements.playerDialog.showModal === 'function') {
    elements.playerDialog.showModal();
  } else {
    elements.playerDialog.setAttribute('open', '');
  }

  syncPlayOverlay();

  if (window.location.protocol === 'https:' && /^http:\/\//i.test(url)) {
    showPlayerError('Este enlace usa HTTP y la PWA está en HTTPS. Ábrelo en localhost o descarga el M3U para VLC.');
    return;
  }

  mediaPlayer.play(url).catch(() => {
    // El error se muestra mediante onError.
  });
}

function closePlayer() {
  if (typeof elements.playerDialog.close === 'function') {
    elements.playerDialog.close();
  } else {
    elements.playerDialog.removeAttribute('open');
    mediaPlayer.stop();
    elements.playerPlay.hidden = true;
  }
}

async function copyPlayerUrl() {
  if (!currentPlayerUrl) return;

  try {
    await copyText(currentPlayerUrl);
    showToast(`Enlace copiado${currentPlayerLabel ? ` · ${currentPlayerLabel}` : ''}`);
  } catch {
    showToast('No se pudo copiar el enlace', true);
  }
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'audio/x-mpegurl;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadVlcM3u() {
  if (!currentPlayerUrl) return;

  const content = buildVlcPlaylist(
    currentPlayerLabel,
    currentPlayerUrl,
    currentPlayerVlcOptions,
  );

  downloadText(`${safeFileName(currentPlayerLabel)}.m3u`, content);
  showToast('M3U para VLC descargado');
}

async function fetchPlaylistText(sourceUrl) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = new URL(sourceUrl);
    url.searchParams.set('_', String(Date.now()));

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'text/plain, */*' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new HttpError(response.status, body);
    }

    return await response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

function describeError(error) {
  if (error instanceof PlaylistParseError) {
    return `La lista no tiene el formato esperado. ${error.message}`;
  }

  if (error instanceof HttpError) {
    if (error.status === 429) {
      return 'Demasiadas solicitudes al proveedor. Espera unos minutos y reintenta.';
    }
    if (error.status === 503 || error.body.toLowerCase().includes('provider-cap')) {
      return 'La fuente no está disponible en el proveedor. Prueba más tarde.';
    }
    return `La fuente devolvió un error HTTP ${error.status}.`;
  }

  if (error.name === 'AbortError') {
    return state.playlist
      ? 'La descarga tardó demasiado. Se muestra la última lista guardada.'
      : 'La descarga tardó demasiado. Comprueba tu conexión.';
  }

  if (error instanceof TypeError) {
    return state.playlist
      ? 'No se pudo actualizar la fuente. Se muestra la última copia guardada.'
      : 'No se pudo acceder a la fuente. Comprueba la URL, el DNS/VPN, el CORS o la conexión.';
  }

  return state.playlist
    ? 'No se pudo actualizar la lista. Se muestra la última copia guardada.'
    : 'No se pudo cargar la lista. Comprueba tu conexión e inténtalo de nuevo.';
}

async function loadPlaylist() {
  if (!state.sourceUrl) {
    render();
    return;
  }

  if (state.loading) return;

  const token = ++loadToken;
  const sourceUrl = state.sourceUrl;

  state.loading = true;
  state.error = null;
  updateChrome();

  try {
    const text = await fetchPlaylistText(sourceUrl);
    if (token !== loadToken) return;

    const playlist = parsePlaylist(text);

    if (playlist.matches.length === 0 && playlist.channels.length === 0) {
      throw new PlaylistParseError('No se encontraron canales.');
    }

    state.playlist = playlist;
    state.fetchedAt = Date.now();
    state.error = null;

    if (playlist.matches.length === 0) {
      state.tab = 'channels';
    }

    saveCache(text, state.fetchedAt);
  } catch (error) {
    if (token !== loadToken) return;
    state.error = describeError(error);
  } finally {
    if (token === loadToken) {
      state.loading = false;
      render();
    }
  }
}

function openSourceDialog() {
  if (!state.sourceUrl) {
    elements.sourceSetup.hidden = false;
    elements.sourceSetupInput.focus();
    return;
  }

  elements.sourceInput.value = state.sourceUrl;
  clearFormError(elements.sourceError);

  if (typeof elements.sourceDialog.showModal === 'function') {
    elements.sourceDialog.showModal();
  } else {
    elements.sourceDialog.setAttribute('open', '');
  }

  elements.sourceInput.focus();
  elements.sourceInput.select();
}

function closeSourceDialog() {
  if (typeof elements.sourceDialog.close === 'function') {
    elements.sourceDialog.close();
  } else {
    elements.sourceDialog.removeAttribute('open');
  }
}

function applySourceUrl(url) {
  const changed = url !== state.sourceUrl;

  state.sourceUrl = url;
  saveSource(url);

  if (changed) {
    loadToken += 1;
    state.playlist = null;
    state.fetchedAt = 0;
    state.error = null;
    state.loading = false;
    state.search = '';
    state.tab = 'matches';
    elements.channelSearch.value = '';
    clearCache();

    if (elements.playerDialog.open) {
      closePlayer();
    }
  }

  closeSourceDialog();
  elements.sourceSetup.hidden = true;
  elements.tabs.hidden = false;
  render();
  loadPlaylist();
}

function handleSourceSubmit(raw, errorElement, onSuccess) {
  const { url, error } = normalizeSourceUrl(raw, window.location.protocol);

  if (error) {
    setFormError(errorElement, sourceErrorMessage(error));
    return;
  }

  clearFormError(errorElement);
  onSuccess(url);
}

function clearError() {
  state.error = null;
  updateChrome();
}

function init() {
  const storedSource = loadSource();

  if (storedSource) {
    const { url, error } = normalizeSourceUrl(storedSource, window.location.protocol);
    if (error) {
      clearSource();
      clearCache();
      state.sourceUrl = null;
    } else {
      state.sourceUrl = url;
      saveSource(url);
    }
  }

  if (state.sourceUrl) {
    const cache = loadCache();
    if (cache) {
      try {
        state.playlist = parsePlaylist(cache.text);
        state.fetchedAt = cache.fetchedAt;
        if (state.playlist.matches.length === 0) {
          state.tab = 'channels';
        }
      } catch {
        state.playlist = null;
      }
    }
  } else {
    clearCache();
  }

  switchTab(state.tab);
  render();

  elements.refreshBtn.addEventListener('click', () => {
    if (!state.sourceUrl) {
      elements.sourceSetupInput.focus();
      return;
    }
    loadPlaylist();
  });
  elements.errorRetry.addEventListener('click', () => loadPlaylist());
  elements.failureRetry.addEventListener('click', () => loadPlaylist());
  elements.errorClose.addEventListener('click', clearError);
  elements.sourceBtn.addEventListener('click', openSourceDialog);

  elements.sourceSetupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSourceSubmit(
      elements.sourceSetupInput.value,
      elements.sourceSetupError,
      (url) => applySourceUrl(url),
    );
  });

  elements.sourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSourceSubmit(
      elements.sourceInput.value,
      elements.sourceError,
      (url) => applySourceUrl(url),
    );
  });

  elements.sourceCancel.addEventListener('click', closeSourceDialog);
  elements.sourceDialog.addEventListener('click', (event) => {
    if (event.target === elements.sourceDialog) {
      closeSourceDialog();
    }
  });

  elements.tabMatches.addEventListener('click', () => switchTab('matches'));
  elements.tabChannels.addEventListener('click', () => switchTab('channels'));

  elements.tabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (elements.tabMatches.hidden) return;

    event.preventDefault();
    const nextTab = state.tab === 'matches' ? 'channels' : 'matches';
    switchTab(nextTab);
    (nextTab === 'matches' ? elements.tabMatches : elements.tabChannels).focus();
  });

  elements.channelSearch.addEventListener('input', (event) => {
    state.search = event.target.value;
    renderChannels();
  });

  elements.matchesList.addEventListener('click', (event) => {
    handlePlayClick(event);
    handleCopyClick(event);
  });
  elements.channelsList.addEventListener('click', (event) => {
    handlePlayClick(event);
    handleCopyClick(event);
  });

  elements.playerClose.addEventListener('click', closePlayer);
  elements.playerDialog.addEventListener('click', (event) => {
    if (event.target === elements.playerDialog) {
      closePlayer();
    }
  });
  elements.playerDialog.addEventListener('close', () => {
    mediaPlayer.stop();
    currentPlayerUrl = '';
    currentPlayerLabel = '';
    currentPlayerVlcOptions = [];
    elements.playerPlay.hidden = true;
    elements.playerCodec.textContent = '';
    elements.playerCodec.hidden = true;
    showPlayerWarning('');
  });
  elements.playerPlay.addEventListener('click', () => {
    elements.playerVideo.play().catch(() => {
      // Si el manifiesto aún no está listo, el usuario puede volver a pulsar.
    });
  });
  elements.playerVideo.addEventListener('play', syncPlayOverlay);
  elements.playerVideo.addEventListener('pause', syncPlayOverlay);
  elements.playerVideo.addEventListener('loadeddata', syncPlayOverlay);
  elements.playerCopy.addEventListener('click', copyPlayerUrl);
  elements.playerVlc.addEventListener('click', downloadVlcM3u);
  elements.playerVideo.addEventListener('error', () => {
    if (!elements.playerDialog.open) return;
    if (!elements.playerVideo.currentSrc && !elements.playerVideo.src) return;
    showPlayerError('No se pudo reproducir en el navegador. Usa Abrir o VLC.');
  });

  if (state.sourceUrl) {
    loadPlaylist();
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Sin service worker la app sigue funcionando con la caché local.
      });
    });
  }
}

init();
