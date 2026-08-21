/**
 * Anthropic reports its quota windows twice: as the legacy top-level fields that
 * `@lenadweb/ai-limits` maps, and as a `limits` array that also carries the
 * model-scoped weekly limits. Only the array names the model behind a limit, so
 * these types describe the part of the response the library does not model yet.
 */
export interface ClaudeLimitScope {
    model?: { display_name?: string | null } | null;
    surface?: string | null;
}

export interface ClaudeLimit {
    /** `session`, `weekly_all` or `weekly_scoped`; any other kind is ignored. */
    kind?: string;
    /** Utilization of the window, 0-100. */
    percent?: number;
    resets_at?: string | null;
    /** Present on `weekly_scoped` entries, naming the model the limit applies to. */
    scope?: ClaudeLimitScope | null;
}

export interface ClaudeUsageResponse {
    limits?: ClaudeLimit[];
    seven_day_sonnet?: { utilization?: number; resets_at?: string | null } | null;
}
