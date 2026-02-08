import { exec } from "child_process";
import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { AntigravityUsageService } from "../services/antigravity-usage-service";
import { AntigravityUsage } from "../interfaces/usage";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { BaseMonitoringAction } from "./base-monitoring-action";

@action({ UUID: "com.len.limits.antigravity" })
export class AntigravityProgressBars extends BaseMonitoringAction<any> {
    private service = AntigravityUsageService.getInstance();
    private renderer = new ProgressBarRenderer();
    private lastUsage: AntigravityUsage | null = null;

    protected async refresh(ev: any): Promise<void> {
        try {
            const usage = await this.service.fetchUsage();

            if (usage) {
                this.lastUsage = usage;
                await this.draw(ev, usage);
            } else {
                this.lastUsage = null;
                await this.drawPlaceholder(ev);
            }
        } catch (error) {
            streamDeck.logger.error(`[Antigravity] Error updating usage: ${error}`);
            this.lastUsage = null;
            await this.drawPlaceholder(ev);
        }
    }

    protected async redraw(ev: any): Promise<void> {
        if (this.lastUsage) {
            await this.draw(ev, this.lastUsage);
        } else {
            await this.drawPlaceholder(ev);
        }
    }

    override async onKeyDown(ev: any): Promise<void> {
        if (!this.lastUsage) {
            exec("open -a Antigravity");
        }
        await this.refresh(ev);
    }

    private async drawPlaceholder(ev: any) {
        const svg = this.renderer.renderPlaceholder(144, 144);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);

        // Optional: Update dial feedback if on a dial
        const dialSvg = this.renderer.renderPlaceholder(200, 100);
        await this.updateDialFeedback(ev, dialSvg);
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
