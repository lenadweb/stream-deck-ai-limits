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
    private loaderInterval: NodeJS.Timeout | null = null;

    protected async refresh(ev: any): Promise<void> {
        this.isLoading = true;
        this.startLoadingAnimation(ev);

        try {
            const usage = await this.usageService.fetchUsage();
            if (usage && (usage.sessionUsed !== null || usage.weekUsed !== null)) {
                this.isLoading = false;
                this.stopLoadingAnimation();
                this.draw(ev, usage);
            } else {
                this.isLoading = false;
                this.stopLoadingAnimation();
                streamDeck.logger.warn("[Usage] Fetch returned null, stopping loader");
            }
        } catch (err) {
            this.isLoading = false;
            this.stopLoadingAnimation();
        }
    }

    private startLoadingAnimation(ev: any) {
        if (this.loaderInterval) clearInterval(this.loaderInterval);

        this.loaderFrame = 0;
        this.loaderInterval = setInterval(async () => {
            if (!this.isLoading) {
                this.stopLoadingAnimation();
                return;
            }
            this.loaderFrame = (this.loaderFrame + 30) % 360;
            const keySvg = this.renderer.renderLoader(this.loaderFrame, 'claude', 144, 144);
            const dialSvg = this.renderer.renderLoader(this.loaderFrame, 'claude', 200, 100);

            const image = `data:image/svg+xml;base64,${Buffer.from(keySvg).toString('base64')}`;
            await ev.action.setImage(image);

            await this.updateDialFeedback(ev, dialSvg);
        }, 100);
    }

    private stopLoadingAnimation() {
        if (this.loaderInterval) {
            clearInterval(this.loaderInterval);
            this.loaderInterval = null;
        }
    }

    private async draw(ev: any, usage: ClaudeUsage) {
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
