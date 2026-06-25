import type { UsageSnapshot } from "../interfaces/codexbar";

export interface NormalizedDisplay {
    value1: number;
    value2: number;
    label1: string;
    label2: string;
    resetTime1: string | null;
    resetTime2: string | null;
}

function clampPercent(v: number | undefined | null): number {
    if (v == null || Number.isNaN(v)) return 0;
    if (v < 0) return 0;
    if (v > 100) return 100;
    return v;
}

export function normalizeCodexBarDisplay(
    snapshot: UsageSnapshot | null | undefined,
    topWindow: "primary" | "secondary",
): NormalizedDisplay {
    const primary = snapshot?.primary ?? null;
    const secondary = snapshot?.secondary ?? null;
    const top = topWindow === "secondary" ? secondary : primary;
    const bottom = topWindow === "secondary" ? primary : secondary;

    return {
        value1: clampPercent(top?.usedPercent),
        value2: clampPercent(bottom?.usedPercent),
        label1: "Session",
        label2: "Week",
        resetTime1: top?.resetsAt ?? null,
        resetTime2: bottom?.resetsAt ?? null,
    };
}
