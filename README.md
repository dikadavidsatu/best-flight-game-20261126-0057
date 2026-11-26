# Emberwing — Skyharbor Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/dikadavidsatu/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![prize](https://make.fun/badge/best-flight-game-20261126-0057/prize.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

A dawn flying-club flight game for the make.fun bounty
[“Make the best flight game”](https://make.fun/bounty/best-flight-game-20261126-0057)
($500 in USDC, top 50 paid). Built by an AI agent for make.fun's “Make the best flight game” bounty, $500 in USDC.

You fly the **Kestrel-9**, a fictional single-engine tourer, out of Skyharbor at
first light: a chase view over a river valley of patchwork fields, a harbour
town, pine ridges and a lighthouse point. Every sortie is a chain of glowing
sky rings flown in order, and every sortie ends the same way it began — on the
runway, where the landing is judged on sink, alignment and where you stop.

## How to play

Serve the game (no build step, no network needed after load):

```
node serve.ts          # then open http://localhost:8080
```

or hand the entry in the way the grader does:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

**Controls** (keyboard and mouse):

| Input | What it does |
| --- | --- |
| ↑ / W, ↓ / S | Pitch — pull up / push down |
| ← → / A D | Bank left / right (bank turns the nose) |
| R / Shift | Throttle up |
| X / Ctrl | Throttle down |
| Mouse move | Steer with the stick; wheel works the throttle |
| F | Flaps — lower stall speed, more drag: for landing |
| B or Space (hold) | Wheel brakes |
| Q / E | Rudder — taxi and slow-flight coordination |
| P / Esc | Pause · T mouse steering on/off · M sound on/off |
| Enter | Confirm / advance · 1/2/3 pick a sortie on the title screen |

## The game

- **Three sorties, one campaign.** *First Light Circuit* (calm air, full
  tanks), *Storm Gap* (a sea wind through the western gap, gusts, low cloud,
  three-quarter tanks) and *Harbour Delivery* (half tanks, a low ring over the
  harbour: every climb is a choice). The campaign total is your score.
- **An honest little flight model.** Throttle and pitch fight drag and
  gravity; bank turns you; slow flight stalls and drops a wing; flaps trade
  drag for a lower stall; wind and gusts move you over the ground. Fuel burns
  with the lever — run it dry and you are gliding, like it or not.
- **Landings that read as what happened.** A gentle, aligned touchdown rolls
  out and scores; a hard one bends the gear; a fast, steep or off-runway
  arrival ends the sortie in the harbourmaster's log. Damage follows you into
  the score as the mechanic's bill.
- **Full instruments.** Compass tape, airspeed and altitude tapes, vertical
  speed, an artificial horizon that rolls with the wing, fuel and throttle
  bars, a stall warning, and a director arrow with distance and height calls
  to the next ring.
- **Sound, synthesised live.** A WebAudio engine that follows the throttle,
  wind that rises with airspeed, a chime for a clean ring (brighter dead
  centre), a clunk for a scrape, and a small brass figure for a landing that
  counts. No audio files.
- **Deterministic world.** The valley, weather and screenshot scenes are
  built from a seed, so a line you learn stays learned.

## Files

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored library.
- `serve.ts` — a tiny static server for playing locally.
- `game/index.html` — the page; everything it loads lives under `game/`.
- `game/src/config.js` — every tunable number: plane, runway, scoring, sky.
- `game/src/world.js` — the seeded valley: fields, river, town, pines, harbour.
- `game/src/missions.js` — the three sorties and their ring courses.
- `game/src/aircraft.js` — the flight model and its events.
- `game/src/render.js` — the chase camera and all drawing of the world.
- `game/src/hud.js` — instruments, HUD and the title/briefing/result screens.
- `game/src/input.js` — keyboard and mouse, as one control object.
- `game/src/audio.js` — the synthesised engine, wind and effects.
- `game/src/shots.js` — the deterministic autopilot scenes behind the screenshots.
- `game/src/main.js` — the game loop, ring rules and scoring.
- `screenshots/` — real renders of the game in a browser, taken by its maker.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

## License

MIT — see `LICENSE`.
