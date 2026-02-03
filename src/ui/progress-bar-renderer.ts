export type ServiceTheme = 'claude' | 'codex';

interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    label: string;
    barBg: string;
}

export class ProgressBarRenderer {
    private themes: Record<ServiceTheme, ThemeColors> = {
        claude: {
            primary: '#D97757',
            secondary: '#E8956B',
            background: '#1A1612',
            text: '#F5E6D3',
            label: '#CC6644',
            barBg: '#2A2420'
        },
        codex: {
            primary: '#10B981',
            secondary: '#34D399',
            background: '#0F1419',
            text: '#E0F2FE',
            label: '#059669',
            barBg: '#1F2937'
        }
    };

    render(session: number, week: number, theme: ServiceTheme = 'claude'): string {
        const colors = this.themes[theme];
        const sessionColor = this.getBarColor(session, theme);
        const weekColor = this.getBarColor(week, theme);

        return this.buildSvg(session, sessionColor, week, weekColor, colors, theme);
    }

    private getBarColor(value: number, theme: ServiceTheme): string {
        const colors = this.themes[theme];

        if (value > 80) return '#EF4444';
        if (value > 60) return '#F59E0B';
        if (value === 0) return colors.barBg;
        return colors.primary;
    }

    private buildSvg(
        sessionVal: number,
        sessionColor: string,
        weekVal: number,
        weekColor: string,
        colors: ThemeColors,
        theme: ServiceTheme
    ): string {
        const serviceName = theme === 'claude' ? 'Claude' : 'Codex';

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="${colors.background}" />
            
            <text x="72" y="22" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>
            
            ${this.renderBarGroup(72, 50, 22, 57, sessionVal, sessionColor, colors, "Session")}
            ${this.renderBarGroup(72, 95, 22, 102, weekVal, weekColor, colors, "Week")}
        </svg>
        `;
    }

    renderLoader(angle: number, theme: ServiceTheme = 'claude'): string {
        const colors = this.themes[theme];

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="${colors.background}" />
            <text x="72" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="${colors.text}" text-anchor="middle" opacity="0.7">Loading...</text>
            <circle cx="72" cy="65" r="25" stroke="${colors.barBg}" stroke-width="5" fill="none" />
            <g transform="rotate(${angle} 72 65)">
                <path d="M72 40 A25 25 0 0 1 97 65" stroke="${colors.primary}" stroke-width="5" fill="none" stroke-linecap="round" />
            </g>
        </svg>
        `;
    }

    private renderBarGroup(
        textX: number,
        textY: number,
        rectX: number,
        rectY: number,
        value: number,
        color: string,
        colors: ThemeColors,
        label: string
    ): string {
        return `
            <text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
                <tspan font-size="16" font-weight="600" fill="${colors.text}">${value}%</tspan>
                <tspan font-size="14" fill="${colors.text}" opacity="0.7">  ${label}</tspan>
            </text>
            <rect x="${rectX}" y="${rectY}" width="100" height="12" fill="${colors.barBg}" rx="6" />
            <rect x="${rectX}" y="${rectY}" width="${value}" height="12" fill="${color}" rx="6" />
        `;
    }
}
