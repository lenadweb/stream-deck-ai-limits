export type ProgressBarSettings = Record<string, any>;

export type CodexSecondaryMetric = "credits" | "resetCredits" | "none";

export interface CodexSettings extends ProgressBarSettings {
    secondaryMetric?: CodexSecondaryMetric;
}

export interface GeminiSettings {
    topModel?: string;
    bottomModel?: string;
    availableModels?: string[];
    [key: string]: any;
}

export interface AntigravitySettings {
    topModel?: string;
    bottomModel?: string;
    availableModels?: string[];
    availableModelLabels?: Record<string, string>;
    loggedInEmail?: string;
    [key: string]: any;
}

export interface MiniMaxSettings {
    apiKey?: string;
    [key: string]: any;
}

export type OpenRouterMetric = "limit" | "daily" | "weekly" | "monthly" | "total";

export interface OpenRouterSettings {
    apiKey?: string;
    topMetric?: OpenRouterMetric;
    bottomMetric?: OpenRouterMetric;
    [key: string]: any;
}
