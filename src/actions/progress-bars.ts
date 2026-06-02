import streamDeck, { action } from "@elgato/streamdeck";
import { ClaudeUsage } from "../interfaces/usage";
import { ProgressBarSettings } from "../interfaces/settings";
import { ClaudeUsageService } from "../services/claude-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends BaseMonitoringAction<ProgressBarSettings> {
    private readonly usageService = new ClaudeUsageService();
    private readonly renderer = new ProgressBarRenderer();
    private lastUsage: ClaudeUsage | null = null;

    protected async refresh(ev: any): Promise<void> {
        try {
            const usage = await this.usageService.fetchUsage();
            if (usage) {
                this.lastUsage = usage;
                this.draw(ev, usage);
            }
        } catch (err) {
        }
    }

    protected async redraw(ev: any): Promise<void> {
        if (this.lastUsage) {
            await this.draw(ev, this.lastUsage);
        }
    }

    private async draw(ev: any, usage: ClaudeUsage) {
        if (usage.error) {
            const svg = this.renderer.renderError(usage.error.message, 'claude', 144, 144);
            const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
            await ev.action.setImage(image);

            const dialSvg = this.renderer.renderError(usage.error.message, 'claude', 200, 100);
            await this.updateDialFeedback(ev, dialSvg);
            return;
        }

        const sessionPercent = usage.sessionUsed ?? 0;
        const weekPercent = usage.weekUsed ?? 0;

        const svg = this.renderer.render(
            sessionPercent,
            weekPercent,
            'claude',
            usage.sessionResetsAt,
            usage.weekResetsAt,
            "Session", "Week",
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.render(
            sessionPercent,
            weekPercent,
            'claude',
            usage.sessionResetsAt,
            usage.weekResetsAt,
            "Session", "Week",
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
