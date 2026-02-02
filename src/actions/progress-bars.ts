import { action, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { ClaudeUsageService, UsageData } from "../services/claude-usage-service";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends SingletonAction<ProgressBarSettings> {
    private readonly usageService = new ClaudeUsageService();
    private readonly renderer = new ProgressBarRenderer();
    private refreshInterval: NodeJS.Timeout | null = null;
    private readonly REFRESH_RATE_MS = 2000;

    override async onWillAppear(ev: WillAppearEvent<ProgressBarSettings>): Promise<void> {
        this.startMonitoring(ev);
    }

    override async onWillDisappear(): Promise<void> {
        this.stopMonitoring();
    }

    override async onKeyUp(ev: any): Promise<void> {
        this.updateView(ev);
        this.usageService.triggerRefresh();
    }

    private startMonitoring(ev: WillAppearEvent<ProgressBarSettings>) {
        this.usageService.startMonitoring(() => {

        });

        this.refreshInterval = setInterval(() => {
            this.updateView(ev);
        }, this.REFRESH_RATE_MS);
    }

    private stopMonitoring() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.usageService.stopMonitoring();
    }

    private async updateView(ev: any) {
        const usage = this.usageService.parseCurrentBuffer();
        if (usage) {
            await this.draw(ev, usage);
        }
    }

    private async draw(ev: any, usage: UsageData) {
        const svg = this.renderer.render(usage.session, usage.week);
        const image = `data:image/svg+xml;base64,${btoa(svg)}`;
        await ev.action.setImage(image);
    }
}
