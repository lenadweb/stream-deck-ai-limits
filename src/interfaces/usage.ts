export interface AntigravityModelQuota {
    usage: number;
    remaining: number;
    limit: number;
    resetTime?: string;
    displayName?: string;
}

export interface AntigravityQuotaResult {
    overallUsage: number;
    overallResetTime: string | null;
    perModel: Map<string, AntigravityModelQuota>;
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

export interface MiniMaxUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null;
    weekUsed: number | null;
    weekResetsAt: number | null;
}
