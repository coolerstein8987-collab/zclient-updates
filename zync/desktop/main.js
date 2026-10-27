// Zync Desktop – Electron-Hülle um den Zync-Webclient.
const {
  app, BrowserWindow, session, desktopCapturer, ipcMain, Tray, Menu, nativeImage, shell, globalShortcut,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const readConfig = () => {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
};
const writeConfig = (c) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));
const serverUrl = () => process.env.ZYNC_URL || readConfig().serverUrl || 'http://localhost:3001';

let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#06070b',
    title: 'Zync',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? undefined : { color: '#00000000', symbolColor: '#a9b2c6', height: 32 },
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  load();
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith('file:')) win.loadFile(path.join(__dirname, 'connect.html'));
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (!quitting && readConfig().minimizeToTray !== false) {
      e.preventDefault();
      win.hide();
    }
  });
}

function load() {
  win.loadURL(serverUrl()).catch(() => win.loadFile(path.join(__dirname, 'connect.html')));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icons', 'icon.png')).resize({ width: 18, height: 18 }));
  tray.setToolTip('Zync');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Zync öffnen', click: () => { win.show(); win.focus(); } },
    { label: 'Stummschalten', click: () => win.webContents.send('zync:shortcut', 'mute') },
    { label: 'Ton aus', click: () => win.webContents.send('zync:shortcut', 'deafen') },
    { type: 'separator' },
    { label: 'Server-Adresse ändern …', click: () => { win.show(); win.loadFile(path.join(__dirname, 'connect.html')); } },
    { label: 'Beenden', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => { win.isVisible() ? win.focus() : win.show(); });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'display-capture', 'speaker-selection'].includes(permission));
  });

  // Bildschirmübertragung: Quellen an den Renderer schicken und Auswahl abwarten.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 } });
      const list = sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
      ipcMain.removeAllListeners('zync:source-picked');
      ipcMain.once('zync:source-picked', (_e, id) => {
        const src = sources.find((s) => s.id === id);
        if (!src) return callback({});
        callback({ video: src, audio: process.platform === 'win32' ? 'loopback' : undefined });
      });
      win.webContents.send('zync:pick-source', list);
    } catch {
      callback({});
    }
  });

  ipcMain.handle('zync:set-server', (_e, url) => {
    const c = readConfig();
    c.serverUrl = String(url).replace(/\/+$/, '');
    writeConfig(c);
    load();
  });
  ipcMain.handle('zync:get-server', () => serverUrl());
  ipcMain.on('zync:badge', (_e, n) => {
    app.setBadgeCount?.(Number(n) || 0);
    tray?.setToolTip(n ? `Zync – ${n} ungelesen` : 'Zync');
  });
  ipcMain.on('zync:icon', (_e, dataUrl) => {
    const img = nativeImage.createFromDataURL(String(dataUrl));
    if (!img.isEmpty()) {
      win?.setIcon(img);
      tray?.setImage(img.resize({ width: 18, height: 18 }));
      if (process.platform === 'darwin') app.dock?.setIcon(img);
    }
  });

  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+M', () => win.webContents.send('zync:shortcut', 'mute'));
  globalShortcut.register('CommandOrControl+Shift+D', () => win.webContents.send('zync:shortcut', 'deafen'));
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => { if (win) win.show(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
