// config.js — every tunable number for Emberwing: Skyharbor Run in one place.
// The world is measured in metres, speeds in metres per second, angles in radians
// unless a name says otherwise. The Kestrel-9 is a fictional single-engine tourer:
// honest stall behaviour, a thirsty engine at full throttle, and flaps that trade
// drag for lift when the runway is close.

export const WORLD = {
  // The flyable valley: x runs west(-)/east(+), z runs south(-, behind the start)/
  // north(+). The harbour runway sits at the south end, pointing north.
  halfWidth: 2600,
  halfLength: 5200,
  groundY: 0,
  seaLevel: -6,
  ceiling: 1500,
};

export const RUNWAY = {
  x: 0,
  zStart: -4300, // threshold (south end, where a landing begins)
  zEnd: -2900, // far end: be stopped or airborne again before here
  width: 46,
  length: 1400,
  headingDeg: 0, // pointing north (+z)
};

export const PLANE = {
  spawnX: 0,
  spawnZ: -4700, // lined up south of the threshold for the opening take-off roll
  spawnAlt: 0,
  minSpeed: 16, // below this on the ground nothing happens; in the air, see stallSpeed
  stallSpeed: 27, // flaps up
  stallSpeedFlaps: 21,
  maxSpeed: 92,
  cruiseSpeed: 48,
  accelPerThrottle: 12.5, // m/s^2 at full throttle, level, no drag
  dragBase: 0.0030,
  dragFlaps: 0.009,
  dragGear: 0.004,
  pitchRate: 0.62, // rad/s at full stick
  rollRate: 1.45,
  maxBank: 1.05, // ~60 degrees
  maxPitch: 0.42,
  turnPerBank: 0.30, // heading rad/s at 45 degrees of bank, scales with tan(bank)
  liftSink: 5.2, // m/s of sink the wing cancels at cruise
  gravity: 9.81,
  fuelCapacity: 100,
  fuelBurnIdle: 0.04, // per second
  fuelBurnFull: 0.22,
  touchDownSinkLimit: 3.4, // m/s: harder than this bends the gear (damage)
  touchDownSinkCrash: 6.5, // m/s: harder than this is a crash, full stop
  groundRollFriction: 0.55,
  brakeDecel: 3.4,
};

export const RING = {
  radius: 26,
  passScore: 300,
  centreBonus: 200, // scaled by how close to the middle of the ring you pass
  postClearance: 2.2, // metres from the rim that still counts as a scrape
};

export const SCORE = {
  landingGood: 800,
  landingPerfect: 1500,
  perSecondLeft: 6, // par-time bonus per unused second
  perFuelLeft: 9, // points per unit of fuel still in the tank at shutdown
  damagePenalty: 25, // per point of damage
  scrapePenalty: 120,
};

export const VIEW = {
  fovDeg: 68,
  cameraBack: 13.5, // metres behind the aircraft
  cameraUp: 4.6, // metres above it
  cameraLag: 3.2, // 1/s: how fast the camera settles behind the tail
  horizonPitchScale: 1.0,
  drawDistance: 4200,
};

export const STEP = 1 / 120; // physics step, seconds: two per 60fps frame

export const SKY = {
  // Dawn over the harbour: three stops the renderer blends by altitude.
  top: [38, 62, 118],
  mid: [116, 148, 196],
  low: [238, 178, 128],
  sunX: 0.72, // fraction across the sky where the sun sits
  sunY: 0.30,
};
