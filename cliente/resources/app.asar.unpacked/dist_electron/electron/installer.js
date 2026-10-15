"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientPath = void 0;
exports.isClientInstalled = isClientInstalled;
exports.installClient = installClient;
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_https_1 = __importDefault(require("node:https"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const config_1 = require("./config");
const clientPath = (directory) => node_path_1.default.join(directory, "wyd.exe");
exports.clientPath = clientPath;
async function isClientInstalled(directory) {
    if (!directory)
        return false;
    try {
        return (await promises_1.default.stat((0, exports.clientPath)(directory))).isFile();
    }
    catch {
        return false;
    }
}
function download(url, target, win) {
    return new Promise((resolve, reject) => {
        const request = node_https_1.default.get(url, (response) => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location)
                return download(response.headers.location, target, win).then(resolve, reject);
            if (response.statusCode !== 200)
                return reject(new Error(`Download HTTP ${response.statusCode ?? "unknown"}`));
            const total = Number(response.headers["content-length"] ?? 0);
            let received = 0;
            const output = node_fs_1.default.createWriteStream(target);
            response.on("data", (chunk) => { received += chunk.length; win.webContents.send("install-progress", { phase: "download", received, total, percent: total ? Math.round(received * 100 / total) : 0 }); });
            response.pipe(output);
            output.on("finish", () => output.close(() => resolve()));
            output.on("error", reject);
            response.on("error", reject);
        });
        request.on("error", reject);
    });
}
async function installClient(directory, win) {
    await promises_1.default.mkdir(directory, { recursive: true });
    const temporary = await promises_1.default.mkdtemp(node_path_1.default.join(node_os_1.default.tmpdir(), "wyd-client-"));
    const zipPath = node_path_1.default.join(temporary, "client.zip");
    const extracted = node_path_1.default.join(temporary, "extracted");
    try {
        await download(config_1.CLIENT_DOWNLOAD_URL, zipPath, win);
        await promises_1.default.mkdir(extracted, { recursive: true });
        win.webContents.send("install-progress", { phase: "extract", percent: 0 });
        new adm_zip_1.default(zipPath).extractAllTo(extracted, true);
        win.webContents.send("install-progress", { phase: "extract", percent: 100 });
        const locateExecutable = async (root) => {
            for (const entry of await promises_1.default.readdir(root, { withFileTypes: true })) {
                const candidate = node_path_1.default.join(root, entry.name);
                if (entry.isFile() && entry.name.toLowerCase() === "wyd.exe")
                    return candidate;
                if (entry.isDirectory()) {
                    const found = await locateExecutable(candidate);
                    if (found)
                        return found;
                }
            }
            return undefined;
        };
        const executable = await locateExecutable(extracted);
        if (!executable)
            throw new Error("O pacote não contém wyd.exe.");
        const sourceDirectory = node_path_1.default.dirname(executable);
        const entries = await promises_1.default.readdir(sourceDirectory);
        for (const entry of entries)
            await promises_1.default.rename(node_path_1.default.join(sourceDirectory, entry), node_path_1.default.join(directory, entry));
        if (!(await isClientInstalled(directory)))
            throw new Error("Não foi possível instalar o wyd.exe.");
    }
    catch (error) {
        if (error.code === "ENOSPC")
            throw new Error("Não há espaço em disco suficiente para instalar o client.");
        throw error;
    }
    finally {
        await promises_1.default.rm(temporary, { recursive: true, force: true }).catch(() => undefined);
    }
}
