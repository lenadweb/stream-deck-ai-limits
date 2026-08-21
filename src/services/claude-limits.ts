import { ModelUsage, ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ClaudeLimit, ClaudeUsageResponse } from "../interfaces/claude";

/** Marks a bucket or metric that targets a model-scoped weekly limit, e.g. `scoped:Fable`. */
export const SCOPE_PREFIX = "scoped:";

/** Sonnet has a fixed metric of its own, predating the scoped limits. */
export const SONNET_MODEL = "Sonnet";

const SESSION_KEY = "5h_quota";
const WEEKLY_KEY = "7d_quota";
const SONNET_KEY = "7d_sonnet_quota";

export function scopedKey(model: string): string {
    return `${SCOPE_PREFIX}${model}`;
}

/** The model behind a scoped bucket or metric, or null when it is a fixed window. */
export function scopeName(key: string): string | null {
    return key.startsWith(SCOPE_PREFIX) ? key.slice(SCOPE_PREFIX.length) : null;
}

/** The models this account reports a scoped weekly limit for. */
export function scopedNames(result: StandardUsageResult | null): string[] {
    return Object.keys(result?.perModel ?? {})
        .map(scopeName)
        .filter((name): name is string => name !== null);
}

/**
 * Maps Anthropic's `limits` array onto the same bucket keys the library uses, so
 * the fixed windows keep their names and every scoped limit gains one of its own.
 * Returns null when the response has no usable array, leaving the caller to fall
 * back to the library mapping.
 */
export function mapClaudeUsage(raw: ClaudeUsageResponse): StandardUsageResult | null {
    const perModel: Record<string, ModelUsage> = {};

    for (const entry of raw?.limits ?? []) {
        const key = bucketKey(entry);
        if (!key || entry.percent == null) continue;
        perModel[key] = {
            usagePercent: entry.percent,
            resetTime: entry.resets_at ?? null,
            displayName: displayName(key)
        };
    }

    if (Object.keys(perModel).length === 0) return null;

    // The Sonnet window predates the array. Accounts that report it there name it
    // like any other model, so only fall back to the legacy field without one.
    if (!perModel[scopedKey(SONNET_MODEL)] && raw.seven_day_sonnet?.utilization != null) {
        perModel[SONNET_KEY] = {
            usagePercent: raw.seven_day_sonnet.utilization,
            resetTime: raw.seven_day_sonnet.resets_at ?? null,
            displayName: displayName(SONNET_KEY)
        };
    }

    // Overall follows the library: the most constrained account-wide window. A
    // scoped limit caps a single model, so it does not speak for the account.
    const worst = [perModel[SESSION_KEY], perModel[WEEKLY_KEY]]
        .filter((bucket): bucket is ModelUsage => bucket != null)
        .reduce<ModelUsage | null>(
            (worstSoFar, bucket) => ((bucket.usagePercent ?? 0) > (worstSoFar?.usagePercent ?? -1) ? bucket : worstSoFar),
            null
        );

    return {
        provider: ProviderName.Claude,
        overallUsagePercent: worst?.usagePercent ?? null,
        overallResetTime: worst?.resetTime ?? null,
        perModel
    };
}

function bucketKey(entry: ClaudeLimit): string | null {
    if (entry.kind === "session") return SESSION_KEY;
    if (entry.kind === "weekly_all") return WEEKLY_KEY;
    if (entry.kind !== "weekly_scoped") return null;

    const model = entry.scope?.model?.display_name || entry.scope?.surface;
    return model ? scopedKey(model) : null;
}

function displayName(key: string): string {
    const model = scopeName(key);
    if (model) return `7-Day ${model} Quota`;
    if (key === SESSION_KEY) return "5-Hour Quota";
    if (key === SONNET_KEY) return "7-Day Sonnet Quota";
    return "7-Day Quota";
}
