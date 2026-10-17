// Spinning category wheel: one sector per available category plus the wildcard.
import { h } from '../dom.js';
import { GEM_SHAPES, WILDCARD_SHAPE } from '../icons.js';
import { CAT_COLORS } from '../config.js';
import { t } from '../i18n.js';
import { fx, reducedMotion } from '../fx.js';
import { onCleanup } from '../core.js';

export const WILDCARD = 'wildcard';

function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function sectorPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`;
}

function wheelSvg(sectors) {
  const n = sectors.length;
  const step = 360 / n;
  const R = 140;
  let paths = '';
  let icons = '';
  sectors.forEach((s, i) => {
    const a0 = i * step;
    const fill = s === WILDCARD ? 'url(#wc-grad)' : CAT_COLORS[s];
    paths += `<path d="${sectorPath(150, 150, R, a0, a0 + step)}" fill="${fill}" stroke="rgba(5,10,25,.55)" stroke-width="2"/>`;
    const [ix, iy] = polar(150, 150, R * 0.66, a0 + step / 2);
    const shape = s === WILDCARD ? { outer: WILDCARD_SHAPE, inner: null } : GEM_SHAPES[s];
    const sc = 1.45;
    icons += `<g transform="translate(${(ix - 12 * sc).toFixed(2)},${(iy - 12 * sc).toFixed(2)}) scale(${sc}) rotate(${(a0 + step / 2).toFixed(2)} 12 12)">`
      + `<polygon points="${shape.outer}" fill="#fff" fill-opacity=".92" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`
      + (shape.inner ? `<polygon points="${shape.inner}" fill="${CAT_COLORS[s]}" fill-opacity=".55"/>` : '')
      + '</g>';
  });
  let studs = '';
  for (let i = 0; i < n * 3; i++) {
    const [x, y] = polar(150, 150, R + 4.5, (i + 0.5) * (360 / (n * 3)));
    studs += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="#f4dc9a"/>`;
  }
  return `<svg viewBox="0 0 300 300" focusable="false" aria-hidden="true">
  <defs>
    <radialGradient id="wheel-shade" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".22"/>
      <stop offset="55%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".32"/>
    </radialGradient>
    <linearGradient id="wc-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1b2552"/><stop offset="100%" stop-color="#3a2a6b"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6e2a6"/><stop offset="50%" stop-color="#a77d2f"/><stop offset="100%" stop-color="#f3d58a"/>
    </linearGradient>
  </defs>
  <circle cx="150" cy="150" r="${R + 7}" fill="#0b1124" stroke="url(#rim)" stroke-width="5"/>
  <g class="wheel-sectors">${paths}</g>
  <circle cx="150" cy="150" r="${R}" fill="url(#wheel-shade)" pointer-events="none"/>
  <g>${icons}</g>
  ${studs}
  <circle cx="150" cy="150" r="30" fill="#0b1124" stroke="url(#rim)" stroke-width="4"/>
  <polygon points="150,130 164,142 164,158 150,170 136,158 136,142" fill="#8fd3ff" opacity=".9"/>
  <polygon points="150,140 156,145 156,155 150,160 144,155 144,145" fill="#fff" opacity=".7"/>
</svg>`;
}

/**
 * @param {string[]} categories available categories
 * @param {(result:string) => void} onResult called with a category id or WILDCARD
 */
export function wheel(categories, onResult) {
  const sectors = [...categories, WILDCARD];
  const step = 360 / sectors.length;
  let spinning = false;
  let rotation = 0;
  let done = null;

  const disc = h('div', { class: 'wheel-disc', html: wheelSvg(sectors) });
  const btn = h('button', {
    type: 'button', class: 'wheel', 'aria-label': `${t('wheel.label')}: ${t('wheel.tapToSpin')}`,
    onclick: () => spin(),
  }, disc);
  const pointer = h('div', { class: 'wheel-pointer', 'aria-hidden': 'true' });
  const el = h('div', { class: 'wheel-wrap' }, pointer, btn);

  function finish(result) {
    if (done) return;
    done = result;
    btn.classList.remove('spinning');
    fx.land();
    onResult(result);
  }

  function spin() {
    if (spinning) return;
    spinning = true;
    fx.tap();
    const i = Math.floor(Math.random() * sectors.length);
    const result = sectors[i];
    const jitter = (Math.random() - 0.5) * step * 0.6;
    const target = i * step + step / 2 + jitter; // wheel angle that must end under the pointer
    const reduce = reducedMotion();
    const turns = reduce ? 0 : 5 + Math.floor(Math.random() * 2);
    const base = rotation - (((rotation % 360) + 360) % 360);
    rotation = base + turns * 360 + (360 - target);
    if (rotation <= 0) rotation += 360;
    const dur = reduce ? 0.25 : 4.2;
    btn.classList.add('spinning');
    btn.setAttribute('aria-busy', 'true');
    disc.style.transition = `transform ${dur}s cubic-bezier(.12,.72,.18,1)`;
    disc.style.transform = `rotate(${rotation}deg)`;
    disc.addEventListener('transitionend', () => finish(result), { once: true });
    const fallback = setTimeout(() => finish(result), dur * 1000 + 400);
    onCleanup(() => clearTimeout(fallback));
  }

  el.spin = spin;
  return el;
}
