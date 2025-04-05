import { Logger } from "../util/logger";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { Socket } from "node:net";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

interface Message {
    type: "start" | "stop" | "list" | "attach";
    script?: string;
    processId?: string;
    options?: { restart?: boolean };
}

interface Process {
    id: string;
    script: string;
    status: string;
}

interface Response {
    status: "ok" | "error" | "stopped";
    id?: string;
    list?: Process[];
    error?: string;
}

export class CLI {
    private readonly CONFIG_DIR = join(homedir(), ".bun-manager");
    private readonly PID_FILE = join(this.CONFIG_DIR, "daemon.pid");
    private readonly SOCKET_PATH = join(this.CONFIG_DIR, "daemon.sock");

    constructor() {
        if (!existsSync(this.CONFIG_DIR)) {
            mkdirSync(this.CONFIG_DIR, { recursive: true });
        }
        this.ensureDaemonRunning();
    }

    private isDaemonRunning(): boolean {
        if (!existsSync(this.PID_FILE)) {
            Logger.debug("No PID file found, daemon is not running");
            return false;
        }
        const pid = Number(readFileSync(this.PID_FILE, "utf-8"));
        try {
            process.kill(pid, 0);
            Logger.debug(`Daemon is running with PID: ${pid}`);
            return true;
        }
        catch {
            Logger.debug(`Daemon PID ${pid} not responding, cleaning up PID file`);
            unlinkSync(this.PID_FILE);
            return false;
        }
    }

    private async waitForDaemon(retries = 5): Promise<boolean> {
        for (let i = 0; i < retries; i++) {
            try {
                const socket = new Socket();
                await new Promise<void>((resolve, reject) => {
                    socket.on("connect", () => {
                        socket.end();
                        resolve();
                    });
                    socket.on("error", reject);
                    socket.connect(this.SOCKET_PATH);
                });
                return true;
            }
            catch {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    }

    private async ensureDaemonRunning(): Promise<void> {
        if (!this.isDaemonRunning()) {
            const proc = spawn("bun", [join(__dirname, "../daemon/daemon.ts")], {
                detached: true,
                stdio: "ignore",
            });
            proc.unref();

            const { pid } = proc;
            if (!pid) {
                Logger.error("Failed to get PID of daemon");
                return;
            }

            writeFileSync(this.PID_FILE, String(pid));
            Logger.debug(`Started new daemon with PID: ${pid}`);

            if (!await this.waitForDaemon()) {
                Logger.error("Failed to connect to daemon after startup");
                process.exit(1);
            }
        }
    }

    private async sendMessage(message: Message, retries = 3): Promise<Response> {
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
                    socket.connect(this.SOCKET_PATH);
                });
            }
            catch (err) {
                if (i === retries - 1) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        throw new Error("Failed to send message after retries");
    }

    private stopDaemon(): void {
        if (existsSync(this.PID_FILE)) {
            const pid = Number(readFileSync(this.PID_FILE, "utf-8"));
            try {
                process.kill(pid);
                unlinkSync(this.PID_FILE);
                Logger.debug(`Successfully killed daemon with PID ${pid}`);
            }
            catch (error) {
                Logger.error("Failed to stop daemon:", { trace: error as Error });
            }
        }
        else {
            Logger.debug("No PID file found, daemon already stopped");
        }
    }

    async handleCommand(command: string, args: string[]): Promise<void> {
        switch (command) {
            case "start":
                await this.handleStart(args);
                break;
            case "list":
                await this.handleList();
                break;
            case "attach":
                await this.handleAttach(args);
                break;
            case "stop":
                await this.handleStop(args);
                break;
            case "help":
                this.showHelp();
                break;
            case "daemon":
                if (args[0] === "stop") {
                    this.stopDaemon();
                    Logger.info("Daemon stopped");
                }
                else Logger.info(`Daemon is ${this.isDaemonRunning() ? "running" : "not running"}`);
                break;
            default:
                this.showHelp(command);
        }
    }

    private async handleStart(args: string[]): Promise<void> {
        const script = args[0];
        if (!script) {
            Logger.error("Please provide a script to run");
            return;
        }

        const response = await this.sendMessage({ type: "start", script, options: { restart: args.includes("--restart") } });
        if (response.status === "ok") Logger.info(`Started process with ID: ${response.id}`);
        else Logger.error(`Failed to start process: ${response.error}`);
    }

    private async handleList(): Promise<void> {
        const response = await this.sendMessage({ type: "list" });
        if (response.status !== "ok") {
            Logger.error(`Failed to list processes: ${response.error}`);
            return;
        }

        if (!response.list?.length) {
            Logger.raw("No processes running");
            return;
        }

        // Calculate column widths
        const idWidth = Math.max(2, ...response.list.map(p => p.id.length));
        const scriptWidth = Math.max(6, ...response.list.map(p => p.script.length));
        const statusWidth = Math.max(6, ...response.list.map(p => p.status.length));

        // Print header
        Logger.raw(
            "┌" + "─".repeat(idWidth + 2) + "┬" +
            "─".repeat(scriptWidth + 2) + "┬" +
            "─".repeat(statusWidth + 2) + "┐",
        );
        Logger.raw(
            "│ " + "ID".padEnd(idWidth) + " │ " +
            "Script".padEnd(scriptWidth) + " │ " +
            "Status".padEnd(statusWidth) + " │",
        );
        Logger.raw(
            "├" + "─".repeat(idWidth + 2) + "┼" +
            "─".repeat(scriptWidth + 2) + "┼" +
            "─".repeat(statusWidth + 2) + "┤",
        );

        // Print processes
        for (const process of response.list) {
            Logger.raw(
                "│ " + process.id.padEnd(idWidth) + " │ " +
                process.script.padEnd(scriptWidth) + " │ " +
                process.status.padEnd(statusWidth) + " │",
            );
        }

        // Print footer
        Logger.raw(
            "└" + "─".repeat(idWidth + 2) + "┴" +
            "─".repeat(scriptWidth + 2) + "┴" +
            "─".repeat(statusWidth + 2) + "┘",
        );
    }

    private async handleStop(args: string[]): Promise<void> {
        const processId = args[0];
        if (!processId) {
            Logger.error("Provide a process ID");
            return;
        }
        const response = await this.sendMessage({ type: "stop", processId });
        if (response.status === "ok") Logger.info(`Process ${processId} stopped`);
        else Logger.error(`Failed to stop process ${processId}`);
    }

    private async handleAttach(args: string[]): Promise<void> {
        const processId = args[0];
        if (!processId) {
            Logger.error("Provide a process ID");
            return;
        }

        const socket = new Socket();
        socket.connect(this.SOCKET_PATH, () => {
            socket.write(JSON.stringify({ type: "attach", processId }) + "\n");
        });

        socket.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);
            for (const line of lines) {
                try {
                    const log = JSON.parse(line);
                    const prefix = log.isError ? "[stderr]" : "[stdout]";
                    Logger.raw(`${prefix} ${log.message.trim()}`);
                }
                catch {
                    Logger.error("Failed to parse log line");
                }
            }
        });

        process.stdin.setRawMode(true);
        process.stdin.on("data", (key) => {
            if (key.toString() === "\u0003") process.exit(); // Ctrl+C
        });
    }

    public showHelp(command?: string): void {
        Logger.raw("\nBun Manager - Process Management for Bun");
        Logger.raw("=======================================\n");
        Logger.raw("Available commands:");
        Logger.raw("  start <script> [--restart]  Start a new process");
        Logger.raw("  list                        List all running processes");
        Logger.raw("  attach <processId>          Attach to a process's output");
        Logger.raw("  stop <processId>            Stop a process");
        Logger.raw("  daemon [stop]               Show daemon status or stop it");
        Logger.raw("  help                        Show this help message\n");
        if (command) {
            Logger.raw(`Command '${command}' not found.\n`);
        }
    }
}
