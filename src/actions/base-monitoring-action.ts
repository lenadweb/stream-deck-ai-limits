import streamDeck, { SingletonAction, KeyDownEvent, KeyUpEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { LaunchSettings, buildLaunchPlan, launchTarget, runLaunchPlan } from "../services/launcher";
import { ProviderName, StandardUsageResult } from "@lenadweb/ai-limits";
import { ProgressBarRenderer, Slot, RenderOptions } from "../ui/progress-bar-renderer";
import { ServiceTheme } from "../interfaces/theme";
import { TileLayout } from "../interfaces/settings";
import { LimitsManager } from "../services/limits-manager";

/** A single placed tile: its own controller kind and its own settings. */
interface TileInstance<T> {
    action: any;
    controller: string;
    settings: T;
}

interface MonitoringResult {
    error?: { message: string } | null;
}

interface CachedUsage<TResult extends MonitoringResult> {
    result: TResult;
    fetchedAt: number;
}

export abstract class BaseMonitoringAction<
    T extends Record<string, any>,
    TResult extends MonitoringResult = StandardUsageResult
> extends SingletonAction<T> {
    protected instances = new Map<string, TileInstance<T>>();
    protected intervalId: NodeJS.Timeout | null = null;
    protected isMonitoring = false;
    protected usage = new Map<string, CachedUsage<TResult>>();
    protected readonly monitoringIntervalMs: number = 900000;
    protected readonly renderer = new ProgressBarRenderer();
    protected readonly limitsManager = LimitsManager.getInstance();
    /** How long a key or dial must be held to launch instead of refresh. */
    protected readonly longPressMs = 500;
    private pressTimers = new Map<string, NodeJS.Timeout>();

    /** Used for logging; external backends may use an id outside ProviderName. */
    protected abstract get providerName(): ProviderName | string;
    protected abstract get themeName(): ServiceTheme;

    protected fetchKey(_settings: T | undefined): string {
        return "";
    }

    protected get lastResult(): TResult | null {
        return this.usage.get("")?.result ?? null;
    }

    protected set lastResult(value: TResult | null) {
        if (value === null) {
            this.usage.delete("");
            return;
        }
        this.usage.set("", { result: value, fetchedAt: Date.now() });
    }

    override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
        this.track(ev, ev.payload.controller);
        // Draw cached data immediately so switching pages/folders never blanks the key
        await this.redraw(ev);
        // Only hit the network on a cold start or when the cached data has gone stale,
        // so re-appearing after a page/folder switch doesn't trigger a visible refresh.
        if (this.isStale(ev)) {
            this.refresh(ev);
        }
        if (!this.isMonitoring) {
            this.isMonitoring = true;
            this.startMonitoring();
        }
    }

    override async onWillDisappear(ev: WillDisappearEvent<T>): Promise<void> {
        this.instances.delete(ev.action.id);
        this.cancelPress(ev.action.id);
        if (this.instances.size === 0) {
            this.stopMonitoring();
            this.isMonitoring = false;
        }
    }

    /**
     * With no long-press target the key refreshes on press, exactly as before. With
     * one, the refresh waits for release: released early it refreshes, held past
     * {@link longPressMs} it launches instead and the release is ignored.
     */
    override async onKeyDown(ev: KeyDownEvent<T>): Promise<void> {
        if (!this.beginPress(ev)) await this.refresh(ev);
    }

    override async onKeyUp(ev: KeyUpEvent<T>): Promise<void> {
        if (this.endPress(ev)) await this.refresh(ev);
    }

    override async onDidReceiveSettings(ev: any): Promise<void> {
        await this.redraw(ev);
        if (!this.usage.has(this.fetchKey(ev?.payload?.settings))) {
            await this.refresh(ev);
        }
    }

    override async onDialDown(ev: any): Promise<void> {
        this.beginPress(ev);
    }

    override async onDialUp(ev: any): Promise<void> {
        // Without a target beginPress tracked nothing, so endPress is false: refresh.
        if (this.endPress(ev) || launchTarget(ev?.payload?.settings) === "none") {
            await this.refresh(ev);
        }
    }

    override async onDialRotate(ev: any): Promise<void> {
        await this.refresh(ev);
    }

    override async onTouchTap(ev: any): Promise<void> {
        if (ev?.payload?.hold && launchTarget(ev?.payload?.settings) !== "none") {
            await this.launch(ev);
            return;
        }
        await this.refresh(ev);
    }

    /**
     * Arm the long-press timer when the tile has a launch target. Returns false when it
     * has none, so the caller keeps the immediate refresh.
     */
    protected beginPress(ev: any): boolean {
        const id = ev?.action?.id;
        if (!id || launchTarget(ev?.payload?.settings) === "none") return false;

        this.cancelPress(id);
        const timer = setTimeout(() => {
            this.pressTimers.delete(id);
            this.launch(ev);
        }, this.longPressMs);
        this.pressTimers.set(id, timer);
        return true;
    }

    /** True when the press was short (released before the timer fired). */
    protected endPress(ev: any): boolean {
        return this.cancelPress(ev?.action?.id);
    }

    private cancelPress(id: string | undefined): boolean {
        const timer = id ? this.pressTimers.get(id) : undefined;
        if (!timer) return false;
        clearTimeout(timer);
        this.pressTimers.delete(id!);
        return true;
    }

    protected async launch(ev: any): Promise<void> {
        const settings = (ev?.payload?.settings ?? {}) as LaunchSettings;
        try {
            if (launchTarget(settings) === "url") {
                await streamDeck.system.openUrl(settings.launchUrl!.trim());
            } else {
                const plan = buildLaunchPlan(settings);
                if (!plan) return;
                await runLaunchPlan(plan);
            }
            await ev.action.showOk?.();
        } catch (err: any) {
            streamDeck.logger.error(`[${this.providerName}] Launch failed: ${err}`);
            try { await ev.action.showAlert?.(); } catch {}
        }
    }

    /**
     * Remember the tile behind an event, along with its current settings. Every draw
     * path funnels through here so the cache stays fresh. Only onWillAppear registers
     * a tile (it passes the controller); other paths refresh what is already tracked,
     * so a stale event cannot resurrect a tile that has disappeared.
     */
    protected track(ev: any, controller?: string): void {
        const id = ev?.action?.id;
        if (!id) return;

        const existing = this.instances.get(id);
        if (!existing && controller === undefined) return;

        this.instances.set(id, {
            action: ev.action,
            controller: controller ?? existing?.controller ?? "Keypad",
            settings: (ev.payload?.settings ?? existing?.settings ?? {}) as T
        });
    }

    /** Event-shaped view of a tracked tile, so draw code can stay event-driven. */
    protected asEvent(instance: TileInstance<T>): any {
        return {
            action: instance.action,
            payload: { settings: instance.settings, controller: instance.controller }
        };
    }

    protected isStale(ev: any): boolean {
        const cached = this.usage.get(this.fetchKey(ev?.payload?.settings));
        return !cached || (Date.now() - cached.fetchedAt) >= this.monitoringIntervalMs;
    }

    protected startMonitoring(): void {
        this.intervalId = setInterval(() => {
            if (this.isMonitoring) {
                this.refreshAll();
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
        this.track(ev);
        const key = this.fetchKey(ev?.payload?.settings);
        try {
            const result = await this.fetchProviderUsage(ev);
            this.usage.set(key, { result, fetchedAt: Date.now() });
            // One fetch feeds every tile sharing the same credentials, each rendered
            // with its own settings — several tiles can show different metrics of it.
            await this.drawAll(key, result);
        } catch (err: any) {
            streamDeck.logger.error(`[${this.providerName}] Refresh failed: ${err}`);
        }
    }

    protected async refreshAll(): Promise<void> {
        const done = new Set<string>();
        for (const instance of [...this.instances.values()]) {
            const key = this.fetchKey(instance.settings);
            if (done.has(key)) continue;
            done.add(key);
            await this.refresh(this.asEvent(instance));
        }
    }

    protected async drawAll(key: string, result: TResult): Promise<void> {
        for (const instance of [...this.instances.values()]) {
            if (this.fetchKey(instance.settings) !== key) continue;
            try {
                await this.draw(this.asEvent(instance), result);
            } catch (err: any) {
                streamDeck.logger.error(`[${this.providerName}] Draw failed: ${err}`);
            }
        }
    }

    protected async redraw(ev: any): Promise<void> {
        this.track(ev);
        const cached = this.usage.get(this.fetchKey(ev?.payload?.settings))?.result ?? null;
        if (cached) {
            await this.draw(ev, cached);
        } else {
            await this.drawPlaceholder(ev);
        }
    }

    protected async fetchProviderUsage(_ev: any): Promise<TResult> {
        const result = await this.limitsManager.getClient().fetchUsage(this.providerName as ProviderName);
        return result as unknown as TResult;
    }

    protected abstract getDisplayData(ev: any, result: TResult): {
        value1?: number;
        value2?: number;
        label1?: string;
        label2?: string;
        resetTime1?: string | null;
        resetTime2?: string | null;
        valueText1?: string;
        valueText2?: string;
        slots?: Slot[];
        /** When set, the tile renders as a single ring gauge instead of bars. */
        ring?: Slot;
    };

    /** Package the slots a tile wants to show into the shape {@link draw} expects. */
    protected tileDisplay(slots: (Slot | null)[], layout: TileLayout) {
        const visible = slots.filter((slot): slot is Slot => slot !== null);
        return layout === "ring" ? { ring: visible[0] } : { slots: visible };
    }

    protected renderOptions(ev: any): RenderOptions {
        const settings = ev?.payload?.settings ?? {};
        return { showName: settings.showProviderName !== false, size: settings.size,
            backgroundMode: settings.backgroundMode, backgroundColor: settings.backgroundColor };
    }

    /** Lets actions with per-tile presentation settings choose a theme at draw time. */
    protected themeForEvent(_ev: any): ServiceTheme {
        return this.themeName;
    }

    protected async draw(ev: any, result: TResult): Promise<void> {
        const opts = this.renderOptions(ev);
        const theme = this.themeForEvent(ev);
        if (result.error) {
            const svg = this.renderer.renderError(result.error.message, theme, 144, 144, opts);
            const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
            await ev.action.setImage(image);

            const dialSvg = this.renderer.renderError(result.error.message, theme, 200, 100, opts);
            await this.updateDialFeedback(ev, dialSvg);
            return;
        }

        const data = this.getDisplayData(ev, result);
        const renderAt = (w: number, h: number) =>
            data.ring
                ? this.renderer.renderRing(data.ring, theme, w, h, opts)
                : data.slots
                    ? this.renderer.renderSlots(data.slots, theme, w, h, opts)
                    : this.renderer.render(
                        data.value1 ?? 0,
                        data.value2 ?? 0,
                        theme,
                        data.resetTime1,
                        data.resetTime2,
                        data.label1 ?? "",
                        data.label2 ?? "",
                        w, h,
                        data.valueText1,
                        data.valueText2,
                        opts
                    );

        const svg = renderAt(144, 144);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = renderAt(200, 100);
        await this.updateDialFeedback(ev, dialSvg);
    }

    protected async drawPlaceholder(ev: any): Promise<void> {
        const opts = this.renderOptions(ev);
        const theme = this.themeForEvent(ev);
        const svg = this.renderer.renderPlaceholder(theme, 144, 144, opts);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.renderPlaceholder(theme, 200, 100, opts);
        await this.updateDialFeedback(ev, dialSvg);
    }

    protected async drawMessage(ev: any, lines: string[]): Promise<void> {
        const opts = this.renderOptions(ev);
        const theme = this.themeForEvent(ev);
        const svg = this.renderer.renderMessage(lines, theme, 144, 144, opts);
        const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        await ev.action.setImage(image);

        const dialSvg = this.renderer.renderMessage(lines, theme, 200, 100, opts);
        await this.updateDialFeedback(ev, dialSvg);
    }

    protected async updateDialFeedback(ev: any, svg: string): Promise<void> {
        const controller = this.instances.get(ev.action.id)?.controller ?? ev?.payload?.controller;
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
