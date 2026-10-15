"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const config_1 = require("./config");
const installer_1 = require("./installer");
const proxy_1 = require("./proxy");
const game_launch_error_1 = require("./game-launch-error");
const updater_1 = require("./updater");
let window;
let game;
const proxy = new proxy_1.GameProxy();
const isDev = !electron_1.app.isPackaged;
async function createWindow() {
    window = new electron_1.BrowserWindow({ width: 960, height: 640, minWidth: 760, minHeight: 500, webPreferences: { contextIsolation: true, nodeIntegration: false, preload: node_path_1.default.join(__dirname, "preload.js") } });
    if (isDev)
        await window.loadURL("http://localhost:5173");
    else
        await window.loadFile(node_path_1.default.join(__dirname, "../../dist/index.html"));
    window.on("close", (event) => { if (game && !game.killed) {
        const result = electron_1.dialog.showMessageBoxSync(window, { type: "warning", buttons: ["Cancelar", "Fechar"], defaultId: 0, cancelId: 0, message: "O jogo está aberto", detail: "Fechar o launcher interromperá a conexão do jogo. Deseja continuar?" });
        if (result === 0)
            event.preventDefault();
    } });
    (0, updater_1.setupUpdater)(window, electron_1.app.isPackaged);
}
electron_1.ipcMain.handle("config:get", async () => ({ ...(await (0, config_1.readConfig)()), suggestedDirectory: (0, config_1.defaultGameDirectory)() }));
electron_1.ipcMain.handle("config:set-directory", async (_event, directory) => { const config = await (0, config_1.readConfig)(); config.gameDirectory = directory; await (0, config_1.writeConfig)(config); return { directory, installed: await (0, installer_1.isClientInstalled)(directory) }; });
electron_1.ipcMain.handle("config:choose-directory", async () => { const result = await electron_1.dialog.showOpenDialog(window, { properties: ["openDirectory", "createDirectory"] }); return result.canceled ? undefined : result.filePaths[0]; });
electron_1.ipcMain.handle("client:inspect", async () => { const config = await (0, config_1.readConfig)(); return { directory: config.gameDirectory, suggestedDirectory: (0, config_1.defaultGameDirectory)(), installed: await (0, installer_1.isClientInstalled)(config.gameDirectory) }; });
electron_1.ipcMain.handle("client:install", async () => { const config = await (0, config_1.readConfig)(); if (!config.gameDirectory)
    throw new Error("Escolha a pasta do jogo primeiro."); await (0, installer_1.installClient)(config.gameDirectory, window); return true; });
electron_1.ipcMain.handle("game:play", async () => { const config = await (0, config_1.readConfig)(); if (!config.gameDirectory || !(await (0, installer_1.isClientInstalled)(config.gameDirectory)))
    throw new Error("Client não encontrado. Instale-o novamente."); try {
    await proxy.start();
    game = (0, node_child_process_1.spawn)((0, installer_1.clientPath)(config.gameDirectory), [], { cwd: config.gameDirectory, windowsHide: false });
    game.once("error", async (error) => { await proxy.stop(); console.error("Falha ao iniciar o jogo:", error); window.webContents.send("game-error", { message: (0, game_launch_error_1.gameLaunchErrorMessage)(error) }); game = undefined; });
    game.once("exit", async () => { await proxy.stop(); game = undefined; window.webContents.send("game-ended"); });
    return true;
}
catch (error) {
    await proxy.stop();
    const e = error;
    if (e.code === "EADDRINUSE")
        throw new Error("A porta 8281 já está em uso, provavelmente por uma regra portproxy. Execute como administrador: netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8281");
    throw error;
} });
electron_1.ipcMain.handle("app:close", () => electron_1.app.quit());
electron_1.ipcMain.handle("update:download", () => (0, updater_1.downloadUpdate)());
electron_1.ipcMain.handle("update:install", () => (0, updater_1.installUpdate)());
electron_1.app.whenReady().then(createWindow);
electron_1.app.on("window-all-closed", () => { void proxy.stop(); if (process.platform !== "darwin")
    electron_1.app.quit(); });
electron_1.app.on("before-quit", () => { void proxy.stop(); });
