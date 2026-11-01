import { app, BrowserWindow } from 'electron';
import path from 'node:path';

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadURL('http://localhost:5173');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
