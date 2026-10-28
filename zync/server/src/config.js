// Zentrale Einstellungen (über Umgebungsvariablen anpassbar).
import path from 'node:path';

export const TZ = process.env.ZYNC_TZ || 'Europe/Berlin';

/** Datenordner (SQLite-Datenbank + Uploads). */
export const DATA_DIR = path.resolve(process.env.ZYNC_DATA || path.join(import.meta.dirname, '..', 'data'));
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const DB_FILE = path.join(DATA_DIR, 'zync.db');

/** Benutzernamen mit „Zync Owner“-Badge (kommagetrennt). Standard: der Erfinder von Zync. */
export const OWNERS = (process.env.ZYNC_OWNERS || 'coolersteinyt').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Kalendertag in der App-Zeitzone als 'YYYY-MM-DD'. */
export const dayKey = (ts = Date.now()) => dayFmt.format(ts);
export const yesterdayKey = (ts = Date.now()) => dayKey(ts - 86_400_000);

/** Minute des Tages (0–1439) in der App-Zeitzone. */
export function minuteOfDay(ts = Date.now()) {
  const [h, m] = timeFmt.format(ts).split(':').map(Number);
  return h * 60 + m;
}

/** Millisekunden bis zum nächsten Tageswechsel (für den Reset der Aufgaben). */
export function msUntilMidnight(ts = Date.now()) {
  const [h, m, s] = timeFmt.format(ts).split(':').map(Number);
  return ((23 - h) * 3600 + (59 - m) * 60 + (60 - s)) * 1000;
}
