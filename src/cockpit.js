// The cockpit: what the pilot sees from inside the island jet in daylight.
// One job — paint the canopy frame, the lit dashboard and the aiming
// reticle over the 3D world. The world itself is drawn by the renderer;
// this file only draws screen-space cockpit furniture, so the same plane
// state drives both the chase view and this one.
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// A lit dial on the dashboard: dark face, glowing arc, needle, readout.
function dial(ctx, x, y, r, label, valueText, fraction, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.92)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r - 3, 0, TAU);
  ctx.stroke();
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, r - 10, start, start + sweep);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, r - 10, start, start + sweep * clamp(fraction, 0, 1));
  ctx.stroke();
  const ang = start + sweep * clamp(fraction, 0, 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ang) * (r - 24), y + Math.sin(ang) * (r - 24));
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(valueText, x, y + r * 0.3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '10px sans-serif';
  ctx.fillText(label, x, y - r * 0.42);
}

export function drawCockpit(ctx, width, height, plane, world, time) {
  const knots = Math.round(plane.speed * 1.944);
  const feet = Math.round(plane.y * 3.281);
  const headingDeg = (((plane.heading * 180) / Math.PI) % 360 + 360) % 360;

  // --- Canopy frame: top bar, side pillars and a centre bow. -----------
  const frame = ctx.createLinearGradient(0, 0, 0, 90);
  frame.addColorStop(0, '#0a0e18');
  frame.addColorStop(1, 'rgba(10, 14, 24, 0.85)');
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, width, 26);
  // Side pillars, leaning in as they rise.
  ctx.fillStyle = '#0a0e18';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(26, 0);
  ctx.lineTo(96, height * 0.62);
  ctx.lineTo(58, height * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(width, 0);
  ctx.lineTo(width - 26, 0);
  ctx.lineTo(width - 96, height * 0.62);
  ctx.lineTo(width - 58, height * 0.62);
  ctx.closePath();
  ctx.fill();
  // Centre bow over the windscreen.
  ctx.fillStyle = 'rgba(10, 14, 24, 0.9)';
  ctx.fillRect(width / 2 - 7, 0, 14, 64);
  // A faint diagonal glare across the glass.
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(width * 0.18, 0);
  ctx.lineTo(width * 0.34, 0);
  ctx.lineTo(width * 0.1, height * 0.5);
  ctx.lineTo(width * 0.02, height * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Vignette: the world darkens toward the corners, like looking through glass.
  const vig = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.42,
    width / 2, height / 2, Math.max(width, height) * 0.72,
  );
  vig.addColorStop(0, 'rgba(4, 6, 14, 0)');
  vig.addColorStop(1, 'rgba(4, 6, 14, 0.38)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  // --- Aiming reticle: a small ring and dot where the nose points. ------
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 14, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 2, 0, TAU);
  ctx.fill();

  // --- Dashboard: a dark panel with lit instruments. ---------------------
  const panelY = height - 168;
  // The jet's nose, peeking over the dashboard: a pointed sliver of cream
  // fuselage with its red cheatline, drawn before the panel so the panel
  // hides its base — the cockpit view still shows the jet.
  ctx.fillStyle = '#e8dcc2';
  ctx.beginPath();
  ctx.moveTo(width / 2, panelY - 46);
  ctx.lineTo(width / 2 - 30, panelY + 26);
  ctx.lineTo(width / 2 + 30, panelY + 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(width / 2, panelY - 46);
  ctx.lineTo(width / 2 - 7, panelY + 26);
  ctx.lineTo(width / 2 + 7, panelY + 26);
  ctx.closePath();
  ctx.fill();
  const panel = ctx.createLinearGradient(0, panelY, 0, height);
  panel.addColorStop(0, '#141b28');
  panel.addColorStop(1, '#05080f');
  ctx.fillStyle = panel;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, panelY + 14);
  ctx.quadraticCurveTo(0, panelY, 14, panelY);
  ctx.lineTo(width - 14, panelY);
  ctx.quadraticCurveTo(width, panelY, width, panelY + 14);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  // Gold pinstripe along the panel's top edge.
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, panelY + 1);
  ctx.lineTo(width, panelY + 1);
  ctx.stroke();

  // Compass tape across the panel's top strip.
  const tapeY = panelY + 24;
  const dirs = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = -60; d <= 60; d += 15) {
    const h = (((Math.round(headingDeg) + d) % 360) + 360) % 360;
    const x = width / 2 + d * 2.6;
    const major = h % 45 === 0;
    ctx.strokeStyle = major ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, tapeY - 8);
    ctx.lineTo(x, major ? tapeY + 4 : tapeY);
    ctx.stroke();
    if (major) {
      const dir = dirs.find(([deg]) => deg === h);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dir ? dir[1] : String(h).padStart(3, '0'), x, tapeY + 13);
    }
  }
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 7, panelY + 2);
  ctx.lineTo(width / 2 + 7, panelY + 2);
  ctx.lineTo(width / 2, panelY + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(String(Math.round(headingDeg)).padStart(3, '0'), width / 2, tapeY + 13);

  // Dials: airspeed left, attitude centre, altitude right.
  const dialY = panelY + 96;
  dial(ctx, 150, dialY, 50, 'AIRSPEED', `${knots} KT`, plane.speed / 96, '#7ddbff');
  dial(ctx, width - 150, dialY, 50, 'ALTITUDE', `${feet.toLocaleString('en-US')} FT`, clamp(plane.y / 420, 0, 1), '#ffd166');

  // Attitude ball, centre of the panel.
  const ax = width / 2;
  const ay = dialY;
  const ar = 46;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, TAU);
  ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-plane.roll);
  ctx.translate(0, plane.pitch * ar * 1.4);
  ctx.fillStyle = '#3d6ea8';
  ctx.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
  ctx.fillStyle = '#6b4a30';
  ctx.fillRect(-ar, 0, ar * 2, ar * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-ar, -1, ar * 2, 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(ax - 14, ay);
  ctx.lineTo(ax + 14, ay);
  ctx.lineTo(ax, ay + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', ax, ay + ar + 13);

  // Throttle and fuel bars, between the airspeed dial and the attitude ball.
  const bx = 240;
  const by = panelY + 72;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', bx, by + 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(bx, by + 14, 150, 10);
  ctx.fillStyle = '#7ddbff';
  ctx.fillRect(bx, by + 14, 150 * plane.throttle, 10);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fillText('FUEL', bx, by + 42);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(bx, by + 50, 150, 10);
  ctx.fillStyle = plane.fuel < 20 ? '#ff8a7a' : '#7ddb8a';
  ctx.fillRect(bx, by + 50, 150 * (plane.fuel / 100), 10);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(`${Math.round(plane.fuel)}%`, bx + 158, by + 58);
  // Low-fuel warning lamp.
  if (plane.fuel < 20) {
    const blink = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.fillStyle = `rgba(255, 90, 70, ${blink})`;
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('⚠ LOW FUEL', bx, by + 84);
  }

  // Rings, time and score, between the attitude ball and the altimeter.
  const rx = width - 420;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`◉ RINGS ${plane.rings}/8`, rx, by + 6);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px sans-serif';
  const mins = Math.floor(plane.time / 60);
  const secs = Math.floor(plane.time % 60);
  ctx.fillText(`TIME ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, rx, by + 30);
  ctx.fillText(`SCORE ${plane.score.toLocaleString('en-US')}`, rx, by + 54);

  // Centre message (ring passed, low fuel) above the panel.
  if (plane.time < plane.messageUntil && plane.message) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px sans-serif';
    ctx.save();
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(plane.message, width / 2, height * 0.3);
    ctx.restore();
  }

  // Off-screen next-ring chevron: point left or right along the panel top.
  const next = world.nextRing();
  if (next) {
    const bearing = Math.atan2(next.x - plane.x, -(next.z - plane.z));
    const diff = wrapAngle(bearing - plane.heading);
    if (Math.abs(diff) > 0.6) {
      const left = diff < 0;
      const ex = left ? 46 : width - 46;
      const ey = height * 0.42;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(left ? Math.PI : 0);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillText('NEXT RING', left ? ex + 26 : ex - 26, ey + 4);
    }
  }
}
