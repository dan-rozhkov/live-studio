import { install } from "./install.js";
import { startServer } from "./serve.js";

function printHelp(): void {
  console.log(`live-studio v${__VERSION__}

Usage:
  live-studio              Start the MCP server
  live-studio install      Install MCP config and skill files

Options:
  --port, -p <number>  WebSocket port (default: 9877, or LIVE_STUDIO_PORT env)
  --help, -h           Show this help
  --version, -v        Show version`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let command: string | undefined;
  let port: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    }
    if (arg === "--version" || arg === "-v") {
      console.log(__VERSION__);
      return;
    }
    if (arg === "--port" || arg === "-p") {
      const val = argv[++i];
      const num = parseInt(val, 10);
      if (!val || isNaN(num) || num < 1 || num > 65535) {
        console.error(`Invalid port: ${val}`);
        process.exit(1);
      }
      port = num;
    } else if (!arg.startsWith("-")) {
      command = arg;
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
  }

  if (command === "install") {
    await install();
  } else {
    await startServer(port);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
