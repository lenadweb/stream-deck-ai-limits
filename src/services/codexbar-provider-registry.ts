import type { ServiceTheme } from "../interfaces/theme";

export interface CodexBarProviderMeta {
    displayName: string;
    theme: ServiceTheme;
}

// Curated subset; the fallback covers all 50+ providers.
const REGISTRY: Record<string, CodexBarProviderMeta> = {
    cursor: { displayName: "Cursor", theme: "cursor" },
    copilot: { displayName: "Copilot", theme: "copilot" },
    gemini: { displayName: "Gemini", theme: "gemini" },
    zai: { displayName: "z.ai", theme: "zai" },
    augment: { displayName: "Augment", theme: "augment" },
    windsurf: { displayName: "Windsurf", theme: "windsurf" },
};

const FALLBACK_THEME: ServiceTheme = "codexbar-generic";

export function themeFor(providerId?: string): ServiceTheme {
    if (!providerId) return FALLBACK_THEME;
    return REGISTRY[providerId]?.theme ?? FALLBACK_THEME;
}

export function displayNameFor(providerId?: string): string {
    if (!providerId) return "CodexBar";
    return REGISTRY[providerId]?.displayName ?? providerId;
}

export function knownProviderIds(): string[] {
    return Object.keys(REGISTRY);
}
