"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    getConfig: () => electron_1.ipcRenderer.invoke("config:get"),
    chooseDirectory: () => electron_1.ipcRenderer.invoke("config:choose-directory"),
    setDirectory: (directory) => electron_1.ipcRenderer.invoke("config:set-directory", directory),
    inspect: () => electron_1.ipcRenderer.invoke("client:inspect"),
    install: () => electron_1.ipcRenderer.invoke("client:install"),
    play: () => electron_1.ipcRenderer.invoke("game:play"),
    close: () => electron_1.ipcRenderer.invoke("app:close"),
    downloadUpdate: () => electron_1.ipcRenderer.invoke("update:download"),
    installUpdate: () => electron_1.ipcRenderer.invoke("update:install"),
    on: (event, listener) => { const wrapped = (_e, value) => listener(value); electron_1.ipcRenderer.on(event, wrapped); return () => electron_1.ipcRenderer.removeListener(event, wrapped); },
};
electron_1.contextBridge.exposeInMainWorld("launcher", api);
