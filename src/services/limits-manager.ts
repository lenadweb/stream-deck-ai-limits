import streamDeck from "@elgato/streamdeck";
import { LimitsClient, ProviderName, AntigravityProvider, GeminiProvider, OpenRouterProvider, Logger } from "@lenadweb/ai-limits";

export const streamDeckLogger: Logger = {
    log: (message: string) => streamDeck.logger.info(message),
    error: (message: string) => streamDeck.logger.error(message),
};

export class LimitsManager {
    private static instance: LimitsManager;
    private client = new LimitsClient({ logger: streamDeckLogger });

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

    getOpenRouterProvider(): OpenRouterProvider {
        return this.client.getProvider<OpenRouterProvider>(ProviderName.OpenRouter);
    }
}
