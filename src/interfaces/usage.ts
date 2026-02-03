export interface AntigravityUsage {
    gemini: { used: number; resetAt: string | null; } | null;
    claude: { used: number; resetAt: string | null; } | null;
}

export interface ClaudeUsage {
    sessionUsed: number | null; // Percent 0-100
    sessionResetsAt: string | null; // ISO Date or specialized string
    weekUsed: number | null; // Percent 0-100
    weekResetsAt: string | null; // ISO Date
}

export interface CodexUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null; // Timestamp
    weekUsed: number | null;
    weekResetsAt: number | null; // Timestamp
}
