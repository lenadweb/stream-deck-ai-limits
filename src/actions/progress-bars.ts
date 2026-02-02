import { action, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";

type ProgressBarSettings = Record<string, any>;

@action({ UUID: "com.len.limits.progress" })
export class ProgressBars extends SingletonAction<ProgressBarSettings> {
    override async onWillAppear(ev: WillAppearEvent<ProgressBarSettings>): Promise<void> {
        // Create an SVG with two progress bars (40% and 60%)
        const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <!-- Background -->
            <rect width="144" height="144" fill="#141414" />
            
            <!-- First Progress Bar (40%) -->
            <text x="72" y="35" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">40%</text>
            <rect x="22" y="45" width="100" height="15" fill="#333" rx="5" />
            <rect x="22" y="45" width="40" height="15" fill="#00AAFF" rx="5" />

            <!-- Second Progress Bar (60%) -->
            <text x="72" y="95" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">60%</text>
            <rect x="22" y="105" width="100" height="15" fill="#333" rx="5" />
            <rect x="22" y="105" width="60" height="15" fill="#00FF00" rx="5" />
        </svg>
        `;

        const image = `data:image/svg+xml;base64,${btoa(svg)}`;
        await ev.action.setImage(image);
    }
}
