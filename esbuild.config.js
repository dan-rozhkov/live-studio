import esbuild from "esbuild";
import cssModulesPlugin from "esbuild-css-modules-plugin";
import fs from "fs";

const isWatch = process.argv.includes("--watch");
const isMinify = process.argv.includes("--minify");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

/**
 * Plugin that injects the generated CSS into the JS bundle as an exported string.
 * This allows the client to inject styles into Shadow DOM at runtime.
 */
function injectCssIntoBundle() {
  return {
    name: "inject-css-into-bundle",
    setup(build) {
      build.onEnd(async (result) => {
        const cssPath = "dist/live-studio.css";
        const jsPath = "dist/live-studio.mjs";
        if (!fs.existsSync(cssPath) || !fs.existsSync(jsPath)) return;
        const css = fs.readFileSync(cssPath, "utf8");
        const js = fs.readFileSync(jsPath, "utf8");
        // Append CSS as an exported constant and auto-inject helper
        const injection = `\n// --- injected CSS modules ---\nexport var __LIVE_STUDIO_CSS__ = ${JSON.stringify(css)};\n`;
        fs.writeFileSync(jsPath, js + injection);
      });
    },
  };
}

/** @type {import('esbuild').BuildOptions} */
const serverConfig = {
  entryPoints: ["src/server/cli.ts"],
  outfile: "dist/cli.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: !isMinify,
  minify: isMinify,
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  external: [
    "@modelcontextprotocol/sdk",
    "ws",
    "zod",
  ],
};

/** @type {import('esbuild').BuildOptions} */
const clientConfig = {
  entryPoints: ["src/client/index.ts"],
  outfile: "dist/live-studio.mjs",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: !isMinify,
  minify: isMinify,
  alias: {
    react: "preact/compat",
    "react-dom": "preact/compat",
    "react/jsx-runtime": "preact/jsx-runtime",
    "react-dom/client": "preact/compat",
  },
  jsxFactory: "h",
  jsxFragment: "Fragment",
  plugins: [cssModulesPlugin(), injectCssIntoBundle()],
  // Preact, zustand, immer, and signals are all bundled into the client output
  external: [],
};

async function build() {
  if (isWatch) {
    const serverCtx = await esbuild.context(serverConfig);
    const clientCtx = await esbuild.context(clientConfig);
    await Promise.all([serverCtx.watch(), clientCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(serverConfig),
      esbuild.build(clientConfig),
    ]);
    console.log("Build complete.");
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
