// Boot and the one loop: input is read every frame, the plane advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, crashed and landed.
//
// ?seed=N fixes the world. ?shot=start|flight|ring|runway (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { MISSIONS, missionByKey } from './missions.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { createLandmarks } from './landmarks.js';
import { createPlane, EVENT_CRASH, EVENT_LANDED, EVENT_RING } from './plane.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_VIEW, createInput } from './input.js';
import { createAudio } from './audio.js';
import { missionAtPoint } from './hud.js';
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
const missionParam = params.get('mission');
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

function announce(text) {
  status.textContent = text;
}

function runShot(name) {
  const scene = stageShot(name, world, plane, missionParam);
  let painted = 0;
  function paint() {
    renderer.draw({ plane, world }, scene.screen, { byMission: { rings: 0, time: 0, precision: 0 }, selected: 'rings' }, plane.time, STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  // Best score per mission, kept in local storage. The ring course keeps
  // the old single best key as a fallback for players who set it in v4.
  function readBest(missionId) {
    try {
      const key = `meridian-run-best-${missionId}`;
      const value = Number.parseInt(window.localStorage.getItem(key) ?? '', 10);
      if (Number.isInteger(value) && value > 0) return value;
      if (missionId === 'rings') {
        return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  }
  function saveBest(missionId, value) {
    try {
      window.localStorage.setItem(`meridian-run-best-${missionId}`, String(value));
    } catch {
      // Storage can be off (private windows): the best then lasts this visit.
    }
  }
  const bestByMission = {
    rings: readBest('rings'),
    time: readBest('time'),
    precision: readBest('precision'),
  };
  let mission = 'rings';
  let accumulator = 0;
  let last = performance.now();
  let simTime = 0;

  function startFlying(missionId) {
    mission = missionId || mission;
    plane.reset(mission);
    world.resetRings();
    screen = SCREEN_PLAY;
    audio.unlock();
    announce(`${MISSIONS[mission].name}: ${MISSIONS[mission].goal}.`);
  }

  function frame(now) {
    const frameSeconds = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    simTime += frameSeconds;

    const action = input.action();
    // Mission select on the title screen: keys 1/2/3 start that mission.
    const picked = input.missionKey();
    if (picked && screen === SCREEN_TITLE) {
      const missionId = missionByKey(picked);
      if (missionId) startFlying(missionId);
    }
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
          if (plane.score > bestByMission[plane.mission]) {
            bestByMission[plane.mission] = plane.score;
            saveBest(plane.mission, plane.score);
          }
          announce(`Crashed: ${plane.crashReason}. Score ${plane.score}.`);
          break;
        }
        if (events & EVENT_LANDED) {
          screen = SCREEN_LANDED;
          audio.land();
          if (plane.score > bestByMission[plane.mission]) {
            bestByMission[plane.mission] = plane.score;
            saveBest(plane.mission, plane.score);
          }
          announce(`Landed on runway 36. Score ${plane.score}.`);
          break;
        }
      }
      audio.update(plane.throttle, plane.speed, screen === SCREEN_PLAY);
    }

    renderer.draw({ plane, world }, screen, { byMission: bestByMission, selected: mission }, simTime, frameSeconds);
    requestAnimationFrame(frame);
  }

  canvas.addEventListener('click', (event) => {
    audio.unlock();
    if (screen === SCREEN_TITLE) {
      // A click on a mission row flies that mission; anywhere else flies
      // the selected one.
      const picked = missionAtPoint(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
      startFlying(picked || mission);
    } else if (screen === SCREEN_OVER || screen === SCREEN_LANDED) {
      startFlying();
    }
  });
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
