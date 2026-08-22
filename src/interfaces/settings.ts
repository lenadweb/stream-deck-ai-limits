export type ProgressBarSettings = Record<string, any>;

/** How a single tile lays out its data: one ring gauge, or the two-slot bar view. */
export type TileLayout = "ring" | "bars";

/**
 * One of the fixed windows, or the bucket key of a weekly limit scoped to a single
 * model, e.g. `7d_fable_quota`. Anthropic reports the scoped ones per account, so
 * they cannot be enumerated up front.
 */
export type ClaudeMetric = "session" | "weekly" | "weeklySonnet" | (string & {});

/** A model-scoped weekly limit as the picker lists it: its bucket key and a name. */
export interface ClaudeScope {
    key: string;
    label: string;
}

export interface ClaudeSettings extends ProgressBarSettings {
    layout?: TileLayout;
    /** Metric shown by the ring layout. */
    metric?: ClaudeMetric;
    /** Metrics shown by the bars layout. */
    topMetric?: ClaudeMetric;
    bottomMetric?: ClaudeMetric;
    /** Scoped limits seen on the last fetch, so the picker works offline. */
    availableScopes?: ClaudeScope[];
}

export type CodexMetric = "session" | "weekly" | "resetCredits" | "credits" | "none";

/** Pre-0.2 setting: the bottom slot of the (then only) bar layout. Migrated on read. */
export type CodexSecondaryMetric = "credits" | "resetCredits" | "none";

export interface CodexSettings extends ProgressBarSettings {
    layout?: TileLayout;
    metric?: CodexMetric;
    topMetric?: CodexMetric;
    bottomMetric?: CodexMetric;
    secondaryMetric?: CodexSecondaryMetric;
}

export interface GeminiSettings {
    layout?: TileLayout;
    /** Model shown by the ring layout; empty string means the overall quota. */
    model?: string;
    topModel?: string;
    bottomModel?: string;
    availableModels?: string[];
    [key: string]: any;
}

export interface AntigravitySettings {
    layout?: TileLayout;
    model?: string;
    topModel?: string;
    bottomModel?: string;
    availableModels?: string[];
    availableModelLabels?: Record<string, string>;
    loggedInEmail?: string;
    [key: string]: any;
}

export type MiniMaxMetric = "daily" | "weekly";

export interface MiniMaxSettings {
    apiKey?: string;
    layout?: TileLayout;
    metric?: MiniMaxMetric;
    topMetric?: MiniMaxMetric;
    bottomMetric?: MiniMaxMetric;
    [key: string]: any;
}

export type OpenRouterMetric = "limit" | "daily" | "weekly" | "monthly" | "total";

export interface OpenRouterSettings {
    apiKey?: string;
    layout?: TileLayout;
    metric?: OpenRouterMetric;
    topMetric?: OpenRouterMetric;
    bottomMetric?: OpenRouterMetric;
    [key: string]: any;
}

/** A CodexBar window id: primary/secondary/tertiary or an `extra:<id>` window. */
export type CodexBarMetric = string;

/** The existing provider palettes available to a generic CodexBar tile. */
export type CodexBarTheme = "codexbar" | "codex" | "claude" | "gemini-cli" | "antigravity" | "minimax" | "openrouter";

export interface CodexBarSettings {
    /** Provider identifier as reported by CodexBar; it is selected from the discovered list. */
    providerId?: string;
    /** CodexBar's optional account label for providers with multiple accounts. */
    account?: string;
    port?: number;
    /** Explicit opt-in to start a locally installed CodexBar CLI when its server is unavailable. */
    autoStart?: boolean;
    layout?: TileLayout;
    metric?: CodexBarMetric;
    topMetric?: CodexBarMetric;
    bottomMetric?: CodexBarMetric;
    theme?: CodexBarTheme;
    showProviderName?: boolean;
    [key: string]: any;
}
