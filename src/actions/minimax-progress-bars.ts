import { action } from "@elgato/streamdeck";
import { MiniMaxUsage } from "../services/minimax-usage-service";
import { MiniMaxSettings } from "../interfaces/settings";
import { MiniMaxUsageService } from "../services/minimax-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.minimax" })
export class MiniMaxProgressBars extends BaseMonitoringAction<MiniMaxSettings> {
    private readonly usageService = new MiniMaxUsageService();
    private readonly renderer = new ProgressBarRenderer();
    private lastUsage: MiniMaxUsage | null = null;
    private settings: MiniMaxSettings = {};

    override async onWillAppear(ev: any): Promise<void> {
        this.settings = (ev.payload?.settings ?? {}) as MiniMaxSettings;
        await super.onWillAppear(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        this.settings = (ev.payload?.settings ?? {}) as MiniMaxSettings;
        await this.refresh(ev);
    }

    protected async refresh(ev: any): Promise<void> {
        try {
            const usage = await this.usageService.fetchUsage(this.settings);
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

    private async draw(ev: any, usage: MiniMaxUsage) {
        if (usage.error) {
            const svg = this.renderer.renderError(usage.error.message, 'minimax', 144, 144);
            const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
            await ev.action.setImage(image);

            const dialSvg = this.renderer.renderError(usage.error.message, 'minimax', 200, 100);
            await this.updateDialFeedback(ev, dialSvg);
            return;
        }

        const sessionPercent = usage.sessionUsed ?? 0;
        const weekPercent = usage.weekUsed ?? 0;

        const svg = this.renderer.render(
            sessionPercent,
            weekPercent,
            'minimax',
            usage.sessionResetsAt,
            usage.weekResetsAt,
            "Daily", "Week",
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.render(
            sessionPercent,
            weekPercent,
            'minimax',
            usage.sessionResetsAt,
            usage.weekResetsAt,
            "Daily", "Week",
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }
}
