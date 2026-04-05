import type { ScoreEntry } from "@/backend";
import { useActor } from "@/hooks/useActor";
import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────── Types ─────────── */
interface Player {
  x: number;
  y: number;
  angle: number;
  health: number;
  invulnTimer: number;
  shootCooldown: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  angle: number;
  health: number;
  shootTimer: number;
}

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  fromPlayer: boolean;
  life: number;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GState {
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  obstacles: Obstacle[];
  score: number;
  wave: number;
  nextId: number;
  status: "playing" | "gameover" | "win";
  waveTimer: number;
}

interface DispState {
  score: number;
  health: number;
  wave: number;
  status: GState["status"];
}

/* ─────────── Constants ─────────── */
const MAX_WAVE = 5;
const PLAYER_SPD = 220;
const ENEMY_SPD = 115;
const BULLET_SPD = 460;
const ENEMY_BULLET_SPD = 330;
const PLAYER_HP = 5;
const ENEMY_HP = 3;
const PR = 16; // player radius
const ER = 14; // enemy radius
const WALL = 22;
const BULLET_LIFE = 2.5;
const PLAYER_SHOOT_CD = 0.22;
const ENEMY_SHOOT_CD = 2.5;
const INVULN = 1.2;
const WAVE_DELAY = 2.5;
const JOY_MAX = 48;
const JOY_SIZE = 130;

// Canvas drawing colors — must be literals (Canvas API can't use CSS vars)
const C = {
  bg: "#0c0f12",
  floor: "#111520",
  gridLine: "rgba(255,255,255,0.022)",
  wall: "#181e2e",
  wallBorder: "#253450",
  obs: "#1a2030",
  obsBorder: "#2d4060",
  player: "#b7e04a",
  playerDark: "#7aaa25",
  playerWheel: "#4a7010",
  enemy: "#e23a2f",
  enemyDark: "#8a2020",
  enemyWheel: "#5a1010",
  pBullet: "#ffe84a",
  eBullet: "#ff6644",
  waveText: "#b7e04a",
};

/* ─────────── Utilities ─────────── */
function circleAABB(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < cr * cr;
}

function resolveCircleAABB(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): { x: number; y: number } {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) {
    const oL = cx - rx;
    const oR = rx + rw - cx;
    const oT = cy - ry;
    const oB = ry + rh - cy;
    const m = Math.min(oL, oR, oT, oB);
    if (m === oL) return { x: rx - cr, y: cy };
    if (m === oR) return { x: rx + rw + cr, y: cy };
    if (m === oT) return { x: cx, y: ry - cr };
    return { x: cx, y: ry + rh + cr };
  }
  const overlap = cr - dist;
  if (overlap > 0) {
    return { x: cx + (dx / dist) * overlap, y: cy + (dy / dist) * overlap };
  }
  return { x: cx, y: cy };
}

function buildObstacles(w: number, h: number): Obstacle[] {
  const aw = w - WALL * 2;
  const ah = h - WALL * 2;
  const ox = WALL;
  const oy = WALL;
  return [
    { x: ox + aw * 0.17, y: oy + ah * 0.17, w: aw * 0.12, h: ah * 0.18 },
    { x: ox + aw * 0.71, y: oy + ah * 0.13, w: aw * 0.12, h: ah * 0.16 },
    { x: ox + aw * 0.12, y: oy + ah * 0.64, w: aw * 0.14, h: ah * 0.12 },
    { x: ox + aw * 0.7, y: oy + ah * 0.66, w: aw * 0.12, h: ah * 0.14 },
    { x: ox + aw * 0.43, y: oy + ah * 0.41, w: aw * 0.15, h: ah * 0.15 },
  ];
}

function makeEnemies(
  wave: number,
  w: number,
  h: number,
  startId: number,
): Enemy[] {
  const count = Math.min(2 + wave, 7);
  const positions = [
    { x: WALL + ER + 15, y: WALL + ER + 15 },
    { x: w - WALL - ER - 15, y: WALL + ER + 15 },
    { x: WALL + ER + 15, y: h - WALL - ER - 15 },
    { x: w - WALL - ER - 15, y: h - WALL - ER - 15 },
    { x: w * 0.5, y: WALL + ER + 15 },
    { x: WALL + ER + 15, y: h * 0.5 },
    { x: w - WALL - ER - 15, y: h * 0.5 },
  ];
  return positions.slice(0, count).map((pos, i) => ({
    id: startId + i,
    x: pos.x,
    y: pos.y,
    angle: 0,
    health: ENEMY_HP,
    shootTimer: ENEMY_SHOOT_CD * (0.3 + Math.random() * 0.7),
  }));
}

/* ─────────── Canvas Drawing ─────────── */
function drawKart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  body: string,
  dark: string,
  wheel: string,
  blink = false,
) {
  if (blink) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = body;
  ctx.shadowBlur = 10;
  // Main body
  ctx.fillStyle = body;
  ctx.fillRect(-14, -7, 28, 14);
  // Cockpit
  ctx.fillStyle = dark;
  ctx.fillRect(-3, -5, 9, 10);
  // Wheels
  ctx.fillStyle = wheel;
  ctx.fillRect(-14, -10, 5, 4);
  ctx.fillRect(-14, 6, 5, 4);
  ctx.fillRect(9, -10, 5, 4);
  ctx.fillRect(9, 6, 5, 4);
  // Front headlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffaa";
  ctx.fillRect(12, -3, 4, 6);
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  state: GState,
  w: number,
  h: number,
) {
  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  // Arena floor
  ctx.fillStyle = C.floor;
  ctx.fillRect(WALL, WALL, w - WALL * 2, h - WALL * 2);

  // Grid lines
  ctx.strokeStyle = C.gridLine;
  ctx.lineWidth = 1;
  const gs = 60;
  for (let gx = WALL; gx < w - WALL; gx += gs) {
    ctx.beginPath();
    ctx.moveTo(gx, WALL);
    ctx.lineTo(gx, h - WALL);
    ctx.stroke();
  }
  for (let gy = WALL; gy < h - WALL; gy += gs) {
    ctx.beginPath();
    ctx.moveTo(WALL, gy);
    ctx.lineTo(w - WALL, gy);
    ctx.stroke();
  }

  // Walls
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, 0, w, WALL);
  ctx.fillRect(0, h - WALL, w, WALL);
  ctx.fillRect(0, WALL, WALL, h - WALL * 2);
  ctx.fillRect(w - WALL, WALL, WALL, h - WALL * 2);
  ctx.strokeStyle = C.wallBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL, WALL, w - WALL * 2, h - WALL * 2);

  // Obstacles
  for (const obs of state.obstacles) {
    ctx.fillStyle = C.obs;
    ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    ctx.strokeStyle = C.obsBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(obs.x + 1, obs.y + 1, obs.w - 2, obs.h - 2);
    // Diagonal stripe detail
    ctx.save();
    ctx.beginPath();
    ctx.rect(obs.x, obs.y, obs.w, obs.h);
    ctx.clip();
    ctx.strokeStyle = "rgba(45,64,96,0.5)";
    ctx.lineWidth = 4;
    for (let s = -obs.h; s < obs.w + obs.h; s += 20) {
      ctx.beginPath();
      ctx.moveTo(obs.x + s, obs.y);
      ctx.lineTo(obs.x + s + obs.h, obs.y + obs.h);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Bullets
  for (const b of state.bullets) {
    ctx.save();
    ctx.fillStyle = b.fromPlayer ? C.pBullet : C.eBullet;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
    ctx.restore();
  }

  // Enemies + health bars
  for (const e of state.enemies) {
    drawKart(ctx, e.x, e.y, e.angle, C.enemy, C.enemyDark, C.enemyWheel);
    const bw = 26;
    const bh = 4;
    ctx.fillStyle = "#1a0a0a";
    ctx.fillRect(e.x - bw / 2, e.y - ER - 11, bw, bh);
    ctx.fillStyle = C.enemy;
    ctx.shadowColor = C.enemy;
    ctx.shadowBlur = 4;
    ctx.fillRect(e.x - bw / 2, e.y - ER - 11, bw * (e.health / ENEMY_HP), bh);
    ctx.shadowBlur = 0;
  }

  // Player
  const p = state.player;
  const blink = p.invulnTimer > 0 && Math.floor(Date.now() / 80) % 2 === 0;
  drawKart(
    ctx,
    p.x,
    p.y,
    p.angle,
    C.player,
    C.playerDark,
    C.playerWheel,
    blink,
  );

  // Wave transition overlay drawn on canvas
  if (state.waveTimer > 0) {
    const alpha = Math.min(1, state.waveTimer * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h / 2 - 60, w, 120);
    ctx.fillStyle = C.waveText;
    ctx.shadowColor = C.waveText;
    ctx.shadowBlur = 24;
    ctx.font = "bold 28px 'Press Start 2P', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`WAVE ${state.wave}`, w / 2, h / 2);
    ctx.restore();
  }
}

/* ─────────── Game Logic ─────────── */
function updateGame(
  state: GState,
  dt: number,
  w: number,
  h: number,
  joy: { angle: number; mag: number },
  keys: Set<string>,
  fireRef: React.MutableRefObject<boolean>,
) {
  if (state.status !== "playing") return;

  // Wave transition pause
  if (state.waveTimer > 0) {
    state.waveTimer = Math.max(0, state.waveTimer - dt);
    if (state.waveTimer === 0) {
      const newEnemies = makeEnemies(state.wave, w, h, state.nextId);
      state.enemies = newEnemies;
      state.nextId += newEnemies.length;
    }
    return;
  }

  const p = state.player;
  p.invulnTimer = Math.max(0, p.invulnTimer - dt);
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);

  // Player movement
  let moveAngle = p.angle;
  let moveSpd = 0;

  if (joy.mag > 0.05) {
    moveAngle = joy.angle;
    moveSpd = joy.mag * PLAYER_SPD;
  } else {
    let kx = 0;
    let ky = 0;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) kx--;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) kx++;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) ky--;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) ky++;
    if (kx !== 0 || ky !== 0) {
      moveAngle = Math.atan2(ky, kx);
      moveSpd = PLAYER_SPD;
    }
  }

  if (moveSpd > 0) {
    p.angle = moveAngle;
    p.x += Math.cos(moveAngle) * moveSpd * dt;
    p.y += Math.sin(moveAngle) * moveSpd * dt;
  }

  // Clamp to arena
  p.x = Math.max(WALL + PR, Math.min(w - WALL - PR, p.x));
  p.y = Math.max(WALL + PR, Math.min(h - WALL - PR, p.y));

  // Obstacle collision
  for (const obs of state.obstacles) {
    if (circleAABB(p.x, p.y, PR, obs.x, obs.y, obs.w, obs.h)) {
      const r = resolveCircleAABB(p.x, p.y, PR, obs.x, obs.y, obs.w, obs.h);
      p.x = r.x;
      p.y = r.y;
    }
  }
  p.x = Math.max(WALL + PR, Math.min(w - WALL - PR, p.x));
  p.y = Math.max(WALL + PR, Math.min(h - WALL - PR, p.y));

  // Player shoot
  if ((fireRef.current || keys.has(" ")) && p.shootCooldown <= 0) {
    state.bullets.push({
      x: p.x + Math.cos(p.angle) * (PR + 8),
      y: p.y + Math.sin(p.angle) * (PR + 8),
      dx: Math.cos(p.angle) * BULLET_SPD,
      dy: Math.sin(p.angle) * BULLET_SPD,
      fromPlayer: true,
      life: BULLET_LIFE,
    });
    p.shootCooldown = PLAYER_SHOOT_CD;
  }
  fireRef.current = false;

  // Enemies
  for (const e of state.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    e.angle = Math.atan2(dy, dx);

    if (dist > PR + ER + 15) {
      e.x += Math.cos(e.angle) * ENEMY_SPD * dt;
      e.y += Math.sin(e.angle) * ENEMY_SPD * dt;
    }

    e.x = Math.max(WALL + ER, Math.min(w - WALL - ER, e.x));
    e.y = Math.max(WALL + ER, Math.min(h - WALL - ER, e.y));

    for (const obs of state.obstacles) {
      if (circleAABB(e.x, e.y, ER, obs.x, obs.y, obs.w, obs.h)) {
        const r = resolveCircleAABB(e.x, e.y, ER, obs.x, obs.y, obs.w, obs.h);
        e.x = r.x;
        e.y = r.y;
      }
    }

    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && dist < 520) {
      e.shootTimer = ENEMY_SHOOT_CD * (0.6 + Math.random() * 0.8);
      const spread = (Math.random() - 0.5) * 0.18;
      const sa = e.angle + spread;
      state.bullets.push({
        x: e.x + Math.cos(sa) * (ER + 8),
        y: e.y + Math.sin(sa) * (ER + 8),
        dx: Math.cos(sa) * ENEMY_BULLET_SPD,
        dy: Math.sin(sa) * ENEMY_BULLET_SPD,
        fromPlayer: false,
        life: BULLET_LIFE,
      });
    }
  }

  // Move bullets
  for (const b of state.bullets) {
    b.x += b.dx * dt;
    b.y += b.dy * dt;
    b.life -= dt;
  }

  // Filter + collision
  state.bullets = state.bullets.filter((b) => {
    // Expire / out of bounds
    if (
      b.life <= 0 ||
      b.x < WALL ||
      b.x > w - WALL ||
      b.y < WALL ||
      b.y > h - WALL
    )
      return false;

    // Hit obstacle
    for (const obs of state.obstacles) {
      if (
        b.x >= obs.x &&
        b.x <= obs.x + obs.w &&
        b.y >= obs.y &&
        b.y <= obs.y + obs.h
      )
        return false;
    }

    if (b.fromPlayer) {
      // Hit enemy
      for (const e of state.enemies) {
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (ER + 5) ** 2) {
          e.health--;
          state.score += e.health <= 0 ? 50 : 10;
          return false;
        }
      }
    } else {
      // Hit player
      if (
        p.invulnTimer <= 0 &&
        (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (PR + 5) ** 2
      ) {
        p.health--;
        p.invulnTimer = INVULN;
        return false;
      }
    }

    return true;
  });

  // Remove dead enemies
  state.enemies = state.enemies.filter((e) => e.health > 0);

  // Wave clear / win
  if (state.enemies.length === 0) {
    if (state.wave >= MAX_WAVE) {
      state.status = "win";
    } else {
      state.wave++;
      state.waveTimer = WAVE_DELAY;
      // Enemies will be spawned when waveTimer hits 0
    }
  }

  // Player death
  if (p.health <= 0) {
    state.status = "gameover";
  }
}

/* ─────────── Component ─────────── */
export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { actor } = useActor();
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const gRef = useRef<GState | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const joyRef = useRef({
    active: false,
    angle: 0,
    mag: 0,
    startX: 0,
    startY: 0,
  });
  const fireRef = useRef(false);
  const dispRef = useRef<DispState>({
    score: 0,
    health: PLAYER_HP,
    wave: 1,
    status: "playing",
  });

  const [disp, setDisp] = useState<DispState>({
    score: 0,
    health: PLAYER_HP,
    wave: 1,
    status: "playing",
  });
  const [joyThumb, setJoyThumb] = useState({ x: 0, y: 0 });
  const [leaderboard, setLeaderboard] = useState<ScoreEntry[]>([]);
  const [playerName, setPlayerName] = useState("ACE");
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

  const initGame = useCallback((canvas: HTMLCanvasElement) => {
    const w = canvas.width;
    const h = canvas.height;
    const enemies = makeEnemies(1, w, h, 0);
    gRef.current = {
      player: {
        x: w / 2,
        y: h / 2,
        angle: -Math.PI / 2,
        health: PLAYER_HP,
        invulnTimer: 0,
        shootCooldown: 0,
      },
      enemies,
      bullets: [],
      obstacles: buildObstacles(w, h),
      score: 0,
      wave: 1,
      nextId: enemies.length,
      status: "playing",
      waveTimer: 0,
    };
    const d: DispState = {
      score: 0,
      health: PLAYER_HP,
      wave: 1,
      status: "playing",
    };
    dispRef.current = d;
    setDisp(d);
    setScoreSubmitted(false);
    setLeaderboard([]);
    joyRef.current = { active: false, angle: 0, mag: 0, startX: 0, startY: 0 };
    fireRef.current = false;
    setJoyThumb({ x: 0, y: 0 });
  }, []);

  // Main game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (gRef.current) {
        gRef.current.obstacles = buildObstacles(canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    initGame(canvas);

    const ctx = canvas.getContext("2d")!;

    const loop = (t: number) => {
      const dt = Math.min((t - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = t;

      const state = gRef.current;
      if (state) {
        if (state.status === "playing") {
          updateGame(
            state,
            dt,
            canvas.width,
            canvas.height,
            joyRef.current,
            keysRef.current,
            fireRef,
          );
        }
        drawScene(ctx, state, canvas.width, canvas.height);

        // Sync React state only when values change
        const prev = dispRef.current;
        const next: DispState = {
          score: state.score,
          health: state.player.health,
          wave: state.wave,
          status: state.status,
        };
        if (
          prev.score !== next.score ||
          prev.health !== next.health ||
          prev.wave !== next.wave ||
          prev.status !== next.status
        ) {
          dispRef.current = next;
          setDisp(next);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [initGame]);

  // Keyboard
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === " ") e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  // Submit score + fetch leaderboard on game end
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional shallow deps
  useEffect(() => {
    if (disp.status === "gameover" || disp.status === "win") {
      actor
        ?.getTopScores()
        .then((scores) => setLeaderboard(scores))
        .catch(() => {});
      if (disp.score > 0 && actor && !scoreSubmitted) {
        actor
          .submitScore(playerName || "ACE", BigInt(disp.score))
          .then(() => {
            setScoreSubmitted(true);
            actor
              .getTopScores()
              .then((scores) => setLeaderboard(scores))
              .catch(() => {});
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disp.status, actor]);

  // Joystick handlers
  const handleJoyStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    joyRef.current = { active: true, angle: 0, mag: 0, startX: cx, startY: cy };
  }, []);

  const handleJoyMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (!joyRef.current.active) return;
    const touch = e.touches[0];
    const rawDx = touch.clientX - joyRef.current.startX;
    const rawDy = touch.clientY - joyRef.current.startY;
    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    joyRef.current.angle = Math.atan2(rawDy, rawDx);
    joyRef.current.mag = Math.min(dist / JOY_MAX, 1);
    const clampDist = Math.min(dist, JOY_MAX);
    const tx = dist > 0 ? (rawDx / dist) * clampDist : 0;
    const ty = dist > 0 ? (rawDy / dist) * clampDist : 0;
    setJoyThumb({ x: tx, y: ty });
  }, []);

  const handleJoyEnd = useCallback(() => {
    joyRef.current.active = false;
    joyRef.current.mag = 0;
    setJoyThumb({ x: 0, y: 0 });
  }, []);

  const handleFire = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    fireRef.current = true;
  }, []);

  const handleRestart = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) initGame(canvas);
  }, [initGame]);

  const isOver = disp.status === "gameover" || disp.status === "win";
  const isWin = disp.status === "win";

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: "#0c0f12", touchAction: "none" }}
    >
      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        data-ocid="game.canvas_target"
        style={{ display: "block", width: "100%", height: "100%" }}
      />

      {/* HUD */}
      {disp.status === "playing" && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between"
          style={{
            padding: "8px 16px",
            background: "rgba(10,12,16,0.88)",
            borderBottom: "1px solid #253450",
          }}
        >
          {/* Health hearts */}
          <div className="flex items-center gap-1">
            {(["hp1", "hp2", "hp3", "hp4", "hp5"] as const)
              .slice(0, PLAYER_HP)
              .map((key, i) => (
                <div
                  key={key}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background: i < disp.health ? "#b7e04a" : "#1a2030",
                    boxShadow: i < disp.health ? "0 0 6px #b7e04a88" : "none",
                    transition: "all 0.15s",
                  }}
                />
              ))}
          </div>

          {/* Wave */}
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 11,
              color: "#b7e04a",
              letterSpacing: "0.08em",
              textShadow: "0 0 8px #b7e04a66",
            }}
          >
            WAVE {disp.wave}/{MAX_WAVE}
          </div>

          {/* Score */}
          <div
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: 13,
              color: "#ffffff",
              minWidth: 60,
              textAlign: "right",
            }}
          >
            {disp.score}
          </div>
        </div>
      )}

      {/* Virtual Joystick */}
      {!isOver && (
        <div
          data-ocid="game.joystick"
          style={{
            position: "absolute",
            bottom: 30,
            left: 30,
            width: JOY_SIZE,
            height: JOY_SIZE,
            touchAction: "none",
          }}
          onTouchStart={handleJoyStart}
          onTouchMove={handleJoyMove}
          onTouchEnd={handleJoyEnd}
        >
          {/* Base ring */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.22)",
              background: "rgba(255,255,255,0.06)",
            }}
          />
          {/* Thumb */}
          <div
            style={{
              position: "absolute",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.26)",
              border: "2px solid rgba(255,255,255,0.45)",
              top: "50%",
              left: "50%",
              boxShadow: "0 0 14px rgba(255,255,255,0.12)",
              transform: `translate(calc(-50% + ${joyThumb.x}px), calc(-50% + ${joyThumb.y}px))`,
              transition: joyRef.current.active
                ? "none"
                : "transform 0.12s ease-out",
            }}
          />
        </div>
      )}

      {/* Fire Button */}
      {!isOver && (
        <button
          type="button"
          data-ocid="game.fire_button"
          style={{
            position: "absolute",
            bottom: 40,
            right: 30,
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 35%, #e23a2f, #b11f1f)",
            border: "2px solid rgba(255,100,80,0.55)",
            boxShadow:
              "0 0 22px rgba(226,58,47,0.55), inset 0 1px 0 rgba(255,180,160,0.25)",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 11,
            color: "#fff",
            letterSpacing: "0.04em",
            cursor: "pointer",
            touchAction: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onTouchStart={handleFire}
          onMouseDown={() => {
            fireRef.current = true;
          }}
        >
          FIRE
        </button>
      )}

      {/* Game Over / Win Overlay */}
      {isOver && (
        <div
          data-ocid="game.modal"
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: "rgba(8,10,14,0.93)" }}
        >
          <div
            className="flex flex-col items-center gap-5 w-full"
            style={{ maxWidth: 360, padding: "0 24px" }}
          >
            {/* Title */}
            <h1
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 26,
                lineHeight: 1.6,
                textAlign: "center",
                color: isWin ? "#b7e04a" : "#e23a2f",
                textShadow: `0 0 24px ${isWin ? "#b7e04a" : "#e23a2f"}`,
                margin: 0,
              }}
            >
              {isWin ? "YOU WIN!" : "GAME OVER"}
            </h1>

            {/* Score */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 10,
                  color: "#556070",
                  letterSpacing: "0.12em",
                  marginBottom: 8,
                }}
              >
                SCORE
              </div>
              <div
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 30,
                  color: "#ffffff",
                  textShadow: "0 0 12px rgba(255,255,255,0.3)",
                }}
              >
                {disp.score}
              </div>
            </div>

            {/* Name input */}
            <div style={{ width: "100%" }}>
              <label
                htmlFor="player-name-input"
                style={{
                  display: "block",
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 9,
                  color: "#556070",
                  letterSpacing: "0.12em",
                  marginBottom: 8,
                }}
              >
                YOUR NAME
              </label>
              <input
                id="player-name-input"
                data-ocid="game.input"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  textAlign: "center",
                  background: "#141a24",
                  border: "1px solid #2d4060",
                  borderRadius: 6,
                  color: "#ffffff",
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
                value={playerName}
                onChange={(e) =>
                  setPlayerName(e.target.value.toUpperCase().slice(0, 8))
                }
                maxLength={8}
              />
            </div>

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
              <div style={{ width: "100%" }}>
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: 9,
                    color: "#556070",
                    letterSpacing: "0.12em",
                    textAlign: "center",
                    marginBottom: 10,
                  }}
                >
                  TOP SCORES
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {leaderboard.slice(0, 5).map((entry, i) => (
                    <div
                      key={`${entry.playerName}-${i}`}
                      data-ocid={`game.leaderboard.item.${i + 1}` as string}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 12px",
                        background:
                          i === 0
                            ? "rgba(183,224,74,0.08)"
                            : "rgba(255,255,255,0.04)",
                        borderRadius: 4,
                        border:
                          i === 0
                            ? "1px solid rgba(183,224,74,0.2)"
                            : "1px solid transparent",
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: 10,
                      }}
                    >
                      <span style={{ color: i === 0 ? "#b7e04a" : "#7a8a9a" }}>
                        {i + 1}. {entry.playerName}
                      </span>
                      <span style={{ color: "#ffffff" }}>
                        {Number(entry.score)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Play Again */}
            <button
              type="button"
              data-ocid="game.play_again_button"
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 6,
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 12,
                letterSpacing: "0.08em",
                cursor: "pointer",
                background: isWin ? "#b7e04a" : "transparent",
                color: isWin ? "#0c0f12" : "#b7e04a",
                border: "2px solid #b7e04a",
                boxShadow: "0 0 18px rgba(183,224,74,0.3)",
                transition: "all 0.15s",
              }}
              onClick={handleRestart}
            >
              PLAY AGAIN
            </button>

            {/* Footer */}
            <div
              style={{
                fontFamily: "sans-serif",
                fontSize: 11,
                color: "#3a4558",
                textAlign: "center",
                marginTop: 4,
              }}
            >
              © {new Date().getFullYear()}.{" "}
              <a
                href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#556070", textDecoration: "none" }}
              >
                Built with ❤ using caffeine.ai
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
