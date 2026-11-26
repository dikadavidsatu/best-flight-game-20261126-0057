// input.js — keyboard and mouse together. The stick is the arrow keys or WASD
// (pitch and roll), the throttle lever is R/X (or Shift/Ctrl, or the mouse
// wheel), Q/E work the rudder, and the mouse can fly the plane on its
// own: where the pointer sits relative to the screen centre is where the stick
// is. Keys are tracked as held/not-held; the game loop turns them into a
// control object each frame, so nothing here knows about physics.

export function createInput() {
  const held = new Set();
  const pressed = new Set(); // one-shot keys, cleared by the loop after reading
  const mouse = { x: 0.5, y: 0.5, active: false, wheel: 0 };
  let enabled = true;

  const down = (event) => {
    if (!enabled) return;
    const code = event.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
    if (!held.has(code)) pressed.add(code);
    held.add(code);
  };
  const up = (event) => held.delete(event.code);
  const move = (event) => {
    mouse.x = event.clientX / Math.max(1, window.innerWidth);
    mouse.y = event.clientY / Math.max(1, window.innerHeight);
    mouse.active = true;
  };
  const wheel = (event) => {
    mouse.wheel += event.deltaY < 0 ? 1 : -1;
  };
  const blur = () => held.clear();

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('mousemove', move);
  window.addEventListener('wheel', wheel, { passive: true });
  window.addEventListener('blur', blur);

  return {
    /** The continuous control object the flight model consumes. */
    controls(useMouse) {
      // ArrowUp / W pulls the nose up; ArrowDown / S pushes it down.
      let pitch = (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0) - (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0);
      let roll = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      let throttle = 0;
      if (held.has('KeyR') || held.has('ShiftLeft') || held.has('ShiftRight')) throttle += 1;
      if (held.has('KeyX')) throttle -= 1;
      if (held.has('ControlLeft') || held.has('ControlRight')) throttle -= 1;
      if (useMouse && mouse.active) {
        const dx = (mouse.x - 0.5) * 2;
        const dy = (0.5 - mouse.y) * 2;
        if (Math.abs(dx) > 0.08) roll = dx;
        if (Math.abs(dy) > 0.08) pitch = dy;
        if (mouse.wheel !== 0) {
          throttle += mouse.wheel > 0 ? 1 : -1;
          mouse.wheel = 0;
        }
      }
      return {
        pitch,
        roll,
        throttle,
        rudder: (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0),
      };
    },
    /** True once per physical press of a one-shot key. */
    take(code) {
      if (pressed.has(code)) {
        pressed.delete(code);
        return true;
      }
      return false;
    },
    held: (code) => held.has(code),
    setEnabled(value) { enabled = value; },
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', blur);
    },
  };
}
