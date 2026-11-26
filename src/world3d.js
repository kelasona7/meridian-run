// The 3D world: terrain, sea, sky, clouds, trees, harbour, lighthouse,
// windmill, sailboats, balloons, birds, rings and runway 36 — all built
// from the game's seeded world (world.heightAt, world.trees, world.clouds,
// world.landmarks, the ring list and the runway constants), so the same
// seed always builds the same islands. Nothing here touches the flight
// model or the course.
//
// Scenery v2 (golden hour): biome terrain colours with slope-based cliffs,
// a waterfall on the north-west island's steep flank, a gradient sky dome
// with sun glow and god-ray shafts, hot air balloons, instanced sailboats
// (replacing the three one-off boats — same look, 7 fewer draw calls),
// broadleaf trees + coastal rocks, animated Fresnel water, and instanced
// seagulls. All placement uses fixed seeds, never Math.random().
import { RINGS, RUNWAY, TOUCHDOWN_ZONE, WORLD } from './config.js';
import { createRandom } from './random.js';

// Golden-hour sun: low from the east-north-east, warm light, long glitter
// path on the sea ahead of the plane on final approach. (Plain array at
// module level — THREE only exists as window.THREE inside createWorld3d.)
const SUN = [800, 340, -650];
const FOG_COLOR = 0xbcd9f5;
const FOG_NEAR = 600;
const FOG_FAR = 5000;

// Terrain colour by height and slope, the bright-day palette as the 2D
// game: wet sand at the waterline, dry beach, patchy meadows and forests,
// grey rock on steep cliffs, white snowy peaks.
function biomeRGB(x, y, z, slope) {
  const n = Math.sin(x * 0.045) * Math.cos(z * 0.045) * 2.5;
  if (y < 1.2) return [194 / 255, 168 / 255, 120 / 255]; // wet sand
  if (y < 4.5 + n * 0.4) return [230 / 255, 213 / 255, 167 / 255]; // dry beach
  if (slope > 0.32 && y > 8) {
    return slope > 0.5
      ? [82 / 255, 87 / 255, 93 / 255] // steep cliff rock, dark
      : [111 / 255, 116 / 255, 120 / 255]; // cliff rock, light
  }
  if (y > 140 + n * 2.5) return [244 / 255, 247 / 255, 251 / 255]; // snow peak
  if (y > 105) return [132 / 255, 118 / 255, 102 / 255]; // rock
  if (y > 55) return n > 0 ? [75 / 255, 127 / 255, 62 / 255] : [63 / 255, 110 / 255, 53 / 255]; // forest, patchy
  return n > 0 ? [112 / 255, 172 / 255, 82 / 255] : [100 / 255, 158 / 255, 72 / 255]; // meadow, patchy
}

// Find the steepest cliff on the north-west island's flank, for the
// waterfall: scan a fixed grid, keep the steepest point above 50 m.
// Deterministic — heightAt is a pure function of the seed.
function findWaterfallSpot(world) {
  let best = null;
  for (let x = -1650; x <= -850; x += 40) {
    for (let z = -1250; z <= -450; z += 40) {
      const h = world.heightAt(x, z);
      if (h < 50) continue;
      const gx = (world.heightAt(x + 20, z) - world.heightAt(x - 20, z)) / 40;
      const gz = (world.heightAt(x, z + 20) - world.heightAt(x, z - 20)) / 40;
      const g = Math.hypot(gx, gz);
      if (!best || g > best.g) best = { x, z, h, g, gx, gz };
    }
  }
  return best;
}

export function createWorld3d(world) {
  const THREE = window.THREE;
  const SUN_DIR = new THREE.Vector3(SUN[0], SUN[1], SUN[2]).normalize();
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  // --- Atmosphere: golden-hour sun, warm sky, haze ------------------------
  group.userData.skyColor = FOG_COLOR;

  const hemi = new THREE.HemisphereLight(0x9ecaff, 0x2c5e6e, 0.65);
  group.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff1d6, 1.45);
  sunLight.position.copy(SUN_DIR).multiplyScalar(1000);
  group.add(sunLight);

  // Gradient sky dome: deep blue zenith fading to a pale warm horizon,
  // with a glow and a hard disc around the sun. Replaces the flat blue
  // background and the old sun sphere.
  {
    const skyGeo = new THREE.SphereGeometry(3200, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: SUN_DIR.clone() },
        uZenith: { value: new THREE.Color(0x1e5aa8) },
        uHorizon: { value: new THREE.Color(FOG_COLOR) },
        uSunGlow: { value: new THREE.Color(0xffe1a8) },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunGlow;
        varying vec3 vWorldDir;
        void main() {
          vec3 d = normalize(vWorldDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
          float sunAmt = max(dot(d, uSunDir), 0.0);
          col += uSunGlow * pow(sunAmt, 10.0) * 0.45;
          col += vec3(1.0, 0.96, 0.85) * pow(sunAmt, 180.0) * 1.2;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    group.add(skyDome);

    // Soft sun glow sprite, additive, never fogged.
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,252,230,1)');
    g.addColorStop(0.2, 'rgba(255,220,150,0.55)');
    g.addColorStop(0.55, 'rgba(255,180,100,0.14)');
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }));
    sunSprite.position.copy(SUN_DIR).multiplyScalar(3200);
    sunSprite.scale.set(900, 900, 1);
    group.add(sunSprite);

    // God-ray shafts: five soft additive cones tilted along the sun
    // direction, standing over the main island's north water.
    const rayGeo = new THREE.ConeGeometry(45, 520, 10, 1, true);
    const rayMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffe6b3) } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vViewDir = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float edge = pow(abs(dot(vNormal, vViewDir)), 1.8);
          float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.3, vUv.y);
          gl_FragColor = vec4(uColor, edge * fade * 0.14);
        }
      `,
    });
    const rays = new THREE.InstancedMesh(rayGeo, rayMat, 5);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, SUN_DIR);
    for (let i = 0; i < 5; i += 1) {
      dummy.position.set((i - 2) * 180, 180, -250 + (i % 2) * 140);
      dummy.quaternion.copy(q);
      dummy.scale.set(0.8 + i * 0.15, 1, 0.8 + i * 0.15);
      dummy.updateMatrix();
      rays.setMatrixAt(i, dummy.matrix);
    }
    rays.instanceMatrix.needsUpdate = true;
    group.add(rays);
  }

  // --- Terrain: displaced plane, slope-aware biome colours -----------------
  const terrainGeo = new THREE.PlaneGeometry(WORLD.extent * 2, WORLD.extent * 2, 160, 160);
  terrainGeo.rotateX(-Math.PI / 2);
  {
    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      pos.setY(i, world.heightAt(pos.getX(i), pos.getZ(i)));
    }
    terrainGeo.computeVertexNormals();
    const norm = terrainGeo.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const slope = 1 - norm.getY(i);
      const [r, g, b] = biomeRGB(x, y, z, slope);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  terrain.matrixAutoUpdate = false;
  terrain.updateMatrix();
  group.add(terrain);

  // --- Water: animated waves, Fresnel sky reflection, sun glitter ---------
  // Replaces the flat sea plane. 96x96 subdivisions over 8 km: the wave
  // normals come from screen-space derivatives, so the glitter reads even
  // at this resolution. Fog is matched to the scene fog by hand — the
  // shader cannot read FogExp2's parameters, and the scene uses linear
  // fog (see render.js).
  let waterMat = null;
  {
    const geo = new THREE.PlaneGeometry(8000, 8000, 96, 96);
    geo.rotateX(-Math.PI / 2);
    waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: SUN_DIR.clone() },
        uDeepColor: { value: new THREE.Color(0x0b3b5c) },
        uShallowColor: { value: new THREE.Color(0x1f7a8c) },
        uSkyColor: { value: new THREE.Color(FOG_COLOR) },
        uFogColor: { value: new THREE.Color(FOG_COLOR) },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 p = position;
          float w1 = sin(p.x * 0.035 + uTime * 1.2) * cos(p.z * 0.03 + uTime * 0.9) * 0.7;
          float w2 = sin((p.x + p.z) * 0.07 - uTime * 1.8) * 0.3;
          p.y += w1 + w2;
          vWave = w1 + w2;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSkyColor;
        uniform vec3 uFogColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 dx = dFdx(vWorldPos);
          vec3 dy = dFdy(vWorldPos);
          vec3 N = normalize(cross(dy, dx));
          vec3 V = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.5);
          vec3 baseCol = mix(uDeepColor, uShallowColor, clamp(vWave * 0.5 + 0.5, 0.0, 1.0));
          vec3 col = mix(baseCol, uSkyColor, clamp(fresnel * 0.85, 0.0, 0.85));
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 140.0);
          col += vec3(1.0, 0.93, 0.78) * spec * 1.4;
          float dist = length(cameraPosition - vWorldPos);
          float fogF = smoothstep(uFogNear, uFogFar, dist);
          col = mix(col, uFogColor, fogF);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      extensions: { derivatives: true },
    });
    const water = new THREE.Mesh(geo, waterMat);
    water.position.y = 0.35;
    water.matrixAutoUpdate = false;
    water.updateMatrix();
    group.add(water);
  }

  // --- Waterfall on the north-west island's steep flank --------------------
  // A curved ribbon with a scrolling procedural texture, stood at the
  // base of the steepest cliff the scan finds, facing downhill.
  let waterfallTex = null;
  {
    const spot = findWaterfallSpot(world);
    if (spot) {
      const rng = createRandom(777);
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 64, 0);
      grad.addColorStop(0, 'rgba(200,235,255,0)');
      grad.addColorStop(0.25, 'rgba(220,245,255,0.85)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.75, 'rgba(220,245,255,0.85)');
      grad.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 128);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 18; i += 1) {
        ctx.fillRect(10 + rng.range(0, 44), rng.range(0, 128), 2 + rng.range(0, 3), 18 + rng.range(0, 25));
      }
      waterfallTex = new THREE.CanvasTexture(canvas);
      waterfallTex.wrapS = THREE.RepeatWrapping;
      waterfallTex.wrapT = THREE.RepeatWrapping;
      const yTop = spot.h;
      const yBottom = 2;
      const height = yTop - yBottom;
      const geo = new THREE.PlaneGeometry(8, height, 4, 10);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        const t = (pos.getY(i) + height / 2) / height;
        pos.setZ(i, Math.sin(t * Math.PI * 0.5) * 3.5);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({
        map: waterfallTex, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const downhill = Math.hypot(spot.gx, spot.gz) || 1;
      const px = spot.x + (spot.gx / downhill) * 10;
      const pz = spot.z + (spot.gz / downhill) * 10;
      mesh.position.set(px, (yTop + yBottom) / 2, pz);
      mesh.rotation.y = Math.atan2(spot.gx, spot.gz);
      group.add(mesh);
    }
  }

  // Clouds: one InstancedMesh, four puffs per seeded cloud. Basic
  // material (unlit white) so the puffs read as clouds, not dark rocks:
  // flat-shaded Lambert left their undersides almost black.
  {
    const puffGeo = new THREE.DodecahedronGeometry(1, 0);
    const puffMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const clouds = new THREE.InstancedMesh(puffGeo, puffMat, world.clouds.length * 4);
    let idx = 0;
    for (const cloud of world.clouds) {
      for (let p = 0; p < 4; p += 1) {
        const px = [-0.5, 0, 0.5, 0.2][p];
        const py = [0.1, -0.12, 0.08, 0.18][p];
        const ps = [0.62, 0.8, 0.66, 0.5][p];
        dummy.position.set(
          cloud.x + px * cloud.r,
          cloud.y + py * cloud.r * 0.5,
          cloud.z + (p % 2 === 0 ? 0.3 : -0.3) * cloud.r,
        );
        dummy.scale.set(cloud.r * ps, cloud.r * ps * 0.55, cloud.r * ps * 0.8);
        dummy.rotation.set(0, p * 0.7, 0);
        dummy.updateMatrix();
        clouds.setMatrixAt(idx, dummy.matrix);
        color.setHex(cloud.dark ? 0xcbd6e2 : 0xffffff);
        clouds.setColorAt(idx, color);
        idx += 1;
      }
    }
    clouds.instanceMatrix.needsUpdate = true;
    if (clouds.instanceColor) clouds.instanceColor.needsUpdate = true;
    clouds.frustumCulled = false;
    group.add(clouds);
  }

  // --- Trees: two InstancedMeshes (trunks + crowns) ------------------------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.7, 4, 5);
    trunkGeo.translate(0, 2, 0);
    const crownGeo = new THREE.ConeGeometry(3.2, 9, 6);
    crownGeo.translate(0, 7.5, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033, flatShading: true });
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const count = world.trees.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
    const greens = [0x2d5a27, 0x35692e, 0x244d21, 0x3f7535];
    for (let i = 0; i < count; i += 1) {
      const tree = world.trees[i];
      const s = tree.s / 10;
      dummy.position.set(tree.x, tree.y - 0.3, tree.z);
      dummy.rotation.set(0, (i * 2.39996) % (Math.PI * 2), 0);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      crowns.setMatrixAt(i, dummy.matrix);
      color.setHex(greens[i % greens.length]);
      crowns.setColorAt(i, color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.frustumCulled = false;
    crowns.frustumCulled = false;
    group.add(trunks);
    group.add(crowns);
  }

  // --- Broadleaf trees + coastal rocks (seeded, reproducible) --------------
  // 350 round-canopy trees beside the pines and 150 boulders along the
  // shores: denser silhouettes for the screenshots, three draw calls.
  {
    const rng = createRandom(2024);
    const broad = [];
    for (let i = 0; i < 350; i += 1) {
      const x = rng.range(-1900, 1900);
      const z = rng.range(-1900, 1900);
      const h = world.heightAt(x, z);
      if (h < 5 || h > 110) continue;
      if (Math.abs(x) < 60 && z > RUNWAY.zStart - 60 && z < RUNWAY.zEnd + 60) continue;
      broad.push({ x, z, y: h, s: rng.range(0.75, 1.4) });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 5);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c4033, flatShading: true });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broad.length);
    const crownGeo = new THREE.DodecahedronGeometry(2.6, 0);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, broad.length);
    const greens = [0x3a6b35, 0x4f8a42, 0x6b9e48, 0x2d5a27, 0x84a546];
    for (let i = 0; i < broad.length; i += 1) {
      const t = broad[i];
      dummy.position.set(t.x, t.y + 1.5 * t.s, t.z);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, t.y + 4.2 * t.s, t.z);
      dummy.scale.set(t.s * 1.15, t.s * 0.9, t.s * 1.15);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      color.setHex(greens[i % greens.length]);
      crowns.setColorAt(i, color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.frustumCulled = false;
    crowns.frustumCulled = false;
    group.add(trunks);
    group.add(crowns);

    const rocks = [];
    for (let i = 0; i < 150; i += 1) {
      const x = rng.range(-1900, 1900);
      const z = rng.range(-1900, 1900);
      const h = world.heightAt(x, z);
      if (h < 0.5 || h > 10) continue;
      rocks.push({ x, z, y: h, s: rng.range(0.8, 2.6) });
    }
    const rockGeo = new THREE.DodecahedronGeometry(1.8, 0);
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
    for (let i = 0; i < rocks.length; i += 1) {
      const r = rocks[i];
      dummy.position.set(r.x, r.y + 0.4, r.z);
      dummy.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      dummy.scale.set(r.s, r.s * rng.range(0.5, 1.1), r.s);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
      const v = 0.35 + rng.range(0, 0.2);
      color.setRGB(v, v * 1.02, v * 1.05);
      rockMesh.setColorAt(i, color);
    }
    rockMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    rockMesh.frustumCulled = false;
    group.add(rockMesh);
  }

  // --- Harbour town: landmark houses + extra seeded houses -----------------
  const wallColors = ['#f2e3c2', '#e8d9b0', '#f7ead0', '#e3cfa5'];
  const roofColors = ['#b8543f', '#c96f4a', '#a84a3a', '#8a5a3b'];
  {
    const houses = world.landmarks.houses.map((h) => ({
      x: h.x, y: h.y, z: h.z, w: h.w, hgt: h.h, wall: h.wall, roof: h.roof,
    }));
    // Extra houses around the same south-coast town, placed with a
    // fixed-seed RNG and seated on the terrain, so they are reproducible
    // and never float.
    const rng = createRandom(1337);
    for (let i = 0; i < 60 && houses.length < 44; i += 1) {
      const x = rng.range(-100, 400);
      const z = rng.range(930, 1180);
      const h = world.heightAt(x, z);
      if (h < 2 || h > 30) continue;
      if (houses.some((o) => Math.hypot(o.x - x, o.z - z) < 14)) continue;
      houses.push({
        x, y: h, z,
        w: rng.range(8, 13),
        hgt: rng.range(5, 10),
        wall: rng.pick(wallColors),
        roof: rng.pick(roofColors),
      });
    }
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    wallGeo.translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(1, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.translate(0, 0.5, 0);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, houses.length);
    const roofs = new THREE.InstancedMesh(roofGeo, roofMat, houses.length);
    for (let i = 0; i < houses.length; i += 1) {
      const h = houses[i];
      dummy.position.set(h.x, h.y, h.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(h.w, h.hgt, 8);
      dummy.updateMatrix();
      walls.setMatrixAt(i, dummy.matrix);
      color.set(h.wall);
      walls.setColorAt(i, color);
      dummy.position.set(h.x, h.y + h.hgt, h.z);
      dummy.scale.set(h.w * 0.75, 5, 6);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
      color.set(h.roof);
      roofs.setColorAt(i, color);
    }
    walls.instanceMatrix.needsUpdate = true;
    roofs.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    walls.frustumCulled = false;
    roofs.frustumCulled = false;
    group.add(walls);
    group.add(roofs);
    // A wooden pier reaching into the south water.
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(10, 1.5, 45),
      new THREE.MeshLambertMaterial({ color: 0x7a593c }),
    );
    pier.position.set(120, 1.2, 1150);
    group.add(pier);
  }

  // --- Lighthouse, beacon, windmill ------------------------------------------
  const beams = [];
  function makeTower(t, scale) {
    const tower = new THREE.Group();
    tower.position.set(t.x, t.y, t.z);
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5, flatShading: true });
    const redMat = new THREE.MeshLambertMaterial({ color: 0xcc2929, flatShading: true });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222, flatShading: true });
    const bands = 5;
    const bandH = 6 * scale;
    const rBottom = 4.2 * scale;
    const rTop = 2.4 * scale;
    for (let i = 0; i < bands; i += 1) {
      const t0 = i / bands;
      const t1 = (i + 1) / bands;
      const rb = rBottom + (rTop - rBottom) * t0;
      const rt = rBottom + (rTop - rBottom) * t1;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(rt, rb, bandH, 10),
        i % 2 === 0 ? whiteMat : redMat,
      );
      seg.position.y = i * bandH + bandH * 0.5;
      tower.add(seg);
    }
    const topY = bands * bandH;
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.1 * scale, 2.8 * scale, 0.8 * scale, 10), darkMat);
    deck.position.y = topY + 0.4 * scale;
    tower.add(deck);
    const lantern = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0 * scale, 2.0 * scale, 3.2 * scale, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff3a8 }),
    );
    lantern.position.y = topY + 2.4 * scale;
    tower.add(lantern);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4 * scale, 2.6 * scale, 10), redMat);
    cap.position.y = topY + 5.3 * scale;
    tower.add(cap);
    const beamGeo = new THREE.ConeGeometry(12 * scale, 85 * scale, 10, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    beamGeo.translate(0, 0, 42.5 * scale);
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff6b0, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = topY + 2.4 * scale;
    tower.add(beam);
    beams.push(beam);
    return tower;
  }
  group.add(makeTower(world.landmarks.lighthouse, world.landmarks.lighthouse.scale));
  group.add(makeTower(world.landmarks.beacon, world.landmarks.beacon.scale));

  let windmillBlades = null;
  {
    const w = world.landmarks.windmill;
    const mill = new THREE.Group();
    mill.position.set(w.x, w.y, w.z);
    const towerMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 5.5, 22, 8),
      new THREE.MeshLambertMaterial({ color: 0xefe3c8, flatShading: true }),
    );
    towerMesh.position.y = 11;
    mill.add(towerMesh);
    const capMesh = new THREE.Mesh(
      new THREE.ConeGeometry(3.6, 5, 8),
      new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true }),
    );
    capMesh.position.y = 24;
    mill.add(capMesh);
    windmillBlades = new THREE.Group();
    windmillBlades.position.set(-3.8, 21, 0);
    for (let k = 0; k < 4; k += 1) {
      const a = (k * Math.PI) / 2;
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 11, 0.9),
        new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true }),
      );
      blade.position.set(0, Math.sin(a) * 5.5, Math.cos(a) * 5.5);
      blade.rotation.x = a;
      windmillBlades.add(blade);
    }
    const hub = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x3a3f4a }),
    );
    windmillBlades.add(hub);
    mill.add(windmillBlades);
    group.add(mill);
  }

  // --- Sailboats: 14 instanced boats in the south water ---------------------
  // Replaces the three one-off boats: more boats on screen, two draw
  // calls instead of nine. Seeded placement, gentle bob per frame.
  const sailboats = [];
  let sailHulls = null;
  let sailSails = null;
  {
    const rng = createRandom(4242);
    const placements = [];
    for (let i = 0; i < 14; i += 1) {
      placements.push({
        x: rng.range(-400, 500),
        z: rng.range(1500, 1900),
        yaw: rng.range(0, Math.PI * 2),
        scale: rng.range(0.9, 1.3),
      });
    }
    const hullGeo = new THREE.BoxGeometry(2.4, 1.1, 7.5);
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    sailHulls = new THREE.InstancedMesh(hullGeo, hullMat, placements.length);
    const sailGeo = new THREE.ConeGeometry(3.2, 10, 3);
    sailGeo.scale(0.12, 1, 1);
    const sailMat = new THREE.MeshLambertMaterial({ color: 0xf8f9fa, flatShading: true, side: THREE.DoubleSide });
    sailSails = new THREE.InstancedMesh(sailGeo, sailMat, placements.length);
    const hullColors = [0x1d3557, 0x9b2226, 0xf1faee, 0x2b2d42];
    for (let i = 0; i < placements.length; i += 1) {
      const b = placements[i];
      sailboats.push(b);
      dummy.position.set(b.x, 0.5, b.z);
      dummy.rotation.set(0, b.yaw, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      sailHulls.setMatrixAt(i, dummy.matrix);
      color.setHex(hullColors[i % hullColors.length]);
      sailHulls.setColorAt(i, color);
      dummy.position.set(b.x, 6.0 * b.scale, b.z);
      dummy.updateMatrix();
      sailSails.setMatrixAt(i, dummy.matrix);
    }
    sailHulls.instanceMatrix.needsUpdate = true;
    sailSails.instanceMatrix.needsUpdate = true;
    if (sailHulls.instanceColor) sailHulls.instanceColor.needsUpdate = true;
    sailHulls.frustumCulled = false;
    sailSails.frustumCulled = false;
    group.add(sailHulls);
    group.add(sailSails);
  }

  // --- Hot air balloons: 8 bright envelopes high over the islands ---------
  // Hand-picked spots, all clear of the ring course and the runway
  // approach, so they read as scale and colour in the frames without ever
  // sitting in the flight path.
  {
    const spots = [
      [-1000, 320, 600], [900, 340, 1100], [-1500, 300, -1200], [1400, 360, -1000],
      [200, 380, -1600], [-600, 330, 1500], [1600, 300, 400], [-1600, 350, 100],
    ];
    const envGeo = new THREE.SphereGeometry(9, 14, 10);
    const pos = envGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      if (y < 0) {
        const taper = 1 + (y / 9) * 0.55;
        pos.setX(i, pos.getX(i) * taper);
        pos.setZ(i, pos.getZ(i) * taper);
        pos.setY(i, y * 1.35);
      }
    }
    envGeo.computeVertexNormals();
    const envMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const envelopes = new THREE.InstancedMesh(envGeo, envMat, spots.length);
    const basketGeo = new THREE.BoxGeometry(2.6, 2.2, 2.6);
    const basketMat = new THREE.MeshLambertMaterial({ color: 0x7c5333, flatShading: true });
    const baskets = new THREE.InstancedMesh(basketGeo, basketMat, spots.length);
    const palette = [0xe63946, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0x457b9d, 0xd62828, 0x8338ec, 0xff006e];
    for (let i = 0; i < spots.length; i += 1) {
      const [x, y, z] = spots[i];
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, i * 1.1, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      envelopes.setMatrixAt(i, dummy.matrix);
      color.setHex(palette[i % palette.length]);
      envelopes.setColorAt(i, color);
      dummy.position.set(x, y - 14.5, z);
      dummy.updateMatrix();
      baskets.setMatrixAt(i, dummy.matrix);
    }
    envelopes.instanceMatrix.needsUpdate = true;
    baskets.instanceMatrix.needsUpdate = true;
    if (envelopes.instanceColor) envelopes.instanceColor.needsUpdate = true;
    envelopes.frustumCulled = false;
    baskets.frustumCulled = false;
    group.add(envelopes);
    group.add(baskets);
  }

  // --- Seagulls: 40 instanced V-shapes circling the lighthouse & harbour --
  let birds = null;
  {
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, 0.6, -1.8, 0.4, -0.4, 0, 0, -0.4,
      0, 0, 0.6, 0, 0, -0.4, 1.8, 0.4, -0.4,
    ]), 3));
    birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(birdGeo, birdMat, 40);
    const rng = createRandom(5150);
    birds = [];
    const flocks = [
      { cx: -800, cy: 150, cz: -100, r: 60 },
      { cx: 120, cy: 110, cz: 1150, r: 80 },
    ];
    for (let i = 0; i < 40; i += 1) {
      const flock = flocks[i < 20 ? 0 : 1];
      birds.push({
        cx: flock.cx, cy: flock.cy, cz: flock.cz,
        r: flock.r * rng.range(0.7, 1.3),
        speed: rng.range(0.15, 0.35) * (i % 2 === 0 ? 1 : -1),
        phase: rng.range(0, Math.PI * 2),
        alt: rng.range(-12, 12),
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    birds.mesh = mesh;
  }

  // --- Rings: gold torus, axis along the course ------------------------------
  const ringMeshes = [];
  const goldMat = new THREE.MeshPhongMaterial({
    color: 0xffc82c, emissive: 0x664400, specular: 0xfff5b8, shininess: 90,
  });
  const doneMat = new THREE.MeshLambertMaterial({ color: 0x44cc66, transparent: true, opacity: 0.25 });
  const futureMat = new THREE.MeshLambertMaterial({ color: 0x59c2d6, transparent: true, opacity: 0.6 });
  const ringGeo = new THREE.TorusGeometry(RINGS[0].r, 1.5, 10, 28);
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < RINGS.length; i += 1) {
    const ring = RINGS[i];
    const prev = RINGS[Math.max(0, i - 1)];
    const next = RINGS[Math.min(RINGS.length - 1, i + 1)];
    const dir = new THREE.Vector3(next.x - prev.x, next.y - prev.y, next.z - prev.z).normalize();
    const mesh = new THREE.Mesh(ringGeo, futureMat);
    mesh.position.set(ring.x, ring.y, ring.z);
    mesh.quaternion.setFromUnitVectors(zAxis, dir);
    group.add(mesh);
    ringMeshes.push(mesh);
  }

  // --- Runway 36 ---------------------------------------------------------------
  {
    const rwy = new THREE.Group();
    rwy.position.set(RUNWAY.x, RUNWAY.elevation + 0.15, (RUNWAY.zStart + RUNWAY.zEnd) / 2);
    const length = RUNWAY.zEnd - RUNWAY.zStart;
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(RUNWAY.width, length),
      new THREE.MeshLambertMaterial({ color: 0x2b2d30 }),
    );
    deck.rotation.x = -Math.PI / 2;
    rwy.add(deck);
    // Centreline dashes.
    const dashCount = 24;
    const dashGeo = new THREE.PlaneGeometry(0.9, 12);
    dashGeo.rotateX(-Math.PI / 2);
    const dashes = new THREE.InstancedMesh(
      dashGeo,
      new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }),
      dashCount,
    );
    const usable = length - 70;
    for (let i = 0; i < dashCount; i += 1) {
      dummy.position.set(0, 0.05, -usable / 2 + (i / (dashCount - 1)) * usable);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    rwy.add(dashes);
    // The big 36 at the approach end, drawn on an offscreen canvas (offline).
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2d30';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#f2f2f2';
    ctx.font = 'bold 145px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('36', 128, 136);
    const numPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }),
    );
    numPlane.rotation.x = -Math.PI / 2;
    numPlane.position.set(0, 0.06, length / 2 - 22);
    rwy.add(numPlane);
    // Amber edge lights, both sides.
    const lightsPerSide = 22;
    const edgeLights = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.65, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffae19, fog: false }),
      lightsPerSide * 2,
    );
    let idx = 0;
    for (const side of [-1, 1]) {
      for (let i = 0; i < lightsPerSide; i += 1) {
        dummy.position.set(
          side * (RUNWAY.width / 2 + 1.4),
          0.7,
          -length / 2 + 8 + (i / (lightsPerSide - 1)) * (length - 16),
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        edgeLights.setMatrixAt(idx, dummy.matrix);
        idx += 1;
      }
    }
    edgeLights.instanceMatrix.needsUpdate = true;
    rwy.add(edgeLights);
    // Threshold lights: green at the approach end, red at the far end.
    const thr = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x7dff9a, fog: false }),
    );
    thr.position.set(0, 0.7, length / 2 - 6);
    rwy.add(thr);
    const far = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8a7a, fog: false }),
    );
    far.position.set(0, 0.7, -length / 2 + 6);
    rwy.add(far);
    // The gold touchdown zone for precision landing: a painted box on the
    // deck, 24 m wide and 200 m long, centred 300 m past the threshold.
    // Local z is measured from the runway centre, so subtract it.
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(TOUCHDOWN_ZONE.halfWidth * 2, TOUCHDOWN_ZONE.halfLength * 2),
      new THREE.MeshBasicMaterial({ color: 0xffd166, toneMapped: false }),
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(TOUCHDOWN_ZONE.x, 0.12, TOUCHDOWN_ZONE.z - (RUNWAY.zStart + RUNWAY.zEnd) / 2);
    rwy.add(zone);
    const zoneBorder = new THREE.Mesh(
      new THREE.PlaneGeometry(TOUCHDOWN_ZONE.halfWidth * 2 + 3, TOUCHDOWN_ZONE.halfLength * 2 + 3),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    zoneBorder.rotation.x = -Math.PI / 2;
    zoneBorder.position.set(TOUCHDOWN_ZONE.x, 0.1, TOUCHDOWN_ZONE.z - (RUNWAY.zStart + RUNWAY.zEnd) / 2);
    rwy.add(zoneBorder);
    group.add(rwy);
  }

  return {
    group,
    update(dt, time, worldState, mission) {
      // Rings: gold for the next one (pulsing), green when done, cyan after.
      // Precision landing has no rings, so none of them pulse gold there.
      for (let i = 0; i < ringMeshes.length; i += 1) {
        const mesh = ringMeshes[i];
        const passed = worldState.rings[i].passed;
        const isNext = mission !== 'precision' && i === worldState.ringIndex;
        if (passed) {
          if (mesh.material !== doneMat) mesh.material = doneMat;
          mesh.scale.setScalar(1);
        } else if (isNext) {
          if (mesh.material !== goldMat) mesh.material = goldMat;
          const pulse = 1 + 0.02 * Math.sin(time * 4);
          mesh.scale.setScalar(pulse);
        } else {
          if (mesh.material !== futureMat) mesh.material = futureMat;
          mesh.scale.setScalar(1);
        }
      }
      for (const beam of beams) beam.rotation.y += dt * 0.9;
      if (windmillBlades) windmillBlades.rotation.x += dt * 0.6;
      // Water waves + waterfall scroll follow the game clock.
      if (waterMat) waterMat.uniforms.uTime.value = time;
      if (waterfallTex) waterfallTex.offset.y += dt * 1.4;
      // Sailboats bob on the swell.
      if (sailHulls && sailSails) {
        for (let i = 0; i < sailboats.length; i += 1) {
          const b = sailboats[i];
          const bob = Math.sin(time * 0.8 + b.x) * 0.3;
          const roll = Math.sin(time * 0.6 + b.x) * 0.03;
          dummy.position.set(b.x, 0.5 + bob, b.z);
          dummy.rotation.set(0, b.yaw, roll);
          dummy.scale.setScalar(b.scale);
          dummy.updateMatrix();
          sailHulls.setMatrixAt(i, dummy.matrix);
          dummy.position.set(b.x, 6.0 * b.scale + bob, b.z);
          dummy.updateMatrix();
          sailSails.setMatrixAt(i, dummy.matrix);
        }
        sailHulls.instanceMatrix.needsUpdate = true;
        sailSails.instanceMatrix.needsUpdate = true;
      }
      // Seagulls circle their flock centres.
      if (birds && birds.mesh) {
        for (let i = 0; i < birds.length; i += 1) {
          const b = birds[i];
          const a = b.phase + time * b.speed;
          dummy.position.set(
            b.cx + Math.cos(a) * b.r,
            b.cy + b.alt + Math.sin(time * 0.7 + b.phase) * 5,
            b.cz + Math.sin(a) * b.r,
          );
          dummy.rotation.set(0, -a, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          birds.mesh.setMatrixAt(i, dummy.matrix);
        }
        birds.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
