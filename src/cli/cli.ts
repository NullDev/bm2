import { Logger } from "../util/logger";
import { DaemonManager } from "./daemon-manager";
import { Socket } from "node:net";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

export class CLI {
    private daemonManager: DaemonManager;

    constructor() {
        this.daemonManager = new DaemonManager();
        this.daemonManager.ensureDaemonRunning();
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
                await this.handleDaemonCommand(args);
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

        const response = await this.daemonManager.getSocketManager().sendMessage({
            type: "start",
            script,
            options: { restart: args.includes("--restart") },
        });

        if (response.status === "ok") Logger.info(`Started process with ID: ${response.id}`);
        else Logger.error(`Failed to start process: ${response.error}`);
    }

    private async handleList(): Promise<void> {
        const response = await this.daemonManager.getSocketManager().sendMessage({ type: "list" });
        if (response.status !== "ok") {
            Logger.error(`Failed to list processes: ${response.error}`);
            return;
        }

        if (!response.list?.length) {
            Logger.raw("No processes running");
            return;
        }

        const idWidth = Math.max(2, ...response.list.map(p => p.id.length));
        const scriptWidth = Math.max(6, ...response.list.map(p => p.script.length));
        const statusWidth = Math.max(6, ...response.list.map(p => p.status.length));

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

        for (const process of response.list) {
            Logger.raw(
                "│ " + process.id.padEnd(idWidth) + " │ " +
                process.script.padEnd(scriptWidth) + " │ " +
                process.status.padEnd(statusWidth) + " │",
            );
        }

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
        const response = await this.daemonManager.getSocketManager().sendMessage({ type: "stop", processId });
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
        socket.connect(this.daemonManager.getSocketManager().getSocketPath(), () => {
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

    private async handleDaemonCommand(args: string[]): Promise<void> {
        const command = args[0] || "status";
        await this.daemonManager.handleDaemonCommand(command);
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
