// main.js — Emberwing: Skyharbor Run. The game loop and the rules that turn
// flying into a score: rings flown in order (a ring behind you is a ring
// missed), a landing judged on sink, alignment and where you stop, fuel and
// time turned into points, damage taken off. Three sorties make a campaign;
// the campaign total is the number the club secretary remembers.
//
// Screens: TITLE -> BRIEF -> PLAY <-> PAUSED -> RESULT -> (next) BRIEF ...
// -> CAMPAIGN. A ?shot=start|play|land|end URL stages a deterministic scene
// for the maker's screenshots instead of the title screen (see shots.js).

import { RING, SCORE, STEP } from './config.js';
import { clamp } from './random.js';
import { buildWorld, stepClouds } from './world.js';
import { SORTIES } from './missions.js';
import { createPlane, stepPlane, EVENT } from './aircraft.js';
import { createCamera, drawScene, SCREEN } from './render.js';
import { drawHud, drawTitle, drawBrief, drawResult, drawCampaign, drawPaused, formatTime } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

let viewW = 0;
let viewH = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.resize(viewW, viewH);
}

const WORLD_SEED = 20261126;
const world = buildWorld(WORLD_SEED);
const camera = createCamera();
const input = createInput();
const audio = createAudio();

const game = {
  screen: SCREEN.TITLE,
  sortieIndex: 0,
  sortie: SORTIES[0],
  plane: null,
  rings: [],
  activeRing: 0,
  ringsDone: 0,
  scrapes: 0,
  score: 0,
  campaignScore: 0,
  campaignDone: false,
  elapsed: 0,
  message: '',
  messageUntil: -1,
  now: 0,
  result: null,
  best: Number(localStorage.getItem('emberwing-best') || 0),
  useMouse: true,
  started: false,
};

function loadSortie(index) {
  game.sortieIndex = index;
  game.sortie = SORTIES[index];
  game.plane = createPlane(game.sortie);
  game.rings = game.sortie.rings.map((ring) => ({ ...ring, passed: false, missed: false }));
  game.activeRing = 0;
  game.ringsDone = 0;
  game.scrapes = 0;
  game.score = 0;
  game.elapsed = 0;
  game.result = null;
  camera.x = game.plane.x - 14;
  camera.z = game.plane.z - 14;
  camera.y = 8;
  camera.heading = 0;
  camera.bank = 0;
  camera.pitch = 0;
}

function say(message, seconds = 2.6) {
  game.message = message;
  game.messageUntil = game.now + seconds;
}

/** Ring logic: crossing the active ring's plane inside its radius scores it. */
function checkRings(prev, plane) {
  const ring = game.rings[game.activeRing];
  if (!ring) return;
  const fx = Math.sin(ring.face);
  const fz = Math.cos(ring.face);
  const prevSide = (prev.x - ring.x) * fx + (prev.z - ring.z) * fz;
  const side = (plane.x - ring.x) * fx + (plane.z - ring.z) * fz;
  if (prevSide < 0 && side >= 0 && plane.airborne) {
    const offCentre = Math.hypot(plane.x - ring.x, plane.alt - ring.alt);
    if (offCentre <= RING.radius) {
      const centre = 1 - offCentre / RING.radius;
      const gained = RING.passScore + Math.round(RING.centreBonus * centre);
      game.score += gained;
      ring.passed = true;
      game.ringsDone += 1;
      audio.ring(centre);
      say(centre > 0.72 ? `DEAD CENTRE — +${gained}` : `RING ${game.activeRing + 1} — +${gained}`);
      game.activeRing += 1;
    } else if (offCentre <= RING.radius + RING.postClearance + 3) {
      game.scrapes += 1;
      game.score = Math.max(0, game.score - SCORE.scrapePenalty);
      game.plane.damage = Math.min(100, game.plane.damage + 7);
      audio.scrape();
      say('RIM SCRAPE — the ring takes paint and points');
      ring.passed = true;
      game.ringsDone += 1;
      game.activeRing += 1;
    } else {
      ring.missed = true;
      say(`RING ${game.activeRing + 1} MISSED — it stays behind you`);
      game.activeRing += 1;
    }
  }
}

function finishSortie(crashed) {
  const plane = game.plane;
  const lines = [];
  let score = game.score;
  if (crashed) {
    lines.push('The Kestrel is in the harbourmaster\'s log, and not kindly.');
    lines.push(`Rings flown: ${game.ringsDone} of ${game.rings.length}`);
    score = Math.max(0, Math.round(score * 0.4));
  } else {
    const sink = Math.abs(plane.lastSink || 0);
    const perfect = sink <= 1.6 && !plane.gearBent;
    const landing = perfect ? SCORE.landingPerfect : SCORE.landingGood;
    score += landing;
    lines.push(perfect ? `A landing the tower applauds (+${landing})` : `Down and parked, gear complaining (+${landing})`);
    lines.push(`Rings flown: ${game.ringsDone} of ${game.rings.length}`);
    const timeLeft = Math.max(0, game.sortie.parSeconds - game.elapsed);
    const timeBonus = Math.round(timeLeft * SCORE.perSecondLeft);
    const fuelBonus = Math.round(plane.fuel * SCORE.perFuelLeft);
    score += timeBonus + fuelBonus;
    lines.push(`Time in hand ${formatTime(timeLeft)} (+${timeBonus}) · fuel left ${Math.round(plane.fuel)}% (+${fuelBonus})`);
    if (game.ringsDone < game.rings.length) lines.push('Not every ring, though. The gold ones count.');
  }
  const damagePenalty = Math.round(plane.damage * SCORE.damagePenalty * 0.1) * (crashed ? 0 : 1);
  if (damagePenalty > 0 && !crashed) {
    score -= damagePenalty;
    lines.push(`The mechanic's bill (−${damagePenalty})`);
  }
  score = Math.max(0, score);
  game.result = { crashed, landed: !crashed, lines, score };
  game.campaignScore += score;
  game.screen = SCREEN.RESULT;
  status.textContent = crashed ? 'Crashed. Sortie over.' : `Sortie complete. Score ${score}.`;
}

function stepGame(dt) {
  const plane = game.plane;
  const prev = { x: plane.x, z: plane.z, alt: plane.alt };
  const ctl = input.controls(game.useMouse);
  plane.brake = input.held('KeyB') || input.held('Space');
  let events = EVENT.NONE;
  let remaining = dt;
  while (remaining > 0) {
    const step = Math.min(STEP, remaining);
    events |= stepPlane(plane, ctl, game.sortie.wind, step);
    remaining -= step;
  }
  game.elapsed += dt;
  stepClouds(world, dt);
  checkRings(prev, plane);
  if (events & EVENT.TOOK_OFF) say('AIRBORNE — chase the gold ring');
  if (events & EVENT.STALLED) audio.stall();
  if (events & EVENT.SCRAPED) say('HARD ARRIVAL — the gear took it');
  if (events & EVENT.LANDED) {
    audio.landed(true);
    say('DOWN — roll her out and brake (B)');
  }
  if (events & EVENT.CRASHED) {
    audio.crash();
    finishSortie(true);
    return;
  }
  // Parked after a landing ends the sortie; parked before take-off does not.
  if (plane.onGround && plane.stopped && plane.hasLanded) finishSortie(false);
  if (events & EVENT.LANDED) plane.hasLanded = true;
  // Out of the valley with no fuel and no height is also an ending.
  if (plane.airborne && plane.alt <= 0.5 && !plane.onGround) finishSortie(true);
}

function draw() {
  const plane = game.plane;
  camera.follow(plane, 1 / 60);
  drawScene(ctx, camera, world, plane, game.rings, game.activeRing, game.sortie, game.now, viewW, viewH);
  if (game.screen === SCREEN.PLAY || game.screen === SCREEN.PAUSED) {
    const allRings = game.activeRing >= game.rings.length;
    drawHud(ctx, plane, game.sortie, {
      nextRing: allRings ? null : game.rings[game.activeRing],
      ringsDone: game.ringsDone,
      ringsTotal: game.rings.length,
      score: game.score,
      elapsed: game.elapsed,
      message: game.message,
      messageUntil: game.messageUntil,
      now: game.now,
      showLandingGuide: allRings && plane.airborne,
    }, viewW, viewH);
  }
  if (game.screen === SCREEN.TITLE) drawTitle(ctx, viewW, viewH, game.best);
  if (game.screen === SCREEN.BRIEF) drawBrief(ctx, game.sortie, viewW, viewH);
  if (game.screen === SCREEN.RESULT && game.result) drawResult(ctx, game.result, viewW, viewH);
  if (game.screen === SCREEN.CAMPAIGN) drawCampaign(ctx, game.campaignScore, viewW, viewH);
  if (game.screen === SCREEN.PAUSED) drawPaused(ctx, viewW, viewH);
}

function handleKeys() {
  if (input.take('KeyM')) audio.toggleMute();
  if (game.screen === SCREEN.TITLE) {
    if (input.take('Enter')) {
      audio.unlock();
      game.campaignScore = 0;
      game.campaignDone = false;
      loadSortie(0);
      game.screen = SCREEN.BRIEF;
    }
    for (const [code, idx] of [['Digit1', 0], ['Digit2', 1], ['Digit3', 2]]) {
      if (input.take(code)) {
        audio.unlock();
        game.campaignScore = 0;
        loadSortie(idx);
        game.screen = SCREEN.BRIEF;
      }
    }
    return;
  }
  if (game.screen === SCREEN.BRIEF) {
    if (input.take('Enter')) {
      game.screen = SCREEN.PLAY;
      game.started = true;
      say('ROLLING — hold R for power, ease her up past 55 kt', 3.4);
    }
    return;
  }
  if (game.screen === SCREEN.PLAY) {
    if (input.take('KeyP') || input.take('Escape')) game.screen = SCREEN.PAUSED;
    if (input.take('KeyF')) game.plane.flaps = !game.plane.flaps;
    if (input.take('KeyT')) game.useMouse = !game.useMouse;
    return;
  }
  if (game.screen === SCREEN.PAUSED) {
    if (input.take('KeyP') || input.take('Escape')) game.screen = SCREEN.PLAY;
    if (input.take('KeyR')) {
      loadSortie(game.sortieIndex);
      game.screen = SCREEN.BRIEF;
    }
    return;
  }
  if (game.screen === SCREEN.RESULT) {
    if (input.take('KeyR')) {
      game.campaignScore -= game.result.score;
      loadSortie(game.sortieIndex);
      game.screen = SCREEN.BRIEF;
    } else if (input.take('Enter')) {
      if (game.result.crashed) {
        game.campaignScore -= game.result.score;
        loadSortie(game.sortieIndex);
        game.screen = SCREEN.BRIEF;
      } else if (game.sortieIndex + 1 < SORTIES.length) {
        loadSortie(game.sortieIndex + 1);
        game.screen = SCREEN.BRIEF;
      } else {
        game.campaignDone = true;
        if (game.campaignScore > game.best) {
          game.best = game.campaignScore;
          localStorage.setItem('emberwing-best', String(game.best));
        }
        game.screen = SCREEN.CAMPAIGN;
      }
    }
    return;
  }
  if (game.screen === SCREEN.CAMPAIGN) {
    if (input.take('Enter')) {
      loadSortie(0);
      game.screen = SCREEN.TITLE;
    }
  }
}

// Flaps also need handling while paused keys are scanned above; F is read in PLAY.
// Screenshot staging: ?shot=<name>&seed=<n> builds a frozen, real scene.
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
loadSortie(0);
if (shotName) {
  const staged = stageShot(shotName, game, world);
  game.screen = staged.screen;
  game.useMouse = false;
  input.setEnabled(false);
}

let last = performance.now();
function frame(nowMs) {
  const dt = clamp((nowMs - last) / 1000, 0, 0.05);
  last = nowMs;
  game.now = nowMs / 1000;
  if (!shotName) {
    handleKeys();
    if (game.screen === SCREEN.PLAY) stepGame(dt);
    else stepClouds(world, dt * 0.4);
    audio.update(game.plane);
  }
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
camera.follow(game.plane, 10);
draw();
requestAnimationFrame(frame);
