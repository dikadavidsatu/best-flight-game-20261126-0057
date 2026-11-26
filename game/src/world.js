// world.js — the Skyharbor valley, generated from a seed: patchwork fields, a
// river that bends down the middle, the harbour town on the east bank, pine
// ridges to the west, the runway at the south end and a lighthouse on the point.
// Everything is flat-shaded polygons in world space; render.js projects them.
// The same seed always builds the same valley, so a line you learn stays learned.

import { RUNWAY, WORLD } from './config.js';
import { clamp, makeRng } from './random.js';

// Field palette: dawn-lit greens, wheat and ploughed earth, in one style.
export const FIELD_COLOURS = [
  [96, 142, 74],
  [122, 158, 82],
  [168, 152, 92],
  [140, 116, 78],
  [86, 128, 88],
  [156, 138, 96],
  [108, 148, 96],
];

export const KIND = { FIELD: 0, WATER: 1, TOWN: 2, RIDGE: 3, BEACH: 4 };

/** River centreline: x as a function of z, a slow double bend down the valley. */
export function riverX(z) {
  return 620 * Math.sin(z * 0.00042 + 0.7) + 260 * Math.sin(z * 0.0011 + 2.1);
}

export function riverHalfWidth(z) {
  return 120 + 40 * Math.sin(z * 0.0007 + 1.3);
}

/** Ground height at a point: flat valley floor, ridges rising in the west. */
export function groundHeight(x, z) {
  const west = clamp((-x - 1500) / 1100, 0, 1);
  const ridge = west * west * (260 + 90 * Math.sin(z * 0.0016) + 60 * Math.sin(z * 0.004 + 1.7));
  const east = clamp((x - 2100) / 500, 0, 1) * 24;
  const inRiver = Math.abs(x - riverX(z)) < riverHalfWidth(z) ? -4 : 0;
  return Math.max(ridge + east, inRiver, -4);
}

/**
 * Build the static world for a seed. Returns ground patches (quads with a
 * colour and kind), the town's houses, the ridge pines, clouds and the
 * harbour props. Patches are stored south to north so the renderer can walk
 * them in painter's order cheaply.
 */
export function buildWorld(seed) {
  const rng = makeRng(seed);
  const patches = [];
  const cell = 260;
  for (let gz = -WORLD.halfLength; gz < WORLD.halfLength; gz += cell) {
    for (let gx = -WORLD.halfWidth; gx < WORLD.halfWidth; gx += cell) {
      const cx = gx + cell / 2;
      const cz = gz + cell / 2;
      const rx = riverX(cz);
      const distRiver = Math.abs(cx - rx);
      let kind = KIND.FIELD;
      let colour = FIELD_COLOURS[rng.int(0, FIELD_COLOURS.length - 1)];
      if (distRiver < riverHalfWidth(cz)) {
        kind = KIND.WATER;
        colour = [64, 108, 148];
      } else if (distRiver < riverHalfWidth(cz) + 90) {
        kind = KIND.BEACH;
        colour = [188, 168, 128];
      } else if (cx < -1500) {
        kind = KIND.RIDGE;
        colour = [74, 104, 70];
      } else if (cx > 950 && cx < 1900 && cz > -1600 && cz < 1500) {
        kind = KIND.TOWN;
        colour = [150, 138, 122];
      }
      // The airfield apron around the runway stays clear grass.
      if (Math.abs(cx) < 260 && cz > RUNWAY.zStart - 500 && cz < RUNWAY.zEnd + 500) {
        kind = KIND.FIELD;
        colour = [104, 146, 80];
      }
      patches.push({
        x0: gx, z0: gz, x1: gx + cell, z1: gz + cell,
        y: groundHeight(cx, cz), kind, colour,
        shade: rng.range(0.92, 1.06),
      });
    }
  }

  // Town houses: little gabled boxes on the east bank, kept off the river road.
  const houses = [];
  for (let i = 0; i < 130; i += 1) {
    const x = rng.range(1020, 1820);
    const z = rng.range(-1500, 1400);
    if (Math.abs(x - riverX(z)) < riverHalfWidth(z) + 130) continue;
    houses.push({
      x, z, w: rng.range(16, 30), d: rng.range(16, 30), h: rng.range(9, 20),
      wall: [196, 178, 152], roof: rng.pick([[148, 74, 58], [104, 96, 92], [128, 88, 66]]),
      rot: rng.range(0, Math.PI),
    });
  }

  // Pines on the western ridge.
  const pines = [];
  for (let i = 0; i < 240; i += 1) {
    const x = rng.range(-2500, -1550);
    const z = rng.range(-WORLD.halfLength, WORLD.halfLength);
    pines.push({ x, z, h: rng.range(16, 30), y: groundHeight(x, z) });
  }

  // Harbour props at the south-east: cranes and the lighthouse on the point.
  const props = [
    { kind: 'lighthouse', x: 1480, z: -4480, h: 64 },
    { kind: 'crane', x: 1180, z: -3980, h: 46, rot: 0.5 },
    { kind: 'crane', x: 1330, z: -3820, h: 52, rot: -0.3 },
    { kind: 'hangar', x: -210, z: -3560, h: 16, w: 90, d: 46, rot: 0 },
    { kind: 'hangar', x: 230, z: -3420, h: 14, w: 74, d: 40, rot: 0 },
    { kind: 'tower', x: 150, z: -4180, h: 30 },
  ];

  // Clouds: soft billboard puffs drifting slowly east, in two layers.
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: rng.range(-WORLD.halfWidth, WORLD.halfWidth),
      z: rng.range(-WORLD.halfLength, WORLD.halfLength),
      y: rng.range(420, 780),
      r: rng.range(90, 240),
      drift: rng.range(2.5, 5),
      alpha: rng.range(0.35, 0.7),
    });
  }

  // Distant mountain ring drawn as a silhouette, pre-computed peaks.
  const peaks = [];
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    peaks.push({ a, h: 420 + 260 * Math.abs(Math.sin(a * 3 + seed)) + rng.range(0, 120), dist: 9000 });
  }

  return { patches, houses, pines, props, clouds, peaks, seed };
}

/** Move the clouds with the wind; wraps them around the valley. */
export function stepClouds(world, dt) {
  for (const cloud of world.clouds) {
    cloud.x += cloud.drift * dt;
    if (cloud.x > WORLD.halfWidth + 300) cloud.x = -WORLD.halfWidth - 300;
  }
}
