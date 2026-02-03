import streamDeck, { SingletonAction, WillAppearEvent, WillDisappearEvent, KeyDownEvent } from "@elgato/streamdeck";

export abstract class BaseMonitoringAction<T extends Record<string, any>> extends SingletonAction<T> {
    protected controllers = new Map<string, string>();
    protected intervalId: NodeJS.Timeout | null = null;
    protected isMonitoring = false;
    protected isLoading = false;
    protected loaderFrame = 0;

    override async onWillAppear(ev: WillAppearEvent<T>): Promise<void> {
        this.controllers.set(ev.action.id, ev.payload.controller);
        if (!this.isMonitoring) {
            this.isMonitoring = true;
            this.startMonitoring(ev);
        }
    }

    override async onWillDisappear(ev: WillDisappearEvent<T>): Promise<void> {
        this.controllers.delete(ev.action.id);
        this.isMonitoring = false;
        this.stopMonitoring();
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

    protected startMonitoring(ev: any) {
        this.refresh(ev);
        this.intervalId = setInterval(() => {
            if (this.isMonitoring) {
                this.refresh(ev);
            }
        }, 300000);
    }

    protected stopMonitoring() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    protected abstract refresh(ev: any): Promise<void>;

    protected async updateDialFeedback(ev: any, svg: string) {
        const controller = this.controllers.get(ev.action.id);
        if (controller === 'Encoder') {
            const feedback = {
                full_view: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
            };
            try {
                await (ev.action as any).setFeedback(feedback);
            } catch (err) {

            }
        }
    }
}
