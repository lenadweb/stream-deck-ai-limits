/** The stable, display-oriented part of the JSON returned by `codexbar serve`. */
export interface CodexBarRateWindow {
    usedPercent?: number | null;
    windowMinutes?: number | null;
    resetsAt?: string | null;
    resetDescription?: string | null;
    isSyntheticPlaceholder?: boolean;
}

export interface CodexBarNamedRateWindow {
    id: string;
    title: string;
    window: CodexBarRateWindow;
    usageKnown?: boolean;
}

export interface CodexBarUsageSnapshot {
    primary?: CodexBarRateWindow | null;
    secondary?: CodexBarRateWindow | null;
    tertiary?: CodexBarRateWindow | null;
    extraRateWindows?: CodexBarNamedRateWindow[] | null;
    updatedAt?: string;
}

export interface CodexBarProviderPayload {
    provider: string;
    account?: string | null;
    source?: string;
    usage?: CodexBarUsageSnapshot | null;
    error?: { code?: string | number; message?: string } | null;
}

export interface CodexBarResult {
    payload?: CodexBarProviderPayload | null;
    error?: { message: string } | null;
}

export interface CodexBarMetricOption {
    id: string;
    label: string;
}

export interface CodexBarProviderOption {
    provider: string;
    account: string;
    label: string;
    metrics: CodexBarMetricOption[];
}
