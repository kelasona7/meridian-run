// The three missions. The title screen offers them with keys 1/2/3 and
// as clickable rows; the HUD names the active one and its objective.
// RINGS is the original game, untouched. TIME TRIAL flies the same course
// against the clock. PRECISION LANDING is one short final approach to the
// gold touchdown zone on runway 36 — no rings at all.
import { PRECISION_SCORE, TIME_TRIAL, TOUCHDOWN_ZONE } from './config.js';

export const MISSION_ORDER = ['rings', 'time', 'precision'];

export const MISSIONS = {
  rings: {
    id: 'rings',
    key: '1',
    name: 'RING COURSE',
    short: 'RINGS',
    goal: 'Fly all 8 rings, then land on runway 36',
    detail: '8 rings × 1,000 · landing 2,500 · all-rings bonus 1,500',
    hudGoal: 'RINGS 8/8, THEN LAND ON RUNWAY 36',
  },
  time: {
    id: 'time',
    key: '2',
    name: 'TIME TRIAL',
    short: 'TIME',
    goal: 'Same 8 rings — fastest landing wins',
    detail: '8,000 base · +50/s under 150 s · landing 2,500 · gold under 2:00',
    hudGoal: 'RINGS 8/8, THEN LAND — BEAT 2:30, GOLD UNDER 2:00',
  },
  precision: {
    id: 'precision',
    key: '3',
    name: 'PRECISION LANDING',
    short: 'PRECISION',
    goal: 'Land inside the gold touchdown zone',
    detail: '10,000 base · −20/m off centre · −200 per m/s down · −1,000 per rad off',
    hudGoal: 'LAND IN THE GOLD ZONE — GENTLE AND STRAIGHT',
  },
};

export function missionByKey(key) {
  for (const id of MISSION_ORDER) {
    if (MISSIONS[id].key === key) return id;
  }
  return null;
}

/** Time-trial score at landing: base + bonus for beating par + landing. */
export function scoreTimeTrial(timeSeconds) {
  const bonus = Math.max(0, TIME_TRIAL.parSeconds - timeSeconds) * TIME_TRIAL.perSecond;
  return {
    total: Math.round(TIME_TRIAL.base + bonus + TIME_TRIAL.landing),
    bonus: Math.round(bonus),
  };
}

/**
 * Precision score at touchdown: distance to the zone centre, vertical
 * speed and centreline alignment all cost points. Never below zero.
 */
export function scorePrecisionLanding(touchdownX, touchdownZ, verticalSpeed, headingError) {
  const dist = Math.hypot(touchdownX - TOUCHDOWN_ZONE.x, touchdownZ - TOUCHDOWN_ZONE.z);
  const total = Math.max(0, Math.round(
    PRECISION_SCORE.base
    - dist * PRECISION_SCORE.perMetre
    - Math.abs(verticalSpeed) * PRECISION_SCORE.perMs
    - Math.abs(headingError) * PRECISION_SCORE.perRad,
  ));
  return { total, dist: Math.round(dist) };
}

export function formatClock(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
