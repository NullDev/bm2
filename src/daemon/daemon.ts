import { createServer, Socket } from "net";
import { join } from "path";
import { homedir } from "os";
import { existsSync, unlinkSync } from "fs";
import { mkdir } from "node:fs/promises";
import { ProcessManager } from "../manager/process-manager";
import { Logger } from "../util/logger";
import type { LogEntry } from "./types";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

const CONFIG_DIR = join(homedir(), ".bun-manager");
const SOCKET_PATH = join(CONFIG_DIR, "daemon.sock");
const PID_FILE = join(CONFIG_DIR, "daemon.pid");

class Daemon {
    private manager = new ProcessManager();
    private server: ReturnType<typeof createServer> | null = null;

    async start(): Promise<void> {
        try {
            try {
                await mkdir(CONFIG_DIR, { recursive: true });
            }
            catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                    throw error;
                }
            }

            await this.cleanup();

            await this.manager.init();
            Logger.info("Bun Manager daemon started");

            Logger.debug(`Attempting to bind to socket: ${SOCKET_PATH}`);

            this.server = createServer(async(socket: Socket) => {
                let buffer = "";

                socket.on("data", async(chunk): Promise<void> => {
                    buffer += chunk.toString();
                    if (buffer.endsWith("\n")) {
                        try {
                            const msg = JSON.parse(buffer);
                            buffer = "";

                            switch (msg.type) {
                                case "start": {
                                    const id = await this.manager.start(msg.script, msg.options);
                                    socket.write(JSON.stringify({ status: "ok", id }) + "\n");
                                    break;
                                }
                                case "stop": {
                                    this.manager.stop(msg.processId);
                                    socket.write(JSON.stringify({ status: "stopped" }) + "\n");
                                    break;
                                }
                                case "list": {
                                    const list = this.manager.list();
                                    socket.write(JSON.stringify({ status: "ok", list }) + "\n");
                                    break;
                                }
                                case "logs": {
                                    const logs = this.manager.getLogs(msg.processId);
                                    socket.write(JSON.stringify({ status: "ok", logs }) + "\n");
                                    break;
                                }
                                case "attach": {
                                    const proc = this.manager.getProcess(msg.processId);
                                    if (!proc){
                                        socket.end(JSON.stringify({ error: "Not found" }) + "\n");
                                        return;
                                    }

                                    for (const log of proc.logs) {
                                        socket.write(JSON.stringify(log) + "\n");
                                    }

                                    const logStream = (entry: LogEntry): void => {
                                        socket.write(JSON.stringify(entry) + "\n");
                                    };
                                    proc.logs.push = new Proxy(proc.logs.push, {
                                        apply(target, thisArg, argArray): void {
                                            logStream(argArray[0]);
                                            return Reflect.apply(target, thisArg, argArray);
                                        },
                                    });
                                    break;
                                }
                                default: {
                                    socket.write(JSON.stringify({ error: "Invalid message type" }) + "\n");
                                    break;
                                }
                            }
                        }
                        catch (err) {
                            socket.write(JSON.stringify({ error: "Invalid message format" }) + "\n");
                            Logger.error("Invalid message format", { trace: err as Error });
                            buffer = "";
                        }
                    }
                });
            });

            this.server.on("error", (error) => {
                Logger.error("Server error:", { trace: error });
                this.cleanup();
                process.exit(1);
            });

            await new Promise<void>((resolve, reject) => {
                if (!this.server){
                    reject(new Error("Server not initialized"));
                    return;
                }

                this.server.listen(SOCKET_PATH, async() => {
                    Logger.info(`Daemon listening on ${SOCKET_PATH}`);
                    try {
                        await Bun.write(PID_FILE, String(process.pid));
                        Logger.debug(`Daemon PID file written: ${process.pid}`);
                    }
                    catch (err) {
                        Logger.error("Failed to write PID file:", { trace: err as Error });
                    }
                    resolve();
                });
                this.server.on("error", reject);
            });

            process.on("SIGINT", () => this.cleanup());
            process.on("SIGTERM", () => this.cleanup());
            process.on("uncaughtException", (error) => {
                Logger.error("Uncaught exception:", { trace: error });
                this.cleanup();
                process.exit(1);
            });
        }
        catch (error) {
            Logger.error("Failed to start daemon:", { trace: error as Error });
            await this.cleanup();
            process.exit(1);
        }
    }

    private async cleanup(): Promise<void> {
        try {
            if (this.server) {
                this.server.close();
                this.server = null;
            }

            if (existsSync(SOCKET_PATH)) {
                try {
                    unlinkSync(SOCKET_PATH);
                    Logger.debug("Removed socket file");
                }
                catch (error) {
                    Logger.error("Failed to remove socket file:", { trace: error as Error });
                }
            }

            if (existsSync(PID_FILE)) {
                try {
                    unlinkSync(PID_FILE);
                    Logger.debug("Removed PID file");
                }
                catch (error) {
                    Logger.error("Failed to remove PID file:", { trace: error as Error });
                }
            }
        }
        catch (error) {
            Logger.error("Failed to cleanup:", { trace: error as Error });
        }
    }
}

if (require.main === module) new Daemon().start();
