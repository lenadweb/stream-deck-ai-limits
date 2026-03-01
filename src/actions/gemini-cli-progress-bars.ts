import { action } from "@elgato/streamdeck";
import { ProgressBarSettings } from "../interfaces/settings";
import { GeminiCliUsageService } from "../services/gemini-cli-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.gemini-cli" })
export class GeminiCliProgressBars extends BaseMonitoringAction<ProgressBarSettings> {
    private readonly usageService = GeminiCliUsageService.getInstance();
    private readonly renderer = new ProgressBarRenderer();
    private lastUsage: number | null = null;

    protected async refresh(ev: any): Promise<void> {
        try {
            const usagePercent = await this.usageService.getUsagePercentage();
            this.lastUsage = usagePercent;
            this.draw(ev, usagePercent);
        } catch (err) {
            // Silently fail or log
        }
    }

    protected async redraw(ev: any): Promise<void> {
        if (this.lastUsage !== null) {
            await this.draw(ev, this.lastUsage);
        }
    }


    private async draw(ev: any, usagePercent: number) {
        // We only have one single generic quota (0-100) for Gemini so we'll 
        // display it as "Limit" taking up the primary bar. 
        // For the secondary bar we use 0% and leave it blank.
        const svg = this.renderer.render(
            usagePercent,
            0,
            'gemini-cli',
            null, // No single reset time since it varies per model
            null,
            "Usage", "Limit",
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.render(
            usagePercent,
            0,
            'gemini-cli',
            null,
            null,
            "Usage", "Limit",
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
