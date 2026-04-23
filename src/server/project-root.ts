import { existsSync } from "fs";
import { join, resolve } from "path";

/** Walk up from cwd to find the nearest directory containing package.json. */
export function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}
