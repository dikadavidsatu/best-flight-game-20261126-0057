// aircraft.js — the Kestrel-9's flight model. A honest arcade model: throttle
// and pitch fight drag and gravity, bank turns the nose, slow flight stalls and
// drops it, flaps lower the stall and add drag, and the ground is unforgiving
// in proportion to how fast you meet it. State is a plain object so the
// screenshot scenes and the game loop drive exactly the same step function.

import { PLANE, RUNWAY, WORLD } from './config.js';
import { angleDelta, clamp, wrapAngle } from './random.js';
import { groundHeight } from './world.js';

export const EVENT = { NONE: 0, TOOK_OFF: 1, LANDED: 2, CRASHED: 4, SCRAPED: 8, STALLED: 16 };

export function createPlane(sortie) {
  return {
    x: PLANE.spawnX,
    z: PLANE.spawnZ,
    alt: PLANE.spawnAlt,
    heading: 0, // north
    pitch: 0,
    bank: 0,
    speed: 0,
    vspeed: 0,
    throttle: 0,
    flaps: false,
    brake: false,
    onGround: true,
    airborne: false,
    fuel: sortie.fuel,
    damage: 0,
    crashed: false,
    stopped: false,
    hasLanded: false,
    lastSink: 0,
    stall: false,
    gearBent: false,
    time: 0,
    windGust: 0,
  };
}

export function stallSpeed(plane) {
  return plane.flaps ? PLANE.stallSpeedFlaps : PLANE.stallSpeed;
}

/**
 * Advance the plane one step. `ctl` is {pitch: -1..1, roll: -1..1, throttle:
 * -1..1 (rate), rudder: -1..1}. `wind` is the sortie wind {x, z, gust}.
 * Returns an EVENT bitmask of what happened this step.
 */
export function stepPlane(plane, ctl, wind, dt) {
  if (plane.crashed || plane.stopped) return EVENT.NONE;
  let events = EVENT.NONE;
  plane.time += dt;

  // Controls: throttle is a lever the pilot pushes up and down, not a switch.
  plane.throttle = clamp(plane.throttle + ctl.throttle * dt * 0.9, 0, 1);
  if (plane.fuel <= 0) plane.throttle = 0;

  // Gusts: a slow wander on top of the steady wind, seeded by time.
  plane.windGust = wind.gust * Math.sin(plane.time * 0.7) * Math.sin(plane.time * 0.23 + 1.7);

  const targetBank = ctl.roll * PLANE.maxBank;
  const targetPitch = ctl.pitch * PLANE.maxPitch;
  const bankRate = plane.onGround ? 2.6 : PLANE.rollRate;
  plane.bank += clamp(targetBank - plane.bank, -bankRate * dt, bankRate * dt);
  plane.pitch += clamp(targetPitch - plane.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  if (plane.onGround) plane.pitch = clamp(plane.pitch, 0, PLANE.maxPitch);

  // Stall: below the stall speed the wing stops holding the nose up.
  const stalled = plane.airborne && plane.speed < stallSpeed(plane);
  if (stalled && !plane.stall) events |= EVENT.STALLED;
  plane.stall = stalled;
  if (stalled) {
    plane.pitch = Math.max(plane.pitch - dt * 0.55, -0.3);
    plane.bank += Math.sin(plane.time * 9) * dt * 0.22; // a wing drops, unevenly
  }

  // Turning: bank tilts the lift; rudder helps on the ground and in slow flight.
  const turnRate = Math.tan(clamp(plane.bank, -1.2, 1.2)) * PLANE.turnPerBank
    * clamp(plane.speed / PLANE.cruiseSpeed, 0, 1.4);
  plane.heading = wrapAngle(plane.heading + turnRate * dt + ctl.rudder * (plane.onGround ? 0.5 : 0.08) * dt);

  // Speed: engine thrust along the nose, minus drag, minus the hill of gravity.
  const dragK = PLANE.dragBase + (plane.flaps ? PLANE.dragFlaps : 0) + (plane.onGround ? 0 : PLANE.dragGear * 0.4);
  let accel = plane.throttle * PLANE.accelPerThrottle
    - dragK * plane.speed * plane.speed
    - Math.sin(plane.pitch) * PLANE.gravity * (plane.airborne ? 1 : 0.35);
  if (plane.onGround) {
    accel -= PLANE.groundRollFriction * (plane.brake ? PLANE.brakeDecel : 0.4);
    if (plane.brake) accel -= PLANE.brakeDecel;
  }
  plane.speed = clamp(plane.speed + accel * dt, 0, PLANE.maxSpeed * 1.25);

  // Vertical: pitch and speed make climb; a stall takes it away.
  const lift = clamp(plane.speed / PLANE.cruiseSpeed, 0, 1.3) * PLANE.liftSink;
  let vspeed = Math.sin(plane.pitch) * plane.speed * 0.92 - Math.max(0, PLANE.liftSink - lift) * 0.4;
  if (stalled) vspeed -= (stallSpeed(plane) - plane.speed) * 0.55;
  if (!plane.airborne) vspeed = 0;
  plane.vspeed = plane.airborne ? vspeed : 0;

  // Move: air velocity along the heading, plus the wind over the ground.
  const vx = Math.sin(plane.heading) * plane.speed + wind.x + plane.windGust * 0.6;
  const vz = Math.cos(plane.heading) * plane.speed + wind.z;
  plane.x = clamp(plane.x + vx * dt, -WORLD.halfWidth - 400, WORLD.halfWidth + 400);
  plane.z = clamp(plane.z + vz * dt, -WORLD.halfLength - 400, WORLD.halfLength + 400);
  if (plane.airborne) plane.alt += plane.vspeed * dt;

  // Fuel: the engine drinks in proportion to the lever.
  plane.fuel = Math.max(0, plane.fuel - (PLANE.fuelBurnIdle + plane.throttle * (PLANE.fuelBurnFull - PLANE.fuelBurnIdle)) * dt * (plane.throttle > 0.02 ? 1 : 0.25));

  const ground = Math.max(groundHeight(plane.x, plane.z), 0);
  const overRunway = Math.abs(plane.x - RUNWAY.x) < RUNWAY.width / 2 + 6
    && plane.z > RUNWAY.zStart - 60 && plane.z < RUNWAY.zEnd + 60;

  if (!plane.airborne) {
    // Take-off: enough speed and a gentle pull, or the runway simply runs out.
    if (plane.speed > stallSpeed(plane) + 4 && plane.pitch > 0.06) {
      plane.airborne = true;
      plane.onGround = false;
      plane.alt = Math.max(plane.alt, 0.5);
      events |= EVENT.TOOK_OFF;
    } else if (plane.z > RUNWAY.zEnd + 240 && Math.abs(plane.x) < 300) {
      // Ran off the far end onto the grass: rough, damaging, still rolling.
      plane.damage = Math.min(100, plane.damage + 22 * dt * 4);
      plane.speed = Math.max(0, plane.speed - 6 * dt);
      if (plane.speed < 3) { plane.crashed = true; events |= EVENT.CRASHED; }
    }
    // Parked only counts after a landing: at the start of a sortie the plane
    // sits still with the engine off too, and that must not end anything.
    if (plane.hasLanded && plane.speed < 0.4 && plane.throttle < 0.05) plane.stopped = true;
    if (plane.throttle > 0.05) plane.stopped = false;
    return events;
  }

  // Airborne and meeting the ground.
  if (plane.alt <= ground + 0.01) {
    plane.alt = ground;
    const sink = -plane.vspeed;
    const aligned = Math.abs(angleDelta(plane.heading, 0)) < 0.16 || Math.abs(angleDelta(plane.heading, Math.PI)) < 0.16;
    if (overRunway && aligned && sink < PLANE.touchDownSinkLimit && plane.speed < 78) {
      plane.airborne = false;
      plane.onGround = true;
      plane.hasLanded = true;
      plane.lastSink = sink;
      plane.pitch = 0;
      plane.bank *= 0.3;
      plane.damage = Math.min(100, plane.damage + (sink > 2.2 ? 6 : 0));
      events |= EVENT.LANDED;
    } else if (sink > PLANE.touchDownSinkCrash || !overRunway || plane.speed > 84) {
      plane.crashed = true;
      plane.damage = 100;
      events |= EVENT.CRASHED;
    } else if (overRunway) {
      // A hard arrival on the concrete: the gear takes it, and complains.
      plane.airborne = false;
      plane.onGround = true;
      plane.hasLanded = true;
      plane.lastSink = sink;
      plane.damage = Math.min(100, plane.damage + 26);
      plane.gearBent = true;
      plane.pitch = 0;
      events |= EVENT.LANDED | EVENT.SCRAPED;
    } else {
      plane.crashed = true;
      plane.damage = 100;
      events |= EVENT.CRASHED;
    }
  }
  if (plane.alt > WORLD.ceiling) plane.alt = WORLD.ceiling;
  return events;
}

/** True when the plane is parked at the end of a landing roll on the runway. */
export function isParked(plane) {
  return plane.onGround && plane.stopped && !plane.crashed;
}
