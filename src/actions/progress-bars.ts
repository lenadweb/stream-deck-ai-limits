import { action, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { ClaudeUsageService, UsageData } from "../services/claude-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends SingletonAction<ProgressBarSettings> {
    private readonly usageService = new ClaudeUsageService();
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

    private fetchData(ev: any) {
        this.usageService.stopMonitoring();

        this.isLoading = true;
        this.startLoadingAnimation(ev);

        this.usageService.startMonitoring(() => {
            const usage = this.usageService.parseCurrentBuffer();
            if (usage) {
                this.isLoading = false;
                this.stopLoadingAnimation();
                this.draw(ev, usage);
                this.usageService.stopMonitoring();
            }
        });
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
            const svg = this.renderer.renderLoader(this.loaderFrame);
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

    private async draw(ev: any, usage: UsageData) {
        const svg = this.renderer.render(usage.session, usage.week);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        await ev.action.setImage(image);
    }
}
