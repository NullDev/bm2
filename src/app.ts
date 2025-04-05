import { CLI } from "./cli/cli";
import { Logger } from "./util/logger";

// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

async function main(): Promise<void> {
    try {
        Logger.debug("Starting Bun Manager CLI...");
        const cli = new CLI();
        const command = process.argv[2] ?? "";
        Logger.debug(`Executing command: ${command || "help"}`);
        await cli.handleCommand(command, process.argv.slice(3));
    }
    catch (error) {
        Logger.error("Fatal error in main:", { trace: error as Error });
        process.exit(1);
    }
}

main().catch((error) => {
    Logger.error("Unhandled error in main:", { trace: error as Error });
    process.exit(1);
});
