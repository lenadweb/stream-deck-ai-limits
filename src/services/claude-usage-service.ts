import { spawn } from "child_process";
import stripAnsi from "strip-ansi";

export type UsageData = {
    session: number;
    week: number;
};

export class ClaudeUsageService {
    private childProcess: any = null;
    private outputBuffer: string = "";
    private readonly MAX_BUFFER_SIZE = 50000;
    private readonly KEEP_BUFFER_SIZE = 20000;
    private readonly SESSION_USAGE_REGEX = /Current session[\s\S]{0,300}?(\d+)%\s*used/g;
    private readonly WEEK_USAGE_REGEX = /Current week[\s\S]{0,300}?(\d+)%\s*used/g;

    startMonitoring(onDataReceived: (data: string) => void) {
        const pythonCmd = "import pty; pty.spawn(['claude', '/usage'])";

        this.childProcess = spawn("python3", ["-c", pythonCmd], {
            env: { ...process.env, TERM: "xterm-256color" }
        });

        this.outputBuffer = "";
        this.setupProcessListeners(onDataReceived);
    }

    stopMonitoring() {
        if (this.childProcess) {
            this.childProcess.kill();
            this.childProcess = null;
        }
    }

    triggerRefresh() {
        if (this.childProcess) {
            try {
                this.childProcess.stdin.write("\n");
            } catch { }
        }
    }

    parseCurrentBuffer(): UsageData | null {
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

    private setupProcessListeners(onDataReceived: (data: string) => void) {
        if (!this.childProcess) return;

        this.childProcess.stdout.on("data", (data: Buffer) => {
            const chunk = data.toString();
            this.appendToBuffer(chunk);
            onDataReceived(chunk);
        });

        this.childProcess.stderr.on("data", () => { });
        this.childProcess.on("error", () => this.stopMonitoring());
        this.childProcess.on("close", () => this.stopMonitoring());
    }

    private appendToBuffer(chunk: string) {
        this.outputBuffer += chunk;
        if (this.outputBuffer.length > this.MAX_BUFFER_SIZE) {
            this.outputBuffer = this.outputBuffer.slice(-this.KEEP_BUFFER_SIZE);
        }
    }

    private findLastMatch(text: string, regex: RegExp): number | null {
        const matches = [...text.matchAll(regex)];
        if (matches.length > 0) {
            const lastMatch = matches[matches.length - 1];
            return parseInt(lastMatch[1], 10);
        }
        return null;
    }
}
