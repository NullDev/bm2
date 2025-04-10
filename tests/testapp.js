// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

setInterval(() => {
    console.log("Hello, world! " + Date.now());
}, 2000);

process.on("SIGINT", () => {
    console.log("\nBye");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\nBye");
    process.exit(0);
});
