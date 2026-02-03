export type ServiceTheme = 'claude' | 'codex' | 'antigravity';

export interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    label: string;
    barBg: string;
    barFill?: string;
}
