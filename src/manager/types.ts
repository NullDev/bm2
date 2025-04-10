export interface LogEntry {
    timestamp: Date;
    message: string;
    isError?: boolean;
}

export interface ProcessOptions {
    restart?: boolean;
    maxLogLines?: number;
}

export interface ProcessInfo {
    id: string;
    script: string;
    process: Bun.Subprocess;
    startTime: Date;
    logs: LogEntry[];
    options: ProcessOptions;
}

export interface ProcessListInfo {
    id: string;
    script: string;
    uptime: number;
    status: string;
}
