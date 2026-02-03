export interface AntigravityUsage {
    gemini: { used: number; resetAt: string | null; } | null;
    claude: { used: number; resetAt: string | null; } | null;
}

export interface ClaudeUsage {
    sessionUsed: number | null;
    sessionResetsAt: string | null;
    weekUsed: number | null;
    weekResetsAt: string | null;
}

export interface CodexUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null;
    weekUsed: number | null;
    weekResetsAt: number | null;
}
