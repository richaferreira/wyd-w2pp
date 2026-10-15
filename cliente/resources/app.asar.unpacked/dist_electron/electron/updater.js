"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installUpdate = exports.downloadUpdate = void 0;
exports.setupUpdater = setupUpdater;
const electron_updater_1 = require("electron-updater");
function setupUpdater(win, isPackaged) {
    if (!isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.on("update-available", (info) => win.webContents.send("update-available", { version: info.version }));
    electron_updater_1.autoUpdater.on("download-progress", (info) => win.webContents.send("update-progress", { percent: info.percent, transferred: info.transferred, total: info.total }));
    electron_updater_1.autoUpdater.on("update-downloaded", (info) => win.webContents.send("update-downloaded", { version: info.version }));
    electron_updater_1.autoUpdater.on("error", (error) => win.webContents.send("update-error", { message: error.message }));
    void electron_updater_1.autoUpdater.checkForUpdates().catch(() => undefined);
}
const downloadUpdate = () => electron_updater_1.autoUpdater.downloadUpdate();
exports.downloadUpdate = downloadUpdate;
const installUpdate = () => electron_updater_1.autoUpdater.quitAndInstall(false, true);
exports.installUpdate = installUpdate;
