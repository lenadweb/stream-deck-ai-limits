import streamDeck, { action, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import { spawn } from "child_process";
import stripAnsi from "strip-ansi";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends SingletonAction<ProgressBarSettings> {
    private childProcess: any = null;
    private parserInterval: NodeJS.Timeout | null = null;
    private outputBuffer: string = "";

    override async onWillAppear(ev: WillAppearEvent<ProgressBarSettings>): Promise<void> {
        streamDeck.logger.info("ProgressBars: onWillAppear");
        this.startClaudiusage(ev);
    }

    override async onWillDisappear(): Promise<void> {
        streamDeck.logger.info("ProgressBars: onWillDisappear");
        this.cleanup();
    }

    private cleanup() {
        if (this.parserInterval) {
            clearInterval(this.parserInterval);
            this.parserInterval = null;
        }
        if (this.childProcess) {
            streamDeck.logger.info("ProgressBars: Killing child process on cleanup.");
            this.childProcess.kill();
            this.childProcess = null;
        }
    }

    private startClaudiusage(ev: WillAppearEvent<ProgressBarSettings>) {
        streamDeck.logger.info("ProgressBars: startClaudiusage called (PTY mode)");

        // Use python3 to create a PTY, tricking claude into outputting data
        const pythonCmd = "import pty; pty.spawn(['claude', '/usage'])";
        const child = spawn("python3", ["-c", pythonCmd], {
            env: { ...process.env, TERM: "xterm-256color" }
        });
        this.childProcess = child; // Store the child process

        let output = "";

        child.stdout.on("data", (data) => {
            const chunk = data.toString();
            output += chunk;

            // Limit buffer size to avoid memory issues, keeping the tail
            if (output.length > 50000) {
                output = output.slice(-20000);
            }
        });

        child.stderr.on("data", (data) => {
            streamDeck.logger.warn(`ProgressBars: stderr: ${data.toString()}`);
        });

        child.on("error", (err) => {
            streamDeck.logger.error(`ProgressBars: spawn error: ${err.message}`);
            this.cleanup(); // Clean up if the child process errors
        });

        child.on("close", (code) => {
            streamDeck.logger.info(`ProgressBars: process exited with code ${code}`);
            this.cleanup(); // Clean up if the child process closes
        });

        // Parse output periodically from the accumulating buffer
        this.parserInterval = setInterval(async () => {
            const cleanOutput = stripAnsi(output);

            streamDeck.logger.info(`ProgressBars: Output length: ${cleanOutput.length}`);
            streamDeck.logger.info(`ProgressBars: Output tail:\n${cleanOutput.slice(-1000)}`); // Log tail for debugging

            // Regex designed to find the LAST occurrence of percentages
            // The TUI format places "Current session ... X%" then "Current week ... Y%"

            // We search for the pattern where both might appear reasonably close??
            // Actually, simply finding the last occurrence of each independent string is risky if the TUI refreshes them at different rates or updates partial lines.
            // But usually TUI clears screen or redraws.

            // Let's look at the logged output in the previous turn (Step 300):
            // It showed:
            // "Current session \n ... 9% used"
            // "Current week ... \n ... 6% used"

            // My previous regex `Current session[\s\S]*?(\d+)% used` is greedy-ish for `[\s\S]*?` if there are multiple "Current session" strings.
            // Wait, `[\s\S]*?` is non-greedy.
            // `matchAll` finds all.
            // The issue might be that `stripAnsi` leaves garbage or the order is mixed in the buffer.

            const sessionMatches = [...cleanOutput.matchAll(/Current session[\s\S]{0,300}?(\d+)%\s*used/g)];
            const weekMatches = [...cleanOutput.matchAll(/Current week[\s\S]{0,300}?(\d+)%\s*used/g)];

            // Get the last match
            const lastSessionMatch = sessionMatches.length > 0 ? sessionMatches[sessionMatches.length - 1] : null;
            const lastWeekMatch = weekMatches.length > 0 ? weekMatches[weekMatches.length - 1] : null;

            streamDeck.logger.info(`ProgressBars: Session matches found: ${sessionMatches.length}. Last: ${lastSessionMatch ? lastSessionMatch[0] : 'none'}`);
            streamDeck.logger.info(`ProgressBars: Week matches found: ${weekMatches.length}. Last: ${lastWeekMatch ? lastWeekMatch[0] : 'none'}`);

            if (lastSessionMatch || lastWeekMatch) {
                // If one is missing, use 0 or previous value? 
                // For now, if missing, default to 0. Ideally we want to persist state.
                const sessionUsage = lastSessionMatch ? parseInt(lastSessionMatch[1], 10) : 0;
                const weekUsage = lastWeekMatch ? parseInt(lastWeekMatch[1], 10) : 0;

                streamDeck.logger.info(`ProgressBars: Parsed - Session: ${sessionUsage}%, Week: ${weekUsage}%`);

                const svg = this.generateSvg(sessionUsage, weekUsage);
                const image = `data:image/svg+xml;base64,${btoa(svg)}`;
                await ev.action.setImage(image);
            }
        }, 2000); // Check every 2 seconds for new data in the buffer
    }

    private generateSvg(session: number, week: number): string {
        // Red color if usage > 80%
        const sessionColor = session > 80 ? "#FF0000" : "#00AAFF";
        const weekColor = week > 80 ? "#FF0000" : "#00FF00";

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <!-- Background -->
            <rect width="144" height="144" fill="#141414" />
            
            <!-- First Progress Bar (Current Session) -->
            <text x="72" y="35" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">${session}% Session</text>
            <rect x="22" y="45" width="100" height="15" fill="#333" rx="5" />
            <rect x="22" y="45" width="${session}" height="15" fill="${sessionColor}" rx="5" />

            <!-- Second Progress Bar (Current Week) -->
            <text x="72" y="95" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">${week}% Week</text>
            <rect x="22" y="105" width="100" height="15" fill="#333" rx="5" />
            <rect x="22" y="105" width="${week}" height="15" fill="${weekColor}" rx="5" />
        </svg>
        `;
    }
}
