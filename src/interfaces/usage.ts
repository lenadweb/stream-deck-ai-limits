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
    error?: { code: number | string; message: string };
}

export interface ClaudeUsage {
    sessionUsed: number | null;
    sessionResetsAt: string | null;
    weekUsed: number | null;
    weekResetsAt: string | null;
    error?: { code: number | string; message: string };
}

export interface CodexUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null;
    weekUsed: number | null;
    weekResetsAt: number | null;
    error?: { code: number | string; message: string };
}

export interface MiniMaxUsage {
    sessionUsed: number | null;
    sessionResetsAt: number | null;
    weekUsed: number | null;
    weekResetsAt: number | null;
    error?: { code: number | string; message: string };
}
