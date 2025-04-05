import { ProcessManager } from "../manager/process-manager";
import { Logger } from "../util/logger";
import { createServer, Socket } from "net";
import { join } from "path";
import { homedir } from "os";
import { existsSync, unlinkSync } from "fs";

const SOCKET_PATH = join(homedir(), ".bun-manager", "daemon.sock");

interface LogEntry {
    isError: boolean;
    message: string;
}

class Daemon {
    private manager = new ProcessManager();

    async start(): Promise<void> {
        await this.manager.init();
        Logger.info("Bun Manager daemon started");

        if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

        const server = createServer(async(socket: Socket) => {
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

                                // Send past logs
                                for (const log of proc.logs) {
                                    socket.write(JSON.stringify(log) + "\n");
                                }

                                // Stream new logs
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

        server.listen(SOCKET_PATH, () => Logger.info(`Daemon listening on ${SOCKET_PATH}`));

        process.on("SIGINT", () => process.exit());
        process.on("SIGTERM", () => process.exit());
    }
}

if (require.main === module) new Daemon().start();
