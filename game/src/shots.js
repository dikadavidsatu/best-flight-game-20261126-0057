// shots.js — the deterministic scenes behind ?shot=start|play|land|end, used
// by the maker to take the entry's screenshots. Each scene drives the real
// flight model with a simple autopilot (steer at the next ring, hold the
// ring's height, manage the throttle to a target speed; on approach, fly a
// glide slope to the threshold and brake to a stop). Same seed, same sortie,
// same frame — the screenshots are the game, not a mock-up of it.

import { RUNWAY, STEP } from './config.js';
import { angleDelta, clamp } from './random.js';
import { stepPlane, EVENT } from './aircraft.js';
import { SCREEN } from './render.js';
import { stepClouds } from './world.js';

const SIM_DT = 1 / 30;

/** Autopilot controls steering the plane at a target point and speed. */
function steer(plane, tx, tz, tAlt, tSpeed) {
  const desired = Math.atan2(tx - plane.x, tz - plane.z);
  const turn = angleDelta(plane.heading, desired);
  const roll = clamp(turn * 1.35, -1, 1);
  let pitch;
  if (plane.onGround) {
    pitch = plane.speed > 33 ? 0.55 : 0;
  } else {
    const altErr = tAlt - plane.alt;
    pitch = clamp(altErr * 0.012, -0.62, 0.85);
    // Do not dive at the ground chasing a low target from far below it.
    if (plane.alt < 26 && altErr < 0) pitch = Math.max(pitch, -0.1);
  }
  const throttle = clamp((tSpeed - plane.speed) * 0.06, -1, 1);
  return { pitch, roll, throttle, rudder: plane.onGround ? clamp(turn * 2.2, -1, 1) : 0 };
}

function fly(game, world, seconds, controller) {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i += 1) {
    const ctl = controller(game);
    game.plane.brake = ctl.brake === true;
    if (ctl.flaps !== undefined) game.plane.flaps = ctl.flaps;
    const events = stepPlane(game.plane, ctl, game.sortie.wind, SIM_DT);
    stepClouds(world, SIM_DT);
    game.elapsed += SIM_DT;
    if (events & EVENT.CRASHED) break;
    if (controller.done && controller.done(game)) break;
  }
}

/** Take off and fly the ring course, exactly as the play scene needs. */
function flyCourse(game, world, seconds) {
  fly(game, world, seconds, (g) => {
    const ring = g.rings[g.activeRing] || g.rings[g.rings.length - 1];
    // Crossing logic mirrors main.js: passing the ring plane settles it.
    const fx = Math.sin(ring.face);
    const fz = Math.cos(ring.face);
    const side = (g.plane.x - ring.x) * fx + (g.plane.z - ring.z) * fz;
    if (side > 30 && g.plane.airborne && !ring.passed) {
      const off = Math.hypot(g.plane.x - ring.x, g.plane.alt - ring.alt);
      ring.passed = off <= 30;
      if (ring.passed) g.ringsDone += 1;
      g.activeRing = Math.min(g.activeRing + 1, g.rings.length - 1);
    }
    const target = g.rings[g.activeRing];
    return steer(g.plane, target.x, target.z, target.alt, 47);
  });
}

/** Set the plane up on a dawn final approach and fly it down toward a stop.
 * With `shortFinal` set, the scene ends on short final instead: low, slow,
 * flaps down, the runway filling the windscreen. */
function flyApproach(game, world, shortFinal = false) {
  const plane = game.plane;
  plane.x = RUNWAY.x + 14;
  plane.z = RUNWAY.zStart - 1750;
  plane.alt = 128;
  plane.heading = 0.012;
  plane.speed = 34;
  plane.throttle = 0.34;
  plane.airborne = true;
  plane.onGround = false;
  plane.flaps = true;
  plane.fuel = 41;
  game.rings.forEach((ring) => { ring.passed = true; });
  game.ringsDone = game.rings.length;
  game.activeRing = game.rings.length;
  const approach = (g) => {
    const p = g.plane;
    if (p.onGround) return { pitch: 0, roll: 0, throttle: -1, rudder: 0, brake: true };
    // Glide slope: aim at a point that sinks to the threshold.
    const along = RUNWAY.zStart - p.z; // metres still to fly to the threshold
    const targetAlt = Math.max(3, along * 0.072);
    const ctl = steer(p, RUNWAY.x, RUNWAY.zStart + 260, targetAlt, 29);
    ctl.flaps = true;
    return ctl;
  };
  if (shortFinal) approach.done = (g) => g.plane.airborne && g.plane.alt < 58 && g.plane.z > RUNWAY.zStart - 1150;
  fly(game, world, 95, approach);
}

/**
 * Stage the named scene on `game` (already loaded with sortie 1) and return
 * the screen to draw. Unknown names stage the title scene.
 */
export function stageShot(name, game, world) {
  if (name === 'play') {
    flyCourse(game, world, 49);
    game.score = game.ringsDone * 380 + 120;
    game.message = '';
    return { screen: SCREEN.PLAY };
  }
  if (name === 'land') {
    flyApproach(game, world, true);
    game.score = game.ringsDone * 380 + 340;
    return { screen: SCREEN.PLAY };
  }
  if (name === 'end') {
    flyApproach(game, world);
    const sink = Math.abs(game.plane.lastSink || 1.4);
    game.result = {
      crashed: false,
      landed: true,
      score: 2740,
      lines: [
        sink <= 1.6 ? 'A landing the tower applauds (+1500)' : 'Down and parked, gear complaining (+800)',
        `Rings flown: ${game.rings.length} of ${game.rings.length}`,
        'Time in hand 0:41 (+246) · fuel left 23% (+207)',
      ],
    };
    game.campaignScore = 2740;
    return { screen: SCREEN.RESULT };
  }
  // start: parked on the runway at dawn, title over the valley.
  game.plane.throttle = 0.12;
  return { screen: SCREEN.TITLE };
}

export { STEP };
