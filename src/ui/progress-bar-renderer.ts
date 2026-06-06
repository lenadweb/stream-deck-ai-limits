import { ServiceTheme, ThemeColors } from "../interfaces/theme";

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
        },
        'gemini-cli': {
            primary: '#4285F4',
            secondary: '#8AB4F8',
            background: '#131314',
            text: '#E3E3E3',
            label: '#C4C7C5',
            barBg: '#444746',
            barFill: '#4285F4'
        },
        minimax: {
            primary: '#3B82F6',
            secondary: '#60A5FA',
            background: '#0F172A',
            text: '#FFFFFF',
            label: '#94A3B8',
            barBg: '#1E293B',
            barFill: '#3B82F6'
        },
        openrouter: {
            primary: '#6467F2',
            secondary: '#8B8DF6',
            background: '#0E0E11',
            text: '#FFFFFF',
            label: '#9CA0A8',
            barBg: '#23232B',
            barFill: '#6467F2'
        }
    };

    private static readonly serviceLabels: Partial<Record<ServiceTheme, string>> = {
        'gemini-cli': 'Gemini',
        openrouter: 'OpenRouter'
    };

    private serviceName(theme: ServiceTheme): string {
        return ProgressBarRenderer.serviceLabels[theme] ?? theme.charAt(0).toUpperCase() + theme.slice(1);
    }

    render(
        session: number,
        week: number,
        theme: ServiceTheme = 'claude',
        sessionResetTime?: string | number | null,
        weekResetTime?: string | number | null,
        sessionLabel: string = "Session",
        weekLabel: string = "Week",
        width: number = 144,
        height: number = 144,
        sessionValueText?: string,
        weekValueText?: string
    ): string {
        const colors = this.themes[theme];
        const sessionColor = this.getBarColor(session, theme);
        const weekColor = this.getBarColor(week, theme);

        return this.buildSvg(
            session, sessionColor,
            week, weekColor,
            colors, theme,
            sessionResetTime, weekResetTime,
            sessionLabel, weekLabel,
            width, height,
            sessionValueText, weekValueText
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
        weekLabel: string = "Week",
        width: number = 144,
        height: number = 144,
        sessionValueText?: string,
        weekValueText?: string
    ): string {
        const serviceName = this.serviceName(theme);
        const centerX = width / 2;

        if (width === 200 && height === 100) {
            const rectWidth = 180;
            const rectX = centerX - (rectWidth / 2);

            const titleY = 20;
            const bar1Y = 28;
            const bar2Y = 62;

            return `
            <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
                <rect width="${width}" height="${height}" fill="${colors.background}" />

                <text x="${centerX}" y="${titleY}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>

                ${this.renderDialBar(rectX, bar1Y, sessionVal, sessionColor, colors, sessionLabel, sessionResetTime, rectWidth, sessionValueText)}
                ${this.renderDialBar(rectX, bar2Y, weekVal, weekColor, colors, weekLabel, weekResetTime, rectWidth, weekValueText)}
            </svg>
            `;
        }

        let rectWidth = 100;
        let rectX = centerX - 50;
        let textY = 18;
        let group1Y = 44;
        let group2Y = 100;

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="${width}" height="${height}" fill="${colors.background}" />

            <text x="${centerX}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>

            ${this.renderBarGroup(centerX, group1Y, rectX, group1Y + 8, sessionVal, sessionColor, colors, sessionLabel, sessionResetTime, rectWidth, sessionValueText)}
            ${this.renderBarGroup(centerX, group2Y, rectX, group2Y + 8, weekVal, weekColor, colors, weekLabel, weekResetTime, rectWidth, weekValueText)}
        </svg>
        `;
    }

    renderLoader(angle: number, theme: ServiceTheme = 'claude', width: number = 144, height: number = 144): string {
        const colors = this.themes[theme];
        const cx = width / 2;
        const cy = height / 2;

        const isDial = width === 200 && height === 100;
        const radius = isDial ? 20 : 25;
        const strokeWidth = 5;
        const spinnerY = isDial ? cy - 8 : cy;
        const textY = isDial ? cy + 35 : 115;

        // For Dial, we might want a different layout, e.g. text right, spinner left? 
        // Or just centered. Let's stick to centered but properly positioned.

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="${width}" height="${height}" fill="${colors.background}" />
            <text x="${cx}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="${isDial ? 14 : 16}" fill="${colors.text}" text-anchor="middle" opacity="0.7">Loading...</text>
            <circle cx="${cx}" cy="${spinnerY}" r="${radius}" stroke="${colors.barBg}" stroke-width="${strokeWidth}" fill="none" />
            <g transform="rotate(${angle} ${cx} ${spinnerY})">
                <path d="M${cx} ${spinnerY - radius} A${radius} ${radius} 0 0 1 ${cx + radius} ${spinnerY}" stroke="${colors.primary}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" />
            </g>
        </svg>
        `;
    }

    private renderDialBar(
        rectX: number,
        rectY: number,
        value: number,
        color: string,
        colors: ThemeColors,
        label: string,
        resetTime?: string | number | null,
        barWidth: number = 180,
        valueText?: string
    ): string {
        const timeText = resetTime ? this.formatResetTime(resetTime) : "";
        const valueLabel = valueText ?? `${value}%`;

        const barHeight = 24;
        const textY = rectY + 16;

        const textShadow = `style="text-shadow: 0px 1px 2px rgba(0,0,0,0.8)"`;

        return `
            <rect x="${rectX}" y="${rectY}" width="${barWidth}" height="${barHeight}" fill="${colors.barBg}" rx="4" />
            <rect x="${rectX}" y="${rectY}" width="${value * (barWidth / 100)}" height="${barHeight}" fill="${color}" rx="4" />

            <text x="${rectX + 6}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" fill="${colors.text}" text-anchor="start" ${textShadow}>
                ${label}
                <tspan fill="#CCC" font-weight="400" font-size="12">
                 ${valueLabel}
                </tspan>
            </text>
            <text x="${rectX + barWidth - 6}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#DDD" text-anchor="end" ${textShadow}>${timeText}</text>
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
        resetTime?: string | number | null,
        barWidth: number = 100,
        valueText?: string
    ): string {
        const timeText = resetTime ? this.formatResetTime(resetTime) : "";
        const valueLabel = valueText ?? `${value}%`;

        return `
            <text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
                <tspan font-size="15" font-weight="600" fill="${colors.text}">${valueLabel}</tspan>
                <tspan font-size="15" fill="#999">  ${label}</tspan>
            </text>
            <rect x="${rectX}" y="${rectY}" width="${barWidth}" height="20" fill="${colors.barBg}" rx="6" />
            <rect x="${rectX}" y="${rectY}" width="${value * (barWidth / 100)}" height="20" fill="${color}" rx="6" />
            ${timeText ? `<text x="${textX}" y="${rectY + 17}" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="500" fill="#AAA" text-anchor="middle">${timeText}</text>` : ''}
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

    renderError(
        message: string,
        theme: ServiceTheme = 'claude',
        width: number = 144,
        height: number = 144
    ): string {
        const colors = this.themes[theme];
        const serviceName = this.serviceName(theme);
        const centerX = width / 2;

        if (width === 200 && height === 100) {
            return `
            <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
                <rect width="${width}" height="${height}" fill="${colors.background}" />
                <text x="${centerX}" y="30" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>
                <rect x="10" y="42" width="180" height="36" fill="${colors.barBg}" rx="4" />
                <text x="${centerX}" y="64" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" fill="#EF4444" text-anchor="middle">${message}</text>
            </svg>
            `;
        }

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="${width}" height="${height}" fill="${colors.background}" />
            <text x="${centerX}" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${colors.label}" text-anchor="middle">${serviceName}</text>
            <text x="${centerX}" y="68" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="700" fill="#EF4444" text-anchor="middle">ERROR</text>
            <text x="${centerX}" y="94" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${colors.text}" text-anchor="middle">${message}</text>
        </svg>
        `;
    }

    renderPlaceholder(width: number, height: number): string {
        const colors = this.themes.antigravity;
        const centerX = width / 2;
        const centerY = height / 2;

        return `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="${width}" height="${height}" fill="${colors.background}" />
            
            <text x="${centerX}" y="${centerY - 10}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="${colors.text}" text-anchor="middle">Open</text>
            <text x="${centerX}" y="${centerY + 10}" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" fill="${colors.text}" text-anchor="middle">Antigravity</text>
        </svg>
        `;
    }
}
