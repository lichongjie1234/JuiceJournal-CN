const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
let win, worker;
let busy = false;
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1180, height: 850, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
});
ipcMain.handle('cn:capture', async () => {
  win.hide();
  try {
    await new Promise(r => setTimeout(r, 300));
    const display = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) } });
    const source = sources.find(s => String(s.display_id) === String(display.id));
    if (!source) throw new Error('无法读取主显示器，请导入截图');
    return source.thumbnail.toDataURL();
  } finally { win.show(); }
});
ipcMain.handle('cn:digits', async (_event, images) => {
  if (busy) throw new Error('正在识别，请稍候');
  if (!Array.isArray(images) || images.length > 576 || images.some(i => typeof i !== 'string' || !i.startsWith('data:image/png;base64,') || i.length > 2000000)) throw new Error('截图参数无效');
  busy = true;
  try {
    if (!worker) {
      worker = await require('tesseract.js').createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' });
    }
    const result = [];
    for (const image of images) {
      const { data } = await worker.recognize(Buffer.from(image.split(',')[1], 'base64'));
      const text = data.text.trim();
      result.push({ quantity: /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null, confidence: data.confidence });
    }
    return result;
  } finally { busy = false; }
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (worker) worker.terminate(); });
