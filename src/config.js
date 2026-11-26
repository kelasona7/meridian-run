// Meridian Run: tuning constants and the course layout.
// Units inside the simulation are metres, metres per second and radians.
// The HUD converts them to knots and feet for the pilot.
export const STEP = 1 / 60;
export const BEST_KEY = 'meridian-run-best';

// --- World ---------------------------------------------------------------
export const WORLD = {
  // Heightmap lookup covers this square, sampled every 10 m.
  extent: 2200,
  cell: 10,
  seaLevel: 0,
};

// --- The course ----------------------------------------------------------
// The runway runs north-south on the main island (heading 360, "36").
// The plane spawns south of it, flies the ring course, then comes back
// down the same line to land on runway 36.
export const RUNWAY = {
  x: 0,
  zStart: -600,
  zEnd: 700,
  width: 44,
  elevation: 8,
  heading: 0, // radians, facing north (-z)
  name: '36',
};

export const SPAWN = {
  x: 0,
  y: 150,
  z: 1500,
  heading: 0, // facing north
  speed: 62,
};

export const RINGS = [
  { x: 0, y: 140, z: 900, r: 26 },
  { x: -420, y: 165, z: 320, r: 26 },
  { x: -720, y: 185, z: -380, r: 26 },
  { x: -260, y: 205, z: -980, r: 26 },
  { x: 480, y: 175, z: -920, r: 26 },
  { x: 820, y: 150, z: -240, r: 26 },
  { x: 430, y: 130, z: 480, r: 26 },
  { x: 0, y: 95, z: 720, r: 26 },
];

// --- Plane ----------------------------------------------------------------
export const PLANE = {
  maxSpeed: 96, // m/s at full throttle, level flight
  stallSpeed: 28, // m/s: below this the wing stops flying
  maxThrottle: 1,
  throttleRate: 0.55, // per second
  pitchRate: 0.9, // rad/s at full elevator
  rollRate: 2.2, // rad/s at full aileron
  maxBank: 1.15, // rad, about 66 degrees
  turnFactor: 0.55, // how much bank turns the heading
  drag: 0.012,
  thrust: 34, // m/s^2 at full throttle
  gravity: 9.81,
  fuelCapacity: 100,
  fuelBurn: 0.6, // units per second at full throttle
  crashDescent: 6, // m/s: harder than this on terrain is a crash
  landingSpeedMax: 42, // m/s
  landingDescentMax: 4.0, // m/s: a firm touchdown is survivable, a dive is not
  landingAlignMax: 0.45, // rad off runway heading
};

// --- Scoring ---------------------------------------------------------------
export const SCORE = {
  ring: 1000,
  landing: 2500,
  allRingsBonus: 1500,
  timeParSeconds: 150,
};
