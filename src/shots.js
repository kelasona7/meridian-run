// Screenshot scenes behind ?shot=start|flight|ring|runway. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot (bank
// toward the target, hold its height, mind the terrain), so the frame is what
// a short game really looks like and the same seed always gives the same frame.
import { RUNWAY, STEP } from './config.js';
import { EVENT_CRASH, EVENT_LANDED } from './plane.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Steer the plane toward a point at a target speed, clearing the terrain. */
function autopilot(plane, world, target, targetSpeed) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const desiredHeading = Math.atan2(dx, -dz);
  const headingError = wrapAngle(desiredHeading - plane.heading);
  const ground = world.heightAt(plane.x, plane.z);
  let pitch = clamp((target.y - plane.y) * 0.02, -0.8, 0.8);
  if (plane.y - ground < 35) pitch = Math.max(pitch, 0.7);
  return {
    pitch,
    roll: clamp(headingError * 1.6, -1, 1),
    throttleDelta: clamp((targetSpeed - plane.speed) * 0.08, -0.55, 0.55),
  };
}

/** Final approach: hold the runway centreline and ride the glidepath down.
 * This steers a line, not a point, so the plane cannot overshoot the
 * threshold and chase the target around behind it. The glidepath is curved
 * — steeper far out, flattening near the strip — so the touchdown itself
 * is gentle. The target altitude is never below the glidepath and never
 * below a safe clearance over the ground under the plane, so the approach
 * first crabs back to the flat valley, then descends on the path. */
function landingControl(plane, world) {
  const ground = world.heightAt(plane.x, plane.z);
  // Crab back to the centreline, never more than ~20 degrees.
  const desiredHeading = clamp(-plane.x * 0.003, -0.35, 0.35);
  const headingError = wrapAngle(desiredHeading - plane.heading);
  const glideY = 8 + Math.pow(Math.max(0, plane.z - 200), 1.35) * 0.012;
  // On the strip the floor is the strip itself; off it, stay 12 m clear.
  const edgeFactor = clamp((Math.abs(plane.x) - 20) / 40, 0, 1);
  const floor = 8 + edgeFactor * (ground + 12 - 8);
  const targetY = Math.max(glideY, floor);
  return {
    pitch: clamp((targetY - plane.y) * 0.06, -0.6, 0.8),
    roll: clamp(headingError * 1.6, -1, 1),
    throttleDelta: clamp((38 - plane.speed) * 0.08, -0.55, 0.55),
  };
}

function fly(plane, world, seconds, steer, stopWhen) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = plane.step(STEP, steer(plane, world), world);
    if (events & EVENT_CRASH) return 'crash';
    if (events & EVENT_LANDED) return 'landed';
    if (stopWhen && stopWhen(plane, world)) return 'staged';
  }
  return 'flying';
}

/**
 * Set `world` and `plane` to the named scene and return the screen to draw.
 * flight: mid-course after 24 s of real flying — banked in the turn toward
 * ring 2, the lighthouse headland in view. ring: through ring 1, lined up
 * close on ring 2. runway: on final approach to runway 36. start: title.
 */
export function stageShot(name, world, plane) {
  plane.reset();
  world.resetRings();
  if (name === 'ring') {
    const result = fly(plane, world, 60, (p, w) => autopilot(p, w, w.nextRing(), 62), (p, w) => {
      const next = w.nextRing();
      return p.rings >= 1 && next && Math.hypot(next.x - p.x, next.y - p.y, next.z - p.z) < 220;
    });
    return { screen: SCREEN_PLAY, stopped: result };
  }
  if (name === 'runway') {
    // Stop while still on the approach, runway 36 and its lights ahead of
    // the nose — not over the threshold, where the strip is under the plane
    // and the cockpit camera sees only grass. The lateral position is not
    // required: the strip reads from anywhere in the approach corridor.
    const result = fly(plane, world, 170, (p, w) => {
      const next = w.nextRing();
      if (next) return autopilot(p, w, next, 62);
      return landingControl(p, w);
    }, (p) => p.rings >= 8 && Math.abs(wrapAngle(p.heading)) < 0.4 && p.y < 70 && p.z < 600 && p.z > 200);
    return { screen: SCREEN_PLAY, stopped: result };
  }
  if (name === 'flight') {
    fly(plane, world, 24, (p, w) => {
      const next = w.nextRing() || { x: 0, y: 120, z: 0 };
      return autopilot(p, w, next, 62);
    });
    return { screen: SCREEN_PLAY, stopped: 'flying' };
  }
  return { screen: SCREEN_TITLE, stopped: 'title' };
}

export { RUNWAY, autopilot, landingControl };
