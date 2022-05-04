export function runTest(code) {
  code().then(() => {
    console.log("Done in", process.uptime());
    process.exit(1);
  });
}
