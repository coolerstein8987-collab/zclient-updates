// Dauerhafte Sicherung für Hosts ohne festen Speicher (z. B. Render Free, dort ist bei jedem
// Neustart alles weg): Datenbank-Snapshot und Uploads landen in einer Postgres-Datenbank
// (kostenlos z. B. bei Neon oder Supabase). Aktiv, sobald ZYNC_BACKUP_URL gesetzt ist.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import pg from 'pg';
import { DATA_DIR, UPLOAD_DIR, DB_FILE } from './config.js';

const URL = (process.env.ZYNC_BACKUP_URL || '').trim();
const EVERY_MS = Math.max(10, Number(process.env.ZYNC_BACKUP_EVERY) || 180) * 1000;
const MAX_FILE = (Number(process.env.ZYNC_BACKUP_MAX_FILE_MB) || 20) * 1024 * 1024;
const DB_KEY = 'db/zync.db.gz';
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export const backupEnabled = !!URL;
let pool = null;
let ready = false; // Snapshots erst schreiben, wenn klar ist, dass wir kein älteres Backup überschreiben
const savedUploads = new Set();
const restoring = new Map();

const log = (...a) => console.log('💾 Backup:', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makePool() {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(URL);
  const ssl = /sslmode=/.test(URL) || local ? undefined : { rejectUnauthorized: false };
  const p = new pg.Pool({ connectionString: URL, ssl, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 20_000 });
  p.on('error', (e) => log('Verbindungsfehler', e.message));
  return p;
}

/** Vor dem Öffnen der Datenbank aufrufen: holt nach einem frischen Start den letzten Stand zurück. */
export async function restoreBackup() {
  if (!backupEnabled) return;
  pool = makePool();
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS zync_backup (
        name TEXT PRIMARY KEY, data BYTEA NOT NULL, size INTEGER NOT NULL, updated_at BIGINT NOT NULL)`);
      const { rows } = await pool.query("SELECT name FROM zync_backup WHERE name LIKE 'uploads/%'");
      for (const r of rows) savedUploads.add(r.name.slice('uploads/'.length));
      if (fs.existsSync(DB_FILE)) {
        log('lokale Datenbank vorhanden – kein Wiederherstellen nötig');
      } else {
        const { rows: [snap] } = await pool.query('SELECT data, updated_at FROM zync_backup WHERE name = $1', [DB_KEY]);
        if (snap) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
          for (const ext of ['-wal', '-shm']) fs.rmSync(DB_FILE + ext, { force: true });
          const tmp = `${DB_FILE}.restore`;
          fs.writeFileSync(tmp, await gunzip(snap.data));
          fs.renameSync(tmp, DB_FILE);
          log(`Stand vom ${new Date(Number(snap.updated_at)).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} wiederhergestellt`);
        } else {
          log('noch kein Backup vorhanden – starte frisch');
        }
      }
      ready = true;
      return;
    } catch (e) {
      if (attempt >= 5) {
        // Lieber ohne Sicherung starten als ein gutes Backup mit einer leeren Datenbank zu überschreiben
        console.error(`💾 Backup: Datenbank nicht erreichbar (${e.message}) – Zync läuft OHNE Sicherung. Prüfe ZYNC_BACKUP_URL.`);
        return;
      }
      await sleep(2000 * 2 ** (attempt - 1));
    }
  }
}

async function put(name, data) {
  await pool.query(
    `INSERT INTO zync_backup (name, data, size, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, size = EXCLUDED.size, updated_at = EXCLUDED.updated_at`,
    [name, data, data.length, Date.now()],
  );
}

/** Upload aus der Sicherung holen, falls er nach einem Neustart lokal fehlt. */
export async function restoreUpload(name) {
  if (!ready || !savedUploads.has(name)) return false;
  if (!restoring.has(name)) {
    restoring.set(name, (async () => {
      const { rows: [row] } = await pool.query('SELECT data FROM zync_backup WHERE name = $1', [`uploads/${name}`]);
      if (!row) return false;
      const file = path.join(UPLOAD_DIR, name);
      fs.writeFileSync(`${file}.part`, row.data);
      fs.renameSync(`${file}.part`, file);
      return true;
    })().finally(() => restoring.delete(name)));
  }
  return restoring.get(name);
}

/** Gelöschten Upload auch aus der Sicherung entfernen. */
export function forgetUpload(name) {
  if (!ready || !savedUploads.delete(name)) return;
  pool.query('DELETE FROM zync_backup WHERE name = $1', [`uploads/${name}`]).catch((e) => log('Löschen fehlgeschlagen', e.message));
}

/** Startet die regelmäßige Sicherung (alle paar Minuten, nur wenn sich etwas geändert hat). */
export function startBackups(db) {
  if (!ready) return;
  let lastChanges = -1;
  let lastRun = 0;
  let running = null;

  const changes = () => db.prepare('SELECT total_changes() AS n').get().n;

  async function snapshot() {
    const n = changes();
    if (n === lastChanges) return;
    const tmp = path.join(DATA_DIR, `snapshot-${process.pid}.db`);
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    try {
      const data = await gzip(fs.readFileSync(tmp));
      await put(DB_KEY, data);
      lastChanges = n;
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  async function uploads() {
    for (const name of await fs.promises.readdir(UPLOAD_DIR)) {
      if (savedUploads.has(name) || name.endsWith('.part')) continue;
      const file = path.join(UPLOAD_DIR, name);
      const st = await fs.promises.stat(file).catch(() => null);
      if (!st?.isFile()) continue;
      if (st.size > MAX_FILE) {
        savedUploads.add(name);
        log(`${name} ist größer als ${MAX_FILE / 1024 / 1024} MB – wird nicht gesichert`);
        continue;
      }
      await put(`uploads/${name}`, await fs.promises.readFile(file));
      savedUploads.add(name);
    }
  }

  const run = () => {
    running ||= (async () => {
      try {
        await uploads();
        await snapshot();
        lastRun = Date.now();
      } catch (e) {
        log('fehlgeschlagen –', e.message);
      }
    })().finally(() => { running = null; });
    return running;
  };

  // Jede Minute prüfen, höchstens alle EVERY_MS sichern – so kann die Gratis-Datenbank dazwischen schlafen.
  setInterval(() => { if (Date.now() - lastRun >= EVERY_MS) run(); }, Math.min(60_000, EVERY_MS)).unref();

  // Render & Co. schicken beim Schlafenlegen/Neustart SIGTERM: vorher noch schnell alles sichern.
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, async () => {
      if (stopping) return;
      stopping = true;
      log('sichere vor dem Beenden …');
      await (running || Promise.resolve());
      await run();
      await pool.end().catch(() => {});
      process.exit(0);
    });
  }
  log(`aktiv (alle ${Math.round(EVERY_MS / 1000)} s bei Änderungen, beim Beenden immer)`);
}
