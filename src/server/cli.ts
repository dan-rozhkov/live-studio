import { install } from "./install.js";
import { startServer } from "./serve.js";

async function main(): Promise<void> {
  if (process.argv[2] === "install") {
    await install();
  } else {
    await startServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
