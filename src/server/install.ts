// CLI install command — writes .mcp.json + skill files
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { SKILL_CONTENT } from "./skill.js";

const MCP_ENTRY = { command: "npx", args: ["-y", "live-studio"] };

// ANSI helpers
const ESC = "\x1B[";
const reset = `${ESC}0m`;
const bold = (s: string) => `${ESC}1m${s}${reset}`;
const dim = (s: string) => `${ESC}2m${s}${reset}`;
const green = (s: string) => `${ESC}32m${s}${reset}`;
const cyan = (s: string) => `${ESC}36m${s}${reset}`;
const yellow = (s: string) => `${ESC}33m${s}${reset}`;

/** Walk up from cwd to find the nearest directory containing package.json */
function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

/** Write or merge .mcp.json — preserves existing servers */
function writeMcpConfig(configFile: string): void {
  let config: Record<string, any> = {};
  try {
    config = JSON.parse(readFileSync(configFile, "utf-8"));
  } catch {
    // file doesn't exist or is invalid — start fresh
  }
  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers["live-studio"] = MCP_ENTRY;
  mkdirSync(join(configFile, ".."), { recursive: true });
  writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
}

/** Write a file, creating parent directories as needed */
function writeFile(filepath: string, content: string): void {
  mkdirSync(join(filepath, ".."), { recursive: true });
  writeFileSync(filepath, content);
}

/** Skill file targets — always-written and conditional (only if agent dir exists) */
const SKILL_TARGETS = [
  { agent: "Claude Code", path: ".claude/skills/studio/SKILL.md", always: true },
  { agent: "Agents (Cursor, VS Code, Codex, Amp)", path: ".agents/skills/studio/SKILL.md", always: true },
  { agent: "Windsurf", path: ".windsurf/skills/studio/SKILL.md", always: false },
];

export async function install(): Promise<void> {
  const root = findProjectRoot();

  console.log("");
  console.log(`  ${bold("Live Studio")}`);
  console.log(`  ${dim("Installing MCP server and skill")}`);
  console.log("");

  // Write .mcp.json (merging with existing config)
  writeMcpConfig(join(root, ".mcp.json"));
  console.log(`  ${green("\u2713")} MCP server`);
  console.log(`    ${dim(".mcp.json")}`);
  console.log("");

  // Write skill files
  const installed: string[] = [];
  for (const target of SKILL_TARGETS) {
    const agentDir = target.path.split("/")[0];
    if (target.always || existsSync(join(root, agentDir))) {
      writeFile(join(root, target.path), SKILL_CONTENT);
      installed.push(target.path);
    }
  }

  console.log(`  ${green("\u2713")} Skill file${installed.length > 1 ? "s" : ""}`);
  for (const p of installed) {
    console.log(`    ${dim(p)}`);
  }
  console.log("");

  // Usage instructions
  console.log(`  ${dim("Add to your app's entry point:")}`);
  console.log("");
  console.log(`    ${cyan('import { startStudio } from "live-studio"')}`);
  console.log(`    ${cyan("startStudio()")}`);
  console.log("");
  console.log(`  ${dim("Then run")} ${yellow("/studio")} ${dim("in your agent to start editing.")}`);
  console.log("");
}
