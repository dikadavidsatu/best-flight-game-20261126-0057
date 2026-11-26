// render.js — the chase camera and everything it draws. A perspective
// projection over the valley: the camera sits behind and above the Kestrel-9,
// looking along its heading with the horizon tilted by its bank, so the world
// rolls the way the wing rolls. Ground patches, the river, the town, the ridge
// pines, the harbour and the rings are flat-shaded polygons sorted far-to-near;
// the aircraft itself is a hand-drawn vector shape, banked and pitched on
// screen, propeller blurred, navigation lights lit at dawn.

import { RING, RUNWAY, SKY, VIEW, WORLD } from './config.js';
import { angleDelta, clamp, lerp } from './random.js';
import { KIND } from './world.js';

export const SCREEN = { TITLE: 0, BRIEF: 1, PLAY: 2, RESULT: 3, CAMPAIGN: 4, PAUSED: 5 };

function rgb(colour, shade = 1, alpha = 1) {
  const r = clamp(Math.round(colour[0] * shade), 0, 255);
  const g = clamp(Math.round(colour[1] * shade), 0, 255);
  const b = clamp(Math.round(colour[2] * shade), 0, 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

function blend(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * A camera that follows the plane. `update` eases the camera heading behind
 * the plane's; `project` turns a world point into screen space, or returns
 * null when the point is behind the camera or beyond the draw distance.
 */
export function createCamera() {
  const cam = {
    x: 0, y: 120, z: -4800, heading: 0, pitch: 0, bank: 0,
    focal: 600, cx: 0, cy: 0, horizonY: 0,
    resize(w, h) {
      cam.cx = w / 2;
      cam.cy = h / 2;
      cam.focal = (h / 2) / Math.tan((VIEW.fovDeg * Math.PI) / 360);
    },
    follow(plane, dt) {
      const back = VIEW.cameraBack;
      const tx = plane.x - Math.sin(plane.heading) * back;
      const tz = plane.z - Math.cos(plane.heading) * back;
      const ty = plane.alt + VIEW.cameraUp;
      const k = clamp(dt * VIEW.cameraLag + 0.12, 0, 1);
      cam.x += (tx - cam.x) * k;
      cam.z += (tz - cam.z) * k;
      cam.y += (ty - cam.y) * clamp(dt * 4.2, 0, 1);
      cam.heading += angleDelta(cam.heading, plane.heading) * k;
      cam.bank += (plane.bank - cam.bank) * clamp(dt * 5, 0, 1);
      cam.pitch += (plane.pitch * 0.55 - cam.pitch) * clamp(dt * 5, 0, 1);
      cam.horizonY = cam.cy + Math.tan(cam.pitch) * cam.focal * VIEW.horizonPitchScale;
    },
    project(x, y, z) {
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      const sin = Math.sin(cam.heading);
      const cos = Math.cos(cam.heading);
      // Into camera space: forward is +z, right is +x.
      const fwd = dx * sin + dz * cos;
      if (fwd < 2 || fwd > VIEW.drawDistance) return null;
      let right = dx * cos - dz * sin;
      let up = dy + Math.tan(cam.pitch) * fwd;
      // Roll the view around the forward axis by the camera bank.
      const sb = Math.sin(cam.bank);
      const cb = Math.cos(cam.bank);
      const rx = right * cb - up * sb;
      const uy = right * sb + up * cb;
      const scale = cam.focal / fwd;
      return { x: cam.cx + rx * scale, y: cam.horizonY - uy * scale, s: scale, depth: fwd };
    },
  };
  return cam;
}

function drawSky(ctx, cam, w, h, cloudBase) {
  const altT = clamp(cam.y / 900, 0, 1);
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(cam.horizonY, 1));
  grad.addColorStop(0, rgb(blend(SKY.top, [24, 34, 66], altT * 0.4)));
  grad.addColorStop(0.55, rgb(SKY.mid));
  grad.addColorStop(1, rgb(SKY.low));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, Math.max(0, cam.horizonY) + 2);
  // The sun, low in the east, with a soft halo.
  const sunX = w * SKY.sunX;
  const sunY = cam.horizonY - h * SKY.sunY * 0.42;
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  halo.addColorStop(0, 'rgba(255,236,190,0.95)');
  halo.addColorStop(0.18, 'rgba(255,205,130,0.55)');
  halo.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
  ctx.fillStyle = '#fff3cf';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 17, 0, Math.PI * 2);
  ctx.fill();
  // A wash of high colour below the horizon line so blends read as haze.
  ctx.fillStyle = 'rgba(238,178,128,0.20)';
  ctx.fillRect(0, cam.horizonY, w, 26);
  return cloudBase;
}

function drawMountains(ctx, cam, world, w) {
  // The far ring of peaks as one connected ridgeline against the horizon,
  // turning with the camera: sample the peak ring finely and join the dots,
  // so it reads as a silhouette, never as separate spikes.
  const span = Math.PI * 0.62;
  ctx.beginPath();
  ctx.moveTo(-40, cam.horizonY + 6);
  let started = false;
  for (let i = 0; i <= 96; i += 1) {
    const rel = -span + (i / 96) * span * 2;
    const a = cam.heading + rel;
    // Interpolate the pre-computed peak ring at this bearing.
    const ringPos = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * 48;
    const i0 = Math.floor(ringPos) % 48;
    const i1 = (i0 + 1) % 48;
    const frac = ringPos - Math.floor(ringPos);
    const hgt = lerp(world.peaks[i0].h, world.peaks[i1].h, frac);
    const sx = cam.cx + Math.tan(rel) * cam.focal;
    const sy = cam.horizonY - (hgt / 9000) * cam.focal + 4;
    if (!started) {
      ctx.moveTo(sx, cam.horizonY + 6);
      started = true;
    }
    ctx.lineTo(sx, sy);
  }
  ctx.lineTo(w + 40, cam.horizonY + 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(88,104,142,0.8)';
  ctx.fill();
  // Snow on the high line, dawn-lit from the east.
  ctx.strokeStyle = 'rgba(240,238,244,0.35)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function poly(ctx, points, fill) {
  if (points.some((p) => p === null)) return false;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  return true;
}

function drawGround(ctx, cam, world, w, h) {
  // A base valley floor from the horizon down, so the near ground the patch
  // grid cannot project (it is under or behind the camera) still reads as
  // fields in haze rather than as holes.
  const base = ctx.createLinearGradient(0, cam.horizonY, 0, h);
  base.addColorStop(0, '#a8a184');
  base.addColorStop(0.25, '#8ba06c');
  base.addColorStop(1, '#5f7d4c');
  ctx.fillStyle = base;
  ctx.fillRect(0, cam.horizonY, w, h - cam.horizonY + 2);
  // Painter's order: far patches first. Patches are stored south to north;
  // walking them in both orders and keeping the projected ones is cheap at
  // this count, and depth sorting by centre distance keeps it exact.
  const visible = [];
  for (const patch of world.patches) {
    const cx = (patch.x0 + patch.x1) / 2;
    const cz = (patch.z0 + patch.z1) / 2;
    const dx = cx - cam.x;
    const dz = cz - cam.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 > VIEW.drawDistance * VIEW.drawDistance) continue;
    const centre = cam.project(cx, patch.y, cz);
    if (!centre && dist2 > 900 * 900) continue;
    visible.push({ patch, dist2 });
  }
  visible.sort((a, b) => b.dist2 - a.dist2);
  for (const { patch } of visible) {
    const y = patch.kind === KIND.WATER ? -3 : patch.y;
    const corners = [
      cam.project(patch.x0, y, patch.z0),
      cam.project(patch.x1, y, patch.z0),
      cam.project(patch.x1, y, patch.z1),
      cam.project(patch.x0, y, patch.z1),
    ];
    if (corners.every((c) => c === null)) continue;
    if (corners.some((c) => c === null)) continue; // clipped by the near plane: skip cleanly
    const fog = clamp(1 - Math.sqrt(Math.max(0, corners[0].depth)) / VIEW.drawDistance, 0.25, 1);
    const shade = patch.shade * (0.55 + 0.45 * fog);
    poly(ctx, corners, rgb(patch.colour, shade));
    if (patch.kind === KIND.WATER) {
      ctx.strokeStyle = 'rgba(220,238,250,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function drawRunway(ctx, cam) {
  const hw = RUNWAY.width / 2;
  // The asphalt is drawn in 100 m strips: a strip is skipped only when it is
  // itself behind the camera, so the runway stays visible when you are
  // sitting on it, where one whole-runway quad would be clipped away.
  let anyDrawn = false;
  for (let z = RUNWAY.zStart; z < RUNWAY.zEnd; z += 100) {
    const strip = [
      cam.project(RUNWAY.x - hw, 0.4, z),
      cam.project(RUNWAY.x + hw, 0.4, z),
      cam.project(RUNWAY.x + hw, 0.4, Math.min(z + 100, RUNWAY.zEnd)),
      cam.project(RUNWAY.x - hw, 0.4, Math.min(z + 100, RUNWAY.zEnd)),
    ];
    if (poly(ctx, strip, '#3d4148')) anyDrawn = true;
  }
  if (!anyDrawn) return;
  // Centreline dashes and threshold bars.
  ctx.strokeStyle = 'rgba(240,240,230,0.85)';
  for (let z = RUNWAY.zStart + 60; z < RUNWAY.zEnd - 40; z += 90) {
    const a = cam.project(RUNWAY.x, 0.5, z);
    const b = cam.project(RUNWAY.x, 0.5, z + 42);
    if (a && b) {
      ctx.lineWidth = Math.max(1, a.s * 1.4);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  for (const side of [-1, 1]) {
    const a = cam.project(RUNWAY.x + side * hw, 0.5, RUNWAY.zStart);
    const b = cam.project(RUNWAY.x + side * hw, 0.5, RUNWAY.zEnd);
    if (a && b) {
      ctx.lineWidth = Math.max(1, a.s * 1.1);
      ctx.strokeStyle = 'rgba(250,250,240,0.7)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // Approach lights: two rows of amber dots guiding the eye to the threshold.
  for (let i = 0; i < 7; i += 1) {
    const z = RUNWAY.zStart - 60 - i * 55;
    for (const side of [-1, 1]) {
      const p = cam.project(RUNWAY.x + side * (hw + 7), 1, z);
      if (p) {
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, p.s * 1.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawBox(ctx, cam, x, yBase, z, w, h, d, wall, roof, rot = 0) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corner = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [ax, az] = corner(-w / 2, -d / 2);
  const [bx, bz] = corner(w / 2, -d / 2);
  const [cx2, cz2] = corner(w / 2, d / 2);
  const [dx, dz] = corner(-w / 2, d / 2);
  const base = [cam.project(ax, yBase, az), cam.project(bx, yBase, bz), cam.project(cx2, yBase, cz2), cam.project(dx, yBase, dz)];
  const top = [cam.project(ax, yBase + h, az), cam.project(bx, yBase + h, bz), cam.project(cx2, yBase + h, cz2), cam.project(dx, yBase + h, dz)];
  if (base.some((p) => !p) || top.some((p) => !p)) return;
  // Two visible side faces plus the roof, shaded by which way they face.
  poly(ctx, [base[0], base[1], top[1], top[0]], rgb(wall, 0.82));
  poly(ctx, [base[1], base[2], top[2], top[1]], rgb(wall, 0.97));
  poly(ctx, [base[2], base[3], top[3], top[2]], rgb(wall, 0.88));
  poly(ctx, [base[3], base[0], top[0], top[3]], rgb(wall, 0.76));
  poly(ctx, top, rgb(roof, 1));
}

function drawProps(ctx, cam, world) {
  const items = [];
  for (const house of world.houses) items.push({ d: dist2(cam, house.x, house.z), f: () => drawBox(ctx, cam, house.x, 0, house.z, house.w, house.h, house.d, house.wall, house.roof, house.rot) });
  for (const pine of world.pines) {
    items.push({
      d: dist2(cam, pine.x, pine.z),
      f: () => {
        const base = cam.project(pine.x, pine.y, pine.z);
        const top = cam.project(pine.x, pine.y + pine.h, pine.z);
        const mid = cam.project(pine.x, pine.y + pine.h * 0.55, pine.z);
        if (!base || !top || !mid) return;
        const wHalf = pine.h * 0.30 * base.s;
        ctx.fillStyle = '#4a3626';
        ctx.fillRect(base.x - 1, mid.y, 2, base.y - mid.y);
        poly(ctx, [{ x: base.x - wHalf, y: base.y }, { x: base.x + wHalf, y: base.y }, top], '#2f5d3a');
        poly(ctx, [{ x: mid.x - wHalf * 0.7, y: mid.y }, { x: mid.x + wHalf * 0.7, y: mid.y }, top], '#38684a');
      },
    });
  }
  for (const prop of world.props) {
    items.push({
      d: dist2(cam, prop.x, prop.z),
      f: () => {
        if (prop.kind === 'lighthouse') {
          const base = cam.project(prop.x, 0, prop.z);
          const top = cam.project(prop.x, prop.h, prop.z);
          if (!base || !top) return;
          const wB = 7 * base.s;
          const wT = 4.6 * top.s;
          poly(ctx, [{ x: base.x - wB, y: base.y }, { x: base.x + wB, y: base.y }, { x: top.x + wT, y: top.y }, { x: top.x - wT, y: top.y }], '#e8e2d4');
          poly(ctx, [{ x: base.x - wB, y: (base.y + top.y) / 2 + 6 * base.s }, { x: base.x + wB, y: (base.y + top.y) / 2 + 6 * base.s }, { x: top.x + wT * 1.15, y: (base.y + top.y) / 2 - 2 * top.s }, { x: top.x - wT * 1.15, y: (base.y + top.y) / 2 - 2 * top.s }], '#c34a3e');
          ctx.fillStyle = '#ffd98a';
          ctx.beginPath();
          ctx.arc(top.x, top.y - 3 * top.s, Math.max(2, 3.4 * top.s), 0, Math.PI * 2);
          ctx.fill();
        } else if (prop.kind === 'crane') {
          const base = cam.project(prop.x, 0, prop.z);
          const top = cam.project(prop.x, prop.h, prop.z);
          const jib = cam.project(prop.x + Math.sin(prop.rot) * 34, prop.h * 0.94, prop.z + Math.cos(prop.rot) * 34);
          if (!base || !top || !jib) return;
          ctx.strokeStyle = '#8a4f2c';
          ctx.lineWidth = Math.max(1.4, base.s * 2.4);
          ctx.beginPath();
          ctx.moveTo(base.x, base.y);
          ctx.lineTo(top.x, top.y);
          ctx.lineTo(jib.x, jib.y);
          ctx.stroke();
        } else if (prop.kind === 'hangar') {
          drawBox(ctx, cam, prop.x, 0, prop.z, prop.w, prop.h, prop.d, [150, 152, 148], [96, 100, 104], prop.rot);
        } else if (prop.kind === 'tower') {
          drawBox(ctx, cam, prop.x, 0, prop.z, 16, prop.h, 16, [178, 182, 186], [70, 110, 150], 0);
        }
      },
    });
  }
  items.sort((a, b) => b.d - a.d);
  for (const item of items) if (item.d < VIEW.drawDistance * VIEW.drawDistance) item.f();
}

function dist2(cam, x, z) {
  const dx = x - cam.x;
  const dz = z - cam.z;
  return dx * dx + dz * dz;
}

function drawRings(ctx, cam, rings, activeIndex, time) {
  // Draw far rings first; each ring is a glowing torus facing along the course.
  const order = rings.map((ring, i) => ({ ring, i })).sort((a, b) => dist2(cam, b.ring.x, b.ring.z) - dist2(cam, a.ring.x, a.ring.z));
  for (const { ring, i } of order) {
    if (ring.passed) continue;
    const centre = cam.project(ring.x, ring.alt, ring.z);
    if (!centre) continue;
    const rPx = RING.radius * centre.s;
    if (rPx < 3) continue;
    const active = i === activeIndex;
    const missed = ring.missed;
    const pulse = active ? 1 + Math.sin(time * 4) * 0.045 : 1;
    // The ring plane is perpendicular to its facing: squash horizontally by
    // how side-on it is to the camera.
    const viewAngle = Math.atan2(cam.x - ring.x, cam.z - ring.z);
    const squash = clamp(Math.abs(Math.cos(angleDelta(viewAngle, ring.face))), 0.22, 1);
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.scale(squash, 1);
    ctx.beginPath();
    ctx.arc(0, 0, rPx * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = missed ? 'rgba(200,90,80,0.75)' : active ? '#ffd166' : 'rgba(140,200,235,0.8)';
    ctx.lineWidth = Math.max(2, rPx * 0.09);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rPx * pulse * 0.86, 0, Math.PI * 2);
    ctx.strokeStyle = missed ? 'rgba(200,90,80,0.28)' : active ? 'rgba(255,209,102,0.35)' : 'rgba(140,200,235,0.25)';
    ctx.lineWidth = Math.max(1, rPx * 0.05);
    ctx.stroke();
    ctx.restore();
    if (active) {
      // A beacon column so the next ring can be found from anywhere.
      const top = cam.project(ring.x, ring.alt + 260, ring.z);
      if (top) {
        const grad = ctx.createLinearGradient(0, top.y, 0, centre.y);
        grad.addColorStop(0, 'rgba(255,209,102,0)');
        grad.addColorStop(1, 'rgba(255,209,102,0.30)');
        ctx.fillStyle = grad;
        ctx.fillRect(centre.x - 2, top.y, 4, centre.y - top.y);
      }
      ctx.fillStyle = '#ffd166';
      ctx.font = `bold ${Math.max(13, Math.min(22, rPx * 0.3))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${i + 1}`, centre.x, centre.y - rPx - 10);
    }
  }
}

function drawClouds(ctx, cam, world, cloudBase) {
  const sorted = [...world.clouds].sort((a, b) => dist2(cam, b.x, b.z) - dist2(cam, a.x, a.z));
  for (const cloud of sorted) {
    const p = cam.project(cloud.x, cloud.y, cloud.z);
    if (!p) continue;
    const r = cloud.r * p.s;
    if (r < 6) continue;
    const shade = cloud.y < cloudBase ? 0.92 : 1;
    ctx.fillStyle = `rgba(${Math.round(244 * shade)},${Math.round(240 * shade)},${Math.round(236 * shade)},${cloud.alpha})`;
    for (const [ox, oy, or] of [[0, 0, 1], [-0.55, 0.1, 0.66], [0.55, 0.12, 0.7], [0.1, -0.22, 0.6]]) {
      ctx.beginPath();
      ctx.ellipse(p.x + ox * r, p.y + oy * r * 0.5, r * or, r * or * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * The Kestrel-9, drawn from behind in chase view: fuselage, high wing, tail,
 * spinning propeller disc, canopy glint and lit navigation lights. It banks
 * and pitches on screen with the flight model, and its size breathes with
 * speed (a touch of chase-camera FOV stretch at full throttle).
 */
export function drawPlane(ctx, plane, cam, w, h, time) {
  const cx = w / 2;
  const ground = plane.onGround;
  const cy = h * (ground ? 0.60 : 0.58) + Math.sin(plane.pitch) * -h * 0.10;
  const size = Math.min(w, h) * 0.30 * (1 + (plane.speed / 95) * 0.05);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.bank * 0.82);
  const u = size / 100; // one unit = 1% of the plane's drawn size
  // The tailplane, up at the far end of the fuselage where the fin rises.
  poly2(ctx, [[-46 * u, -26 * u], [46 * u, -26 * u], [30 * u, -17 * u], [-30 * u, -17 * u]], '#8f3a30');
  // Main wing: a long tapered plank across the top of the fuselage.
  poly2(ctx, [[-98 * u, -16 * u], [98 * u, -16 * u], [84 * u, -6 * u], [-84 * u, -6 * u]], '#c8452c');
  poly2(ctx, [[-98 * u, -16 * u], [98 * u, -16 * u], [92 * u, -12 * u], [-92 * u, -12 * u]], '#e0573a');
  // Wing tips carry the navigation lights: red left, green right.
  light(ctx, -97 * u, -13 * u, 3.2 * u, '#ff4d4d', time);
  light(ctx, 97 * u, -13 * u, 3.2 * u, '#3dff7a', time);
  // Fuselage: a rounded body tapering to the tail.
  ctx.fillStyle = '#e8e0cd';
  ctx.beginPath();
  ctx.moveTo(-13 * u, 26 * u);
  ctx.quadraticCurveTo(-16 * u, -6 * u, -7 * u, -22 * u);
  ctx.lineTo(7 * u, -22 * u);
  ctx.quadraticCurveTo(16 * u, -6 * u, 13 * u, 26 * u);
  ctx.quadraticCurveTo(0, 33 * u, -13 * u, 26 * u);
  ctx.fill();
  // Belly stripe and the club's ember cheatline.
  poly2(ctx, [[-13 * u, 12 * u], [13 * u, 12 * u], [12 * u, 20 * u], [-12 * u, 20 * u]], '#c8452c');
  // Vertical fin above the tail.
  poly2(ctx, [[-2.6 * u, -22 * u], [2.6 * u, -22 * u], [4.4 * u, -44 * u], [-4.4 * u, -44 * u]], '#c8452c');
  poly2(ctx, [[-4.4 * u, -44 * u], [4.4 * u, -44 * u], [3 * u, -38 * u], [-3 * u, -38 * u]], '#e8e0cd');
  // Canopy: a dark teardrop with a dawn glint.
  ctx.fillStyle = '#22384f';
  ctx.beginPath();
  ctx.ellipse(0, -8 * u, 7.6 * u, 13 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,220,160,0.75)';
  ctx.beginPath();
  ctx.ellipse(-2.4 * u, -13 * u, 2.4 * u, 5 * u, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Propeller: a blurred disc with two blade ghosts, spinning with throttle.
  const spin = time * (14 + plane.throttle * 60);
  ctx.fillStyle = 'rgba(40,36,32,0.16)';
  ctx.beginPath();
  ctx.arc(0, 27 * u, 15 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,28,26,0.55)';
  ctx.lineWidth = 2.6 * u;
  for (const off of [0, Math.PI / 2]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(spin + off) * -14 * u, 27 * u + Math.sin(spin + off) * 3.4 * u);
    ctx.lineTo(Math.cos(spin + off) * 14 * u, 27 * u - Math.sin(spin + off) * 3.4 * u);
    ctx.stroke();
  }
  ctx.fillStyle = '#d8b25a';
  ctx.beginPath();
  ctx.arc(0, 27 * u, 3.4 * u, 0, Math.PI * 2);
  ctx.fill();
  // Gear legs when down (always down on the Kestrel: fixed gear, honest drag).
  ctx.strokeStyle = '#3a3a3e';
  ctx.lineWidth = 2.4 * u;
  ctx.beginPath();
  ctx.moveTo(-8 * u, 22 * u);
  ctx.lineTo(-13 * u, 33 * u);
  ctx.moveTo(8 * u, 22 * u);
  ctx.lineTo(13 * u, 33 * u);
  ctx.stroke();
  ctx.fillStyle = '#26262a';
  for (const sx of [-13, 13]) {
    ctx.beginPath();
    ctx.arc(sx * u, 34.5 * u, 4.4 * u, 0, Math.PI * 2);
    ctx.fill();
  }
  if (plane.flaps) {
    poly2(ctx, [[-60 * u, -4 * u], [60 * u, -4 * u], [56 * u, 1.5 * u], [-56 * u, 1.5 * u]], '#8f3a30');
  }
  if (plane.damage > 55 && !plane.crashed) {
    // Smoke trail from the cowling when the engine has taken a beating.
    ctx.fillStyle = 'rgba(50,50,55,0.35)';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(Math.sin(time * 3 + i) * 5 * u, (30 + i * 9) * u, (3 + i * 1.7) * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function poly2(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function light(ctx, x, y, r, colour, time) {
  const blink = colour === '#3dff7a' || colour === '#ff4d4d' ? 0.75 + 0.25 * Math.sin(time * 2.4) : 1;
  ctx.fillStyle = colour;
  ctx.globalAlpha = blink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Draw one full frame of the flying scene (no HUD: hud.js overlays it). */
export function drawScene(ctx, cam, world, plane, rings, activeIndex, sortie, time, w, h) {
  drawSky(ctx, cam, w, h, sortie.cloudBase);
  drawMountains(ctx, cam, world, w);
  drawGround(ctx, cam, world, w, h);
  drawRunway(ctx, cam);
  drawProps(ctx, cam, world);
  drawRings(ctx, cam, rings, activeIndex, time);
  drawClouds(ctx, cam, world, sortie.cloudBase);
  if (plane.alt < sortie.cloudBase + 260) drawPlane(ctx, plane, cam, w, h, time);
  // A soft vignette so the panel and sky sit in one dawn grade.
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  vig.addColorStop(0, 'rgba(10,10,24,0)');
  vig.addColorStop(1, 'rgba(10,10,24,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

export { rgb, blend, poly };
