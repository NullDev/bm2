import { Socket } from "node:net";
import { Logger } from "../util/logger";
import type { Message, Response } from "./types";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

export class SocketManager {
    constructor(private readonly socketPath: string) {}

    async connect(timeout = 5000): Promise<boolean> {
        for (let i = 0; i < 5; i++) {
            try {
                const socket = new Socket();
                await new Promise<void>((resolve, reject) => {
                    socket.on("connect", () => {
                        socket.end();
                        resolve();
                    });
                    socket.on("error", (err) => {
                        socket.destroy();
                        reject(err);
                    });
                    socket.on("timeout", () => {
                        socket.destroy();
                        reject(new Error("Socket timeout"));
                    });
                    socket.setTimeout(timeout);
                    socket.connect(this.socketPath);
                });
                return true;
            }
            catch (error) {
                if (i === 4) {
                    Logger.error("Failed to connect to daemon:", { trace: error as Error });
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    }

    async sendMessage(message: Message, retries = 3): Promise<Response> {
        for (let i = 0; i < retries; i++) {
            try {
                return await new Promise<Response>((resolve, reject) => {
                    const socket = new Socket();
                    let buffer = "";

                    socket.on("connect", () => {
                        socket.write(JSON.stringify(message) + "\n");
                    });

                    socket.on("data", (data) => {
                        buffer += data.toString();
                        if (buffer.endsWith("\n")) {
                            try {
                                const parsed = JSON.parse(buffer);
                                resolve(parsed);
                                socket.end();
                            }
                            catch (err) {
                                reject(err);
                            }
                        }
                    });

                    socket.on("error", (err) => {
                        socket.destroy();
                        reject(err);
                    });

                    socket.on("timeout", () => {
                        socket.destroy();
                        reject(new Error("Socket timeout"));
                    });

                    socket.setTimeout(5000);
                    socket.connect(this.socketPath);
                });
            }
            catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error("Failed to send message after retries");
    }

    getSocketPath(): string {
        return this.socketPath;
    }
}
