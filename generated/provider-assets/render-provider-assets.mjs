import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const outRoot = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(outRoot, '..', '..');

const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-assets-'));
try {
    execSync(
        `npx tsc src/ui/progress-bar-renderer.ts src/interfaces/theme.ts --outDir ${distDir} --module ESNext --target ES2022 --moduleResolution bundler`,
        { cwd: repoRoot, stdio: 'ignore' }
    );
} catch {
    // tsc reports ambient @types/node errors but still emits the JS we need.
}
fs.writeFileSync(path.join(distDir, 'package.json'), '{"type":"module"}');

const { ProgressBarRenderer } = await import(
    pathToFileURL(path.join(distDir, 'ui', 'progress-bar-renderer.js')).href
);
const renderer = new ProgressBarRenderer();

const gauge = (label, percent, caption) => ({ kind: 'gauge', label, percent, caption });
const stat = (label, valueText) => ({ kind: 'stat', label, valueText });

const providers = {
    claude: [gauge('Session', 16, '3h 33m'), gauge('Week', 92, '16h 3m')],
    codex: [gauge('Session', 5, '4h'), gauge('Week', 10, '6d')],
    antigravity: [gauge('Claude', 24, '2h 14m'), gauge('Gemini', 41, '4d 3h')],
    'gemini-cli': [gauge('Overall', 11, '8h'), gauge('Overall', 37, '2d 5h')],
    minimax: [gauge('Daily', 33, '1h 42m'), gauge('Week', 58, '1d 9h')],
    openrouter: [gauge('Limit', 18, '9d 4h'), stat('Total', '$1,234.56')]
};

function render(svgPath, outPath, w, h) {
    execSync(`rsvg-convert -w ${w} -h ${h} "${svgPath}" -o "${outPath}"`);
}

for (const [name, slots] of Object.entries(providers)) {
    const dir = path.join(outRoot, name);
    fs.mkdirSync(dir, { recursive: true });

    const sq = path.join(dir, 'base-144.svg');
    const dl = path.join(dir, 'base-dial-200x100.svg');
    fs.writeFileSync(sq, renderer.renderSlots(slots, name, 144, 144));
    fs.writeFileSync(dl, renderer.renderSlots(slots, name, 200, 100));

    render(sq, path.join(dir, 'icon.png'), 20, 20);
    render(sq, path.join(dir, 'icon@2x.png'), 40, 40);
    render(sq, path.join(dir, 'key.png'), 72, 72);
    render(sq, path.join(dir, 'key@2x.png'), 144, 144);
    render(sq, path.join(dir, 'category-icon.png'), 28, 28);
    render(sq, path.join(dir, 'category-icon@2x.png'), 56, 56);
    render(sq, path.join(dir, 'plugin-icon.png'), 256, 256);
    render(sq, path.join(dir, 'plugin-icon@2x.png'), 512, 512);
    render(sq, path.join(dir, 'marketplace.png'), 288, 288);
    render(sq, path.join(dir, 'marketplace@2x.png'), 512, 512);

    render(dl, path.join(dir, 'dial.png'), 200, 100);
    render(dl, path.join(dir, 'dial@2x.png'), 400, 200);
}

fs.rmSync(distDir, { recursive: true, force: true });
console.log('Regenerated provider assets from the current renderer');
