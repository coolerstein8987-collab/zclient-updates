import express from 'express';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './db.js';
import { backupEnabled, restoreUpload, startBackups } from './backup.js';
import { initDiscord } from './discord.js';
import { startHelperTicks } from './helpers.js';
import { api } from './api.js';
import { startTicks } from './features.js';
import { initRealtime } from './realtime.js';

const PORT = Number(process.env.PORT || 3001);
const CLIENT_DIST = path.resolve(import.meta.dirname, '..', '..', 'client', 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.ZYNC_TRUST_PROXY === '1');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use('/api', api);

// Uploads: Bilder/Videos/Audio inline, alles andere als Download. Sandbox-CSP verhindert Skripte in hochgeladenen Dateien.
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/.+)$/;
if (backupEnabled) {
  // Nach einem Neustart fehlende Uploads bei Bedarf aus der Sicherung holen
  app.use('/uploads', async (req, res, next) => {
    const name = path.basename(req.path);
    if (name && !fs.existsSync(path.join(UPLOAD_DIR, name))) await restoreUpload(name).catch(() => {});
    next();
  });
}
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '365d',
  immutable: true,
  setHeaders(res, filePath) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    const type = res.getHeader('Content-Type') || '';
    if (!INLINE.test(String(type).split(';')[0])) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
  },
}));

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, {
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
      if (filePath.endsWith('.apk')) res.setHeader('Content-Disposition', 'attachment; filename="Zync.apk"');
    },
  }));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.type('text').send('Zync-Server läuft. Client mit "npm run build" bauen oder "npm run dev" im Hauptordner starten.'));
}

const tls = process.env.ZYNC_TLS_CERT && process.env.ZYNC_TLS_KEY
  ? { cert: fs.readFileSync(process.env.ZYNC_TLS_CERT), key: fs.readFileSync(process.env.ZYNC_TLS_KEY) }
  : null;
const server = tls ? https.createServer(tls, app) : http.createServer(app);
initRealtime(server);
startTicks();
startBackups(db);
initDiscord();
startHelperTicks();

server.listen(PORT, () => {
  console.log(`⚡ Zync läuft auf ${tls ? 'https' : 'http'}://localhost:${PORT}`);
});
