export type ServiceTheme = 'claude' | 'codex' | 'antigravity';

interface ThemeColors {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    label: string;
    barBg: string;
    barFill?: string;
}

export class ProgressBarRenderer {
    private themes: Record<ServiceTheme, ThemeColors> = {
        claude: {
            primary: '#D97757',
            secondary: '#E8956B',
            background: '#2F2724',
            text: '#FFFFFF',
            label: '#9D8B86',
            barBg: '#4A3D39',
            barFill: '#D97757'
        },
        codex: {
            primary: '#10B981',
            secondary: '#34D399',
            background: '#18181B',
            text: '#FFFFFF',
            label: '#71717A',
            barBg: '#27272A',
            barFill: '#10B981'
        },
        antigravity: {
            primary: '#8B5CF6',
            secondary: '#A78BFA',
            background: '#1E1B2E',
            text: '#FFFFFF',
            label: '#9CA3AF',
            barBg: '#2D2B40',
            barFill: '#8B5CF6'
        }
    };

    render(
        session: number,
        week: number,
        theme: ServiceTheme = 'claude',
        sessionResetTime?: string | number | null,
        weekResetTime?: string | number | null,
        sessionLabel: string = "Session",
        weekLabel: string = "Week"
    ): string {
        const colors = this.themes[theme];
        const sessionColor = this.getBarColor(session, theme);
        const weekColor = this.getBarColor(week, theme);

        return this.buildSvg(
            session, sessionColor,
            week, weekColor,
            colors, theme,
            sessionResetTime, weekResetTime,
            sessionLabel, weekLabel
        );
    }

    private getBarColor(value: number, theme: ServiceTheme): string {
        const colors = this.themes[theme];

        if (value > 80) return '#EF4444';
        if (value > 60) return '#F59E0B';
        if (value === 0) return colors.barBg;
        return colors.barFill || colors.primary;
    }

    private buildSvg(
        sessionVal: number,
        sessionColor: string,
        weekVal: number,
        weekColor: string,
        colors: ThemeColors,
        theme: ServiceTheme,
        sessionResetTime?: string | number | null,
        weekResetTime?: string | number | null,
        sessionLabel: string = "Session",
        weekLabel: string = "Week"
    ): string {
        const serviceName = theme.charAt(0).toUpperCase() + theme.slice(1);

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="${colors.background}" />
            
            <text x="72" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>
            
            ${this.renderBarGroup(72, 44, 22, 52, sessionVal, sessionColor, colors, sessionLabel, sessionResetTime)}
            ${this.renderBarGroup(72, 100, 22, 108, weekVal, weekColor, colors, weekLabel, weekResetTime)}
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
                <tspan font-size="15" font-weight="600" fill="${colors.text}">${value}%</tspan>
                <tspan font-size="15" fill="#999">  ${label}</tspan>
            </text>
            <rect x="${rectX}" y="${rectY}" width="100" height="24" fill="${colors.barBg}" rx="6" />
            <rect x="${rectX}" y="${rectY}" width="${value}" height="24" fill="${color}" rx="6" />
            ${timeText ? `<text x="72" y="${rectY + 17}" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="500" fill="#AAA" text-anchor="middle">${timeText}</text>` : ''}
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
