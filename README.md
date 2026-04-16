# Live Studio

Visual CSS editor with MCP integration for AI agents. Edit styles, HTML attributes, text content, and CSS variables on a live page — changes are sent to your AI coding agent for implementation.

## Install

```bash
npm install live-studio
```

Run the installer to set up MCP config and skill files:

```bash
npx live-studio install
```

This creates `.mcp.json` and skill files for Claude Code, Cursor, and other supported agents.

## Setup

Add `startStudio()` to your app's entry point so it runs in the browser. It should only run in development.

### React + Vite

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

if (import.meta.env.DEV) {
  import("live-studio").then(({ startStudio }) => startStudio());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

For source file tracking (so the AI agent knows which file to edit), add the Vite plugin:

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { reactTracer } from "live-studio/vite";

export default defineConfig({
  plugins: [react(), reactTracer()],
});
```

The plugin injects source location attributes in dev mode only — no impact on production builds. Without it, the agent can still edit styles but won't know the exact source file and line number for each component.

### Next.js (App Router)

Create a client component that loads the editor:

```tsx
// src/components/LiveStudio.tsx
"use client";

import { useEffect } from "react";

export function LiveStudio() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cleanup: (() => void) | undefined;
    import("live-studio").then(({ startStudio }) => {
      cleanup = startStudio();
    });
    return () => cleanup?.();
  }, []);

  return null;
}
```

Add it to your root layout:

```tsx
// src/app/layout.tsx
import { LiveStudio } from "@/components/LiveStudio";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "development" && <LiveStudio />}
      </body>
    </html>
  );
}
```

### Next.js (Pages Router)

```tsx
// src/pages/_app.tsx
import type { AppProps } from "next/app";
import { useEffect } from "react";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let cleanup: (() => void) | undefined;
    import("live-studio").then(({ startStudio }) => {
      cleanup = startStudio();
    });
    return () => cleanup?.();
  }, []);

  return <Component {...pageProps} />;
}
```

### Vue (Vite)

```ts
// src/main.ts
import { createApp } from "vue";
import App from "./App.vue";

if (import.meta.env.DEV) {
  import("live-studio").then(({ startStudio }) => startStudio());
}

createApp(App).mount("#app");
```

### Nuxt

Create a client-only plugin:

```ts
// plugins/live-studio.client.ts
export default defineNuxtPlugin(() => {
  if (import.meta.dev) {
    import("live-studio").then(({ startStudio }) => startStudio());
  }
});
```

## Usage

1. Start your dev server as usual
2. Run `/studio` in your AI agent (Claude Code, Cursor, etc.)
3. Edit styles visually in the panel that appears in your browser
4. The agent receives your changes and applies them to source code

## Options

```ts
startStudio({
  port: 9877, // WebSocket port (default: 9877)
});
```

The port can also be set via the `LIVE_STUDIO_PORT` environment variable.

## Development

To work on `live-studio` locally and see changes in a target project without publishing:

```bash
# in the live-studio directory (once)
npm link

# in your project
npm link live-studio
```

Run `npm run dev` in live-studio for watch mode — changes will be picked up automatically.

To switch back to the npm-published version:

```bash
npm unlink live-studio
npm install live-studio
```

## License

MIT
