import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { Logger } from "../util/logger";
import { SocketManager } from "./socket-manager";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

export class DaemonManager {
    private readonly CONFIG_DIR = join(homedir(), ".bun-manager");
    private readonly PID_FILE = join(this.CONFIG_DIR, "daemon.pid");
    private readonly SOCKET_PATH = join(this.CONFIG_DIR, "daemon.sock");
    private readonly socketManager: SocketManager;

    constructor() {
        this.socketManager = new SocketManager(this.SOCKET_PATH);
        this.ensureConfigDir();
    }

    private async ensureConfigDir(): Promise<void> {
        try {
            await mkdir(this.CONFIG_DIR, { recursive: true });
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                throw error;
            }
        }
    }

    private async isDaemonRunning(): Promise<boolean> {
        const pidFile = Bun.file(this.PID_FILE);
        if (!await pidFile.exists()) {
            Logger.debug("No PID file found, daemon is not running");
            return false;
        }

        try {
            const pidFileContent = await pidFile.text();
            const pid = Number(pidFileContent);
            if (!pidFileContent || isNaN(pid) || pid <= 0) {
                Logger.debug("Invalid PID in PID file");
                await Bun.write(this.PID_FILE, "");
                return false;
            }

            try {
                process.kill(pid, 0);
                Logger.debug(`Daemon is running with PID: ${pid}`);
                return true;
            }
            catch {
                Logger.debug(`Daemon PID ${pid} not responding, cleaning up PID file`);
                await Bun.write(this.PID_FILE, "");
                return false;
            }
        }
        catch (error) {
            Logger.debug("Failed to read PID file:", { trace: error as Error });
            await Bun.write(this.PID_FILE, "");
            return false;
        }
    }

    private async stopDaemon(): Promise<void> {
        const pidFile = Bun.file(this.PID_FILE);
        if (!await pidFile.exists()) {
            Logger.debug("No PID file found, daemon already stopped");
            return;
        }

        try {
            const pid = Number(await pidFile.text());
            if (isNaN(pid)) {
                Logger.debug("Invalid PID in PID file");
                await Bun.write(this.PID_FILE, "");
                return;
            }

            try {
                process.kill(pid);
                await Bun.write(this.PID_FILE, "");
                Logger.debug(`Successfully killed daemon with PID ${pid}`);
            }
            catch (error) {
                Logger.error("Failed to stop daemon:", { trace: error as Error });
                await Bun.write(this.PID_FILE, "");
            }
        }
        catch (error) {
            Logger.error("Failed to read PID file:", { trace: error as Error });
            await Bun.write(this.PID_FILE, "");
        }
    }

    async ensureDaemonRunning(): Promise<void> {
        if (!await this.isDaemonRunning()) {
            if (existsSync(this.SOCKET_PATH)) {
                try {
                    unlinkSync(this.SOCKET_PATH);
                    Logger.debug("Removed existing socket file");
                }
                catch (error) {
                    Logger.error("Failed to remove socket file:", { trace: error as Error });
                }
            }

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

            await Bun.write(this.PID_FILE, String(pid));
            Logger.debug(`Started new daemon with PID: ${pid}`);

            if (!await this.socketManager.connect()) {
                Logger.error("Failed to connect to daemon after startup");
                process.exit(1);
            }
        }
    }

    async handleDaemonCommand(command: string): Promise<void> {
        if (command === "stop") {
            await this.stopDaemon();
            Logger.info("Daemon stopped");
        }
        else {
            Logger.info(`Daemon is ${await this.isDaemonRunning() ? "running" : "not running"}`);
        }
    }

    getSocketManager(): SocketManager {
        return this.socketManager;
    }
}
