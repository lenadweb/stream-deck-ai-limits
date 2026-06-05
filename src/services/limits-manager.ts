import { LimitsClient, ProviderName, AntigravityProvider, GeminiProvider } from "@lenadweb/ai-limits";

export class LimitsManager {
    private static instance: LimitsManager;
    private client = new LimitsClient();

    private constructor() {}

    static getInstance(): LimitsManager {
        if (!LimitsManager.instance) {
            LimitsManager.instance = new LimitsManager();
        }
        return LimitsManager.instance;
    }

    getClient(): LimitsClient {
        return this.client;
    }

    getAntigravityProvider(): AntigravityProvider {
        return this.client.getProvider<AntigravityProvider>(ProviderName.Antigravity);
    }

    getGeminiProvider(): GeminiProvider {
        return this.client.getProvider<GeminiProvider>(ProviderName.Gemini);
    }
}
