import { TileSize } from "../interfaces/settings";
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
    /** Scale preset; every size, gap and offset of the tile derives from it. */
    size?: TileSize;
}

/**
 * A preset is three independent moves, not one zoom: the type grows, the padding
 * and the gaps between things tighten to pay for it. That is what lets Extra Large
 * fit a 32px bar into the same 144px key.
 */
interface SizePreset {
    type: number;
    pad: number;
    gap: number;
}

const PRESETS: Record<TileSize, SizePreset> = {
    compact: { type: 0.88, pad: 1.15, gap: 1.1 },
    default: { type: 1, pad: 1, gap: 1 },
    large: { type: 1.16, pad: 0.68, gap: 0.85 },
    xlarge: { type: 1.32, pad: 0.42, gap: 0.68 }
};

/**
 * Every measurement of the default preset, in the two shapes a tile is drawn in.
 * Sizes are multiplied by `type`, margins by `pad`, the space between elements by
 * `gap`; positions are derived, never listed, so a preset cannot drift out of the
 * tile.
 */
const BASE = {
    key: {
        side: 15, edge: 7, ringEdge: 7, minSide: 8, minEdge: 4,
        header: 10, headerPad: 4.2, headerTracking: 2.5, nameAxis: 0, nameGap: 0,
        head: 12.5, headGap: 17, headBarGap: 8, bar: 24, barR: 7, time: 14, slotGap: 17,
        statLabel: 11, statValue: 23, statPad: 7.4,
        ringR: 46, ringRBare: 50, ringSw: 10, ringSwBare: 11, ringInnerPad: 5,
        ringValue: 30, ringValueMin: 10, ringLabel: 11, ringCaption: 11,
        ringLabelDy: -18, ringValueDy: 9, ringCaptionDy: 26,
        loaderR: 22, loaderSw: 6,
        icon: 14, iconStroke: 2, iconGap: 22, errText: 13, errLine: 16,
        msg: 16, msgLine: 22
    },
    dial: {
        side: 12, edge: 9, ringEdge: 4, minSide: 10, minEdge: 3,
        header: 10, headerPad: 0, headerTracking: 1.5, nameAxis: 13, nameGap: 6,
        head: 11, headGap: 13, headBarGap: 6, bar: 19, barR: 6, time: 12, slotGap: 13,
        statLabel: 12, statValue: 17, statPad: 7,
        ringR: 40, ringRBare: 40, ringSw: 9, ringSwBare: 9, ringInnerPad: 4,
        ringValue: 24, ringValueMin: 9, ringLabel: 10, ringCaption: 10,
        ringLabelDy: -15, ringValueDy: 8, ringCaptionDy: 22,
        loaderR: 17, loaderSw: 5,
        icon: 14, iconStroke: 2, iconGap: 16, errText: 12, errLine: 16,
        msg: 15, msgLine: 19
    }
};

/** Cap height as a share of the font size; how far the ink reaches above a baseline. */
const CAP = 0.72;

/** Font sizes snap to half a pixel, so a preset never lands on a blurry value. */
const snap = (v: number): number => Math.round(v * 2) / 2;

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

    /** Characters whose width a per-class estimate would get meaningfully wrong. */
    private static readonly CHAR_WIDTHS: Record<string, number> = {
        " ": 0.2, "1": 0.46, "%": 0.84, "$": 0.62, "\u221e": 0.89, "\u2026": 0.62,
        "-": 0.43, "\"": 0.43, "m": 0.82, "w": 0.74, "M": 0.84, "W": 0.94
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
        const geo = this.geometry(width, height, isDial, showName, displayedSlots.length, this.preset(opts));

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
        const p = this.preset(opts);
        const geo = this.geometry(width, height, isDial, showName, 1, p);
        const ring = this.ringGeometry(width, height, isDial, showName, p);

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
            // Model names can be long; shrink before falling back to an ellipsis.
            const size = this.fitInRing(labelText, ring, ring.labelDy, ring.labelSize, ring.labelMin, 600);
            const label = this.fitText(labelText, size, ProgressBarRenderer.SANS, this.chord(ring.inner, ring.labelDy, size), 600);
            body += this.txt(ring.cx, ring.cy + ring.labelDy, label, size, 600, colors.label, "middle", ProgressBarRenderer.SANS);
        }

        const valueSize = this.fitInRing(value, ring, ring.valueDy, ring.valueSize, ring.valueMin, 700);
        // Shrinking keeps a long amount whole and readable; the ellipsis is only a
        // guard so nothing can ever spill over the gauge.
        const valueText = this.fitText(value, valueSize, ProgressBarRenderer.SANS, this.chord(ring.inner, ring.valueDy, valueSize), 700);
        const valueColor = slot.muted ? colors.label : color;
        body += this.txt(ring.cx, ring.cy + ring.valueDy, valueText, valueSize, 700, valueColor, "middle", ProgressBarRenderer.SANS);

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

    private preset(opts: RenderOptions): SizePreset {
        return PRESETS[opts.size ?? "default"] ?? PRESETS.default;
    }

    /** Margins, and the vertical band the tile's content is centred in. */
    private frame(width: number, height: number, isDial: boolean, showName: boolean, p: SizePreset) {
        const b = isDial ? BASE.dial : BASE.key;
        const edge = Math.max(b.minEdge, this.round(b.edge * p.pad));
        const side = Math.max(b.minSide, this.round(b.side * p.pad));
        const headerSize = snap(b.header * p.type);
        const headerY = Math.round(edge + headerSize * CAP);
        // The rotated name on a dial eats width, not height.
        // The gap after the name follows the name's own size, not the shrinking gaps.
        const left = Math.round(isDial && showName ? b.nameAxis + headerSize * CAP + b.nameGap * p.type : side);
        return {
            b, edge, side, headerSize, headerY, left,
            right: Math.round(width - side),
            headerTracking: this.round(b.headerTracking * p.type),
            bandTop: !isDial && showName ? headerY + b.headerPad * p.gap : edge,
            bandBottom: height - edge
        };
    }

    private ringGeometry(width: number, height: number, isDial: boolean, showName: boolean, p: SizePreset) {
        const f = this.frame(width, height, isDial, showName, p);
        const b = f.b;
        const cx = (f.left + f.right) / 2;

        // A ring is a circle: it may sit closer to the edges than a block of text.
        const ringEdge = Math.max(b.minEdge, this.round(b.ringEdge * p.pad));
        const bandTop = !isDial && showName ? f.headerY + b.headerPad * p.gap : ringEdge;
        const bandBottom = height - ringEdge;
        const cy = this.round((bandTop + bandBottom) / 2);

        const sw = snap((showName ? b.ringSw : b.ringSwBare) * p.type);
        const baseR = showName ? b.ringR : b.ringRBare;
        // The type takes the whole step even where the ring runs out of room; what
        // does not fit inside the gauge is shrunk to fit by fitFontSize, never clipped.
        const r = this.round(Math.min(baseR * p.type, (bandBottom - bandTop) / 2 - sw / 2));
        const ratio = r / baseR;
        // Air between the stroke and the text; without it a chord-limited value at a
        // big preset would sit flush against its own gauge.
        const inner = r - sw / 2 - b.ringInnerPad * ratio;

        return {
            cx, cy, r, sw, inner,
            labelSize: snap(b.ringLabel * p.type),
            labelMin: snap(b.ringLabel * ratio * 0.77),
            labelDy: this.round(b.ringLabelDy * ratio),
            valueSize: snap(b.ringValue * p.type),
            valueMin: snap(b.ringValueMin * ratio),
            valueDy: this.round(b.ringValueDy * ratio),
            captionSize: snap(b.ringCaption * p.type),
            captionDy: this.round(b.ringCaptionDy * ratio)
        };
    }

    private geometry(width: number, height: number, isDial: boolean, showName: boolean, moduleCount = 2, p: SizePreset = PRESETS.default) {
        const f = this.frame(width, height, isDial, showName, p);
        const b = f.b;

        const head = snap(b.head * p.type);
        const labelRow = this.round(head * CAP);
        const barH = Math.round(b.bar * p.type);
        const barY = Math.round(labelRow + b.headBarGap * p.gap);
        const moduleH = barY + barH;
        const slotGap = Math.round(b.slotGap * p.gap);

        // Modules are stacked by their ink, then the stack is centred in the band —
        // so every preset ends up with balanced air above and below.
        const count = Math.min(2, Math.max(1, moduleCount));
        const blockH = count * moduleH + (count - 1) * slotGap;
        const top = Math.round(f.bandTop + Math.max(0, f.bandBottom - f.bandTop - blockH) / 2);
        const moduleTop = Array.from({ length: count }, (_, i) => top + i * (moduleH + slotGap));

        // A stat has no bar, so its label and value are centred in the module instead.
        const statLabel = snap(b.statLabel * p.type);
        const statValue = snap(b.statValue * p.type);
        const statStep = this.round(statValue * CAP + b.statPad * p.gap);
        const statTop = Math.max(0, (moduleH - (statLabel * CAP + statStep)) / 2);

        return {
            width,
            height,
            nameAxis: b.nameAxis,
            left: f.left,
            right: f.right,
            innerW: f.right - f.left,
            headerY: f.headerY,
            headerSize: f.headerSize,
            headerMin: snap(f.headerSize * 0.65),
            headerTracking: f.headerTracking,
            labelRow,
            percentSize: head,
            barY,
            barH,
            barR: Math.round(b.barR * p.type),
            headGap: Math.round(b.headGap * p.type),
            timeSize: snap(b.time * p.type),
            statLabelSize: statLabel,
            statLabelRow: this.round(statTop + statLabel * CAP),
            statValueSize: statValue,
            statValueRow: this.round(statTop + statLabel * CAP + statStep),
            statValueMin: snap(13 * p.type),
            bandTop: f.bandTop,
            bandBottom: f.bandBottom,
            moduleTop
        };
    }

    /**
     * Largest size at which a line still fits the ring at its offset. The room a
     * line has depends on its own size, so the chord is re-measured at every step
     * rather than taken once at the largest size.
     */
    private fitInRing(text: string, ring: { inner: number }, dy: number, max: number, min: number, weight: number): number {
        let size = max;
        while (size > min && this.measure(text, size, ProgressBarRenderer.SANS, weight) > this.chord(ring.inner, dy, size)) {
            size -= 0.5;
        }
        return size;
    }

    /** Widest line of text that still fits inside the ring at a given vertical offset. */
    private chord(inner: number, dy: number, size: number): number {
        const y = Math.max(Math.abs(dy), Math.abs(dy - size * 0.72));
        if (y >= inner) return 0;
        return 2 * Math.sqrt(inner * inner - y * y);
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
            const size = this.fitFontSize(upper, geo.headerSize, geo.headerMin, ProgressBarRenderer.SANS, geo.height - 22, geo.headerTracking);
            const ax = axisX + size * 0.34;
            return `<text x="${this.round(ax)}" y="${this.round(cy)}" font-family="${ProgressBarRenderer.SANS}" font-size="${size}" font-weight="700" letter-spacing="${geo.headerTracking}" fill="${colors.label}" text-anchor="middle" transform="rotate(-90 ${this.round(ax)} ${this.round(cy)})">${text}</text>`;
        }
        const fitted = this.fitText(upper, geo.headerSize, ProgressBarRenderer.SANS, geo.innerW, 700, geo.headerTracking);
        return this.txt((geo.left + geo.right) / 2, geo.headerY, fitted, geo.headerSize, 700, colors.label, "middle", ProgressBarRenderer.SANS, geo.headerTracking);
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
        out += this.txt(cx, top + geo.statLabelRow, label, geo.statLabelSize, 600, colors.label, "middle", ProgressBarRenderer.SANS);
        const font = this.fitFontSize(value, geo.statValueSize, geo.statValueMin, ProgressBarRenderer.SANS, geo.innerW);
        out += this.txt(cx, top + geo.statValueRow, this.escape(value), font, 700, colors.primary, "middle", ProgressBarRenderer.SANS);
        return out;
    }

    renderLoader(angle: number, theme: ServiceTheme = 'claude', width: number = 144, height: number = 144, opts: RenderOptions = {}): string {
        const colors = this.themes[theme];
        const isDial = this.isDial(width, height);
        const showName = opts.showName !== false;
        const p = this.preset(opts);
        const b = isDial ? BASE.dial : BASE.key;
        const geo = this.geometry(width, height, isDial, showName, 2, p);
        const cx = (geo.left + geo.right) / 2;
        const cy = this.round((geo.bandTop + geo.bandBottom) / 2);
        const r = this.round(b.loaderR * p.type);
        const sw = snap(b.loaderSw * p.type);
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
        const p = this.preset(opts);
        const b = isDial ? BASE.dial : BASE.key;
        const geo = this.geometry(width, height, isDial, showName, 2, p);
        const cx = (geo.left + geo.right) / 2;

        const r = this.round(b.icon * p.type);
        const size = snap(b.errText * p.type);
        const gap = b.iconGap * p.gap;
        const lineH = b.errLine * p.type;
        const lines = this.wrapText(message, size, ProgressBarRenderer.SANS, geo.innerW + 4, 2, 600);
        // Icon and message are one block, centred in the same band as everything else.
        const blockH = 2 * r + gap + lineH * lines.length;
        const top = geo.bandTop + Math.max(0, geo.bandBottom - geo.bandTop - blockH) / 2;

        const cyIcon = this.round(top + r);
        const t = p.type;
        const icon = `<circle cx="${cx}" cy="${cyIcon}" r="${r}" fill="none" stroke="${STATE_DANGER}" stroke-width="${snap(b.iconStroke * t)}" />`
            + `<rect x="${this.round(cx - t)}" y="${this.round(cyIcon - 7 * t)}" width="${snap(2 * t)}" height="${this.round(8 * t)}" rx="1" fill="${STATE_DANGER}" />`
            + `<circle cx="${cx}" cy="${this.round(cyIcon + 5 * t)}" r="${this.round(1.4 * t)}" fill="${STATE_DANGER}" />`;

        const startY = cyIcon + r + gap;
        const text = lines.map((l, i) => this.txt(cx, startY + i * lineH, l, size, 600, colors.text, "middle", ProgressBarRenderer.SANS)).join("");

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
        const p = this.preset(opts);
        const b = isDial ? BASE.dial : BASE.key;
        const geo = this.geometry(width, height, isDial, showName, 2, p);
        const cx = (geo.left + geo.right) / 2;
        const size = snap(b.msg * p.type);
        const lineH = b.msgLine * p.type;
        const cap = size * CAP;
        // Centre the ink of the block, not its baselines.
        const startY = (geo.bandTop + geo.bandBottom) / 2 + cap / 2 - ((lines.length - 1) * lineH) / 2;
        const text = lines.map((line, i) =>
            this.txt(cx, startY + i * lineH, this.escape(line), size, 700, colors.text, "middle", ProgressBarRenderer.SANS)
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

    /**
     * Advance width of one character, in ems, sampled from SF Pro at weight 500 —
     * the face the tiles actually render in, and close enough to Segoe UI and Inter
     * to place text by. Averaging every character to a single factor underestimated
     * "%" and digits by a quarter, which let a ring value overlap its own gauge.
     */
    private charWidth(ch: string, family: string): number {
        if (family === ProgressBarRenderer.MONO) return 0.6;
        const known = ProgressBarRenderer.CHAR_WIDTHS[ch];
        if (known !== undefined) return known;
        if (ch >= "0" && ch <= "9") return 0.61;
        if ("iIjl.,:;'!|".includes(ch)) return 0.24;
        if ("frt/()[]".includes(ch)) return 0.33;
        if (ch >= "A" && ch <= "Z") return 0.65;
        // CJK and other full-width scripts advance a whole em.
        if (ch.codePointAt(0)! > 0x2e7f) return 1;
        return 0.53;
    }

    private measure(text: string, size: number, family: string, weight: number): number {
        // Heavier cuts of the same face are a few percent wider, uniformly enough
        // to fold into a single multiplier.
        const bold = weight >= 700 ? 1.06 : weight >= 600 ? 1.03 : 1;
        let ems = 0;
        for (const ch of text) ems += this.charWidth(ch, family);
        return ems * size * bold;
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
