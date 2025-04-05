// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

interface LogOptions {
    force?: boolean;
    trace?: Error;
}

/**
 * Logging utility class
 */
export class Logger {
    private static readonly LOG_PREFIXES = {
        error: "\x1b[41m\x1b[315m x \x1b[0m\x1b[31m",
        warn: "\x1b[43m\x1b[30m ! \x1b[0m\x1b[33m",
        debug: "\x1b[45m\x1b[30m d \x1b[0m\x1b[35m",
        wait: "\x1b[46m\x1b[30m ⧖ \x1b[0m\x1b[36m",
        info: "\x1b[44m\x1b[30m i \x1b[0m\x1b[36m",
        done: "\x1b[42m\x1b[30m ✓ \x1b[0m\x1b[32m",
        reset: "\x1b[0m",
    };

    /**
     * Get neatly formatted date
     */
    private static getDate(): string {
        const options: Intl.DateTimeFormatOptions = {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };

        const date = new Intl.DateTimeFormat(
            "en-US",
            options,
        ).format(new Date());

        return `[${date}]`;
    }

    /**
     * Perform log action
     */
    private static logger(str: string): void {
        console.log(str);
    }

    /**
     * Log an error
     */
    static error(input: string, options?: LogOptions): void {
        const log = `[ERROR] ${this.getDate()} - ${input}`;
        this.logger(
            `${this.LOG_PREFIXES.error} ${log}${this.LOG_PREFIXES.reset}`,
        );

        if (options?.trace?.stack) {
            const eLog = `[TRACE] ${this.getDate()} - ${options.trace.stack}`;
            this.logger(
                `${this.LOG_PREFIXES.error} ${eLog}${this.LOG_PREFIXES.reset}`,
            );
        }
    }

    /**
     * Log a warning
     */
    static warn(input: string): void {
        const log = `[WARN]  ${this.getDate()} - ${input}`;
        this.logger(
            `${this.LOG_PREFIXES.warn} ${log}${this.LOG_PREFIXES.reset}`,
        );
    }

    /**
     * Log a debug message
     * (only if NODE_ENV is set to development)
     */
    static debug(input: string, options?: LogOptions): void {
        if (process.env.NODE_ENV !== "development" && !options?.force) return;
        const log = `[DEBUG] ${this.getDate()} - ${input}`;
        this.logger(
            `${this.LOG_PREFIXES.debug} ${log}${this.LOG_PREFIXES.reset}`,
        );
    }

    /**
     * Log a wait message
     */
    static wait(input: string): void {
        const log = `[WAIT]  ${this.getDate()} - ${input}`;
        this.logger(
            `${this.LOG_PREFIXES.wait} ${log}${this.LOG_PREFIXES.reset}`,
        );
    }

    /**
     * Log an info
     */
    static info(input: string): void {
        const log = `[INFO]  ${this.getDate()} - ${input}`;
        this.logger(
            `${this.LOG_PREFIXES.info} ${log}${this.LOG_PREFIXES.reset}`,
        );
    }

    /**
     * Log a success
     */
    static done(input: string): void {
        const log = `[DONE]  ${this.getDate()} - ${input}`;
        this.logger(
            `${this.LOG_PREFIXES.done} ${log}${this.LOG_PREFIXES.reset}`,
        );
    }

    /**
     * Log a message without any formatting
     */
    static raw(input: string): void {
        this.logger(input);
    }
}
