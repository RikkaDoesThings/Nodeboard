// main.cjs — Electron main process (CommonJS)
const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Set AppUserModelID on Windows so notifications and taskbar/tray behave
// correctly when the app is packaged. Must be done early.
try {
  if (process.platform === 'win32' && app && typeof app.setAppUserModelId === 'function') {
    app.setAppUserModelId('com.rikka.nodeboard');
    console.info('[Nodeboard] setAppUserModelId -> com.rikka.nodeboard');
  }
} catch (e) { /* ignore */ }

// Persistent store path (reminders + background flag)
const STORE_FILE = path.join(app.getPath('userData'), 'nodeboard-store.json');

let STORE = { reminders: [], bgEnabled: false };
let reminderTimers = new Map();
let mainWindow = null;
let tray = null;
let forceQuit = false;
let trayCreating = false;

function loadStore() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8');
      STORE = Object.assign({ reminders: [], bgEnabled: false }, JSON.parse(raw || '{}'));
    }
  } catch (err) {
    console.warn('Failed loading store', err);
    STORE = { reminders: [], bgEnabled: false };
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(STORE, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed saving store', err);
  }
}

function showNativeNotification(title, body) {
  try {
    // Prefer Electron's Notification API when available
    try {
      if (Notification && Notification.isSupported && Notification.isSupported()) {
        try {
          const n = new Notification({ title: String(title || 'Notification'), body: String(body || '') });
          try { n.on('show', () => console.info('[Nodeboard] Notification showed (electron)')); n.on('click', () => console.info('[Nodeboard] Notification clicked (electron)')); } catch (e) { /* ignore */ }
          n.show();
          return true;
        } catch (e) {
          console.warn('[Nodeboard] electron Notification failed:', e);
        }
      }
    } catch (e) { /* ignore */ }

    // macOS fallback: use osascript
    if (process.platform === 'darwin') {
      try {
        const script = `display notification ${JSON.stringify(String(body || ''))} with title ${JSON.stringify(String(title || 'Notification'))}`;
        execFile('/usr/bin/osascript', ['-e', script], (err, stdout, stderr) => {
          if (err) console.warn('[Nodeboard] osascript notification failed:', err, stderr ? stderr.toString() : '');
          else console.info('[Nodeboard] osascript notification succeeded', stdout ? stdout.toString() : '');
        });
        return true;
      } catch (err) {
        console.warn('[Nodeboard] macOS fallback notification failed:', err);
      }
    }

    // Linux fallback: try notify-send
    if (process.platform === 'linux') {
      try {
        execFile('notify-send', [String(title || 'Notification'), String(body || '')], (err, stdout, stderr) => {
          if (err) console.warn('[Nodeboard] notify-send failed:', err, stderr ? stderr.toString() : '');
          else console.info('[Nodeboard] notify-send succeeded');
        });
        return true;
      } catch (err) {
        console.warn('[Nodeboard] linux fallback notification failed:', err);
      }
    }

    // If we reach here, we couldn't show a notification
    console.info('[Nodeboard] No notification method available for platform', process.platform);
    return false;
  } catch (err) {
    console.warn('showNativeNotification failed', err);
    return false;
  }
}

function fireReminderById(id) {
  try {
    const r = (STORE.reminders || []).find(x => x.id === id);
    if (!r) return;
    console.info('[Nodeboard] fireReminderById: firing', id, 'title=', r.title);
    const ok = showNativeNotification(r.title || 'Reminder', r.note || '');
    console.info('[Nodeboard] fireReminderById: showNativeNotification returned ->', !!ok);
    // mark fired in store and persist
    STORE.reminders = (STORE.reminders || []).map(x => x.id === id ? { ...x, fired: true } : x);
    saveStore();
    // notify renderer windows that the reminder fired
    try {
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('reminder-fired', { id }));
    } catch (err) { /* ignore */ }
  } catch (err) {
    console.error('fireReminderById error', err);
  }
}

function clearAllReminderTimers() {
  try {
    for (const t of reminderTimers.values()) clearTimeout(t);
    reminderTimers.clear();
  } catch (err) { /* ignore */ }
}

function scheduleAllReminders() {
  clearAllReminderTimers();
  const now = Date.now();
  (STORE.reminders || []).forEach(r => {
    if (!r || !r.enabled || r.fired || !r.time) return;
    const when = new Date(r.time).getTime();
    if (isNaN(when)) return;
    const ms = when - now;
    console.info('[Nodeboard] scheduleAllReminders: scheduling', r.id, 'when=', new Date(when).toISOString(), 'in', ms, 'ms');
    if (ms <= 0) {
      // fire ASAP
      const t = setTimeout(() => fireReminderById(r.id), 0);
      reminderTimers.set(r.id, t);
    } else {
      const t = setTimeout(() => fireReminderById(r.id), ms);
      reminderTimers.set(r.id, t);
    }
  });
}

function ensureTray() {
  try {
    // If a tray already exists and is not destroyed, update its menu/tooltip and return.
    try { if (tray && !tray.isDestroyed()) { console.info('[Nodeboard] ensureTray: tray already exists, updating menu'); tray.setToolTip('Nodeboard'); return; } } catch (e) { /* ignore */ }
    if (trayCreating) { console.info('[Nodeboard] ensureTray: tray creation already in progress'); return; }
    trayCreating = true;
    console.info('[Nodeboard] ensureTray: creating tray (bgEnabled=', !!(STORE && STORE.bgEnabled), ')');
    // Prefer to use the exe/app icon (so the tray matches the taskbar icon).
    // app.getFileIcon(process.execPath) returns a nativeImage for the running executable.
    app.getFileIcon(process.execPath).then(img => {
      try {
        tray = new Tray(img);
        const ctx = Menu.buildFromTemplate([
          { label: 'Show Nodeboard', click: () => { if (mainWindow) { mainWindow.show(); } } },
          { label: 'Hide', click: () => { if (mainWindow) mainWindow.hide(); } },
          { type: 'separator' },
          { label: 'Quit', click: () => { forceQuit = true; app.quit(); } }
        ]);
        tray.setToolTip('Nodeboard');
        tray.setContextMenu(ctx);
        tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
        tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } });
        trayCreating = false;
        console.info('[Nodeboard] ensureTray: created tray using exe icon');
      } catch (err) {
        trayCreating = false;
        console.warn('[Nodeboard] Failed creating tray with exe icon', err);
      }
    }).catch(err => {
      trayCreating = false;
      console.warn('[Nodeboard] app.getFileIcon failed, falling back to build icon or tiny placeholder', err);
      // fallback: try to load a bundled icon from the build resources, then a tiny placeholder
      try {
        const altPath = path.join(__dirname, 'build', 'icon-tray.png');
        let img;
        if (fs.existsSync(altPath)) {
          img = nativeImage.createFromPath(altPath);
        } else {
          img = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=');
        }
        tray = new Tray(img);
        const ctx = Menu.buildFromTemplate([
          { label: 'Show Nodeboard', click: () => { if (mainWindow) { mainWindow.show(); } } },
          { label: 'Hide', click: () => { if (mainWindow) mainWindow.hide(); } },
          { type: 'separator' },
          { label: 'Quit', click: () => { forceQuit = true; app.quit(); } }
        ]);
        tray.setToolTip('Nodeboard');
        tray.setContextMenu(ctx);
        tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
        tray.on('click', () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } });
        console.info('[Nodeboard] ensureTray: created tray using fallback icon');
      } catch (e) {
        console.warn('[Nodeboard] Failed creating fallback tray', e);
      }
    });
  } catch (err) {
    console.warn('Failed creating tray', err);
  }
}

function destroyTray() {
  try {
    if (tray) {
      console.info('[Nodeboard] destroyTray: destroying tray');
      tray.destroy();
      tray = null;
    }
  } catch (err) { console.warn('[Nodeboard] destroyTray error', err); }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), // secure bridging
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow = win;

  // When the user closes the window, if background notifications are enabled
  // we keep the app running in the tray (hide the window). If not, let the
  // default behavior occur.
  win.on('close', (e) => {
    try { console.info('[Nodeboard] window close event; forceQuit=', !!forceQuit, 'STORE.bgEnabled=', !!(STORE && STORE.bgEnabled)); } catch (e) {}
    if (!forceQuit && STORE && STORE.bgEnabled) {
      e.preventDefault();
      try {
        console.info('[Nodeboard] window close intercepted - ensuring tray exists and hiding window (bgEnabled=true)');
        ensureTray();
        win.hide();
      } catch (err) { console.warn('[Nodeboard] hide failed on close', err); }
    }
  });

  // In dev, the dev script sets VITE_DEV_SERVER_URL
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  // log store file path, load persisted store and schedule reminders
  try { console.info('[Nodeboard] STORE_FILE ->', STORE_FILE); } catch (e) { /* ignore */ }
  loadStore();
  scheduleAllReminders();
  // No SnoreToast / node-notifier auto-install: prefer system Notification API and
  // platform-specific native fallbacks. SnoreToast caused invisible non-system
  // toasts on some systems, so we avoid bundling or invoking it.
  if (STORE.bgEnabled) ensureTray();
  // Helpful debug: log whether native notifications are supported on this platform
  try { console.info('[Nodeboard] Notification.isSupported():', !!(Notification && Notification.isSupported && Notification.isSupported()), 'platform:', process.platform); } catch (e) { /* ignore */ }
  createWindow();
});

// IPC handler to show native notifications from the renderer. We expose a
// simple 'show-notification' channel that accepts an object { title, body }.
// The renderer will prefer this when running inside Electron so users get
// native OS notifications.
ipcMain.handle('show-notification', (event, payload) => {
  try {
    if (!payload) return false;
    const { title = 'Notification', body = '' } = payload;
    return showNativeNotification(title, body);
  } catch (err) {
    console.warn('Failed to show native notification', err);
    return false;
  }
});

// Persist reminders from renderer and (re)schedule
ipcMain.handle('persist-reminders', (event, reminders) => {
  try {
    STORE.reminders = Array.isArray(reminders) ? reminders : [];
    saveStore();
    scheduleAllReminders();
    return true;
  } catch (err) {
    console.warn('persist-reminders failed', err);
    return false;
  }
});

ipcMain.handle('get-persisted-reminders', () => {
  return STORE.reminders || [];
});

// Backups: save/list/read/delete backups under userData/backups
ipcMain.handle('save-backup', (event, snapshot) => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const name = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const fp = path.join(dir, name);
    fs.writeFileSync(fp, typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot, null, 2), 'utf8');
    return { success: true, file: name };
  } catch (err) {
    console.warn('[Nodeboard] save-backup failed', err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('list-backups', () => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      const stat = fs.statSync(path.join(dir, f));
      return { name: f, time: stat.mtimeMs, size: stat.size };
    }).sort((a,b) => b.time - a.time);
    return files;
  } catch (err) {
    console.warn('[Nodeboard] list-backups failed', err);
    return [];
  }
});

ipcMain.handle('read-backup', (event, name) => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    const fp = path.join(dir, name);
    if (!fs.existsSync(fp)) return { success: false, error: 'not found' };
    const raw = fs.readFileSync(fp, 'utf8');
    return { success: true, content: raw };
  } catch (err) {
    console.warn('[Nodeboard] read-backup failed', err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('delete-backup', (event, name) => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    const fp = path.join(dir, name);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return { success: true };
  } catch (err) {
    console.warn('[Nodeboard] delete-backup failed', err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('delete-all-backups', () => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(dir)) return { success: true };
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const f of files) fs.unlinkSync(path.join(dir, f));
    return { success: true };
  } catch (err) {
    console.warn('[Nodeboard] delete-all-backups failed', err);
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('set-bg-notifications-enabled', (event, enabled) => {
  try {
    const prev = !!(STORE && STORE.bgEnabled);
    STORE.bgEnabled = !!enabled;
    console.info('[Nodeboard] IPC set-bg-notifications-enabled ->', !!enabled, 'previous=', prev);
    saveStore();
    if (STORE.bgEnabled) {
      console.info('[Nodeboard] Enabling background notifications: creating tray');
      ensureTray();
    } else {
      console.info('[Nodeboard] Disabling background notifications: destroying tray');
      destroyTray();
    }
    return true;
  } catch (err) {
    console.warn('set-bg-notifications-enabled failed', err);
    return false;
  }
});

app.on('before-quit', () => {
  try { console.info('[Nodeboard] before-quit event; setting forceQuit=true'); } catch (e) {}
  forceQuit = true;
});

ipcMain.handle('get-bg-notifications-enabled', () => {
  return !!STORE.bgEnabled;
});

app.on('window-all-closed', () => {
  // If background notifications are enabled we keep the app running in the tray
  // even if all windows are closed. Otherwise quit as usual.
  console.info('[Nodeboard] window-all-closed event; platform=', process.platform, 'STORE.bgEnabled=', !!(STORE && STORE.bgEnabled));
  if (process.platform !== 'darwin' && !STORE.bgEnabled) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});