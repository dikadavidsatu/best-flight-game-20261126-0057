// missions.js — the three sorties of the Skyharbor flying club, in the order a
// new pilot flies them. Each sortie is a chain of sky rings over the valley and
// a landing back on the harbour runway. Later sorties add wind, thin fuel and
// lower cloud: the same valley, harder decisions. A ring is {x, z, alt} with
// its facing worked out from its neighbours, so the chain always reads as a
// course, never as scattered hoops.

import { riverX } from './world.js';

/** A ring's facing: the heading of the course as it passes through the ring. */
export function ringFacing(points, i) {
  const prev = points[Math.max(0, i - 1)];
  const next = points[Math.min(points.length - 1, i + 1)];
  return Math.atan2(next[0] - prev[0], next[1] - prev[1]);
}

function makeRings(points) {
  return points.map(([x, z, alt], i) => ({
    x, z, alt,
    face: ringFacing(points, i),
    passed: false,
    missed: false,
  }));
}

export const SORTIES = [
  {
    id: 'first-light',
    name: 'Sortie 1 — First Light Circuit',
    brief: 'Take off north, follow the dawn rings up the river and bring her home. Full tanks, calm air: learn the valley.',
    parSeconds: 420,
    fuel: 100,
    wind: { x: 0, z: 0, gust: 0 },
    cloudBase: 900,
    rings: makeRings([
      [0, -2400, 130],
      [riverX(-1200), -1200, 170],
      [riverX(100) - 260, 100, 210],
      [riverX(1500), 1500, 240],
      [300, 2900, 260],
      [-700, 2100, 220],
      [-500, 600, 180],
      [-160, -900, 140],
    ]),
  },
  {
    id: 'storm-gap',
    name: 'Sortie 2 — Storm Gap',
    brief: 'A sea wind is pushing through the western gap and the cloud is down. Ten rings, three-quarter tanks, and the ridge leg bites.',
    parSeconds: 520,
    fuel: 96,
    wind: { x: -6.5, z: 1.5, gust: 3.2 },
    cloudBase: 520,
    rings: makeRings([
      [-150, -2300, 150],
      [-800, -1100, 230],
      [-1350, 300, 320],
      [-900, 1700, 300],
      [riverX(2800), 2800, 260],
      [900, 3400, 240],
      [1500, 1900, 210],
      [riverX(500) + 200, 500, 180],
      [500, -800, 150],
      [80, -1900, 120],
    ]),
  },
  {
    id: 'harbour-delivery',
    name: 'Sortie 3 — Harbour Delivery',
    brief: 'Carry the mail to the lighthouse point and back before the light goes. Half tanks: every climb is a choice, and the last ring sits low over the harbour.',
    parSeconds: 460,
    fuel: 70,
    wind: { x: 3.5, z: -2.5, gust: 1.8 },
    cloudBase: 680,
    rings: makeRings([
      [200, -2200, 120],
      [900, -3300, 130],
      [1420, -4250, 90],
      [900, -3600, 150],
      [riverX(-1600) + 150, -1600, 190],
      [riverX(-100), -100, 230],
      [-350, 1300, 250],
      [-200, -300, 170],
      [-60, -1500, 110],
    ]),
  },
];

/** Total campaign par, for the end-of-campaign summary. */
export function campaignPar() {
  return SORTIES.reduce((sum, s) => sum + s.parSeconds, 0);
}
