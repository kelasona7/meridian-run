// The world: an island archipelago, its heightmap, the runway, the ring
// course, clouds and trees. Everything is generated from the seed, so the
// same seed always builds the same islands.
import { RINGS, RUNWAY, WORLD } from './config.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Gaussian hills that make the islands. [x, z, radius, height]
const ISLANDS = [
  [0, 0, 850, 132],
  [-1250, -850, 520, 168],
  [1050, -650, 430, 96],
  [-900, 900, 380, 58],
  [1150, 800, 340, 44],
  [250, -1450, 300, 72],
];

function makeNoiseGrid(random, size) {
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = random.next();
  return grid;
}

function noiseAt(grid, size, x, z) {
  // Clamp the lattice coordinates first: outside the lattice the fractions
  // would run past 1 and the smoothstep would explode into phantom peaks.
  const gx = Math.max(0, Math.min(size - 1, ((x / WORLD.extent) + 0.5) * (size - 1)));
  const gz = Math.max(0, Math.min(size - 1, ((z / WORLD.extent) + 0.5) * (size - 1)));
  const x0 = Math.max(0, Math.min(size - 2, Math.floor(gx)));
  const z0 = Math.max(0, Math.min(size - 2, Math.floor(gz)));
  const fx = gx - x0;
  const fz = gz - z0;
  const a = grid[z0 * size + x0];
  const b = grid[z0 * size + x0 + 1];
  const c = grid[(z0 + 1) * size + x0];
  const d = grid[(z0 + 1) * size + x0 + 1];
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

export function createWorld(random) {
  const noise = makeNoiseGrid(random, 48);
  const n = Math.floor((WORLD.extent * 2) / WORLD.cell) + 1;
  const heights = new Float32Array(n * n);

  function baseHeight(x, z) {
    let h = 0;
    for (const [ix, iz, ir, ih] of ISLANDS) {
      const dx = (x - ix) / ir;
      const dz = (z - iz) / ir;
      const d2 = dx * dx + dz * dz;
      if (d2 < 4) h += ih * Math.exp(-d2 * 1.6);
    }
    // Gentle rolling noise, stronger on land.
    const nz = noiseAt(noise, 48, x, z);
    if (h > 2) h += (nz - 0.5) * 26 * Math.min(1, h / 40);
    return h;
  }

  for (let iz = 0; iz < n; iz += 1) {
    const z = -WORLD.extent + iz * WORLD.cell;
    for (let ix = 0; ix < n; ix += 1) {
      const x = -WORLD.extent + ix * WORLD.cell;
      heights[iz * n + ix] = baseHeight(x, z);
    }
  }

  // Flatten a wide valley for the runway strip so the approach is safe: the
  // strip itself sits at the runway elevation and the ground rises smoothly
  // back to the island's natural height on either side and past each end.
  // The strip is dead flat across its full width (plus a margin), so a
  // touchdown on the strip never clips a lip at the edge.
  const rwHalf = 150;
  const stripHalf = RUNWAY.width / 2 + 6;
  for (let z = RUNWAY.zStart - 100; z <= RUNWAY.zEnd + 100; z += WORLD.cell) {
    for (let x = -rwHalf; x <= rwHalf; x += WORLD.cell) {
      const ix = Math.round((x + WORLD.extent) / WORLD.cell);
      const iz = Math.round((z + WORLD.extent) / WORLD.cell);
      if (ix >= 0 && ix < n && iz >= 0 && iz < n) {
        const dx = clamp((Math.abs(x) - stripHalf) / (rwHalf - stripHalf), 0, 1);
        const pastEnd = z < RUNWAY.zStart ? RUNWAY.zStart - z : z > RUNWAY.zEnd ? z - RUNWAY.zEnd : 0;
        const edge = Math.max(dx, Math.min(1, pastEnd / 100));
        const h = heights[iz * n + ix];
        heights[iz * n + ix] = h + (RUNWAY.elevation - h) * (1 - edge * edge);
      }
    }
  }

  function heightAt(x, z) {
    if (x < -WORLD.extent || x > WORLD.extent || z < -WORLD.extent || z > WORLD.extent) return 0;
    const fx = (x + WORLD.extent) / WORLD.cell;
    const fz = (z + WORLD.extent) / WORLD.cell;
    const ix = Math.max(0, Math.min(n - 2, Math.floor(fx)));
    const iz = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * n + ix];
    const b = heights[iz * n + ix + 1];
    const c = heights[(iz + 1) * n + ix];
    const d = heights[(iz + 1) * n + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  // Clouds: soft white puffs the plane flies under and between. Every fifth
  // one is a shaded grey cloud, darker underneath against the blue sky.
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: random.range(-1900, 1900),
      y: random.range(240, 420),
      z: random.range(-1900, 1900),
      r: random.range(60, 170),
      dark: i % 5 === 0,
    });
  }

  // Trees across the archipelago, kept clear of the runway. Denser than
  // the 2D game drew (it capped at 160 on screen); the 3D renderer
  // instances them all in two draw calls.
  const trees = [];
  for (let i = 0; i < 900; i += 1) {
    const x = random.range(-1900, 1900);
    const z = random.range(-1900, 1900);
    const h = heightAt(x, z);
    if (h < 5 || h > 110) continue;
    if (Math.abs(x) < 60 && z > RUNWAY.zStart - 60 && z < RUNWAY.zEnd + 60) continue;
    trees.push({ x, z, y: h, s: random.range(7, 15) });
  }

  const rings = RINGS.map((ring) => ({ ...ring, passed: false }));

  return {
    heights,
    gridN: n,
    heightAt,
    clouds,
    trees,
    rings,
    ringIndex: 0,
    resetRings() {
      for (const ring of rings) ring.passed = false;
      this.ringIndex = 0;
    },
    nextRing() {
      return this.ringIndex < rings.length ? rings[this.ringIndex] : null;
    },
    ringsLeft() {
      return rings.length - this.ringIndex;
    },
    /** True when the plane's nose is inside the ring's opening. */
    checkRing(x, y, z) {
      const ring = this.nextRing();
      if (!ring) return false;
      const dx = x - ring.x;
      const dy = y - ring.y;
      const dz = z - ring.z;
      if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
        ring.passed = true;
        this.ringIndex += 1;
        return true;
      }
      return false;
    },
  };
}

// Terrain colour by height, in a bright day palette: warm sand, vivid
// meadows and forests, grey rock, and white snowy peaks.
export function terrainColor(h, sunShade) {
  let r;
  let g;
  let b;
  if (h < 2.5) {
    r = 226; g = 196; b = 140; // sand, warm in the high sun
  } else if (h < 55) {
    r = 112; g = 172; b = 82; // meadow green, bright
  } else if (h < 105) {
    r = 74; g = 132; b = 72; // forest green
  } else if (h < 140) {
    r = 132; g = 118; b = 102; // rock
  } else {
    r = 240; g = 244; b = 248; // snowy peaks, white in daylight
  }
  const s = 0.8 + 0.2 * sunShade;
  return `rgb(${(r * s) | 0},${(g * s) | 0},${(b * s) | 0})`;
}
