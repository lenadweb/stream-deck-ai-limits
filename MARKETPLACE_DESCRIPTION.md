Open source: https://github.com/lenadweb/stream-deck-ai-limits

AI Usage Limits shows your AI usage limits and reset times directly on Stream Deck keys and dials. Track Claude Code, Codex (ChatGPT), Antigravity, Gemini CLI, MiniMax, OpenCode and OpenRouter without opening a terminal, dashboard or billing page.

What it does:

- Shows live usage percentages and reset countdowns, refreshed automatically.
- Offers two layouts: **Bars** for two metrics at once, or **Ring** for one large gauge with the value and reset time inside.
- Provides four sizes: Compact, Default, Large and Extra Large.
- Lets every key choose its own metric, so one action can be placed several times with different metrics.
- Includes native actions for Claude, Codex, Antigravity, Gemini CLI, MiniMax, OpenCode and OpenRouter.
- Adds an optional CodexBar backend action for providers configured in a local CodexBar server.
- Supports manual refresh by key press, dial touch or dial rotation.

How it looks:

- Color-coded bars turn amber and red as you approach the limit, with countdowns like `3h 33m` or `4d 3h`.
- Ring keys put one metric front and centre, readable from a distance.
- Every provider has its own theme; the provider name can be hidden for a cleaner key.
- Unavailable data shows a neutral placeholder; unsupported windows show `no data` instead of a misleading 0%.

Getting started:

1. Install the plugin and restart Stream Deck if needed.
2. Drag the provider action you want onto a key or dial.
3. Press the key once to trigger the first fetch.
4. Make sure you are signed in to the related service locally.

Configuration:

- **Claude:** choose the 5-hour session, 7-day weekly or 7-day Sonnet weekly window for each section.
- **Codex:** choose session usage, weekly usage, usage-limit resets or credits balance, or hide the bottom section.
- **Gemini CLI:** choose the models to display, or keep the overall view.
- **Antigravity:** install the Antigravity CLI (`agy`), sign in, then choose a shared quota pool (Gemini or Claude/GPT) or the most-used pool.
- **MiniMax:** enter your API key and choose daily or weekly usage.
- **OpenCode:** enter a personal API key from OpenCode Console and choose Auto, 5-hour, weekly, monthly, overall, budget or Zen balance. Auto follows the Go allowance when the workspace has Go, otherwise the most-used Console budget or prepaid balance.
- **OpenRouter:** enter your API key and choose the key limit or spend by day, week, month or all time.
- **CodexBar backend (optional):** start `codexbar serve`, then load providers from the action settings and choose a provider, account, quota windows and theme. Extra metrics include credits, pace, identity, data confidence and OpenRouter budget/spend.
- Keys using the same API key share one request, so extra tiles cost no extra calls.
- Other providers use the auth or session data stored locally by their own tools.

Usage controls:

- Key press forces an immediate refresh.
- On dial devices, push/touch/rotate also refreshes.
- Background refresh keeps values current between manual checks, and cached values appear instantly when switching pages or profiles.

Notes:

- If local auth data or API access is missing, that provider may show an error until credentials are available.
- Antigravity reads usage from the signed-in `agy` CLI, found on `PATH` or in `~/.local/bin`. The settings panel includes setup and troubleshooting hints.
- The CodexBar backend is optional and connects only to a local `127.0.0.1` server; it is intended for macOS. Every other provider works without it.
- OpenAI currently exposes only a weekly window on several Codex plans; a tile set to the session limit shows `no data` until the 5-hour window returns.
- Works on macOS and Windows. On macOS, Claude credentials are read from the Keychain; on Windows they are read from the credential file written by Claude Code.

Want support for another provider? Send feedback and tell us which one to add next.
