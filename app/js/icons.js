// Inline SVG icons (stroke style, 24x24) and gem shapes. No external assets.
import { CAT_COLORS } from './config.js';

const stroke = (body) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;

export const ICONS = {
  back: stroke('<path d="M15 18l-6-6 6-6"/>'),
  home: stroke('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  settings: stroke('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  stats: stroke('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>'),
  info: stroke('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.01"/>'),
  play: stroke('<path d="M7 4l13 8-13 8z"/>'),
  bolt: stroke('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  book: stroke('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>'),
  users: stroke('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  check: stroke('<path d="M4 12.5l5 5L20 6.5"/>'),
  x: stroke('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  plus: stroke('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  minus: stroke('<path d="M5 12h14"/>'),
  timer: stroke('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/>'),
  trophy: stroke('<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/>'),
  refresh: stroke('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
  sun: stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: stroke('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  phone: stroke('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>'),
  sparkle: stroke('<path d="M12 3l1.8 5.6L19.5 10l-5.7 1.6L12 17l-1.8-5.4L4.5 10l5.7-1.4z"/><path d="M19 16l.7 2 2 .7-2 .6L19 21l-.7-1.7-2-.6 2-.7z"/>'),
  globe: stroke('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>'),
};

/**
 * Gem cut per category (viewBox 0 0 24 24). Different silhouettes so categories are
 * distinguishable without relying on color alone.
 */
export const GEM_SHAPES = {
  roshar: { outer: '12,2 21,7 21,17 12,22 3,17 3,7', inner: '12,7 16.5,9.5 16.5,14.5 12,17 7.5,14.5 7.5,9.5' },
  scadrial: { outer: '12,1.5 21.5,12 12,22.5 2.5,12', inner: '12,7 16.5,12 12,17 7.5,12' },
  sel: { outer: '7.5,2.5 16.5,2.5 20.5,6.5 20.5,17.5 16.5,21.5 7.5,21.5 3.5,17.5 3.5,6.5', inner: '9,7 15,7 15,17 9,17' },
  nalthis: { outer: '12,2.5 22,20 2,20', inner: '12,9 16.6,17 7.4,17' },
  otros: { outer: '12,2 21.5,9 18,21 6,21 2.5,9', inner: '12,7.5 16.3,10.7 14.7,16.5 9.3,16.5 7.7,10.7' },
  cosmere: { outer: '7,3.5 17,3.5 22,9 12,22 2,9', inner: '9.5,9 12,3.5 14.5,9 12,22', lines: 'M2 9h20M7 3.5L9.5 9M17 3.5L14.5 9' },
};

export const WILDCARD_SHAPE = '12,2 14.2,9.8 22,12 14.2,14.2 12,22 9.8,14.2 2,12 9.8,9.8';

let clipSeq = 0;

/** SVG markup for a gem. charges: 0 (empty), 1 (half), 2 (infused). */
export function gemSvg(cat, { charges = 2, size = 24, color } = {}) {
  const s = GEM_SHAPES[cat] || GEM_SHAPES.cosmere;
  const c = color || CAT_COLORS[cat] || '#999';
  let fill = '';
  if (charges >= 2) {
    fill = `<polygon points="${s.outer}" fill="${c}"/>`
      + `<polygon points="${s.inner}" fill="#fff" fill-opacity=".32"/>`
      + (s.lines ? `<path d="${s.lines}" stroke="#fff" stroke-opacity=".45" stroke-width="1" fill="none"/>` : '');
  } else if (charges === 1) {
    const id = `gclip${++clipSeq}`;
    fill = `<clipPath id="${id}"><rect x="0" y="12" width="24" height="12"/></clipPath>`
      + `<polygon points="${s.outer}" fill="${c}" fill-opacity=".14"/>`
      + `<polygon points="${s.outer}" fill="${c}" clip-path="url(#${id})"/>`;
  } else {
    fill = `<polygon points="${s.outer}" fill="${c}" fill-opacity=".12"/>`;
  }
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" focusable="false">${fill}`
    + `<polygon points="${s.outer}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
