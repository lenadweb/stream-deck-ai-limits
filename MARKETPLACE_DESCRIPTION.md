Open source: https://github.com/lenadweb/stream-deck-ai-limits

AI Usage Limits gives you a live view of your AI usage limits directly on your Stream Deck keys. It helps you avoid hitting caps unexpectedly by showing how much of your daily/weekly quota is already used and when it resets.

What it does:

- Displays usage as dual progress bars on a single key.
- Shows usage percentages and reset times.
- Supports automatic periodic refresh plus manual refresh on demand.
- Includes provider actions for Claude, Codex, Antigravity, Gemini CLI, and MiniMax.
- Works with Stream Deck dials (Encoder): push/touch/rotate can trigger refresh.

How it looks:

- Two bars represent two usage windows (typically current session/day and weekly window).
- Each provider has its own visual theme for quick recognition.
- If data is temporarily unavailable, the key shows a neutral placeholder instead of stale values.

Getting started:

1. Install the plugin and restart Stream Deck if needed.
2. Drag the provider action you want onto a key.
3. Press the key once to trigger the first fetch.
4. Make sure you are logged into the related service locally.

Configuration:

- Gemini CLI: open action settings and choose the models for top and bottom bars (or keep overall view).
- MiniMax: open action settings and enter your API key.
- Other providers rely on locally available auth/session data from their respective tools/apps.

Usage controls:

- Key press: force refresh immediately.
- On dial-enabled devices: push/touch/rotate also refreshes.
- Background refresh keeps values reasonably up to date between manual checks.

Notes:

- If local auth data or API access is missing, that provider may not return values until credentials are available.
- Antigravity usage depends on its local process being accessible.
- Works on macOS and Windows. On macOS, Claude credentials are read from the Keychain; on Windows they are read from the credential file written by Claude Code.

If you want support for additional providers, send feedback and tell us which ones to add next.