import { fileURLToPath } from "url";
import { realpathSync } from "fs";
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

/** Result of parsing CLI argv. Pure — no side effects (no printing/exiting). */
export type ParsedArgs =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "run"; command?: string; port?: number }
  | { kind: "error"; message: string };

/**
 * Parse process argv (already sliced past `node script`). Pure function, used
 * by `main()`. Returns a discriminated result instead of printing/exiting so it
 * can be unit-tested; `main()` performs the side effects based on the result.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let command: string | undefined;
  let port: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }
    if (arg === "--version" || arg === "-v") {
      return { kind: "version" };
    }
    if (arg === "--port" || arg === "-p") {
      const val = argv[++i];
      const num = parseInt(val, 10);
      if (!val || isNaN(num) || num < 1 || num > 65535) {
        return { kind: "error", message: `Invalid port: ${val}` };
      }
      port = num;
    } else if (!arg.startsWith("-")) {
      command = arg;
    } else {
      return { kind: "error", message: `Unknown flag: ${arg}` };
    }
  }

  return { kind: "run", command, port };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.kind === "help") {
    printHelp();
    return;
  }
  if (parsed.kind === "version") {
    console.log(__VERSION__);
    return;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    process.exit(1);
    return;
  }

  if (parsed.command === "install") {
    await install();
  } else {
    await startServer(parsed.port);
  }
}

// Run as a CLI only when this module is the process entry point (the built
// `dist/cli.mjs` bin). When imported (e.g. by unit tests) `main()` is not run.
// argv[1] may be an npm bin symlink, while import.meta.url resolves to the real
// file, so realpath both sides before comparing.
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== "string") return false;
  const self = fileURLToPath(import.meta.url);
  if (self === entry) return true;
  try {
    return realpathSync(self) === realpathSync(entry);
  } catch {
    return false;
  }
}

const isEntry = isEntryPoint();

if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
