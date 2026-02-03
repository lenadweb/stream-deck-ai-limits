import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { AntigravityUsage, AntigravityUsageService } from "../services/antigravity-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.antigravity" })
export class AntigravityProgressBars extends BaseMonitoringAction<any> {
    private service = AntigravityUsageService.getInstance();
    private renderer = new ProgressBarRenderer();

    protected async refresh(ev: any): Promise<void> {
        try {
            const usage = await this.service.fetchUsage();

            if (usage) {
                await this.draw(ev, usage);
            } else {
                streamDeck.logger.warn("[Antigravity] Failed to fetch usage");
            }
        } catch (error) {
            streamDeck.logger.error(`[Antigravity] Error updating usage: ${error}`);
        }
    }

    private async draw(ev: any, usage: AntigravityUsage) {
        const geminiPercent = usage.gemini?.used ?? 0;
        const claudePercent = usage.claude?.used ?? 0;

        const svg = this.renderer.render(
            claudePercent,
            geminiPercent,
            'antigravity',
            usage.claude?.resetAt,
            usage.gemini?.resetAt,
            'Claude',
            'Gemini',
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        // Use base class helper or custom logic
        const dialSvg = this.renderer.render(
            claudePercent,
            geminiPercent,
            'antigravity',
            usage.claude?.resetAt,
            usage.gemini?.resetAt,
            'Claude',
            'Gemini',
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
