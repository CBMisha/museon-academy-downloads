#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const help = `Usage: node palette-preview.mjs <proposal.json> [preview.svg]

Create an offline SVG palette and packaging preview from a newly designed proposal.
Required JSON fields: paper, ink, background (six-digit HEX strings).
Optional fields: title, description, language (en or zh; default en).
No default palette is supplied. This script never writes run.json.
Use a new proposal filename to retain each feedback revision.
`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(help);
  process.exit(0);
}
if (args.length < 1 || args.length > 2) {
  console.error(help);
  process.exit(1);
}

try {
  const inputPath = path.resolve(args[0]);
  const outputPath = args[1] ? path.resolve(args[1]) : path.join(path.dirname(inputPath), path.basename(inputPath, path.extname(inputPath)) + '.preview.svg');
  if (inputPath === outputPath) throw new Error('The SVG output must differ from the proposal JSON.');
  if (path.extname(outputPath).toLowerCase() !== '.svg') throw new Error('The output must be an .svg file.');
  const proposal = JSON.parse((await fs.readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''));
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('The proposal must be a JSON object.');
  const palette = {};
  for (const field of ['paper', 'ink', 'background']) {
    if (typeof proposal[field] !== 'string' || !/^#[0-9a-f]{6}$/i.test(proposal[field])) {
      throw new Error(`${field} must be an explicitly designed six-digit HEX color, such as # followed by six hexadecimal digits.`);
    }
    palette[field] = proposal[field].toUpperCase();
  }
  const language = proposal.language ?? 'en';
  if (!['en', 'zh'].includes(language)) throw new Error('language must be en or zh.');
  const title = typeof proposal.title === 'string' ? proposal.title.trim() : '';
  const description = typeof proposal.description === 'string' ? proposal.description.trim() : '';
  const svg = render({ ...palette, language, title, description });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, svg, 'utf8');
  const ratio = contrast(palette.ink, palette.paper);
  console.log(JSON.stringify({
    proposal: inputPath,
    preview: outputPath,
    palette,
    inkOnPaperContrast: Number(ratio.toFixed(2)),
    smallTextReferenceMet: ratio >= 4.5,
    largeTextReferenceMet: ratio >= 3,
    runManifestModified: false,
  }, null, 2));
} catch (error) {
  console.error(`Palette preview failed: ${error.message}`);
  process.exitCode = 1;
}

function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

function rgb(hex) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
}

function hex(values) {
  return '#' + values.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function shade(color, factor) {
  return hex(rgb(color).map(value => value * factor));
}

function luminance(color) {
  const values = rgb(color).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

function contrast(first, second) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function labelColor(surface) {
  // Neutral UI labels only; the box uses exactly the proposed paper and ink.
  return contrast(surface, '#FFFFFF') > contrast(surface, '#000000') ? '#FFFFFF' : '#000000';
}

function lines(value, limit, maximum) {
  const result = [];
  for (const paragraph of String(value).split(/\r?\n/)) {
    let current = '';
    let width = 0;
    for (const character of Array.from(paragraph)) {
      const advance = character.charCodeAt(0) > 255 ? 2 : 1;
      if (width + advance > limit && current) {
        result.push(current.trim());
        current = '';
        width = 0;
      }
      current += character;
      width += advance;
    }
    if (current.trim()) result.push(current.trim());
  }
  if (result.length > maximum) {
    result.length = maximum;
    result[maximum - 1] = result[maximum - 1].slice(0, -1) + '…';
  }
  return result;
}

function textLines(values, x, y, lineHeight, attributes = '') {
  return `<text x="${x}" y="${y}" ${attributes}>${values.map((value, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escape(value)}</tspan>`).join('')}</text>`;
}

function render({ paper, ink, background, title, description, language }) {
  const zh = language === 'zh';
  const ui = zh ? {
    heading: '本次配色提案',
    subtitle: '根据你的气质、场景与色彩偏好重新设计',
    paper: '包装纸张', ink: '印刷油墨', background: '展示背景',
    preview: '盒面示意',
    contrast: '油墨 / 纸面',
    footer: '候选预览 · 可继续反馈调整 · 确认后写入最终站点',
    noTitle: '你的标题',
  } : {
    heading: 'Your palette proposal',
    subtitle: 'Designed for your character, setting and color preferences',
    paper: 'Packaging paper', ink: 'Printing ink', background: 'Scene background',
    preview: 'Packaging study',
    contrast: 'Ink / paper',
    footer: 'A proposal to refine. Applied to the final site after your selection.',
    noTitle: 'Your title',
  };
  const ratio = contrast(ink, paper).toFixed(2);
  const outside = labelColor(background);
  const frontTitle = lines(title || ui.noTitle, 15, 3);
  const titleY = 310 - (frontTitle.length - 1) * 15;
  const swatches = [['paper', paper], ['ink', ink], ['background', background]].map(([field, value], index) => {
    const y = 188 + index * 97;
    return `<rect x="54" y="${y}" width="78" height="66" rx="3" fill="${value}" stroke="${outside}" stroke-opacity=".15"/>
<text x="150" y="${y + 23}" font-size="17" font-weight="600">${ui[field]}</text>
<text x="150" y="${y + 49}" font-size="16" opacity=".72">${value}</text>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-labelledby="palette-title palette-desc">
<title id="palette-title">${escape(ui.heading)}${title ? ' — ' + escape(title) : ''}</title>
<desc id="palette-desc">${escape(description || ui.subtitle)}. ${ui.paper}: ${paper}; ${ui.ink}: ${ink}; ${ui.background}: ${background}.</desc>
<defs><filter id="shadow" x="-40%" y="-30%" width="180%" height="170%"><feGaussianBlur stdDeviation="14"/></filter></defs>
<rect width="960" height="640" fill="${background}"/>
<g fill="${outside}" font-family="Arial, 'Microsoft YaHei', sans-serif">
<text x="54" y="63" font-size="28" font-weight="600">${escape(ui.heading)}</text>
<text x="54" y="94" font-size="15" opacity=".65">${escape(ui.subtitle)}</text>
<line x1="54" y1="124" x2="906" y2="124" stroke="${outside}" stroke-opacity=".14"/>
${swatches}
<text x="54" y="515" font-size="14" opacity=".68">${escape(ui.contrast)} ${ratio}:1</text>
${textLines(lines(description, 45, 2), 54, 545, 21, 'font-size="14" opacity=".72"')}
<text x="625" y="165" font-size="13" opacity=".6" text-anchor="middle">${escape(ui.preview)}</text>
<ellipse cx="683" cy="510" rx="155" ry="23" fill="${outside}" opacity=".12" filter="url(#shadow)"/>
<path d="M540 230 701 189 835 247 674 292Z" fill="${paper}"/>
<path d="M674 292 835 247 835 476 674 523Z" fill="${shade(paper, 0.86)}"/>
<path d="M540 230 674 292 674 523 540 459Z" fill="${paper}"/>
<path d="M540 230 701 189 835 247 835 476 674 523 540 459Z" fill="none" stroke="${ink}" stroke-opacity=".18" stroke-width="1.3"/>
<path d="M540 259 674 320 835 275M540 271 674 332 835 287" fill="none" stroke="${ink}" stroke-opacity=".32" stroke-width="1.2" stroke-dasharray="4 4"/>
<g transform="matrix(.74,.34,0,1,541,238)" fill="${ink}" font-family="Arial, 'Microsoft YaHei', sans-serif">
${textLines(frontTitle, 88, titleY - 239, 30, 'font-size="23" font-weight="600" text-anchor="middle"')}
<path d="M23 200H153" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity=".32"/>
</g>
<line x1="54" y1="592" x2="906" y2="592" stroke="${outside}" stroke-opacity=".14"/>
<text x="54" y="620" font-size="12" opacity=".62">${escape(ui.footer)}</text>
</g></svg>
`;
}
