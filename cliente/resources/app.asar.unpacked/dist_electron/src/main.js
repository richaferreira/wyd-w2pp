"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const client_1 = require("react-dom/client");
require("./style.css");
function App() {
    const [config, setConfig] = (0, react_1.useState)({});
    const [installed, setInstalled] = (0, react_1.useState)(false);
    const [progress, setProgress] = (0, react_1.useState)();
    const [message, setMessage] = (0, react_1.useState)("");
    const [update, setUpdate] = (0, react_1.useState)();
    const [busy, setBusy] = (0, react_1.useState)(false);
    const inspect = async () => { const result = await window.launcher.inspect(); setConfig({ gameDirectory: result.directory, suggestedDirectory: result.suggestedDirectory }); setInstalled(result.installed); };
    (0, react_1.useEffect)(() => { void inspect(); const removers = [window.launcher.on("install-progress", (p) => setProgress(p)), window.launcher.on("update-available", (u) => setUpdate(u)), window.launcher.on("update-downloaded", (u) => setUpdate({ ...u, downloaded: true })), window.launcher.on("game-ended", () => setMessage("Jogo encerrado.")), window.launcher.on("game-error", (e) => setMessage(e.message))]; return () => removers.forEach((remove) => remove()); }, []);
    const choose = async () => { const directory = await window.launcher.chooseDirectory(); if (directory) {
        const result = await window.launcher.setDirectory(directory);
        setConfig({ gameDirectory: directory });
        setInstalled(result.installed);
        setMessage("");
    } };
    const install = async () => { setBusy(true); setMessage(""); try {
        await window.launcher.install();
        await inspect();
    }
    catch (error) {
        setMessage(error.message);
    }
    finally {
        setBusy(false);
        setProgress(undefined);
    } };
    const play = async () => { setBusy(true); setMessage(""); try {
        await window.launcher.play();
        setMessage("Jogo iniciado. Mantenha o launcher aberto.");
    }
    catch (error) {
        setMessage(error.message);
    }
    finally {
        setBusy(false);
    } };
    return (0, jsx_runtime_1.jsxs)("main", { children: [(0, jsx_runtime_1.jsxs)("header", { children: [(0, jsx_runtime_1.jsxs)("div", { children: [(0, jsx_runtime_1.jsx)("small", { children: "WYD KERSEF" }), (0, jsx_runtime_1.jsx)("h1", { children: "Launcher" })] }), (0, jsx_runtime_1.jsx)("span", { className: "status", children: installed ? "CLIENT PRONTO" : "CONFIGURAÇÃO NECESSÁRIA" })] }), (0, jsx_runtime_1.jsxs)("section", { className: "card", children: [(0, jsx_runtime_1.jsx)("h2", { children: "Arquivos do jogo" }), (0, jsx_runtime_1.jsx)("p", { className: "path", children: config.gameDirectory || `Sugestão: ${config.suggestedDirectory || "escolha uma pasta"}` }), (0, jsx_runtime_1.jsx)("button", { onClick: () => void choose(), children: "Escolher pasta" }), !installed && config.gameDirectory && (0, jsx_runtime_1.jsx)("button", { className: "primary", disabled: busy, onClick: () => void install(), children: busy ? "Instalando..." : "Baixar e instalar client" }), installed && (0, jsx_runtime_1.jsx)("button", { className: "primary", disabled: busy, onClick: () => void play(), children: "Jogar" }), progress && (0, jsx_runtime_1.jsxs)("div", { className: "progress", children: [(0, jsx_runtime_1.jsx)("div", { style: { width: `${progress.percent}%` } }), (0, jsx_runtime_1.jsx)("span", { children: progress.phase === "download" ? `Baixando ${progress.percent}%` : `Extraindo ${progress.percent}%` })] }), message && (0, jsx_runtime_1.jsx)("p", { className: "message", children: message })] }), update && (0, jsx_runtime_1.jsxs)("section", { className: "card update", children: [(0, jsx_runtime_1.jsxs)("h2", { children: ["Atualiza\u00E7\u00E3o ", update.version] }), update.downloaded ? (0, jsx_runtime_1.jsx)("button", { className: "primary", onClick: () => { if (confirm("Instalar agora? O jogo em execução perderá a conexão."))
                            void window.launcher.installUpdate(); }, children: "Instalar atualiza\u00E7\u00E3o" }) : (0, jsx_runtime_1.jsx)("button", { onClick: () => void window.launcher.downloadUpdate(), children: "Baixar atualiza\u00E7\u00E3o" })] }), (0, jsx_runtime_1.jsx)("footer", { children: "O launcher mant\u00E9m a conex\u00E3o local ativa enquanto o jogo estiver aberto." })] });
}
(0, client_1.createRoot)(document.getElementById("root")).render((0, jsx_runtime_1.jsx)(react_1.default.StrictMode, { children: (0, jsx_runtime_1.jsx)(App, {}) }));
