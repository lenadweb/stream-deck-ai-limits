import { spawn } from "node:child_process";
import { homedir } from "node:os";

/** What a long press on a tile opens. "none" keeps the plain refresh-on-press behaviour. */
export type LaunchTarget = "none" | "app" | "url" | "command";

export interface LaunchSettings {
    launchTarget?: LaunchTarget;
    /** App name ("Claude") or full path to an .app / .exe / shortcut. */
    launchApp?: string;
    launchUrl?: string;
    /** Shell command, e.g. `open -a Terminal ~/code/project`. */
    launchCommand?: string;
    /** Working directory for the command; empty means the home folder. */
    launchCwd?: string;
}

/** A process to start: the executable, its arguments and spawn options. */
export interface LaunchPlan {
    file: string;
    args: string[];
    shell?: boolean;
    cwd?: string;
}

/** The target a tile's settings resolve to, ignoring a target whose field is empty. */
export function launchTarget(settings: LaunchSettings | undefined): LaunchTarget {
    const target = settings?.launchTarget ?? "none";
    switch (target) {
        case "app": return settings?.launchApp?.trim() ? "app" : "none";
        case "url": return isWebUrl(settings?.launchUrl) ? "url" : "none";
        case "command": return settings?.launchCommand?.trim() ? "command" : "none";
        default: return "none";
    }
}

export function isWebUrl(value: string | undefined): boolean {
    if (!value) return false;
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}

function expandHome(path: string): string {
    return path === "~" || path.startsWith("~/") || path.startsWith("~\\")
        ? homedir() + path.slice(1)
        : path;
}

/**
 * Translate app/command settings into a process to start. URLs are not handled here:
 * they go through Stream Deck's own openUrl so the default browser is used.
 */
export function buildLaunchPlan(settings: LaunchSettings, platform: NodeJS.Platform = process.platform): LaunchPlan | null {
    const target = launchTarget(settings);

    if (target === "app") {
        const app = expandHome(settings.launchApp!.trim());
        if (platform === "darwin") {
            // A path opens that bundle; a bare name lets Launch Services find the app.
            return app.includes("/") ? { file: "open", args: [app] } : { file: "open", args: ["-a", app] };
        }
        if (platform === "win32") {
            // `start` resolves paths, shortcuts and App Paths names (e.g. "claude").
            // The empty "" is start's window-title argument.
            // /s strips the outer quotes, leaving: start "" "<app>"
            return { file: "cmd.exe", args: ["/d", "/s", "/c", `"start "" "${app}""`] };
        }
        return { file: "xdg-open", args: [app] };
    }

    if (target === "command") {
        const cwd = settings.launchCwd?.trim() ? expandHome(settings.launchCwd.trim()) : homedir();
        return { file: settings.launchCommand!.trim(), args: [], shell: true, cwd };
    }

    return null;
}

/** Start a process detached from the plugin so it outlives a plugin restart. */
export function runLaunchPlan(plan: LaunchPlan): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(plan.file, plan.args, {
            cwd: plan.cwd,
            shell: plan.shell ?? false,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            windowsVerbatimArguments: process.platform === "win32" && !plan.shell
        });
        child.once("error", reject);
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });
}
