// Mirrors CodexBar serve JSON (CodexBarCore Codable field names).
// All fields optional/nullable for resilience — providers are heterogeneous.

export interface RateWindow {
    usedPercent: number;          // 0-100
    windowMinutes?: number | null;
    resetsAt?: string | null;     // ISO8601
    resetDescription?: string | null;
}

export interface UsageSnapshot {
    primary?: RateWindow | null;
    secondary?: RateWindow | null;
    tertiary?: RateWindow | null;
    extraRateWindows?: { name: string; [k: string]: unknown }[] | null;
    updatedAt: string;
}

export interface ProviderPayload {
    provider: string;
    source: string;
    usage?: UsageSnapshot | null;
    credits?: unknown | null;
    error?: { message: string; [k: string]: unknown } | null;
}

export interface HealthPayload {
    status: string;
    version?: string;
}

// Shape returned to BaseMonitoringAction. `error` has `message`, matching the
// shape BaseMonitoringAction.draw() reads (`result.error.message`).
export interface CodexBarResult {
    usage?: UsageSnapshot | null;
    error?: { message: string; code?: string } | null;
}

// Persisted via Stream Deck settings.
export interface CodexBarGenericSettings {
    providerId?: string;                       // default "cursor"
    port?: number;                             // default 8080
    window?: "primary" | "secondary";          // which window is the TOP bar; default "primary"
    showProviderName?: boolean;
}
