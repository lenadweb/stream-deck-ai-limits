import streamDeck, { SingletonAction, KeyDownEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ProgressBarRenderer } from "../ui/progress-bar-renderer";
import { ServiceTheme } from "../interfaces/theme";
import { LimitsManager } from "../services/limits-manager";

export abstract class BaseMonitoringAction<T extends Record<string, any>> extends SingletonAction<T> {
    protected controllers = new Map<string, string>();
    protected intervalId: NodeJS.Timeout | null = null;
    protected isMonitoring = false;
    protected lastResult: StandardUsageResult | null = null;
    protected lastFetchTime = 0;
    protected readonly monitoringIntervalMs = 900000;
    protected readonly renderer = new ProgressBarRenderer();
    protected readonly limitsManager = LimitsManager.getInstance();

    protected abstract get providerName(): ProviderName;
    protected abstract get themeName(): ServiceTheme;

    override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
        this.controllers.set(ev.action.id, ev.payload.controller);
        // Draw cached data immediately so switching pages/folders never blanks the key
        await this.redraw(ev);
        if (!this.isMonitoring) {
            this.isMonitoring = true;
            this.startMonitoring(ev);
        }
    }

    override async onWillDisappear(ev: WillDisappearEvent<T>): Promise<void> {
        this.controllers.delete(ev.action.id);
        if (this.controllers.size === 0) {
            this.stopMonitoring();
            this.isMonitoring = false;
        }
    }

    override async onKeyDown(ev: KeyDownEvent<T>): Promise<void> {
        await this.refresh(ev);
    }

    override async onDialUp(ev: any): Promise<void> {
        await this.refresh(ev);
    }

    override async onDialRotate(ev: any): Promise<void> {
        await this.refresh(ev);
    }

    override async onTouchTap(ev: any): Promise<void> {
        await this.refresh(ev);
    }

    protected startMonitoring(ev: any): void {
        // Only hit the network on a cold start or when the cached data has gone stale,
        // so re-appearing after a page/folder switch doesn't trigger a visible refresh.
        const isStale = !this.lastResult || (Date.now() - this.lastFetchTime) >= this.monitoringIntervalMs;
        if (isStale) {
            this.refresh(ev);
        }
        this.intervalId = setInterval(() => {
            if (this.isMonitoring) {
                this.refresh(ev);
            }
        }, this.monitoringIntervalMs);
    }

    protected stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    protected async refresh(ev: any): Promise<void> {
        try {
            const result = await this.fetchProviderUsage(ev);
            this.lastResult = result;
            this.lastFetchTime = Date.now();
            await this.draw(ev, result);
        } catch (err: any) {
            streamDeck.logger.error(`[${this.providerName}] Refresh failed: ${err}`);
        }
    }

    protected async redraw(ev: any): Promise<void> {
        if (this.lastResult) {
            await this.draw(ev, this.lastResult);
        } else {
            await this.drawPlaceholder(ev);
        }
    }

    protected async fetchProviderUsage(ev: any): Promise<StandardUsageResult> {
        return this.limitsManager.getClient().fetchUsage(this.providerName);
    }

    protected abstract getDisplayData(ev: any, result: StandardUsageResult): {
        value1: number;
        value2: number;
        label1: string;
        label2: string;
        resetTime1?: string | null;
        resetTime2?: string | null;
    };

    protected async draw(ev: any, result: StandardUsageResult): Promise<void> {
        if (result.error) {
            const svg = this.renderer.renderError(result.error.message, this.themeName, 144, 144);
            const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
            await ev.action.setImage(image);

            const dialSvg = this.renderer.renderError(result.error.message, this.themeName, 200, 100);
            await this.updateDialFeedback(ev, dialSvg);
            return;
        }

        const data = this.getDisplayData(ev, result);
        const svg = this.renderer.render(
            data.value1,
            data.value2,
            this.themeName,
            data.resetTime1,
            data.resetTime2,
            data.label1,
            data.label2,
            144, 144
        );
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.render(
            data.value1,
            data.value2,
            this.themeName,
            data.resetTime1,
            data.resetTime2,
            data.label1,
            data.label2,
            200, 100
        );
        await this.updateDialFeedback(ev, dialSvg);
    }

    protected async drawPlaceholder(ev: any): Promise<void> {
        const svg = this.renderer.renderPlaceholder(144, 144);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.renderPlaceholder(200, 100);
        await this.updateDialFeedback(ev, dialSvg);
    }

    protected async updateDialFeedback(ev: any, svg: string): Promise<void> {
        const controller = this.controllers.get(ev.action.id);
        if (controller === "Encoder") {
            const feedback = {
                full_view: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
            };
            try {
                await (ev.action as any).setFeedback(feedback);
            } catch {}
        }
    }
}
