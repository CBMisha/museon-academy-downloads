/**
 * Creates original, brand-neutral packaging artwork entirely in the browser.
 * Face 0 is the front; faces 1–5 follow around the sleeve.
 * Uploaded artwork is fitted without cropping or distortion on the front only.
 */
export function makePackaging(options = {}, previewCanvas) {
  const paper = color(options.paper, '#bd9466');
  const ink = color(options.ink, '#242424');
  const background = color(options.background, '#e9e9e6');
  const title = typeof options.title === 'string' ? options.title.trim() : '';
  const art = options.art ?? null;
  const panels = Array.from({ length: 6 }, (_, index) => panel(index, { paper, ink, title, art }));
  const lid = lidArtwork({ paper, ink, title });
  if (previewCanvas?.getContext) drawPreview(previewCanvas, panels, { background, ink });
  return { panels, lid, paper, ink, background };
}

const PANEL_WIDTH = 1024;
const PANEL_HEIGHT = 2048;
const TYPEFACE = '"Helvetica Neue", Arial, "Microsoft YaHei", sans-serif';

function color(input, fallback) {
  if (typeof input !== 'string' || !input.trim()) return fallback;
  const value = input.trim();
  if (typeof CSS !== 'undefined' && CSS.supports && !CSS.supports('color', value)) return fallback;
  return value;
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function fill(context, width, height, paper) {
  context.fillStyle = paper;
  context.fillRect(0, 0, width, height);
}

function rule(context, x1, y1, x2, y2, ink, opacity = 0.2, width = 2) {
  context.save();
  context.strokeStyle = ink;
  context.globalAlpha = opacity;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

function panel(index, { paper, ink, title, art }) {
  const element = canvas(PANEL_WIDTH, PANEL_HEIGHT);
  const context = element.getContext('2d');
  fill(context, PANEL_WIDTH, PANEL_HEIGHT, paper);

  // Fine registration lines continue consistently across the six sleeve faces.
  rule(context, 0, 128, PANEL_WIDTH, 128, ink, 0.18);
  rule(context, 0, PANEL_HEIGHT - 94, PANEL_WIDTH, PANEL_HEIGHT - 94, ink, 0.18);

  if (index === 0) {
    const hasArt = imageDimensions(art) !== null;
    const heading = title ? fitTitle(context, title, PANEL_WIDTH - 160, hasArt ? 62 : 74, 3) : null;
    if (heading) {
      const y = hasArt ? 226 : PANEL_HEIGHT * 0.43 - heading.height / 2;
      drawTitle(context, heading, PANEL_WIDTH / 2, y, ink);
    }

    if (hasArt) {
      const top = heading ? 290 + heading.height : 256;
      const area = { x: 88, y: top, width: PANEL_WIDTH - 176, height: PANEL_HEIGHT - top - 230 };
      drawContainedImage(context, art, area);
    }
  }
  return element;
}

function imageDimensions(image) {
  if (!image) return null;
  const width = image.naturalWidth ?? image.width;
  const height = image.naturalHeight ?? image.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

function drawContainedImage(context, image, area) {
  const dimensions = imageDimensions(image);
  if (!dimensions) return;
  const scale = Math.min(area.width / dimensions.width, area.height / dimensions.height);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, area.x + (area.width - width) / 2, area.y + (area.height - height) / 2, width, height);
  context.restore();
}

function breakLines(context, text, width) {
  const lines = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) { lines.push(''); continue; }
    let line = '';
    // Iterate grapheme clusters when available, so CJK and emoji wrap safely.
    const units = typeof Intl !== 'undefined' && Intl.Segmenter
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(paragraph), part => part.segment)
      : Array.from(paragraph);
    for (const unit of units) {
      const next = line + unit;
      if (line && context.measureText(next).width > width) {
        lines.push(line.trimEnd());
        line = unit.trimStart();
      } else line = next;
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}

function fitTitle(context, text, width, preferredSize, preferredLines) {
  let size = preferredSize;
  let lines;
  do {
    context.font = `500 ${size}px ${TYPEFACE}`;
    lines = breakLines(context, text, width);
    if (lines.length <= preferredLines || size <= 24) break;
    size -= 2;
  } while (size > 0);
  // Preserve the full requested title, even when unusually long text needs more lines.
  return { size, lines, lineHeight: size * 1.3, height: lines.length * size * 1.3 };
}

function drawTitle(context, heading, x, top, ink) {
  context.save();
  context.fillStyle = ink;
  context.font = `500 ${heading.size}px ${TYPEFACE}`;
  context.textAlign = 'center';
  context.textBaseline = 'top';
  for (let index = 0; index < heading.lines.length; index++) {
    context.fillText(heading.lines[index], x, top + index * heading.lineHeight);
  }
  context.restore();
}

function lidArtwork({ paper, ink, title }) {
  const element = canvas(1024, 1024);
  const context = element.getContext('2d');
  fill(context, 1024, 1024, paper);
  context.save();
  context.strokeStyle = ink;
  context.globalAlpha = 0.18;
  context.lineWidth = 2;
  context.beginPath();
  for (let index = 0; index < 6; index++) {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    const x = 512 + Math.cos(angle) * 424;
    const y = 512 + Math.sin(angle) * 424;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
  context.stroke();
  context.restore();
  if (title) {
    const heading = fitTitle(context, title, 590, 48, 3);
    drawTitle(context, heading, 512, 512 - heading.height / 2, ink);
  }
  return element;
}

function drawPreview(element, panels, { background, ink }) {
  element.width = 1440;
  element.height = 584;
  const context = element.getContext('2d');
  if (!context) return;
  fill(context, element.width, element.height, background);
  const width = 224;
  const height = width * PANEL_HEIGHT / PANEL_WIDTH;
  const left = (element.width - panels.length * width) / 2;
  const top = (element.height - height) / 2;
  for (let index = 0; index < panels.length; index++) {
    context.drawImage(panels[index], left + index * width, top, width, height);
  }
  context.save();
  context.strokeStyle = ink;
  context.globalAlpha = 0.2;
  context.lineWidth = 1;
  context.strokeRect(left, top, panels.length * width, height);
  context.setLineDash([4, 6]);
  for (let index = 1; index < panels.length; index++) {
    context.beginPath();
    context.moveTo(left + index * width, top);
    context.lineTo(left + index * width, top + height);
    context.stroke();
  }
  context.restore();
}
