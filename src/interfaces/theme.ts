export type ServiceTheme = 'claude' | 'codex' | 'antigravity' | 'gemini-cli' | 'minimax' | 'openrouter';

export interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    label: string;
    barBg: string;
    barFill?: string;
}
