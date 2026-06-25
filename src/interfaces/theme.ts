export type ServiceTheme =
    | 'claude' | 'codex' | 'antigravity' | 'gemini-cli' | 'minimax' | 'openrouter'
    // CodexBar-backed providers (curated brand themes)
    | 'cursor' | 'copilot' | 'gemini' | 'zai' | 'augment' | 'windsurf'
    // Fallback for any provider without a curated theme
    | 'codexbar-generic';

export interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    label: string;
    barBg: string;
    barFill?: string;
}
