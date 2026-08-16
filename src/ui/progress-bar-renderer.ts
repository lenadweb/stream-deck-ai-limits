import { ServiceTheme, ThemeColors } from "../interfaces/theme";

export interface Slot {
    kind: "gauge" | "stat";
    label: string;
    /** Used instead of {@link label} inside a ring, where horizontal space is tight. */
    shortLabel?: string;
    percent?: number;
    valueText?: string;
    caption?: string;
    /** Renders the value in the muted label colour, for placeholders like "no data". */
    muted?: boolean;
}

export interface RenderOptions {
    showName?: boolean;
    /** Overrides the theme label, for generic backends such as CodexBar. */
    serviceName?: string;
}

const STATE_DANGER = "#F2564F";
const STATE_WARN = "#E5A12E";

export class ProgressBarRenderer {
    private themes: Record<ServiceTheme, ThemeColors> = {
        claude: {
            primary: '#E08763',
            secondary: '#E8956B',
            background: '#221C1A',
            text: '#FBF4F0',
            label: '#A1908A',
            barBg: '#352B27',
            barFill: '#E5825B'
        },
        codex: {
            primary: '#23C892',
            secondary: '#34D399',
            background: '#101113',
            text: '#F4F4F5',
            label: '#75757D',
            barBg: '#23242A',
            barFill: '#2BD89A'
        },
        antigravity: {
            primary: '#9D7BFF',
            secondary: '#A78BFA',
            background: '#15121E',
            text: '#F3EEFF',
            label: '#928AAC',
            barBg: '#27223A',
            barFill: '#9D7BFF'
        },
        'gemini-cli': {
            primary: '#5B9BFF',
            secondary: '#8AB4F8',
            background: '#0E0F11',
            text: '#ECEDEF',
            label: '#8E929A',
            barBg: '#23272D',
            barFill: '#5B9BFF'
        },
        minimax: {
            primary: '#F8068D',
            secondary: '#FF54B0',
            background: '#18090F',
            text: '#FDEBF4',
            label: '#A57E92',
            barBg: '#2E1320',
            barFill: '#FF1F99'
        },
        openrouter: {
            primary: '#7B7DFF',
            secondary: '#8B8DF6',
            background: '#0B0B0E',
            text: '#F5F5F8',
            label: '#8A8D96',
            barBg: '#1D1D25',
            barFill: '#8284FF'
        },
        codexbar: {
            primary: '#A5B4FC',
            secondary: '#C4B5FD',
            background: '#12131B',
            text: '#F5F5FF',
            label: '#9CA3B8',
            barBg: '#25283A',
            barFill: '#A5B4FC'
        }
    };

    private static readonly serviceLabels: Partial<Record<ServiceTheme, string>> = {
        'gemini-cli': 'Gemini',
        openrouter: 'OpenRouter',
        codexbar: 'CodexBar'
    };

    private static readonly SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
    private static readonly MONO = "'SF Mono', 'JetBrains Mono', 'Roboto Mono', ui-monospace, 'Menlo', monospace";

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
        weekValueText?: string,
        opts: RenderOptions = {}
    ): string {
        const slots: Slot[] = [
            {
                kind: "gauge",
                label: sessionLabel,
                percent: session,
                valueText: sessionValueText,
                caption: sessionResetTime != null ? this.formatResetTime(sessionResetTime) : undefined
            },
            {
                kind: "gauge",
                label: weekLabel,
                percent: week,
                valueText: weekValueText,
                caption: weekResetTime != null ? this.formatResetTime(weekResetTime) : undefined
            }
        ];
        return this.renderSlots(slots, theme, width, height, opts);
    }

    renderSlots(slots: Slot[], theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        const colors = this.themes[theme];
        const isDial = this.isDial(width, height);
        const showName = opts.showName !== false;
        const displayedSlots = slots.slice(0, 2);
        const geo = this.geometry(width, height, isDial, showName, displayedSlots.length);

        const chrome = this.background(width, height, colors) + this.header(opts.serviceName ?? this.serviceName(theme), colors, geo, isDial, showName);
        const modules = displayedSlots.map((slot, i) =>
            slot.kind === "stat"
                ? this.statModule(slot, colors, theme, geo, geo.moduleTop[i], isDial)
                : this.gaugeModule(slot, colors, theme, geo, geo.moduleTop[i], isDial)
        ).join("");

        return this.svg(width, height, chrome + modules);
    }

    /**
     * Single ring gauge filling the whole tile: label, value and reset time stacked
     * inside the ring. Stat slots (credits, reset counts) keep the ring as a frame
     * and simply show their value, so a mixed set of tiles still reads as one family.
     */
    renderRing(slot: Slot, theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        const colors = this.themes[theme];
        const isDial = this.isDial(width, height);
        const showName = opts.showName !== false;
        const geo = this.geometry(width, height, isDial, showName, 1);
        const ring = this.ringGeometry(width, height, isDial, showName);

        const isGauge = slot.kind !== "stat";
        const pct = this.clampPct(slot.percent ?? 0);
        const color = isGauge ? this.barColor(pct, theme) : colors.primary;
        const value = slot.valueText ?? (isGauge ? `${pct}%` : "—");

        const cx = this.round(ring.cx);
        const cy = this.round(ring.cy);

        let body = this.background(width, height, colors)
            + this.header(opts.serviceName ?? this.serviceName(theme), colors, geo, isDial, showName);

        body += `<circle cx="${cx}" cy="${cy}" r="${ring.r}" fill="none" stroke="${colors.barBg}" stroke-width="${ring.sw}" />`;
        if (isGauge && pct > 0) {
            const circumference = 2 * Math.PI * ring.r;
            const filled = (circumference * pct) / 100;
            body += `<circle cx="${cx}" cy="${cy}" r="${ring.r}" fill="none" stroke="${color}" stroke-width="${ring.sw}"`
                + ` stroke-linecap="round" stroke-dasharray="${this.round(filled)} ${this.round(circumference)}"`
                + ` transform="rotate(-90 ${cx} ${cy})" />`;
        }

        const labelText = slot.shortLabel ?? slot.label;
        if (labelText) {
            const max = this.chord(ring.inner, ring.labelDy, ring.labelSize);
            // Model names can be long; shrink before falling back to an ellipsis.
            const size = this.fitFontSize(labelText, ring.labelSize, ring.labelSize - 2.5, ProgressBarRenderer.SANS, max);
            const label = this.fitText(labelText, size, ProgressBarRenderer.SANS, max, 600);
            body += this.txt(ring.cx, ring.cy + ring.labelDy, label, size, 600, colors.label, "middle", ProgressBarRenderer.SANS);
        }

        const valueMax = this.chord(ring.inner, ring.valueDy, ring.valueSize);
        const valueSize = this.fitFontSize(value, ring.valueSize, ring.valueMin, ProgressBarRenderer.SANS, valueMax);
        const valueColor = slot.muted ? colors.label : color;
        body += this.txt(ring.cx, ring.cy + ring.valueDy, this.escape(value), valueSize, 700, valueColor, "middle", ProgressBarRenderer.SANS);

        // A clipped caption carries no information, so drop it rather than ellipsise it.
        if (slot.caption) {
            const max = this.chord(ring.inner, ring.captionDy, ring.captionSize);
            if (this.measure(slot.caption, ring.captionSize, ProgressBarRenderer.SANS, 500) <= max) {
                body += this.txt(ring.cx, ring.cy + ring.captionDy, this.escape(slot.caption), ring.captionSize, 500, colors.label, "middle", ProgressBarRenderer.SANS);
            }
        }

        return this.svg(width, height, body);
    }

    private isDial(w: number, h: number): boolean {
        return w === 200 && h === 100;
    }

    private ringGeometry(width: number, height: number, isDial: boolean, showName: boolean) {
        const margin = isDial ? 12 : 15;
        const left = isDial && showName ? 26 : margin;
        const cx = (left + (width - margin)) / 2;

        if (isDial) {
            const r = 40, sw = 9;
            return {
                cx, cy: height / 2, r, sw, inner: r - sw / 2 - 2.5,
                labelSize: 10, labelDy: -15,
                valueSize: 24, valueMin: 13, valueDy: 8,
                captionSize: 10, captionDy: 22
            };
        }

        const r = showName ? 46 : 50;
        const sw = showName ? 10 : 11;
        return {
            cx, cy: showName ? 84 : 72, r, sw, inner: r - sw / 2 - 3,
            labelSize: 11, labelDy: -18,
            valueSize: 30, valueMin: 15, valueDy: 9,
            captionSize: 11, captionDy: 26
        };
    }

    /** Widest line of text that still fits inside the ring at a given vertical offset. */
    private chord(inner: number, dy: number, size: number): number {
        const y = Math.max(Math.abs(dy), Math.abs(dy - size * 0.72));
        if (y >= inner) return 0;
        return 2 * Math.sqrt(inner * inner - y * y);
    }

    private geometry(width: number, height: number, isDial: boolean, showName: boolean, moduleCount = 2) {
        const margin = isDial ? 12 : 15;
        const nameAxis = 13;
        const left = isDial && showName ? 26 : margin;
        const right = width - margin;

        let moduleTop: number[];
        if (moduleCount === 1) {
            moduleTop = [isDial ? 27 : 43];
        } else if (isDial) {
            moduleTop = [6, 52];
        } else {
            moduleTop = showName ? [24, 82] : [14, 72];
        }

        return {
            margin,
            width,
            height,
            nameAxis,
            left,
            right,
            innerW: right - left,
            headerY: 14,
            labelRow: isDial ? 11 : 13,
            percentSize: isDial ? 11 : 12.5,
            labelSize: isDial ? 10.5 : 12,
            barY: isDial ? 17 : 21,
            barH: isDial ? 19 : 24,
            barR: isDial ? 6 : 7,
            headGap: isDial ? 13 : 17,
            timeSize: isDial ? 12 : 14,
            statLabelSize: isDial ? 12 : 11,
            statValueRow: isDial ? 31 : 37,
            statValueSize: isDial ? 17 : 23,
            moduleTop
        };
    }

    private svg(width: number, height: number, body: string): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
    }

    private background(width: number, height: number, colors: ThemeColors): string {
        return `<rect width="${width}" height="${height}" fill="${colors.background}" />`;
    }

    private header(name: string, colors: ThemeColors, geo: any, isDial: boolean, showName: boolean): string {
        if (!showName) return "";
        const upper = name.toUpperCase();
        const text = this.escape(upper);
        if (isDial) {
            const axisX = geo.nameAxis;
            const cy = geo.height / 2;
            const size = this.fitFontSize(upper, 10, 6.5, ProgressBarRenderer.SANS, geo.height - 22, 1.5);
            const ax = axisX + size * 0.34;
            return `<text x="${this.round(ax)}" y="${this.round(cy)}" font-family="${ProgressBarRenderer.SANS}" font-size="${size}" font-weight="700" letter-spacing="1.5" fill="${colors.label}" text-anchor="middle" transform="rotate(-90 ${this.round(ax)} ${this.round(cy)})">${text}</text>`;
        }
        const fitted = this.fitText(upper, 10, ProgressBarRenderer.SANS, geo.innerW, 700, 2.5);
        return this.txt((geo.left + geo.right) / 2, geo.headerY, fitted, 10, 700, colors.label, "middle", ProgressBarRenderer.SANS, 2.5);
    }

    private gaugeModule(slot: Slot, colors: ThemeColors, theme: ServiceTheme, geo: any, top: number, isDial: boolean): string {
        const pct = this.clampPct(slot.percent ?? 0);
        const color = this.barColor(pct, theme);
        const time = slot.caption ? this.escape(slot.caption) : "";
        const raw = slot.valueText ?? `${pct}%`;

        const weight = 500;
        const headSize = geo.percentSize;
        const headGap = geo.headGap;
        const m = raw.match(/^(\d+)(%)$/);
        const percentText = m ? `${m[1]}${m[2]}` : raw;
        const percentW = this.measure(percentText, headSize, ProgressBarRenderer.SANS, weight);

        const labelMax = geo.innerW - percentW - headGap;
        const label = this.fitText(slot.label, headSize, ProgressBarRenderer.SANS, labelMax, weight);

        const barTop = top + geo.barY;
        const r = geo.barR;
        const fw = pct > 0 ? Math.max(geo.barH, (geo.innerW * pct) / 100) : 0;
        const cx = (geo.left + geo.right) / 2;
        const timeY = barTop + geo.barH / 2 + geo.timeSize * 0.35;
        const onFill = color === STATE_WARN ? "#1A1505" : "#FFFFFF";

        const labelW = this.measure(label, headSize, ProgressBarRenderer.SANS, weight);
        const headRow = top + geo.labelRow;
        const startX = cx - (percentW + headGap + labelW) / 2;

        let out = "";
        out += this.txt(startX, headRow, this.escape(percentText), headSize, weight, colors.text, "start", ProgressBarRenderer.SANS);
        out += this.txt(startX + percentW + headGap, headRow, label, headSize, weight, colors.label, "start", ProgressBarRenderer.SANS);
        out += `<rect x="${geo.left}" y="${barTop}" width="${this.round(geo.innerW)}" height="${geo.barH}" rx="${r}" fill="${colors.barBg}" />`;
        if (fw > 0) {
            out += `<rect x="${geo.left}" y="${barTop}" width="${this.round(fw)}" height="${geo.barH}" rx="${r}" fill="${color}" />`;
        }
        if (time) {
            out += this.txt(cx, timeY, time, geo.timeSize, 500, colors.label, "middle", ProgressBarRenderer.SANS);
            if (fw > 0) {
                const clipId = `bar${this.round(barTop)}_${this.round(geo.left)}`;
                out += `<defs><clipPath id="${clipId}"><rect x="${geo.left}" y="${barTop}" width="${this.round(fw)}" height="${geo.barH}" rx="${r}" /></clipPath></defs>`;
                out += `<g clip-path="url(#${clipId})">${this.txt(cx, timeY, time, geo.timeSize, 500, onFill, "middle", ProgressBarRenderer.SANS)}</g>`;
            }
        }
        return out;
    }

    private statModule(slot: Slot, colors: ThemeColors, theme: ServiceTheme, geo: any, top: number, isDial: boolean): string {
        const value = slot.valueText ?? "—";
        const cx = (geo.left + geo.right) / 2;

        let out = "";
        const label = this.fitText(slot.label, geo.statLabelSize, ProgressBarRenderer.SANS, geo.innerW, 600);
        out += this.txt(cx, top + geo.labelRow, label, geo.statLabelSize, 600, colors.label, "middle", ProgressBarRenderer.SANS);
        const font = this.fitFontSize(value, geo.statValueSize, 13, ProgressBarRenderer.SANS, geo.innerW);
        out += this.txt(cx, top + geo.statValueRow, this.escape(value), font, 700, colors.primary, "middle", ProgressBarRenderer.SANS);
        return out;
    }

    renderLoader(angle: number, theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        const colors = this.themes[theme];
        const isDial = this.isDial(width, height);
        const showName = opts.showName !== false;
        const geo = this.geometry(width, height, isDial, showName);
        const cx = (geo.left + geo.right) / 2;
        const cy = height / 2;
        const r = isDial ? 17 : 22;
        const sw = isDial ? 5 : 6;
        const dash = 2 * Math.PI * r;

        const ring = `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors.barBg}" stroke-width="${sw}" fill="none" />`
            + `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors.primary}" stroke-width="${sw}" fill="none" stroke-linecap="round" `
            + `stroke-dasharray="${this.round(dash * 0.28)} ${this.round(dash)}" transform="rotate(${angle} ${cx} ${cy})" />`;

        const body = this.background(width, height, colors)
            + this.header(opts.serviceName ?? this.serviceName(theme), colors, geo, isDial, showName)
            + ring;
        return this.svg(width, height, body);
    }

    renderError(message: string, theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        const colors = this.themes[theme];
        const isDial = this.isDial(width, height);
        const showName = opts.showName !== false;
        const geo = this.geometry(width, height, isDial, showName);
        const cx = (geo.left + geo.right) / 2;
        const top = isDial ? 26 : 42;

        const r = 14;
        const cyIcon = top + r;
        const icon = `<circle cx="${cx}" cy="${cyIcon}" r="${r}" fill="none" stroke="${STATE_DANGER}" stroke-width="2" />`
            + `<rect x="${cx - 1}" y="${cyIcon - 7}" width="2" height="8" rx="1" fill="${STATE_DANGER}" />`
            + `<circle cx="${cx}" cy="${cyIcon + 5}" r="1.4" fill="${STATE_DANGER}" />`;

        const lines = this.wrapText(message, isDial ? 12 : 13, ProgressBarRenderer.SANS, geo.innerW + 4, 2, 600);
        const startY = cyIcon + r + (isDial ? 16 : 22);
        const text = lines.map((l, i) => this.txt(cx, startY + i * 16, l, isDial ? 12 : 13, 600, colors.text, "middle", ProgressBarRenderer.SANS)).join("");

        const body = this.background(width, height, colors)
            + this.header(opts.serviceName ?? this.serviceName(theme), colors, geo, isDial, showName)
            + icon + text;
        return this.svg(width, height, body);
    }

    renderPlaceholder(theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        return this.renderLoader(0, theme, width, height, opts);
    }

    renderMessage(lines: string[], theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        const colors = this.themes[theme];
        const isDial = this.isDial(width, height);
        const showName = opts.showName !== false;
        const geo = this.geometry(width, height, isDial, showName);
        const cx = (geo.left + geo.right) / 2;
        const cy = height / 2 + (isDial ? 5 : 8);
        const lineH = isDial ? 19 : 22;
        const startY = cy - ((lines.length - 1) * lineH) / 2;
        const text = lines.map((line, i) =>
            this.txt(cx, startY + i * lineH, this.escape(line), isDial ? 15 : 16, 700, colors.text, "middle", ProgressBarRenderer.SANS)
        ).join("");
        const body = this.background(width, height, colors)
            + this.header(opts.serviceName ?? this.serviceName(theme), colors, geo, isDial, showName)
            + text;
        return this.svg(width, height, body);
    }

    private txt(x: number, y: number, content: string, size: number, weight: number, fill: string, anchor: string, family: string, tracking = 0): string {
        const ls = tracking ? ` letter-spacing="${tracking}"` : "";
        return `<text x="${this.round(x)}" y="${this.round(y)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls}>${content}</text>`;
    }

    private barColor(value: number, theme: ServiceTheme): string {
        const colors = this.themes[theme];
        if (value > 88) return STATE_DANGER;
        if (value > 70) return STATE_WARN;
        return colors.barFill || colors.primary;
    }

    private clampPct(v: number): number {
        if (!Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(100, Math.round(v)));
    }

    private factor(family: string, weight: number): number {
        if (family === ProgressBarRenderer.MONO) return 0.6;
        if (weight >= 800) return 0.64;
        if (weight >= 600) return 0.57;
        return 0.53;
    }

    private measure(text: string, size: number, family: string, weight: number): number {
        return text.length * size * this.factor(family, weight);
    }

    private fitText(text: string, size: number, family: string, maxWidth: number, weight = 600, tracking = 0): string {
        const w = (s: string) => this.measure(s, size, family, weight) + Math.max(0, s.length - 1) * tracking;
        const clean = text.trim();
        if (w(clean) <= maxWidth) return this.escape(clean);
        const ell = "…";
        let lo = 0, hi = clean.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (w(clean.slice(0, mid) + ell) <= maxWidth) lo = mid;
            else hi = mid - 1;
        }
        return this.escape(clean.slice(0, lo).trimEnd() + ell);
    }

    private fitFontSize(text: string, max: number, min: number, family: string, maxWidth: number, tracking = 0): number {
        let size = max;
        const w = (s: number) => this.measure(text, s, family, 700) + Math.max(0, text.length - 1) * tracking;
        while (size > min && w(size) > maxWidth) size -= 0.5;
        return Math.round(size * 10) / 10;
    }

    private wrapText(text: string, size: number, family: string, maxWidth: number, maxLines: number, weight = 600): string[] {
        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const w of words) {
            const next = line ? `${line} ${w}` : w;
            if (this.measure(next, size, family, weight) <= maxWidth || !line) {
                line = next;
            } else {
                lines.push(line);
                line = w;
                if (lines.length === maxLines - 1) break;
            }
        }
        if (line && lines.length < maxLines) lines.push(line);
        const last = lines.length - 1;
        if (last >= 0 && this.measure(lines[last], size, family, weight) > maxWidth) {
            return lines.slice(0, last).map((l) => this.escape(l)).concat(this.fitText(lines[last], size, family, maxWidth, weight));
        }
        return lines.map((l) => this.escape(l));
    }

    private round(n: number): number {
        return Math.round(n * 100) / 100;
    }

    private escape(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    private formatResetTime(resetTime: string | number): string {
        const resetDate = typeof resetTime === 'number' ? new Date(resetTime * 1000) : new Date(resetTime);
        const diffMs = resetDate.getTime() - Date.now();
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
