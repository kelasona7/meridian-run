// Boot and the one loop: input is read every frame, the plane advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, crashed and landed.
//
// ?seed=N fixes the world. ?shot=start|flight|ring|runway (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createLandmarks } from './landmarks.js';
import { createPlane, EVENT_CRASH, EVENT_LANDED, EVENT_RING } from './plane.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_VIEW, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_LANDED,
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const viewParam = params.get('view');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
world.landmarks = createLandmarks(world);
const plane = createPlane();
// Debug hook for smoke tests: lets a script read the plane's live state.
window.__meridian = { plane, world };
const renderer = createRenderer(canvas);
if (viewParam === 'cockpit' || viewParam === 'chase') renderer.setView(viewParam);
window.__meridian.renderer = renderer;
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit.
  }
}

function announce(text) {
  status.textContent = text;
}

function runShot(name) {
  const scene = stageShot(name, world, plane);
  let painted = 0;
  function paint() {
    renderer.draw({ plane, world }, scene.screen, 0, plane.time, STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let simTime = 0;

  function startFlying() {
    plane.reset();
    world.resetRings();
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Flying: follow the gold ring, then land on runway 36.');
  }

  function frame(now) {
    const frameSeconds = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    simTime += frameSeconds;

    const action = input.action();
    if (action === ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) startFlying();
      else if (screen === SCREEN_OVER || screen === SCREEN_LANDED) startFlying();
      audio.unlock();
    } else if (action === ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    } else if (action === ACTION_RESTART) {
      if (screen !== SCREEN_TITLE) startFlying();
    } else if (action === ACTION_VIEW) {
      renderer.toggleView();
    }

    if (screen === SCREEN_PLAY) {
      accumulator += frameSeconds;
      while (accumulator >= STEP) {
        accumulator -= STEP;
        const events = plane.step(STEP, input.read(), world);
        if (events & EVENT_RING) {
          const next = world.nextRing();
          audio.ring();
          if (next) renderer.burst(next.x, next.y, next.z);
          else renderer.burst(plane.x, plane.y, plane.z);
        }
        if (events & EVENT_CRASH) {
          screen = SCREEN_OVER;
          audio.crash();
          renderer.smoke(plane.x, plane.y, plane.z);
          if (plane.score > best) {
            best = plane.score;
            saveBest(best);
          }
          announce(`Crashed: ${plane.crashReason}. Score ${plane.score}.`);
          break;
        }
        if (events & EVENT_LANDED) {
          screen = SCREEN_LANDED;
          audio.land();
          if (plane.score > best) {
            best = plane.score;
            saveBest(best);
          }
          announce(`Landed on runway 36. Score ${plane.score}.`);
          break;
        }
      }
      audio.update(plane.throttle, plane.speed, screen === SCREEN_PLAY);
    }

    renderer.draw({ plane, world }, screen, best, simTime, frameSeconds);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('click', () => {
    audio.unlock();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_LANDED) startFlying();
  });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
