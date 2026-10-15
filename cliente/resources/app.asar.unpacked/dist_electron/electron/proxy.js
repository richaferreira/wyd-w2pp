"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameProxy = void 0;
const node_net_1 = __importDefault(require("node:net"));
const config_1 = require("./config");
class GameProxy {
    server;
    get active() { return Boolean(this.server); }
    async start() {
        if (this.server)
            return;
        await new Promise((resolve, reject) => {
            const probe = node_net_1.default.createConnection({ host: config_1.SERVER_HOST, port: config_1.SERVER_PORT });
            const fail = (error) => { probe.destroy(); reject(new Error(`Servidor indisponível: ${error.message}`)); };
            probe.setTimeout(4000, () => fail(new Error("tempo esgotado")));
            probe.once("connect", () => { probe.end(); resolve(); });
            probe.once("error", fail);
        });
        const server = node_net_1.default.createServer((client) => {
            const upstream = node_net_1.default.createConnection({ host: config_1.SERVER_HOST, port: config_1.SERVER_PORT });
            client.pipe(upstream);
            upstream.pipe(client);
            const close = () => { client.destroy(); upstream.destroy(); };
            client.once("error", close);
            upstream.once("error", close);
        });
        await new Promise((resolve, reject) => {
            const onError = (error) => { server.removeListener("listening", onListen); reject(error); };
            const onListen = () => { server.removeListener("error", onError); resolve(); };
            server.once("error", onError);
            server.once("listening", onListen);
            server.listen(config_1.LOCAL_PORT, config_1.LOCAL_HOST);
        });
        this.server = server;
    }
    async stop() {
        const server = this.server;
        this.server = undefined;
        if (!server)
            return;
        await new Promise((resolve) => server.close(() => resolve()));
    }
}
exports.GameProxy = GameProxy;
