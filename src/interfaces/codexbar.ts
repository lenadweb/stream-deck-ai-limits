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

/** Provider-specific information rendered by CodexBar below its quota windows. */
export interface CodexBarDetailRow {
    label?: string;
    value?: string | number | null;
    secondaryValue?: string | null;
}

export interface CodexBarDetailChartPoint {
    label?: string;
    value?: string | number | null;
}

export interface CodexBarDetailSection {
    title?: string;
    rows?: CodexBarDetailRow[];
    chart?: {
        title?: string;
        unit?: string;
        points?: CodexBarDetailChartPoint[];
    };
}

export interface CodexBarUsageSnapshot {
    primary?: CodexBarRateWindow | null;
    secondary?: CodexBarRateWindow | null;
    tertiary?: CodexBarRateWindow | null;
    extraRateWindows?: CodexBarNamedRateWindow[] | null;
    details?: CodexBarDetailSection[] | null;
    updatedAt?: string;
}

export interface CodexBarProviderPayload {
    provider: string;
    account?: string | null;
    source?: string;
    usage?: CodexBarUsageSnapshot | null;
    error?: CodexBarError | null;
}

export interface CodexBarError {
    code?: string | number;
    message: string;
}

export interface CodexBarResult {
    payload?: CodexBarProviderPayload | null;
    error?: CodexBarError | null;
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
    error?: CodexBarError | null;
}

export interface CodexBarServerStatus {
    state: "running" | "stopped";
    /** True only when this Stream Deck plugin session spawned the process. */
    managed: boolean;
    pid?: number;
}
