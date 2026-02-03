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

    render(
        session: number,
        week: number,
        theme: ServiceTheme = 'claude',
        sessionResetTime?: string | number | null,
        weekResetTime?: string | number | null
    ): string {
        const colors = this.themes[theme];
        const sessionColor = this.getBarColor(session, theme);
        const weekColor = this.getBarColor(week, theme);

        return this.buildSvg(session, sessionColor, week, weekColor, colors, theme, sessionResetTime, weekResetTime);
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
        theme: ServiceTheme,
        sessionResetTime?: string | number | null,
        weekResetTime?: string | number | null
    ): string {
        const serviceName = theme === 'claude' ? 'Claude' : 'Codex';

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="${colors.background}" />
            
            <text x="72" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>
            
            ${this.renderBarGroup(72, 44, 22, 52, sessionVal, sessionColor, colors, "Session", sessionResetTime)}
            ${this.renderBarGroup(72, 100, 22, 108, weekVal, weekColor, colors, "Week", weekResetTime)}
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
        label: string,
        resetTime?: string | number | null
    ): string {
        const timeText = resetTime ? this.formatResetTime(resetTime) : "";

        return `
            <text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
                <tspan font-size="14" font-weight="600" fill="${colors.text}">${value}%</tspan>
                <tspan font-size="14" fill="#999">  ${label}</tspan>
            </text>
            <rect x="${rectX}" y="${rectY}" width="100" height="24" fill="${colors.barBg}" rx="6" />
            <rect x="${rectX}" y="${rectY}" width="${value}" height="24" fill="${color}" rx="6" />
            ${timeText ? `<text x="72" y="${rectY + 17}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#AAA" text-anchor="middle">${timeText}</text>` : ''}
        `;
    }

    private formatResetTime(resetTime: string | number): string {
        let resetDate: Date;

        if (typeof resetTime === 'number') {
            resetDate = new Date(resetTime * 1000);
        } else {
            resetDate = new Date(resetTime);
        }

        const now = new Date();
        const diffMs = resetDate.getTime() - now.getTime();

        if (diffMs <= 0) return "now";

        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
            const hours = diffHours % 24;
            return hours > 0 ? `${diffDays}d ${hours}h` : `${diffDays}d`;
        }

        if (diffHours > 0) {
            const minutes = diffMinutes % 60;
            return minutes > 0 ? `${diffHours}h ${minutes}m` : `${diffHours}h`;
        }

        return `${diffMinutes}m`;
    }
}
