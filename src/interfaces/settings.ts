export type ProgressBarSettings = Record<string, any>;

export interface GeminiSettings {
    topModel?: string;
    bottomModel?: string;
    availableModels?: string[];
    [key: string]: any;
}

export interface MiniMaxSettings {
    apiKey?: string;
    [key: string]: any;
}
