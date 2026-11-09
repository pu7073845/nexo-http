/**
 * Utilidades de fecha/hora para la lista M3U.
 *
 * Las horas de la lista están en la zona horaria de origen (Vietnam) y el
 * usuario indicó que van 6 horas por delante de su hora local. Para evitar
 * problemas con el cambio de horario del dispositivo, todo el cálculo se hace
 * como "hora de reloj" usando Date.UTC() y leyendo después con getUTC*().
 */

export const DISPLAY_OFFSET_HOURS = -6;
export const DISPLAY_OFFSET_MS = DISPLAY_OFFSET_HOURS * 60 * 60 * 1000;

const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const WEEKDAYS_SHORT = [
  'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb',
];

const pad = (value) => String(value).padStart(2, '0');

/**
 * Convierte la fecha de la cabecera "Last Updated" en una marca de tiempo
 * de reloj (UTC) sin aplicar todavía el desfase de -6 h.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function parseUpdatedAt(text) {
  if (typeof text !== 'string') return null;

  const match = text.match(
    /Last Updated:\s*(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i,
  );
  if (!match) return null;

  let hour = Number(match[4]);
  const ampm = match[7] ? match[7].toUpperCase() : null;

  if (ampm === 'PM' && hour < 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    hour,
    Number(match[5]),
    Number(match[6] || 0),
  );
}

/**
 * Marca de tiempo de reloj correspondiente al "ahora" local. Sirve como
 * respaldo cuando la lista no trae cabecera.
 *
 * @param {Date} [now]
 * @returns {number}
 */
export function nowWallClockTs(now = new Date()) {
  return Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  );
}

/**
 * Asigna una fecha a cada entrada con hora. La lista es cronológica y puede
 * cruzar la medianoche (23h30 -> 0h00), por lo que se incrementa el día cuando
 * la hora vuelve hacia atrás.
 *
 * @param {Array<{minutes:number}>} entries
 * @param {number} updatedWallTs
 */
export function assignSourceDates(entries, updatedWallTs) {
  const anchor = new Date(updatedWallTs);
  let currentDay = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
  );

  let previousMinutes = null;
  const firstEntryWindowMs = 12 * 60 * 60 * 1000;

  for (const entry of entries) {
    if (!Number.isFinite(entry.minutes)) continue;

    const minuteMs = entry.minutes * 60 * 1000;
    let sourceTs;

    if (previousMinutes === null) {
      sourceTs = currentDay + minuteMs;
      // Si la primera entrada está muchas horas por detrás de la actualización,
      // en realidad pertenece al día siguiente (lista publicada de madrugada).
      if (sourceTs < updatedWallTs - firstEntryWindowMs) {
        sourceTs += 24 * 60 * 60 * 1000;
      }
      currentDay = sourceTs - minuteMs;
    } else {
      if (entry.minutes < previousMinutes) {
        currentDay += 24 * 60 * 60 * 1000;
      }
      sourceTs = currentDay + minuteMs;
    }

    entry.sourceTs = sourceTs;
    entry.displayTs = sourceTs + DISPLAY_OFFSET_MS;
    previousMinutes = entry.minutes;
  }
}

/**
 * @param {number} wallTs
 */
export function wallClockParts(wallTs) {
  const date = new Date(wallTs);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    weekday: date.getUTCDay(),
  };
}

/**
 * @param {{year:number, month:number, day:number}} parts
 * @returns {string} YYYY-MM-DD
 */
export function dateKey(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/**
 * Claves de hoy y mañana según el reloj local del dispositivo.
 *
 * @param {Date} [now]
 * @returns {{today:string, tomorrow:string}}
 */
export function localDayKeys(now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const tomorrow = new Date(year, month, day + 1);

  return {
    today: `${year}-${pad(month + 1)}-${pad(day)}`,
    tomorrow: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
  };
}

/**
 * Etiqueta y hora visibles de un evento.
 *
 * @param {number} displayTs marca de tiempo ya desplazada -6 h
 * @param {string} todayKey
 * @param {string} tomorrowKey
 * @returns {{dayLabel:string, time:string, dateLabel:string, key:string, weekday:string}}
 */
export function formatKickoff(displayTs, todayKey, tomorrowKey) {
  const parts = wallClockParts(displayTs);
  const key = dateKey(parts);
  const dateLabel = `${parts.day} ${MONTHS_SHORT[parts.month - 1]}`;
  const weekday = WEEKDAYS_SHORT[parts.weekday];

  let dayLabel;
  if (key === todayKey) {
    dayLabel = 'Hoy';
  } else if (key === tomorrowKey) {
    dayLabel = 'Mañana';
  } else {
    dayLabel = `${weekday} ${dateLabel}`;
  }

  return {
    dayLabel,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    dateLabel,
    key,
    weekday,
  };
}

/**
 * Texto de "última actualización" aplicando el mismo desfase de -6 h.
 *
 * @param {number} updatedWallTs
 * @returns {string} DD/MM · HH:mm
 */
export function formatUpdated(updatedWallTs) {
  const parts = wallClockParts(updatedWallTs + DISPLAY_OFFSET_MS);
  return `${pad(parts.day)}/${pad(parts.month)} · ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Fecha y hora completas, por si se necesitan en el futuro.
 *
 * @param {number} displayTs
 * @returns {string} DD/MM/YYYY HH:mm
 */
export function formatFullDateTime(displayTs) {
  const parts = wallClockParts(displayTs);
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year} · ${pad(parts.hour)}:${pad(parts.minute)}`;
}
