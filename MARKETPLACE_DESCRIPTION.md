Open source: https://github.com/lenadweb/stream-deck-ai-limits

AI Usage Limits gives you a live view of your AI usage limits directly on your Stream Deck keys and dials. It tracks quotas and rate limits for Claude Code, Codex (ChatGPT), Antigravity, Gemini CLI, MiniMax and OpenRouter, so you can see how much of your session, daily or weekly quota is already used and when it resets — without opening a terminal, a dashboard or a billing page.

What it does:

- Shows AI usage limits, percentages and reset countdowns on a single key, updated automatically.
- Two layouts per key: Bars for two metrics at once, or Ring for one large gauge with the value and reset countdown inside it.
- Lets every key pick its own metric, so you can place the same action several times, for example Claude session next to Claude weekly.
- Includes provider actions for Claude, Codex, Antigravity, Gemini CLI, MiniMax and OpenRouter.
- Adds an optional CodexBar backend action for advanced users, which displays any provider you have configured in CodexBar.
- Supports automatic periodic refresh plus manual refresh on demand.
- Works with Stream Deck dials (Encoder): push/touch/rotate can trigger refresh.

How it looks:

- Color-coded usage bars turn amber and red as you approach the cap, with countdowns like 3h 33m or 4d 3h.
- Ring keys put one metric front and centre, readable across the room.
- Each provider has its own visual theme for quick recognition; the provider name can be hidden for a cleaner key.
- If data is temporarily unavailable, the key shows a neutral placeholder instead of stale values, and a window your plan does not report reads "no data" instead of a misleading 0%.

Getting started:

1. Install the plugin and restart Stream Deck if needed.
2. Drag the provider action you want onto a key or dial.
3. Press the key once to trigger the first fetch.
4. Make sure you are logged into the related service locally.

Configuration:

- Claude: choose the 5-hour session window, the 7-day window or the 7-day Sonnet window for each section.
- Codex: choose session usage, weekly usage, usage limit resets or credits balance, or hide the bottom section.
- Gemini CLI and Antigravity: open action settings and choose the models to display (or keep the overall view).
- MiniMax: enter your API key and choose daily or weekly usage.
- OpenRouter: enter your API key and choose the key limit or spend by day, week, month or all time.
- CodexBar backend (optional, for advanced users): start `codexbar serve`, then load enabled providers from the action settings and choose a provider, account, quota windows and tile theme. Extra metrics include credits, pace, identity and data confidence, plus API-key budget, spend and rate limit for OpenRouter.
- Keys with the same API key share a single request, so extra keys cost no extra API calls.
- Other providers rely on locally available auth/session data from their respective tools/apps.

Usage controls:

- Key press: force refresh immediately.
- On dial-enabled devices: push/touch/rotate also refreshes.
- Background refresh keeps values reasonably up to date between manual checks, and cached values are drawn instantly when you switch pages or profiles.

Notes:

- If local auth data or API access is missing, that provider may not return values until credentials are available.
- Antigravity usage depends on its local process being accessible.
- The CodexBar backend is an optional extra for advanced users: it connects only to a local 127.0.0.1 CodexBar server and is intended for macOS. Every other provider works without it.
- OpenAI currently exposes only a weekly window on several Codex plans; a key set to the session limit shows "no data" until the 5-hour window returns.
- Works on macOS and Windows. On macOS, Claude credentials are read from the Keychain; on Windows they are read from the credential file written by Claude Code.

If you want support for additional providers, send feedback and tell us which ones to add next.
