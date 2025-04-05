import Bun from "bun";
import { join } from "path";
import { homedir } from "os";
import { Logger } from "../util/logger";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

interface LogEntry {
    timestamp: Date;
    message: string;
    isError?: boolean;
}

interface ProcessOptions {
    restart?: boolean;
    maxLogLines?: number;
}

interface ProcessInfo {
    id: string;
    script: string;
    process: Bun.Subprocess;
    startTime: Date;
    logs: LogEntry[];
    options: ProcessOptions;
}

interface ProcessListInfo {
    id: string;
    script: string;
    uptime: number;
    status: string;
}

export class ProcessManager {
    private processes: Map<string, ProcessInfo>;
    private configPath: string;
    private configFile: string;
    private config: { processes: ProcessInfo[] } = { processes: [] };

    constructor() {
        this.processes = new Map();
        this.configPath = join(homedir(), ".bun-manager");
        this.configFile = join(this.configPath, "config.json");
    }

    async init(): Promise<void> {
        try {
            const configFile = Bun.file(this.configFile);
            if (!await configFile.exists()) {
                await Bun.write(this.configFile, JSON.stringify({ processes: [] }));
            }
            await this.loadConfig();
        }
        catch (error) {
            Logger.error("Failed to initialize Bun Manager:", { trace: error as Error });
            throw error;
        }
    }

    private async loadConfig(): Promise<void> {
        try {
            const file = Bun.file(this.configFile);
            this.config = await file.json();
        }
        catch (error) {
            this.config = { processes: [] };
            Logger.error("Failed to load config:", { trace: error as Error });
            await this.saveConfig();
        }
    }

    private async saveConfig(): Promise<void> {
        await Bun.write(this.configFile, JSON.stringify(this.config, null, 2));
    }

    async start(script: string, options: ProcessOptions = {}): Promise<string> {
        const processId = Date.now().toString();
        const process = Bun.spawn(["bun", script], {
            stdio: ["pipe", "pipe", "pipe"],
            ...options,
        });

        const processInfo: ProcessInfo = {
            id: processId,
            script,
            process,
            startTime: new Date(),
            logs: [],
            options: {
                maxLogLines: 1000,
                ...options,
            },
        };

        this.processes.set(processId, processInfo);
        this.config.processes.push(processInfo);
        await this.saveConfig();

        const stdoutHandler = {
            write: (chunk: Uint8Array): void => {
                const log = new TextDecoder().decode(chunk);
                this.addLog(processInfo, log);
            },
        };

        const stderrHandler = {
            write: (chunk: Uint8Array): void => {
                const log = new TextDecoder().decode(chunk);
                this.addLog(processInfo, log, true);
            },
        };

        process.stdout.pipeTo(new WritableStream(stdoutHandler));
        process.stderr.pipeTo(new WritableStream(stderrHandler));

        process.exited.then((code): void => {
            if (code !== 0 && options.restart) {
                Logger.info(`Process ${processId} exited with code ${code}. Restarting...`);
                this.start(script, options);
            }
        });

        return processId;
    }

    private addLog(processInfo: ProcessInfo, message: string, isError = false): void {
        const logEntry: LogEntry = {
            timestamp: new Date(),
            message,
            isError,
        };

        processInfo.logs.push(logEntry);

        // Trim logs if they exceed maxLogLines
        if (processInfo.logs.length > (processInfo.options.maxLogLines || 1000)) {
            processInfo.logs = processInfo.logs.slice(-(processInfo.options.maxLogLines || 1000));
        }
    }

    list(): ProcessListInfo[] {
        return Array.from(this.processes.values()).map(proc => ({
            id: proc.id,
            script: proc.script,
            uptime: Date.now() - proc.startTime.getTime(),
            status: proc.process.exitCode === null ? "running" : "stopped",
        }));
    }

    getLogs(processId: string, startIndex = 0, count = 200): LogEntry[] {
        const processInfo = this.processes.get(processId);
        if (!processInfo) {
            throw new Error(`Process ${processId} not found`);
        }

        const {logs} = processInfo;
        const endIndex = Math.min(startIndex + count, logs.length);
        return logs.slice(startIndex, endIndex);
    }

    stop(processId: string): void {
        const processInfo = this.processes.get(processId);
        if (processInfo) {
            processInfo.process.kill();
            this.processes.delete(processId);
        }
    }

    getProcess(processId: string): ProcessInfo | undefined {
        return this.processes.get(processId);
    }
}
