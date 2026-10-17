// Sound (WebAudio-synthesized, no audio files), vibration and confetti.
import { CAT_COLORS } from './config.js';

const prefs = { sound: true, vibration: true };
export function setFxPrefs(p) { Object.assign(prefs, p); }

let ctx = null;
function audio() {
  if (!prefs.sound) return null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx ||= new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function vibrate(pattern) {
  if (!prefs.vibration) return;
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* ignore */ }
}

export const canVibrate = () => typeof navigator.vibrate === 'function';

export const fx = {
  tap() { tone(660, 0, 0.06, 'triangle', 0.05); },
  tick() { tone(1200, 0, 0.03, 'square', 0.02); },
  land() { tone(523, 0, 0.12, 'triangle'); tone(784, 0.1, 0.2, 'triangle'); vibrate(20); },
  correct() { tone(659, 0, 0.12); tone(988, 0.1, 0.25); vibrate(35); },
  wrong() { tone(220, 0, 0.25, 'sawtooth', 0.06); tone(165, 0.12, 0.3, 'sawtooth', 0.05); vibrate([80, 50, 80]); },
  infuse() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.25, 'triangle', 0.08)); vibrate([30, 40, 30]); },
  lifeline() { [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.05, 0.22, 'sine', 0.06)); vibrate(25); },
  saved() { tone(392, 0, 0.14, 'triangle', 0.07); tone(587, 0.1, 0.22, 'triangle', 0.07); vibrate([40, 30, 40]); },
  victory() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.09)); vibrate([60, 60, 60, 60, 160]); },
};

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** CSS confetti burst inside `container`. Removed automatically. */
export function confetti(container, count = 90) {
  if (reducedMotion()) return;
  const colors = Object.values(CAT_COLORS).concat(['#8fd3ff', '#ffffff']);
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--rot', `${Math.round(Math.random() * 900 - 450)}deg`);
    p.style.animationDelay = `${Math.random() * 0.9}s`;
    p.style.animationDuration = `${2.6 + Math.random() * 2}s`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    layer.appendChild(p);
  }
  container.appendChild(layer);
  setTimeout(() => layer.remove(), 6500);
}
