import { action, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { CodexUsageService, CodexUsage } from "../services/codex-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.codex.progress" })
export class CodexProgressBars extends SingletonAction<ProgressBarSettings> {
    private readonly usageService = new CodexUsageService();
    private readonly renderer = new ProgressBarRenderer();
    private loaderInterval: NodeJS.Timeout | null = null;
    private isLoading = false;
    private loaderFrame = 0;

    override async onWillAppear(ev: WillAppearEvent<ProgressBarSettings>): Promise<void> {
        this.fetchData(ev);
    }

    override async onWillDisappear(): Promise<void> {
        this.usageService.stopMonitoring();
        this.stopLoadingAnimation();
    }

    override async onKeyUp(ev: any): Promise<void> {
        this.fetchData(ev);
    }

    private async fetchData(ev: any) {
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

    private startLoadingAnimation(ev: WillAppearEvent<ProgressBarSettings>) {
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
        const svg = this.renderer.render(sessionPercent, weekPercent, 'codex');
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);
    }
}
