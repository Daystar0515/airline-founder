// Electron 外殼：把網頁版遊戲包成 Windows 桌面程式，之後在這裡接上 Steamworks（成就、雲端存檔）。
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 680,
    backgroundColor: '#0e1920', title: '航空公司創始人',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'game', 'airline-founder.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
