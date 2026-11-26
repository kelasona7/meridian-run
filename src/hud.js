// The 2D overlay: HUD, title screen and end screens, painted on a
// transparent 2D canvas stacked over the WebGL canvas. The 3D world is
// drawn by render.js; this file only draws screen-space furniture, so the
// same plane state drives both the chase view and the cockpit view.
// `project` maps a world point to screen pixels (or null when behind the
// camera) and comes from the Three.js camera in render.js.
import { MISSIONS, MISSION_ORDER, formatClock } from './missions.js';
import { TOUCHDOWN_ZONE } from './config.js';
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function gauge(ctx, x, y, r, label, valueText, fraction, color) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(12, 18, 28, 0.72)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r - 3, 0, TAU);
  ctx.stroke();
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
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
  ctx.fillText(valueText, x, y + r * 0.28);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '10px sans-serif';
  ctx.fillText(label, x, y - r * 0.42);
}

export function drawHUD(ctx, width, height, plane, world, time, fps, project) {
  const knots = Math.round(plane.speed * 1.944);
  const feet = Math.round(plane.y * 3.281);
  const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;

  // Frame-rate readout, top-left: the "60 FPS" the edition promises.
  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 28, 0.62)';
  ctx.fillRect(14, 12, 92, 26);
  ctx.fillStyle = fps >= 55 ? '#7ddb8a' : fps >= 30 ? '#ffd166' : '#ff8a7a';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(fps)} FPS`, 24, 26);
  ctx.restore();

  // Compass tape across the top.
  ctx.save();
  ctx.fillStyle = 'rgba(12, 18, 28, 0.62)';
  ctx.fillRect(width / 2 - 190, 12, 380, 34);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.strokeRect(width / 2 - 190, 12, 380, 34);
  const dirs = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = -60; d <= 60; d += 15) {
    const h = ((Math.round(headingDeg) + d) % 360 + 360) % 360;
    const x = width / 2 + d * 2.6;
    const major = h % 45 === 0;
    ctx.strokeStyle = major ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, major ? 30 : 26);
    ctx.stroke();
    if (major) {
      const dir = dirs.find(([deg]) => deg === h);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dir ? dir[1] : String(h).padStart(3, '0'), x, 38);
    }
  }
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(width / 2 - 7, 12);
  ctx.lineTo(width / 2 + 7, 12);
  ctx.lineTo(width / 2, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(String(Math.round(headingDeg)).padStart(3, '0'), width / 2, 56);
  ctx.restore();

  // Mission banner: the active mission and its objective, under the compass.
  const mission = MISSIONS[plane.mission] || MISSIONS.rings;
  const bannerText = `${mission.name} — ${mission.hudGoal}`;
  ctx.save();
  ctx.font = 'bold 13px sans-serif';
  const bannerW = Math.min(760, ctx.measureText(bannerText).width + 28);
  ctx.fillStyle = 'rgba(12, 18, 28, 0.62)';
  ctx.fillRect(width / 2 - bannerW / 2, 66, bannerW, 24);
  ctx.fillStyle = '#ffd166';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bannerText, width / 2, 79);
  ctx.restore();

  // Airspeed (left) and altitude (right): lit instruments.
  gauge(ctx, 74, 92, 52, 'AIRSPEED', `${knots} KT`, plane.speed / 96, '#7ddbff');
  gauge(ctx, width - 74, 92, 52, 'ALTITUDE', `${feet.toLocaleString('en-US')} FT`, clamp(plane.y / 420, 0, 1), '#ffd166');
  const vs = plane.verticalSpeed;
  ctx.fillStyle = vs > 0.5 ? '#7ddb8a' : vs < -0.5 ? '#ff8a7a' : 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(vs > 0.5 ? '▲ CLIMB' : vs < -0.5 ? '▼ SINK' : '— LEVEL', width - 74, 158);

  // Attitude indicator, bottom-left of centre.
  const ax = width / 2 - 150;
  const ay = height - 92;
  const ar = 44;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, TAU);
  ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-plane.roll);
  ctx.translate(0, plane.pitch * ar * 1.4);
  ctx.fillStyle = '#5b8fc9';
  ctx.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
  ctx.fillStyle = '#8a6b46';
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
  ctx.fillText('ATTITUDE', ax, ay + ar + 14);

  // Throttle and fuel, bottom-left.
  const bx = 26;
  const by = height - 118;
  ctx.fillStyle = 'rgba(12, 18, 28, 0.62)';
  ctx.fillRect(bx - 6, by - 8, 190, 96);
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

  // Mission panel, bottom-right: what this mission scores on.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(12, 18, 28, 0.62)';
  ctx.fillRect(width - 216, height - 118, 190, 96);
  if (plane.mission === 'time') {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`◷ ${formatClock(plane.time)}`, width - 36, height - 88);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('GOLD UNDER 2:00', width - 36, height - 60);
    ctx.fillText(`CHECKPOINTS ${plane.rings}/8`, width - 36, height - 38);
  } else if (plane.mission === 'precision') {
    const dist = Math.hypot(plane.x - TOUCHDOWN_ZONE.x, plane.z - TOUCHDOWN_ZONE.z);
    const vs = plane.verticalSpeed;
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`◎ ZONE ${Math.round(dist)} m`, width - 36, height - 88);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`${vs >= 0 ? '▲ CLIMB' : '▼ SINK'} ${Math.abs(vs).toFixed(1)} m/s`, width - 36, height - 60);
    ctx.fillText(`SCORE ${plane.score.toLocaleString('en-US')}`, width - 36, height - 38);
  } else {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`◉ RINGS ${plane.rings}/8`, width - 36, height - 88);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    const mins = Math.floor(plane.time / 60);
    const secs = Math.floor(plane.time % 60);
    ctx.fillText(`TIME ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, width - 36, height - 60);
    ctx.fillText(`SCORE ${plane.score.toLocaleString('en-US')}`, width - 36, height - 38);
  }

  // Centre message.
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

  // Next-ring arrow when the ring is off-screen (ring missions only:
  // precision landing has no rings to chase).
  const next = plane.mission === 'precision' ? null : world.nextRing();
  if (next && project) {
    const p = project(next.x, next.y, next.z);
    if (p && (p.x < 0 || p.x > width || p.y < 0 || p.y > height)) {
      const ang = Math.atan2(p.y - height / 2, p.x - width / 2);
      const ex = width / 2 + Math.cos(ang) * (Math.min(width, height) * 0.36);
      const ey = height / 2 + Math.sin(ang) * (Math.min(width, height) * 0.36);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

// Mission rows on the title screen: one source of geometry for drawing
// and for click hit-testing, so a click on a row always picks that mission.
export function titleMissionRows(width, height) {
  const rows = [];
  let y = height * 0.3 + 176;
  for (const id of MISSION_ORDER) {
    rows.push({ id, x: width / 2 - 350, y, w: 700, h: 50 });
    y += 58;
  }
  return rows;
}

export function missionAtPoint(x, y, width, height) {
  for (const row of titleMissionRows(width, height)) {
    if (x >= row.x && x <= row.x + row.w && y >= row.y && y <= row.y + row.h) return row.id;
  }
  return null;
}

export function drawTitle(ctx, width, height, bestByMission, selected) {
  const bests = bestByMission || { rings: 0, time: 0, precision: 0 };
  const chosen = selected || 'rings';
  ctx.save();
  ctx.fillStyle = 'rgba(6, 18, 38, 0.72)';
  const panelX = width / 2 - 430;
  const panelY = height * 0.3 - 80;
  const panelW = 860;
  const panelH = 540;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 18);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#ffd166';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#fff6dc';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('MERIDIAN RUN', width / 2, height * 0.3);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Fly all 8 rings over the islands — then land on runway 36', width / 2, height * 0.3 + 40);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  const lines = [
    '↑ ↓ pitch      ← → bank & turn      SHIFT throttle up      CTRL throttle down',
    'Mouse steers like a stick      V cockpit / chase view      P pause      R restart',
    'Watch your fuel — empty tanks mean a glide, and the sea is not a runway.',
  ];
  let y = height * 0.3 + 92;
  for (const line of lines) {
    ctx.fillText(line, width / 2, y);
    y += 28;
  }
  // Mission select: keys 1/2/3 or click a row to fly that mission.
  for (const row of titleMissionRows(width, height)) {
    const m = MISSIONS[row.id];
    const isChosen = row.id === chosen;
    ctx.save();
    ctx.fillStyle = isChosen ? 'rgba(255, 209, 102, 0.16)' : 'rgba(255, 255, 255, 0.07)';
    ctx.beginPath();
    ctx.roundRect(row.x, row.y, row.w, row.h, 10);
    ctx.fill();
    if (isChosen) {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Key badge.
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.roundRect(row.x + 10, row.y + 8, 34, 34, 7);
    ctx.fill();
    ctx.fillStyle = '#1a1408';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.key, row.x + 27, row.y + 26);
    // Name + goal on one line, scoring detail underneath.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(m.name, row.x + 56, row.y + 19);
    const nameW = ctx.measureText(m.name).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '13px sans-serif';
    ctx.fillText(`— ${m.goal}`, row.x + 56 + nameW + 8, row.y + 19);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px sans-serif';
    ctx.fillText(m.detail, row.x + 56, row.y + 38);
    // Best score, right-aligned.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 14px sans-serif';
    const best = bests[row.id] || 0;
    ctx.fillText(best > 0 ? `BEST ${best.toLocaleString('en-US')}` : 'BEST —', row.x + row.w - 14, row.y + 19);
    ctx.restore();
  }
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 22px sans-serif';
  const blink = 0.65 + 0.35 * Math.sin(Date.now() / 350);
  ctx.globalAlpha = blink;
  ctx.fillText('CLICK A MISSION OR PRESS ENTER TO FLY', width / 2, height * 0.3 + 388);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('60 FPS ENHANCED SCENERY EDITION', width / 2, height * 0.3 + 424);
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('An original game — Meridian Isles, runway 36, eight rings, one little island jet.', width / 2, height - 24);
}

export function drawOverlay(ctx, width, height, title, lines, accent) {
  ctx.fillStyle = 'rgba(8, 14, 24, 0.55)';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = 'bold 44px sans-serif';
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  ctx.fillText(title, width / 2, height * 0.38);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px sans-serif';
  let y = height * 0.38 + 44;
  for (const line of lines) {
    ctx.fillText(line, width / 2, y);
    y += 30;
  }
}
