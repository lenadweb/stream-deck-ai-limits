import streamDeck, { action, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { spawn } from "child_process";
import stripAnsi from "strip-ansi";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends SingletonAction<ProgressBarSettings> {
    private childProcess: any = null;
    private parserInterval: NodeJS.Timeout | null = null;
    private outputBuffer: string = "";
    private readonly MAX_BUFFER_SIZE = 50000;
    private readonly KEEP_BUFFER_SIZE = 20000;
    private readonly PARSE_INTERVAL_MS = 2000;
    private readonly SESSION_USAGE_REGEX = /Current session[\s\S]{0,300}?(\d+)%\s*used/g;
    private readonly WEEK_USAGE_REGEX = /Current week[\s\S]{0,300}?(\d+)%\s*used/g;

    override async onWillAppear(ev: WillAppearEvent<ProgressBarSettings>): Promise<void> {
        this.initializeUsageMonitoring(ev);
    }

    override async onWillDisappear(): Promise<void> {
        this.cleanupResources();
    }

    override async onKeyUp(ev: any): Promise<void> {
        this.processBufferAndDisplay(ev);
        this.triggerProcessRefresh();
    }

    private initializeUsageMonitoring(ev: WillAppearEvent<ProgressBarSettings>) {
        const pythonCmd = "import pty; pty.spawn(['claude', '/usage'])";

        this.childProcess = spawn("python3", ["-c", pythonCmd], {
            env: { ...process.env, TERM: "xterm-256color" }
        });

        this.outputBuffer = "";
        this.setupProcessListeners();
        this.startPeriodicParsing(ev);
    }

    private setupProcessListeners() {
        if (!this.childProcess) return;

        this.childProcess.stdout.on("data", (data: Buffer) => {
            this.appendToBuffer(data.toString());
        });

        this.childProcess.stderr.on("data", () => { });

        this.childProcess.on("error", (err: Error) => {
            streamDeck.logger.error(`Spawn error: ${err.message}`);
            this.cleanupResources();
        });

        this.childProcess.on("close", () => {
            this.cleanupResources();
        });
    }

    private appendToBuffer(chunk: string) {
        this.outputBuffer += chunk;
        if (this.outputBuffer.length > this.MAX_BUFFER_SIZE) {
            this.outputBuffer = this.outputBuffer.slice(-this.KEEP_BUFFER_SIZE);
        }
    }

    private startPeriodicParsing(ev: WillAppearEvent<ProgressBarSettings>) {
        this.parserInterval = setInterval(() => {
            this.processBufferAndDisplay(ev);
        }, this.PARSE_INTERVAL_MS);
    }

    private triggerProcessRefresh() {
        if (this.childProcess) {
            try {
                this.childProcess.stdin.write("\n");
            } catch {

            }
        }
    }

    private cleanupResources() {
        if (this.parserInterval) {
            clearInterval(this.parserInterval);
            this.parserInterval = null;
        }

        if (this.childProcess) {
            this.childProcess.kill();
            this.childProcess = null;
        }
    }

    private async processBufferAndDisplay(ev: any) {
        const usageData = this.parseUsageData();
        if (usageData) {
            await this.updateDisplay(ev, usageData.session, usageData.week);
        }
    }

    private parseUsageData(): { session: number, week: number } | null {
        const cleanOutput = stripAnsi(this.outputBuffer);

        const sessionMatch = this.findLastMatch(cleanOutput, this.SESSION_USAGE_REGEX);
        const weekMatch = this.findLastMatch(cleanOutput, this.WEEK_USAGE_REGEX);

        if (sessionMatch !== null || weekMatch !== null) {
            return {
                session: sessionMatch ?? 0,
                week: weekMatch ?? 0
            };
        }
        return null;
    }

    private findLastMatch(text: string, regex: RegExp): number | null {
        const matches = [...text.matchAll(regex)];
        if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            return parseInt(lastMatch[1], 10);
        }
        return null;
    }

    private async updateDisplay(ev: any, session: number, week: number) {
        const svg = this.createProgressSvg(session, week);
        const image = `data:image/svg+xml;base64,${btoa(svg)}`;
        await ev.action.setImage(image);
    }

    private createProgressSvg(session: number, week: number): string {
        const sessionColor = session > 80 ? "#FF0000" : "#00AAFF";
        const weekColor = week > 80 ? "#FF0000" : "#00FF00";

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="#141414" />
            <text x="72" y="35" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">${session}% Session</text>
            <rect x="22" y="45" width="100" height="15" fill="#333" rx="5" />
            <rect x="22" y="45" width="${session}" height="15" fill="${sessionColor}" rx="5" />
            <text x="72" y="95" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">${week}% Week</text>
            <rect x="22" y="105" width="100" height="15" fill="#333" rx="5" />
            <rect x="22" y="105" width="${week}" height="15" fill="${weekColor}" rx="5" />
        </svg>
        `;
    }
}
