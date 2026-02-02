export class ProgressBarRenderer {
    render(session: number, week: number): string {
        const sessionBar = this.createBarConfig(session, 80);
        const weekBar = this.createBarConfig(week, 80);

        return this.buildSvg(session, sessionBar.color, week, weekBar.color);
    }

    private createBarConfig(value: number, threshold: number) {
        return {
            value,
            color: value > threshold ? "#FF0000" : (value === 0 ? "#00AAFF" : this.getDefaultColor(value))
        };
    }

    private getDefaultColor(value: number): string {
        return "#00AAFF";
    }

    private buildSvg(sessionVal: number, sessionColor: string, weekVal: number, weekColor: string): string {
        const weekDefaultColor = weekVal > 80 ? "#FF0000" : "#00FF00";

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="#141414" />
            
            ${this.renderBarGroup(72, 35, 22, 45, sessionVal, sessionColor, "Session")}
            ${this.renderBarGroup(72, 95, 22, 105, weekVal, weekDefaultColor, "Week")}
        </svg>
        `;
    }

    renderLoader(angle: number): string {
        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="#141414" />
            <text x="72" y="115" font-family="sans-serif" font-size="18" fill="#888" text-anchor="middle">Loading...</text>
            <circle cx="72" cy="65" r="25" stroke="#333" stroke-width="5" fill="none" />
            <g transform="rotate(${angle} 72 65)">
                <path d="M72 40 A25 25 0 0 1 97 65" stroke="#00AAFF" stroke-width="5" fill="none" stroke-linecap="round" />
            </g>
        </svg>
        `;
    }

    private renderBarGroup(textX: number, textY: number, rectX: number, rectY: number, value: number, color: string, label: string): string {
        return `
            <text x="${textX}" y="${textY}" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">${value}% ${label}</text>
            <rect x="${rectX}" y="${rectY}" width="100" height="15" fill="#333" rx="5" />
            <rect x="${rectX}" y="${rectY}" width="${value}" height="15" fill="${color}" rx="5" />
        `;
    }
}
