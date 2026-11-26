// The renderer: a real Three.js 3D scene — terrain, sea, sky, the jet —
// with the HUD, cockpit, title and end screens painted on a transparent
// 2D canvas stacked over the WebGL canvas. Same API as the 2D renderer
// (setView / toggleView / getView / burst / smoke / draw), so main.js,
// shots.js and the smoke tests work unchanged. Screens: title (slow orbit
// over the island), play, paused, over, landed. Views: chase (the jet in
// frame) and cockpit (from the pilot's seat, dashboard by cockpit.js).
// The world is a bright blue day: a high sun, a blue sky, white puffy
// clouds, and the lighthouse beam sweeping the water.
import { RUNWAY, WORLD } from './config.js';
import { MISSIONS, formatClock } from './missions.js';
import { createWorld3d } from './world3d.js';
import { createJet } from './jet.js';
import { drawHUD, drawOverlay, drawTitle } from './hud.js';
import { drawCockpit } from './cockpit.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_LANDED = 'landed';

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Software rasterisers (SwiftShader, llvmpipe) pay a steep price for
// multisampling and cannot hold 60 fps at 1280x720 anyway; real GPUs get
// the antialiased path. Adaptive quality, not a benchmark trick: the
// scene is identical, only the edge smoothing changes.
function isSoftwareGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return false;
    return /swiftshader|llvmpipe|software|basic render/i.test(
      String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || ''),
    );
  } catch {
    return false;
  }
}

export function createRenderer(canvas) {
  const THREE = window.THREE;
  if (!THREE) throw new Error('three.min.js did not load — the game needs its vendored library');
  let width = 0;
  let height = 0;
  let dpr = 1;
  let viewMode = 'chase';
  let fps = 60;
  let overlayAccum = 0;
  let overlayDrawn = false;

  // The 2D overlay canvas: transparent, stacked over the WebGL canvas,
  // never intercepting input.
  const overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
  document.body.appendChild(overlay);
  const octx = overlay.getContext('2d');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isSoftwareGL(), powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  // Golden-hour grade: ACES filmic tone mapping + sRGB output, exposure
  // lifted a touch to keep the warm low sun from muddying the day.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  // Pale horizon blue, linear fog matched to the water shader's fog
  // (world3d.js FOG_NEAR/FOG_FAR): haze swallows the far islands while
  // the near field stays crisp.
  scene.background = new THREE.Color(0xbcd9f5);
  scene.fog = new THREE.Fog(0xbcd9f5, 600, 5000);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);

  let world3d = null;
  let jet = null;

  function resize() {
    dpr = Math.min(1.5, window.devicePixelRatio || 1);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    overlay.width = Math.round(width * dpr);
    overlay.height = Math.round(height * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  // --- Particles: one THREE.Points cloud, gold bursts and grey smoke -----
  const MAXP = 240;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  for (let i = 0; i < MAXP; i += 1) pPos[i * 3 + 1] = -5000;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ size: 3, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  points.frustumCulled = false;
  scene.add(points);
  const pool = [];
  for (let i = 0; i < MAXP; i += 1) {
    pool.push({ x: 0, y: -5000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 1e9, r: 1, g: 1, b: 1 });
  }
  let poolNext = 0;
  function spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const pt = pool[poolNext];
    poolNext = (poolNext + 1) % MAXP;
    pt.x = x;
    pt.y = y;
    pt.z = z;
    pt.vx = vx;
    pt.vy = vy;
    pt.vz = vz;
    pt.life = life;
    pt.age = 0;
    pt.r = r;
    pt.g = g;
    pt.b = b;
  }
  function burst(x, y, z) {
    for (let i = 0; i < 42; i += 1) {
      const a = Math.random() * TAU;
      const b = Math.random() * TAU;
      const sp = 14 + Math.random() * 26;
      spawn(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp,
        0.9 + Math.random() * 0.5, 1, 0.82, 0.4);
    }
  }
  function smoke(x, y, z) {
    for (let i = 0; i < 26; i += 1) {
      spawn(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4, 3 + Math.random() * 5, (Math.random() - 0.5) * 4,
        1.4 + Math.random() * 0.8, 0.47, 0.47, 0.49);
    }
  }
  function updateParticles(dt) {
    for (let i = 0; i < MAXP; i += 1) {
      const pt = pool[i];
      pt.age += dt;
      if (pt.age >= pt.life) {
        pPos[i * 3 + 1] = -5000;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z += pt.vz * dt;
      pPos[i * 3] = pt.x;
      pPos[i * 3 + 1] = pt.y;
      pPos[i * 3 + 2] = pt.z;
      pCol[i * 3] = pt.r;
      pCol[i * 3 + 1] = pt.g;
      pCol[i * 3 + 2] = pt.b;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  // --- Camera ---------------------------------------------------------------
  // Scratch objects, allocated once: nothing per frame.
  const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const scratchQuat = new THREE.Quaternion();
  const scratchV1 = new THREE.Vector3();
  const scratchV2 = new THREE.Vector3();
  const scratchV3 = new THREE.Vector3();
  const chasePos = new THREE.Vector3();
  const chaseLook = new THREE.Vector3();
  let chaseInit = false;

  function updateCamera(plane, screen, time) {
    if (screen === SCREEN_TITLE) {
      const a = time * 0.045;
      camera.position.set(Math.sin(a) * 1500, 380, Math.cos(a) * 1500);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 70, 0);
      return;
    }
    const jetPos = scratchV1.set(plane.x, plane.y, plane.z);
    scratchEuler.set(plane.pitch, -plane.heading, -plane.roll, 'YXZ');
    scratchQuat.setFromEuler(scratchEuler);
    if (viewMode === 'cockpit') {
      // In the pilot's seat, looking where the nose points, banking with
      // the plane — the full roll, so a turn feels like a turn.
      scratchV2.set(0, 1.05, -1.55).applyQuaternion(scratchQuat).add(jetPos);
      camera.position.copy(scratchV2);
      scratchV3.set(0, 0.9, -40).applyQuaternion(scratchQuat).add(jetPos);
      camera.up.set(0, 1, 0).applyQuaternion(scratchQuat);
      camera.lookAt(scratchV3);
      return;
    }
    // Chase: behind and above the jet, smoothed, banking with the plane
    // but only half as much, so the horizon tilts without losing bearings.
    scratchV2.set(0, 3.8, 13.5).applyQuaternion(scratchQuat).add(jetPos);
    scratchV3.set(0, 1.0, -30).applyQuaternion(scratchQuat).add(jetPos);
    const frameDt = 1 / 60;
    if (!chaseInit) {
      chasePos.copy(scratchV2);
      chaseLook.copy(scratchV3);
      chaseInit = true;
    } else {
      chasePos.lerp(scratchV2, 1 - Math.exp(-6.5 * frameDt));
      chaseLook.lerp(scratchV3, 1 - Math.exp(-10.0 * frameDt));
    }
    camera.position.copy(chasePos);
    scratchEuler.set(plane.pitch, -plane.heading, -plane.roll * 0.55, 'YXZ');
    scratchQuat.setFromEuler(scratchEuler);
    camera.up.set(0, 1, 0).applyQuaternion(scratchQuat);
    camera.lookAt(chaseLook);
  }

  // Project a world point to overlay pixels (null when behind the camera).
  const projV = new THREE.Vector3();
  function project(x, y, z) {
    projV.set(x, y, z).project(camera);
    if (projV.z > 1) return null;
    return { x: (projV.x * 0.5 + 0.5) * width, y: (-projV.y * 0.5 + 0.5) * height };
  }

  return {
    setView(mode) {
      if (mode === 'cockpit' || mode === 'chase') {
        viewMode = mode;
        chaseInit = false;
      }
    },
    toggleView() {
      viewMode = viewMode === 'cockpit' ? 'chase' : 'cockpit';
      chaseInit = false;
    },
    getView() {
      return viewMode;
    },
    getFPS() {
      return fps;
    },
    getCalls() {
      return renderer.info.render.calls;
    },
    getTriangles() {
      return renderer.info.render.triangles;
    },
    burst(x, y, z) {
      burst(x, y, z);
    },
    smoke(x, y, z) {
      smoke(x, y, z);
    },
    draw(state, screen, best, time, dt) {
      const { plane, world } = state;
      if (!world3d) {
        world3d = createWorld3d(world);
        scene.add(world3d.group);
        jet = createJet();
        scene.add(jet.mesh);
      }
      if (dt > 0) fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;

      // The jet takes the plane's attitude straight from the flight model.
      scratchEuler.set(plane.pitch, -plane.heading, -plane.roll, 'YXZ');
      jet.mesh.quaternion.setFromEuler(scratchEuler);
      jet.mesh.position.set(plane.x, plane.y, plane.z);
      jet.mesh.visible = screen !== SCREEN_TITLE && viewMode !== 'cockpit';
      jet.updateThrottle(plane.throttle, time);

      updateCamera(plane, screen, time);
      world3d.update(dt, time, world, plane.mission);
      updateParticles(dt);
      renderer.render(scene, camera);

      // 2D overlay: HUD, cockpit furniture, title and end screens.
      // Redrawn at most every 66 ms — the gauges' shadowBlur is the
      // slowest part of a frame in software rendering — and always on
      // the first frame, so staged screenshots are complete.
      overlayAccum += dt;
      if (overlayAccum >= 0.066 || !overlayDrawn) {
        overlayAccum = 0;
        overlayDrawn = true;
        octx.clearRect(0, 0, width, height);
      if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
        if (viewMode === 'cockpit') drawCockpit(octx, width, height, plane, world, time);
        else drawHUD(octx, width, height, plane, world, time, fps, project);
      }
      if (screen === SCREEN_TITLE) {
        drawTitle(octx, width, height, best.byMission, best.selected, best.titleView, best.menuSel);
      } else if (screen === SCREEN_PAUSED) {
        drawOverlay(octx, width, height, 'PAUSED', ['P or Esc to keep flying', 'R to start over'], '#7ddbff');
      } else if (screen === SCREEN_OVER) {
        const mission = MISSIONS[plane.mission] || MISSIONS.rings;
        drawOverlay(octx, width, height, 'CRASHED', [
          plane.crashReason || 'The flight is over.',
          `${mission.name} — Score: ${plane.score.toLocaleString('en-US')}`,
          'Press R to fly again',
        ], '#ff8a7a');
      } else if (screen === SCREEN_LANDED) {
        const mission = MISSIONS[plane.mission] || MISSIONS.rings;
        let detail;
        if (plane.mission === 'time' && plane.timeTrial) {
          const gold = plane.timeTrial.time < 120;
          detail = `Time trial finished in ${formatClock(plane.timeTrial.time)} — ${gold ? 'GOLD! Under 2:00' : 'gold is under 2:00'} — bonus +${plane.timeTrial.bonus.toLocaleString('en-US')}`;
        } else if (plane.mission === 'precision' && plane.touchdown) {
          detail = `Touchdown ${plane.touchdown.dist} m from the zone centre — ${plane.touchdown.vspeed.toFixed(1)} m/s down`;
        } else {
          detail = `Score: ${plane.score.toLocaleString('en-US')} — Rings: ${plane.rings}/8 — Time: ${formatClock(plane.time)}`;
        }
        drawOverlay(octx, width, height, 'TOUCHDOWN — RUNWAY 36', [
          `${mission.name} — a clean landing on the Meridian Isles strip.`,
          detail,
          'Press R to fly again',
        ], '#7ddb8a');
      }
      }
    },
  };
}
