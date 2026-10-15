"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLIENT_DOWNLOAD_URL = exports.LOCAL_PORT = exports.LOCAL_HOST = exports.SERVER_PORT = exports.SERVER_HOST = void 0;
exports.defaultGameDirectory = defaultGameDirectory;
exports.readConfig = readConfig;
exports.writeConfig = writeConfig;
const electron_1 = require("electron");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
exports.SERVER_HOST = "66.33.22.224";
exports.SERVER_PORT = 56950;
exports.LOCAL_HOST = "127.0.0.1";
exports.LOCAL_PORT = 8281;
// Packaged launchers always use the public portal; overrides are development-only.
exports.CLIENT_DOWNLOAD_URL = electron_1.app.isPackaged
    ? "https://wyd-ten.vercel.app/api/launcher/client"
    : process.env.WYD_CLIENT_DOWNLOAD_URL?.trim() || "https://wyd-ten.vercel.app/api/launcher/client";
function defaultGameDirectory() { return node_path_1.default.join(electron_1.app.getPath("documents"), "WYD Kersef"); }
function configPath() { return node_path_1.default.join(electron_1.app.getPath("userData"), "config.json"); }
async function readConfig() {
    try {
        return JSON.parse(await promises_1.default.readFile(configPath(), "utf8"));
    }
    catch {
        return {};
    }
}
async function writeConfig(config) {
    const file = configPath();
    await promises_1.default.mkdir(node_path_1.default.dirname(file), { recursive: true });
    await promises_1.default.writeFile(file, JSON.stringify(config, null, 2), "utf8");
}
