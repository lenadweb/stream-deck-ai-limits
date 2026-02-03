export interface AntigravityUsage {
    gemini: { used: number; resetAt: string | null; } | null;
    claude: { used: number; resetAt: string | null; } | null;
}

export class AntigravityParser {
    parse(data: any): AntigravityUsage {
        const models = data.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];

        return {
            gemini: this.parseModel(models, 'Gemini 3 Pro', 'Flash'),
            claude: this.parseModel(models, 'Claude')
        };
    }

    private parseModel(models: any[], include: string, exclude?: string): { used: number; resetAt: string | null; } | null {
        const model = models.find((m: any) =>
            m.label?.includes(include) && (!exclude || !m.label?.includes(exclude))
        );

        if (!model?.quotaInfo) return null;

        const { remainingFraction, resetTime } = model.quotaInfo;
        let used: number | null = null;

        if (typeof remainingFraction === 'number') {
            used = Math.round((1 - remainingFraction) * 100);
        } else if (resetTime) {
            // If there is a reset time but no remaining fraction, assume capped (100% used)
            // or maybe it means 0%? The original code assumed 100 if resetTime generic check.
            // "if (model.quotaInfo.resetTime) used = 100;"
            used = 100;
        }

        if (used === null) return null;

        return {
            used,
            resetAt: resetTime || null
        };
    }
}
