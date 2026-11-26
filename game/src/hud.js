// hud.js — the instrument panel and every overlay screen. The HUD keeps the
// three numbers the bounty asks for — altitude, speed and heading — always on
// screen, and adds the instruments a pilot actually scans: an artificial
// horizon that rolls with the wing, a compass tape, a vertical-speed needle,
// fuel and throttle bars, and a director arrow pointing at the next ring.
// Screens (title, briefing, result, campaign) are drawn here too, in the same
// dawn grade as the sky, so the game reads as one place.

import { PLANE, RUNWAY } from './config.js';
import { angleDelta, clamp, headingDeg } from './random.js';
import { stallSpeed } from './aircraft.js';

const INK = '#f4ecd8';
const DIM = 'rgba(244,236,216,0.72)';
const PANEL = 'rgba(16,20,32,0.66)';
const AMBER = '#ffd166';
const RED = '#ff6b5e';

function panel(ctx, x, y, w, h, r = 10) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(244,236,216,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(ctx, str, x, y, size, colour = INK, align = 'left', bold = false) {
  ctx.fillStyle = colour;
  ctx.font = `${bold ? 'bold ' : ''}${size}px system-ui, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

export function drawCompass(ctx, plane, w) {
  const width = Math.min(430, w * 0.44);
  const x0 = (w - width) / 2;
  panel(ctx, x0, 14, width, 44);
  const deg = headingDeg(plane.heading);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + 6, 18, width - 12, 36);
  ctx.clip();
  const pxPerDeg = 3.1;
  for (let d = -80; d <= 80; d += 5) {
    const shown = ((Math.round((deg + d) / 5) * 5) % 360 + 360) % 360;
    const cx = w / 2 + (shown - deg + (Math.abs(shown - deg) > 180 ? (shown > deg ? -360 : 360) : 0)) * pxPerDeg;
    if (cx < x0 || cx > x0 + width) continue;
    const major = shown % 30 === 0;
    ctx.strokeStyle = DIM;
    ctx.beginPath();
    ctx.moveTo(cx, 52);
    ctx.lineTo(cx, major ? 42 : 47);
    ctx.stroke();
    if (major) {
      const label = shown === 0 ? 'N' : shown === 90 ? 'E' : shown === 180 ? 'S' : shown === 270 ? 'W' : String(shown / 10).padStart(2, '0');
      text(ctx, label, cx, 31, 13, shown % 90 === 0 ? AMBER : INK, 'center', true);
    }
  }
  ctx.restore();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 58);
  ctx.lineTo(w / 2 + 6, 58);
  ctx.lineTo(w / 2, 66);
  ctx.closePath();
  ctx.fill();
  text(ctx, `${String(Math.round(deg)).padStart(3, '0')}°`, w / 2, 78, 13, INK, 'center', true);
}

export function drawHorizonGauge(ctx, plane, x, y, r) {
  ctx.save();
  panel(ctx, x - r - 8, y - r - 8, (r + 8) * 2, (r + 8) * 2, 14);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-plane.bank);
  const pitchPx = clamp(plane.pitch, -0.5, 0.5) * r * 1.5;
  ctx.fillStyle = '#5d84b8';
  ctx.fillRect(-r * 1.5, -r * 1.5 + pitchPx, r * 3, r * 1.5);
  ctx.fillStyle = '#8a6844';
  ctx.fillRect(-r * 1.5, pitchPx, r * 3, r * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 1.5, pitchPx);
  ctx.lineTo(r * 1.5, pitchPx);
  ctx.stroke();
  for (const off of [-0.3, 0.3]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, pitchPx + off * r * 1.5);
    ctx.lineTo(r * 0.42, pitchPx + off * r * 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol and bank pointer.
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y);
  ctx.lineTo(x - r * 0.18, y);
  ctx.lineTo(x - r * 0.18, y + r * 0.14);
  ctx.moveTo(x + r * 0.55, y);
  ctx.lineTo(x + r * 0.18, y);
  ctx.lineTo(x + r * 0.18, y + r * 0.14);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  const bankA = -Math.PI / 2 - plane.bank;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(bankA) * (r - 4), y + Math.sin(bankA) * (r - 4));
  ctx.lineTo(x + Math.cos(bankA) * (r - 13), y + Math.sin(bankA) * (r - 13));
  ctx.strokeStyle = RED;
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function drawTape(ctx, x, y, label, value, unit, warn) {
  panel(ctx, x, y, 118, 58);
  text(ctx, label, x + 10, y + 14, 11, DIM);
  text(ctx, String(value), x + 10, y + 38, 24, warn ? RED : INK, 'left', true);
  text(ctx, unit, x + 112, y + 40, 11, DIM, 'right');
}

export function drawDirector(ctx, plane, ring, w, h) {
  if (!ring) return;
  const target = Math.atan2(ring.x - plane.x, ring.z - plane.z);
  const rel = angleDelta(plane.heading, target);
  const dist = Math.hypot(ring.x - plane.x, ring.z - plane.z);
  const cx = w / 2 + clamp(rel, -1.1, 1.1) * (w * 0.30);
  const cy = 108;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(clamp(rel, -1.2, 1.2));
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(8, 8);
  ctx.lineTo(0, 3);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(ctx, `${Math.round(dist)} m`, cx, cy + 24, 12, DIM, 'center');
  const altDiff = ring.alt - plane.alt;
  text(ctx, altDiff > 12 ? `▲ climb ${Math.round(altDiff)}` : altDiff < -12 ? `▼ sink ${Math.round(-altDiff)}` : '● on height', cx, cy + 42, 12, Math.abs(altDiff) <= 12 ? '#7dd87d' : DIM, 'center');
}

/** The full in-flight HUD. `info` carries sortie progress and messages. */
export function drawHud(ctx, plane, sortie, info, w, h) {
  drawCompass(ctx, plane, w);
  drawDirector(ctx, plane, info.nextRing, w, h);
  const knots = Math.round(plane.speed * 1.944);
  const feet = Math.round(plane.alt * 3.281);
  drawTape(ctx, 16, 16, 'AIRSPEED', knots, 'kt', plane.stall);
  drawTape(ctx, w - 134, 16, 'ALTITUDE', feet, 'ft', plane.alt < 30 && plane.airborne);
  drawTape(ctx, 16, 84, 'VERT SPEED', `${plane.vspeed >= 0 ? '+' : ''}${Math.round(plane.vspeed * 196.85)}`, 'fpm', plane.vspeed < -9);
  drawTape(ctx, w - 134, 84, 'HEADING', String(Math.round(headingDeg(plane.heading))).padStart(3, '0'), 'deg', false);

  // Bottom-left cluster: horizon gauge; bottom-right: fuel, throttle, flaps.
  drawHorizonGauge(ctx, plane, 86, h - 92, 56);
  const bx = w - 226;
  panel(ctx, bx, h - 148, 210, 132);
  bar(ctx, bx + 14, h - 128, 182, 'FUEL', plane.fuel / 100, plane.fuel < 22 ? RED : '#7dd87d');
  bar(ctx, bx + 14, h - 96, 182, 'THROTTLE', plane.throttle, AMBER);
  text(ctx, `FLAPS ${plane.flaps ? 'DOWN' : 'UP'}`, bx + 14, h - 62, 13, plane.flaps ? AMBER : DIM);
  text(ctx, `BRAKE ${plane.brake ? 'ON' : 'OFF'}`, bx + 120, h - 62, 13, plane.brake ? RED : DIM);
  text(ctx, `DMG ${Math.round(plane.damage)}%`, bx + 14, h - 36, 13, plane.damage > 40 ? RED : DIM);
  text(ctx, `STALL ${Math.round(stallSpeed(plane) * 1.944)} kt`, bx + 120, h - 36, 13, DIM);

  // Sortie progress, top centre under the compass.
  text(ctx, `${sortie.name}`, w / 2, h - 26, 13, DIM, 'center');
  text(ctx, `RINGS ${info.ringsDone}/${info.ringsTotal}   SCORE ${info.score}   ${formatTime(info.elapsed)}`, w / 2, 178, 15, INK, 'center', true);

  if (plane.stall) {
    if (Math.floor(info.elapsed * 2.4) % 2 === 0) text(ctx, '⚠ STALL', w / 2, h * 0.30, 30, RED, 'center', true);
  }
  if (plane.fuel <= 0 && plane.airborne) text(ctx, 'ENGINE STARVED — GLIDE FOR THE RUNWAY', w / 2, h * 0.30 + 40, 17, RED, 'center', true);
  if (info.message && info.messageUntil > info.now) {
    text(ctx, info.message, w / 2, h * 0.24, 21, AMBER, 'center', true);
  }
  if (info.showLandingGuide) {
    const dist = Math.round(RUNWAY.zStart - plane.z);
    text(ctx, dist > 0 ? `RUNWAY AHEAD — ${dist} m TO THRESHOLD` : 'OVER THE RUNWAY — BE STOPPED BY THE FAR END', w / 2, h * 0.24, 17, '#7dd87d', 'center', true);
  }
}

function bar(ctx, x, y, width, label, frac, colour) {
  text(ctx, label, x, y + 6, 11, DIM);
  ctx.fillStyle = 'rgba(244,236,216,0.16)';
  ctx.fillRect(x, y + 14, width, 10);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y + 14, width * clamp(frac, 0, 1), 10);
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function shade(ctx, w, h, alpha) {
  ctx.fillStyle = `rgba(8,10,22,${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

export function drawTitle(ctx, w, h, best) {
  shade(ctx, w, h, 0.34);
  text(ctx, 'E M B E R W I N G', w / 2, h * 0.30, Math.min(64, w * 0.07), AMBER, 'center', true);
  text(ctx, 'S K Y H A R B O R   R U N', w / 2, h * 0.30 + 52, Math.min(30, w * 0.034), INK, 'center', true);
  text(ctx, 'A dawn flying-club game: rings over the river, weather off the sea,', w / 2, h * 0.52, 17, INK, 'center');
  text(ctx, 'and a runway that only forgives a gentle arrival.', w / 2, h * 0.52 + 24, 17, INK, 'center');
  text(ctx, 'ENTER — start   ·   1/2/3 — pick a sortie   ·   M — sound', w / 2, h * 0.66, 16, AMBER, 'center', true);
  text(ctx, 'Fly: ↑ ↓ pitch · ← → bank · R/X throttle · F flaps · B brake · Q/E rudder · mouse steers too', w / 2, h * 0.66 + 28, 14, DIM, 'center');
  if (best > 0) text(ctx, `Best campaign score so far: ${best}`, w / 2, h * 0.76, 15, DIM, 'center');
}

export function drawBrief(ctx, sortie, w, h) {
  shade(ctx, w, h, 0.45);
  panel(ctx, w / 2 - 330, h * 0.24, 660, 250, 14);
  text(ctx, sortie.name, w / 2, h * 0.24 + 42, 24, AMBER, 'center', true);
  wrapText(ctx, sortie.brief, w / 2, h * 0.24 + 84, 600, 16, INK);
  text(ctx, `${sortie.rings.length} rings · par ${formatTime(sortie.parSeconds)} · fuel ${sortie.fuel}% · wind ${Math.abs(Math.round(sortie.wind.x * 1.944))} kt`, w / 2, h * 0.24 + 168, 15, DIM, 'center');
  text(ctx, 'You are lined up on the runway. Hold R to spool up, pull ↑ gently past 55 kt,', w / 2, h * 0.24 + 200, 14, DIM, 'center');
  text(ctx, 'then chase the gold ring. ENTER when ready.', w / 2, h * 0.24 + 222, 14, AMBER, 'center', true);
}

export function drawResult(ctx, result, w, h) {
  shade(ctx, w, h, 0.5);
  panel(ctx, w / 2 - 300, h * 0.22, 600, 330, 14);
  const title = result.crashed ? 'SHE CAME DOWN HARD' : result.landed ? 'SORTIE COMPLETE' : 'SORTIE OVER';
  text(ctx, title, w / 2, h * 0.22 + 44, 27, result.crashed ? RED : AMBER, 'center', true);
  const lines = result.lines;
  lines.forEach((line, i) => text(ctx, line, w / 2, h * 0.22 + 92 + i * 26, 16, INK, 'center'));
  text(ctx, `SORTIE SCORE  ${result.score}`, w / 2, h * 0.22 + 92 + lines.length * 26 + 14, 21, AMBER, 'center', true);
  text(ctx, result.crashed ? 'ENTER — fly her again' : 'ENTER — next sortie · R — fly this one again', w / 2, h * 0.22 + 296, 15, DIM, 'center');
}

export function drawCampaign(ctx, total, w, h) {
  shade(ctx, w, h, 0.5);
  text(ctx, 'THE MAIL GOT THROUGH', w / 2, h * 0.34, 34, AMBER, 'center', true);
  text(ctx, 'All three sorties flown. The club secretary pins your score', w / 2, h * 0.44, 17, INK, 'center');
  text(ctx, 'to the harbour noticeboard, under the gulls.', w / 2, h * 0.44 + 24, 17, INK, 'center');
  text(ctx, `CAMPAIGN SCORE  ${total}`, w / 2, h * 0.56, 26, AMBER, 'center', true);
  text(ctx, 'ENTER — back to the title', w / 2, h * 0.68, 15, DIM, 'center');
}

export function drawPaused(ctx, w, h) {
  shade(ctx, w, h, 0.45);
  text(ctx, 'PAUSED', w / 2, h * 0.42, 34, AMBER, 'center', true);
  text(ctx, 'P or ESC — resume · R — restart the sortie', w / 2, h * 0.42 + 44, 16, INK, 'center');
}

function wrapText(ctx, str, x, y, maxWidth, size, colour) {
  ctx.font = `${size}px system-ui, 'Segoe UI', sans-serif`;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = testLine;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(ctx, l, x, y + i * (size + 6), size, colour, 'center'));
}
