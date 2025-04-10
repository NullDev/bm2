// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

export interface Message {
    type: "start" | "stop" | "list" | "attach";
    script?: string;
    processId?: string;
    options?: { restart?: boolean };
}

export interface Process {
    id: string;
    script: string;
    status: string;
}

export interface Response {
    status: "ok" | "error" | "stopped";
    id?: string;
    list?: Process[];
    error?: string;
}
