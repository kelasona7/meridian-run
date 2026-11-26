// Keyboard and mouse input. Arrows (or WASD) fly the plane, Shift/Ctrl work
// the throttle, the mouse steers like a stick, V swaps cockpit/chase view,
// P pauses, R restarts.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_RESTART = 'restart';
export const ACTION_VIEW = 'view';

export function createInput(canvas) {
  const keys = new Set();
  // Edge queue: one-shot presses are recorded here at event time, because
  // a quick press can land entirely between two frames (at ~10 FPS under
  // software rendering a keydown+keyup pair is regularly missed by code
  // that only polls the held-key set). navKey/missionKey consume from this
  // queue, so no press is ever lost. Only one-shot keys are queued.
  const queue = [];
  const ONE_SHOT = new Set(['1', '2', '3', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'w', 's']);
  const mouse = { active: false, x: 0, y: 0 };

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
    const name = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // Edge only: auto-repeat while held must not queue again.
    if (!keys.has(name) && ONE_SHOT.has(name)) {
      queue.push(name);
      if (queue.length > 32) queue.shift();
    }
    keys.add(name);
  }
  function onKeyUp(event) {
    keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.active = true;
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  }
  function onMouseLeave() {
    mouse.active = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseleave', onMouseLeave);

  function pressed(...names) {
    return names.some((name) => keys.has(name));
  }

  return {
    /** Pitch and roll in -1..1 plus a throttle delta per second. */
    read() {
      let pitch = 0;
      let roll = 0;
      if (pressed('ArrowUp', 'w')) pitch += 1;
      if (pressed('ArrowDown', 's')) pitch -= 1;
      if (pressed('ArrowLeft', 'a')) roll -= 1;
      if (pressed('ArrowRight', 'd')) roll += 1;
      // The mouse is a stick: push forward to dive, pull back to climb,
      // and the further from centre, the harder the turn.
      if (mouse.active) {
        pitch += Math.max(-1, Math.min(1, mouse.y * 1.4));
        roll += Math.max(-1, Math.min(1, mouse.x * 1.4));
      }
      let throttleDelta = 0;
      if (pressed('Shift')) throttleDelta += 0.55;
      if (pressed('Control', 'c')) throttleDelta -= 0.55;
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttleDelta,
      };
    },
    /** One-shot actions, consumed when read. */
    action() {
      if (pressed('Enter', ' ')) return ACTION_CONFIRM;
      if (pressed('p', 'P', 'Escape')) return ACTION_PAUSE;
      if (pressed('r', 'R')) return ACTION_RESTART;
      if (pressed('v', 'V')) return ACTION_VIEW;
      return null;
    },
    /** Mission select on the title screen: keys 1/2/3, consumed when read.
     * Reads the edge queue, so a quick press is never lost between frames. */
    missionKey() {
      for (let i = 0; i < queue.length; i += 1) {
        if (queue[i] === '1' || queue[i] === '2' || queue[i] === '3') {
          return queue.splice(i, 1)[0];
        }
      }
      return null;
    },
    /** Title-menu navigation, edge-triggered: each press fires once even
     * when the key is held, so Enter cannot skip a menu level. Up/down
     * move the highlight, Enter opens/selects, Escape goes back. Reads the
     * edge queue, so a quick press is never lost between frames. */
    navKey() {
      const map = {
        ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down',
        Enter: 'confirm', ' ': 'confirm', Escape: 'back',
      };
      for (let i = 0; i < queue.length; i += 1) {
        if (map[queue[i]]) return map[queue.splice(i, 1)[0]];
      }
      return null;
    },
    mouse,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    },
  };
}
