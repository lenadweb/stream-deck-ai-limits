import { action } from "@elgato/streamdeck";
import { CodexUsageService, CodexUsage } from "../services/codex-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.codex.progress" })
export class CodexProgressBars extends BaseMonitoringAction<ProgressBarSettings> {
    private readonly usageService = new CodexUsageService();
    private readonly renderer = new ProgressBarRenderer();
    private loaderInterval: NodeJS.Timeout | null = null;
    // isLoading and loaderFrame are now in base class

    // Lifecycle methods removed as they are handled by base class
    // User interaction handlers removed as they are handled by base class

    protected async refresh(ev: any): Promise<void> {
        this.isLoading = true;
        this.startLoadingAnimation(ev);

        try {
            const usage = await this.usageService.fetchUsage();
            if (usage && (usage.sessionUsed !== null || usage.weekUsed !== null)) {
                this.isLoading = false;
                this.stopLoadingAnimation();
                this.draw(ev, usage);
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
            const svg = this.renderer.renderLoader(this.loaderFrame, 'codex');
            const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
            await ev.action.setImage(image);

            await this.updateDialFeedback(ev, svg);
        }, 100);
    }

    private stopLoadingAnimation() {
        if (this.loaderInterval) {
            clearInterval(this.loaderInterval);
            this.loaderInterval = null;
        }
    }

    private async draw(ev: any, usage: CodexUsage) {
        const sessionPercent = usage.sessionUsed ?? 0;
        const weekPercent = usage.weekUsed ?? 0;

        const svg = this.renderer.render(
            sessionPercent,
            weekPercent,
            'codex',
            usage.sessionResetsAt,
            usage.weekResetsAt,
            "Session", "Week",
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        // Dial Feedback
        const dialSvg = this.renderer.render(
            sessionPercent,
            weekPercent,
            'codex',
            usage.sessionResetsAt,
            usage.weekResetsAt,
            "Session", "Week",
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
