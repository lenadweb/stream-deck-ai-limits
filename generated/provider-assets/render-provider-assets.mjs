import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const outRoot = path.dirname(new URL(import.meta.url).pathname); // resolved relative to this script's own location

const providers = {
  claude: {
    title: 'Claude',
    theme: { primary:'#D97757', background:'#2F2724', text:'#FFFFFF', label:'#9D8B86', barBg:'#4A3D39', barFill:'#D97757' },
    square: { top:16, bottom:92, topLabel:'Session', bottomLabel:'Week', topTime:'3h 33m', bottomTime:'16h 3m' },
    dial: { top:16, bottom:92, topLabel:'Session', bottomLabel:'Week', topTime:'3h 33m', bottomTime:'16h 3m' }
  },
  codex: {
    title: 'Codex',
    theme: { primary:'#10B981', background:'#18181B', text:'#FFFFFF', label:'#71717A', barBg:'#27272A', barFill:'#10B981' },
    square: { top:5, bottom:10, topLabel:'Session', bottomLabel:'Week', topTime:'4h', bottomTime:'6d' },
    dial: { top:5, bottom:10, topLabel:'Session', bottomLabel:'Week', topTime:'4h', bottomTime:'6d' }
  },
  antigravity: {
    title: 'Antigravity',
    theme: { primary:'#8B5CF6', background:'#1E1B2E', text:'#FFFFFF', label:'#9CA3AF', barBg:'#2D2B40', barFill:'#8B5CF6' },
    square: { top:24, bottom:41, topLabel:'Claude', bottomLabel:'Gemini', topTime:'2h 14m', bottomTime:'4d 3h' },
    dial: { top:24, bottom:41, topLabel:'Claude', bottomLabel:'Gemini', topTime:'2h 14m', bottomTime:'4d 3h' }
  },
  'gemini-cli': {
    title: 'Gemini-cli',
    theme: { primary:'#4285F4', background:'#131314', text:'#E3E3E3', label:'#C4C7C5', barBg:'#444746', barFill:'#4285F4' },
    square: { top:11, bottom:37, topLabel:'Overall', bottomLabel:'Overall', topTime:'8h', bottomTime:'2d 5h' },
    dial: { top:11, bottom:37, topLabel:'Overall', bottomLabel:'Overall', topTime:'8h', bottomTime:'2d 5h' }
  },
  minimax: {
    title: 'Minimax',
    theme: { primary:'#3B82F6', background:'#0F172A', text:'#FFFFFF', label:'#94A3B8', barBg:'#1E293B', barFill:'#3B82F6' },
    square: { top:33, bottom:58, topLabel:'Daily', bottomLabel:'Week', topTime:'1h 42m', bottomTime:'1d 9h' },
    dial: { top:33, bottom:58, topLabel:'Daily', bottomLabel:'Week', topTime:'1h 42m', bottomTime:'1d 9h' }
  }
};

function getBarColor(v, t) {
  if (v > 80) return '#EF4444';
  if (v > 60) return '#F59E0B';
  if (v === 0) return t.barBg;
  return t.barFill || t.primary;
}

function squareSvg(cfg) {
  const t = cfg.theme;
  const s = cfg.square;
  const sc = getBarColor(s.top, t);
  const wc = getBarColor(s.bottom, t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${t.background}" />
  <text x="72" y="18" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="${t.label}" text-anchor="middle">${cfg.title}</text>
  <text x="72" y="44" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
    <tspan font-size="15" font-weight="600" fill="${t.text}">${s.top}%</tspan>
    <tspan font-size="15" fill="#999">  ${s.topLabel}</tspan>
  </text>
  <rect x="22" y="52" width="100" height="20" fill="${t.barBg}" rx="6" />
  <rect x="22" y="52" width="${s.top}" height="20" fill="${sc}" rx="6" />
  <text x="72" y="69" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="500" fill="#AAA" text-anchor="middle">${s.topTime}</text>

  <text x="72" y="100" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
    <tspan font-size="15" font-weight="600" fill="${t.text}">${s.bottom}%</tspan>
    <tspan font-size="15" fill="#999">  ${s.bottomLabel}</tspan>
  </text>
  <rect x="22" y="108" width="100" height="20" fill="${t.barBg}" rx="6" />
  <rect x="22" y="108" width="${s.bottom}" height="20" fill="${wc}" rx="6" />
  <text x="72" y="125" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="500" fill="${t.text}" text-anchor="middle">${s.bottomTime}</text>
</svg>`;
}

function dialBar(y, label, val, time, color, t) {
  const rectX = 10;
  const rectW = 180;
  const rectH = 24;
  const textY = y + 16;
  return `<rect x="${rectX}" y="${y}" width="${rectW}" height="${rectH}" fill="${t.barBg}" rx="4" />
  <rect x="${rectX}" y="${y}" width="${Math.round((val / 100) * rectW)}" height="${rectH}" fill="${color}" rx="4" />
  <text x="${rectX + 6}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" fill="${t.text}" text-anchor="start">${label}<tspan fill="#CCC" font-weight="400" font-size="12"> ${val}%</tspan></text>
  <text x="${rectX + rectW - 6}" y="${textY}" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" fill="#DDD" text-anchor="end">${time}</text>`;
}

function dialSvg(cfg) {
  const t = cfg.theme;
  const d = cfg.dial;
  const sc = getBarColor(d.top, t);
  const wc = getBarColor(d.bottom, t);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect width="200" height="100" fill="${t.background}" />
  <text x="100" y="20" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" fill="${t.label}" text-anchor="middle">${cfg.title}</text>
  ${dialBar(28, d.topLabel, d.top, d.topTime, sc, t)}
  ${dialBar(62, d.bottomLabel, d.bottom, d.bottomTime, wc, t)}
</svg>`;
}

function render(svgPath, outPath, w, h) {
  execSync(`rsvg-convert -w ${w} -h ${h} ${svgPath} -o ${outPath}`);
}

for (const [name, cfg] of Object.entries(providers)) {
  const dir = path.join(outRoot, name);
  fs.mkdirSync(dir, { recursive: true });

  const sq = path.join(dir, 'base-144.svg');
  const dl = path.join(dir, 'base-dial-200x100.svg');
  fs.writeFileSync(sq, squareSvg(cfg));
  fs.writeFileSync(dl, dialSvg(cfg));

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

console.log('Regenerated provider assets with native dial layout');
