# AI Usage Limits Stream Deck Plugin

A professional Elgato Stream Deck plugin to monitor and display usage limits and quotas across multiple AI coding assistants and agent providers directly on your Stream Deck keys and dials.

Supports:
- **Claude** (Claude Code CLI / Keychain)
- **ChatGPT** (Web API / Codex)
- **Antigravity** (Google Cloud Code Assist OAuth)
- **Gemini CLI** (Google Cloud Code Assist)
- **MiniMax** (Coding Plan API)

## Requirements

- **Stream Deck Application** (v6.9 or newer)
- **Node.js** (v20 or newer)
- **@lenadweb/ai-limits** (TypeScript SDK library)

## Installation & Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Build the Plugin:**
   ```bash
   npm run build
   ```
3. **Register/Run the Plugin:**
   Open the Stream Deck application, and the plugin will be registered automatically if you run watch mode:
   ```bash
   npm run watch
   ```

## Provider Setup

- **Claude:** Automatically reads your credentials from the macOS Keychain (`Claude Code-credentials`) or the local credentials file `~/.claude/.credentials.json` created by Claude Code CLI.
- **ChatGPT:** Reads authentication tokens and account ID from `~/.codex/auth.json`.
- **Antigravity:** Click **Login** in the Stream Deck Property Inspector to start the Google OAuth2 flow. Credentials will be securely saved to `~/.limits-streamdeck/antigravity_oauth.json`.
- **Gemini CLI:** Reads Google OAuth credentials from `~/.gemini/oauth_creds.json`.
- **MiniMax:** Enter your API key directly in the Stream Deck Property Inspector.

## Development Scripts

- `npm run build` - Compiles the TypeScript plugin code using Rollup into `com.len.limits.sdPlugin/bin/plugin.js`.
- `npm run watch` - Builds and watches the codebase for modifications, automatically restarting the plugin in the Stream Deck app on save.
- `npm run release` - Packages the plugin into a distributable `.streamDeckPlugin` file.

## License

MIT
