// The 3D island jet, built from primitives: a pointed nose, swept delta
// wings, twin canted red tails, a dark canopy and twin exhaust glows.
// Local space: forward is -Z, right is +X, up is +Y — the same basis the
// flight model uses, so the mesh takes the plane's heading/pitch/roll
// straight from the Euler angles (pitch, -heading, -roll, 'YXZ').
export function createJet() {
  const THREE = window.THREE;
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: 0xd9e1e8, shininess: 40, flatShading: true });
  const accentMat = new THREE.MeshPhongMaterial({ color: 0xc92a2a, shininess: 30, flatShading: true });
  const canopyMat = new THREE.MeshPhongMaterial({ color: 0x101820, specular: 0x88ccff, shininess: 110 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2b3036, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff8822, transparent: true, opacity: 0.85 });

  // Fuselage: slim nose, fatter tail. rotation.x = PI/2 puts the top
  // radius (0.85) at the tail (+Z) and the bottom radius (0.65) at the
  // nose (-Z).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.65, 7.5, 8), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.2;
  root.add(fuselage);

  // Pointed nose cone, tip forward.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.4, 8), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.25;
  root.add(nose);

  // Dark canopy bubble, swept back from the nose.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.58, 10, 8), canopyMat);
  canopy.scale.set(0.95, 0.72, 2.6);
  canopy.position.set(0, 0.58, -1.6);
  root.add(canopy);

  // Swept delta wing: one extruded shape, leading edge forward.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -2.0);
  wingShape.lineTo(5.4, 2.4);
  wingShape.lineTo(5.4, 3.2);
  wingShape.lineTo(0, 2.7);
  wingShape.lineTo(-5.4, 3.2);
  wingShape.lineTo(-5.4, 2.4);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.16, bevelEnabled: false });
  wingGeo.rotateX(Math.PI / 2);
  const wings = new THREE.Mesh(wingGeo, bodyMat);
  wings.position.set(0, 0.05, 0.3);
  root.add(wings);

  // Red wingtip caps.
  for (const wx of [-5.1, 5.1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.85), accentMat);
    tip.position.set(wx, 0.0, 2.95);
    root.add(tip);
  }

  // Navigation lights: red port (-X), green starboard (+X).
  const navRed = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  navRed.position.set(-5.35, 0.05, 2.8);
  root.add(navRed);
  const navGreen = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0x30e06a }),
  );
  navGreen.position.set(5.35, 0.05, 2.8);
  root.add(navGreen);

  // Stabilators: small tailplanes at the rear.
  for (const side of [-1, 1]) {
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.3), bodyMat);
    stab.position.set(side * 1.35, 0.35, 2.7);
    stab.rotation.y = -side * 0.12;
    root.add(stab);
  }

  // Twin canted tail fins, red.
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(1.7, 0);
  tailShape.lineTo(2.4, 1.9);
  tailShape.lineTo(1.3, 1.9);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.12, bevelEnabled: false });
  tailGeo.rotateY(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(tailGeo, accentMat);
    fin.position.set(side * 0.75, 0.3, 2.2);
    fin.rotation.z = -side * 0.32;
    root.add(fin);
  }

  // Twin exhausts: dark nozzles with glowing cones that stretch with
  // throttle and flicker with time (a sine, so the frame stays
  // reproducible for a given time).
  const glows = [];
  for (const ex of [-0.42, 0.42]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.9, 8), darkMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(ex, -0.05, 4.15);
    root.add(nozzle);
    const glowGeo = new THREE.ConeGeometry(0.28, 2.4, 8);
    glowGeo.rotateX(Math.PI / 2);
    glowGeo.translate(0, 0, 1.2);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(ex, -0.05, 4.55);
    root.add(glow);
    glows.push(glow);
  }

  // Match the v3 jet's size: ~8.6 m span, ~8.8 m long.
  root.scale.setScalar(0.8);

  return {
    mesh: root,
    updateThrottle(throttle, time) {
      const s = 0.25 + throttle * 1.4;
      for (let i = 0; i < glows.length; i += 1) {
        const flicker = 0.9 + 0.1 * Math.sin(time * 31 + (i === 0 ? -0.42 : 0.42) * 9);
        glows[i].visible = throttle > 0.05;
        glows[i].scale.set(0.8 + throttle * 0.3, 0.8 + throttle * 0.3, s * flicker);
      }
    },
  };
}
