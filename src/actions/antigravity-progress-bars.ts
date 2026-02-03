import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { AntigravityUsage, AntigravityUsageService } from "../services/antigravity-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";

@action({ UUID: "com.len.limits.antigravity" })
export class AntigravityProgressBars extends SingletonAction<any> {
    private service = AntigravityUsageService.getInstance();
    private renderer = new ProgressBarRenderer();
    private intervalId: NodeJS.Timeout | null = null;
    private isMonitoring = false;
    private controllers = new Map<string, string>();

    override async onWillAppear(ev: WillAppearEvent<any>): Promise<void> {
        this.controllers.set(ev.action.id, ev.payload.controller);
        if (!this.isMonitoring) {
            this.isMonitoring = true;
            this.startMonitoring(ev);
        }
    }

    override async onWillDisappear(ev: WillDisappearEvent<any>): Promise<void> {
        this.controllers.delete(ev.action.id);
        this.isMonitoring = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    override async onKeyDown(ev: KeyDownEvent<any>): Promise<void> {
        await this.updateUsage(ev);
    }

    override async onDialUp(ev: any): Promise<void> {
        await this.updateUsage(ev);
    }

    override async onDialRotate(ev: any): Promise<void> {
        await this.updateUsage(ev);
    }

    override async onTouchTap(ev: any): Promise<void> {
        await this.updateUsage(ev);
    }

    private startMonitoring(ev: any) {
        this.updateUsage(ev);

        this.intervalId = setInterval(() => {
            if (this.isMonitoring) {
                this.updateUsage(ev);
            }
        }, 300000);
    }

    private async updateUsage(ev: any) {
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

        const controller = this.controllers.get(ev.action.id);

        if (controller === 'Encoder') {
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
            const feedback = {
                full_view: `data:image/svg+xml;base64,${Buffer.from(dialSvg).toString('base64')}`
            };

            try {
                await (ev.action as any).setFeedback(feedback);
            } catch (err) {
                streamDeck.logger.error(`[Antigravity] Failed to set feedback: ${err}`);
            }
        }
    }
}
