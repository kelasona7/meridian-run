// The flight model: an arcade plane with just enough discipline to matter.
// Throttle sets the speed the engine wants; the wing only flies above stall
// speed; bank turns the heading; fuel runs out and the glide begins.
import { PLANE, RUNWAY, SPAWN } from './config.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_CRASH = 2;
export const EVENT_LANDED = 4;
export const EVENT_LOW_FUEL = 8;

export function createPlane() {
  return {
    x: SPAWN.x,
    y: SPAWN.y,
    z: SPAWN.z,
    heading: SPAWN.heading,
    pitch: 0,
    roll: 0,
    speed: SPAWN.speed,
    throttle: 0.62,
    fuel: PLANE.fuelCapacity,
    verticalSpeed: 0,
    time: 0,
    score: 0,
    rings: 0,
    crashed: false,
    landed: false,
    crashReason: '',
    message: '',
    messageUntil: 0,

    reset() {
      this.x = SPAWN.x;
      this.y = SPAWN.y;
      this.z = SPAWN.z;
      this.heading = SPAWN.heading;
      this.pitch = 0;
      this.roll = 0;
      this.speed = SPAWN.speed;
      this.throttle = 0.62;
      this.fuel = PLANE.fuelCapacity;
      this.verticalSpeed = 0;
      this.time = 0;
      this.score = 0;
      this.rings = 0;
      this.crashed = false;
      this.landed = false;
      this.crashReason = '';
      this.message = '';
      this.messageUntil = 0;
    },

    say(text, seconds) {
      this.message = text;
      this.messageUntil = this.time + seconds;
    },

    /**
     * One fixed step. `ctl` is { pitch, roll, throttleDelta } with pitch and
     * roll in -1..1. Returns an event bitmask.
     */
    step(dt, ctl, world) {
      if (this.crashed || this.landed) return EVENT_NONE;
      this.time += dt;
      let events = EVENT_NONE;

      // Throttle, then fuel. Empty tanks mean a dead stick glide.
      this.throttle = Math.max(0, Math.min(1, this.throttle + ctl.throttleDelta * dt));
      if (this.fuel > 0) {
        this.fuel = Math.max(0, this.fuel - PLANE.fuelBurn * this.throttle * dt);
        if (this.fuel <= 0) {
          this.throttle = 0;
          events |= EVENT_LOW_FUEL;
          this.say('FUEL EMPTY — GLIDING', 3);
        } else if (this.fuel < 20 && this.time > this.messageUntil) {
          this.say('LOW FUEL', 2);
        }
      }

      // Attitude: elevator pitches, ailerons bank, bank turns the heading.
      const pitchTarget = ctl.pitch * 0.55;
      this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 3.2);
      const rollTarget = ctl.roll * PLANE.maxBank;
      this.roll += (rollTarget - this.roll) * Math.min(1, dt * 3.6);
      this.heading += Math.sin(this.roll) * PLANE.turnFactor * (this.speed / 60) * dt;

      // Speed: thrust against drag, plus a little help from a dive.
      const targetSpeed = this.throttle * PLANE.maxSpeed;
      const drag = PLANE.drag * this.speed * this.speed;
      const thrust = this.throttle * PLANE.thrust;
      this.speed += (thrust - drag - Math.sin(this.pitch) * PLANE.gravity * 0.9) * dt;
      this.speed = Math.max(0, this.speed);

      // Lift: the wing flies above stall speed and stalls below it.
      const stalled = this.speed < PLANE.stallSpeed;
      const liftFactor = stalled ? 0.25 : 1;
      const climb = Math.sin(this.pitch) * this.speed * liftFactor;
      const sink = stalled ? (PLANE.stallSpeed - this.speed) * 0.55 : 0.35;
      this.verticalSpeed = climb - sink;
      this.y += this.verticalSpeed * dt;

      // Move along the heading.
      const forwardX = Math.sin(this.heading);
      const forwardZ = -Math.cos(this.heading);
      this.x += forwardX * Math.cos(this.pitch) * this.speed * dt;
      this.z += forwardZ * Math.cos(this.pitch) * this.speed * dt;

      // Ring check.
      if (world.checkRing(this.x, this.y, this.z)) {
        this.rings += 1;
        this.score += 1000;
        events |= EVENT_RING;
        if (world.ringsLeft() === 0) {
          this.say('COURSE COMPLETE — LAND ON RUNWAY 36', 5);
        } else {
          this.say(`RING ${this.rings} OF 8 — +1000`, 2);
        }
      }

      // Ground and water.
      const ground = world.heightAt(this.x, this.z);
      const onRunway = Math.abs(this.x - RUNWAY.x) < RUNWAY.width / 2
        && this.z > RUNWAY.zStart && this.z < RUNWAY.zEnd;
      const groundY = onRunway ? RUNWAY.elevation : ground;
      if (this.y <= groundY + 0.5) {
        if (onRunway) {
          const aligned = Math.abs(this.heading) < PLANE.landingAlignMax || Math.abs(this.heading - Math.PI * 2) < PLANE.landingAlignMax;
          const gentle = this.verticalSpeed > -PLANE.landingDescentMax;
          const slow = this.speed < PLANE.landingSpeedMax;
          if (aligned && gentle && slow) {
            this.y = RUNWAY.elevation + 0.5;
            this.landed = true;
            this.score += 2500 + (world.ringsLeft() === 0 ? 1500 : 0);
            return events | EVENT_LANDED;
          }
          this.crashed = true;
          this.crashReason = !aligned ? 'LANDED ACROSS THE RUNWAY' : !gentle ? 'TOO HARD — GEAR COLLAPSED' : 'TOO FAST TO LAND';
          return events | EVENT_CRASH;
        }
        if (ground <= 0.5) {
          this.crashed = true;
          this.crashReason = 'DITCHED IN THE SEA';
        } else if (this.verticalSpeed < -6) {
          this.crashed = true;
          this.crashReason = 'FLEW INTO THE MOUNTAIN';
        } else {
          this.crashed = true;
          this.crashReason = 'CLIPPED THE TERRAIN';
        }
        return events | EVENT_CRASH;
      }

      // Warnings the pilot can still act on. No terrain shout on final
      // approach: being low over the runway corridor is the plan, not a
      // hazard.
      const onFinal = Math.abs(this.x - RUNWAY.x) < 30 && this.z > RUNWAY.zStart && this.z < RUNWAY.zEnd
        && (Math.abs(this.heading) < PLANE.landingAlignMax || Math.abs(this.heading - Math.PI * 2) < PLANE.landingAlignMax);
      if (stalled && this.time > this.messageUntil) this.say('STALL — NOSE DOWN, ADD POWER', 2);
      if (!onFinal && this.y - ground < 25 && this.verticalSpeed < -2 && this.time > this.messageUntil) {
        this.say('PULL UP — TERRAIN', 2);
      }
      return events;
    },
  };
}
