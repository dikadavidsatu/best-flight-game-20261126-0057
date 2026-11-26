// audio.js — all sound is synthesised with WebAudio, no audio files: a
// two-oscillator engine whose pitch follows the throttle, filtered wind that
// rises with airspeed, a chime for a ring flown clean, a clunk for a scrape,
// a low thud for a crash and a small brass figure for a landing that counts.
// The context is created lazily on the first user gesture, as browsers require.

export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let wind = null;
  let windGain = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    // Engine: a sawtooth and a square a fifth apart, through a low-pass.
    engine = ctx.createOscillator();
    const engine2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.type = 'sawtooth';
    engine2.type = 'square';
    engine.frequency.value = 55;
    engine2.frequency.value = 82.5;
    engine.connect(filter);
    engine2.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engine.start();
    engine2.start();
    engine._second = engine2;
    engine._filter = filter;
    // Wind: looped noise through a band-pass.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    wind.start();
    return true;
  }

  function tone(freq, seconds, type, gain, when = 0, slideTo = null) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  return {
    unlock() { ensure(); },
    /** Continuous engine and wind, called every frame with the plane's state. */
    update(plane) {
      if (!ctx || !engine) return;
      const target = muted ? 0 : 0.028 + plane.throttle * 0.075;
      engineGain.gain.setTargetAtTime(plane.crashed ? 0 : target, ctx.currentTime, 0.09);
      const rpm = 52 + plane.throttle * 68 + plane.speed * 0.12;
      engine.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.08);
      engine._second.frequency.setTargetAtTime(rpm * 1.5, ctx.currentTime, 0.08);
      engine._filter.frequency.setTargetAtTime(300 + plane.throttle * 700, ctx.currentTime, 0.1);
      const windTarget = muted ? 0 : Math.min(0.16, (plane.speed / 95) * 0.16) * (plane.airborne ? 1 : 0.35);
      windGain.gain.setTargetAtTime(plane.crashed ? 0 : windTarget, ctx.currentTime, 0.15);
    },
    ring(centre) {
      // Cleaner through the middle, brighter the chime.
      tone(660 + centre * 320, 0.35, 'sine', 0.16);
      tone(990 + centre * 480, 0.5, 'sine', 0.10, 0.07);
    },
    scrape() { tone(140, 0.22, 'square', 0.14, 0, 70); },
    stall() { tone(1180, 0.14, 'square', 0.05); tone(1180, 0.14, 'square', 0.05, 0.2); },
    crash() {
      tone(90, 0.7, 'triangle', 0.3, 0, 34);
      tone(55, 0.9, 'sine', 0.3, 0.03, 26);
    },
    landed(good) {
      if (good) {
        tone(523, 0.16, 'triangle', 0.14);
        tone(659, 0.16, 'triangle', 0.14, 0.12);
        tone(784, 0.3, 'triangle', 0.16, 0.24);
      } else {
        tone(220, 0.25, 'triangle', 0.12, 0, 180);
      }
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() { return muted; },
  };
}
