'use client';

import { useRef, useEffect } from 'react';
import { usePlayerStore } from '@/store/player-store';

const MODES: [number, number][] = [
  [1, 1], [1, 2], [2, 1], [2, 2], [2, 3], [3, 2],
  [3, 3], [3, 4], [4, 3], [4, 5], [5, 4], [5, 6],
  [6, 5], [6, 7], [7, 6], [5, 8], [8, 5], [7, 9],
];

function getMode(fd: Uint8Array, t: number) {
  const L = fd.length; if (!L) return { m: 2, n: 3, i: 0.4, r: 0 };
  const bE = Math.floor(L * 0.1), lmE = Math.floor(L * 0.25), mE = Math.floor(L * 0.5), hmE = Math.floor(L * 0.75);
  let b = 0, lm = 0, m = 0, hm = 0, h = 0;
  for (let i = 0; i < L; i++) { const v = fd[i] / 255; if (i < bE) b += v; else if (i < lmE) lm += v; else if (i < mE) m += v; else if (i < hmE) hm += v; else h += v; }
  b /= bE || 1; lm /= (lmE - bE) || 1; m /= (mE - lmE) || 1; hm /= (hmE - mE) || 1; h /= (L - hmE) || 1;
  const intensity = Math.min(1, b * 1.5 + lm * 0.8 + m * 0.5);
  const bands = [b, lm, m, hm, h]; let dom = 0, mx = 0;
  for (let i = 0; i < bands.length; i++) { if (bands[i] > mx) { mx = bands[i]; dom = i; } }
  const cx = b * 0.15 + lm * 0.2 + m * 0.25 + hm * 0.25 + h * 0.15;
  const idx = Math.min(dom * 3 + Math.floor(cx * 2.5), MODES.length - 1);
  const cyc = Math.floor(t * 0.12) % 4;
  const fi = Math.min(idx + cyc, MODES.length - 1);
  const [mn, nn] = MODES[fi];
  return { m: mn, n: nn, i: intensity, r: t * 0.015 * (1 + m * 0.5) };
}

function drawChladni(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, m: number, n: number, intensity: number, rotation: number, alpha: number, glow: boolean) {
  const step = Math.max(2, Math.floor(size / 100));
  const hs = size / 2; const cR = Math.cos(rotation); const sR = Math.sin(rotation);
  const thr = 0.06 + (1 - intensity) * 0.12;
  ctx.save();
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 0.6 + intensity * 1.2;
  if (glow) {
    ctx.shadowBlur = 6 + intensity * 14;
    ctx.shadowColor = `rgba(160, 130, 255, ${0.3 + intensity * 0.4})`;
  }
  ctx.beginPath(); let has = false;
  for (let px = -hs; px <= hs; px += step) { for (let py = -hs; py <= hs; py += step) {
    const rx = px * cR - py * sR, ry = px * sR + py * cR;
    const val = Math.sin(m * Math.PI * (rx / hs)) * Math.sin(n * Math.PI * (ry / hs)) + Math.sin(n * Math.PI * (rx / hs)) * Math.sin(m * Math.PI * (ry / hs));
    if (Math.abs(val) < thr) { ctx.moveTo(cx + px + 0.5, cy + py); ctx.arc(cx + px, cy + py, 0.5 + intensity * 0.5, 0, Math.PI * 2); has = true; }
  }}
  if (has) ctx.stroke(); ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, intensity: number, fd: Uint8Array) {
  const lc = Math.floor(6 + intensity * 12); const hs = size / 2; const L = fd.length;
  ctx.save();
  ctx.strokeStyle = `rgba(160, 100, 255, ${0.1 + intensity * 0.2})`;
  ctx.lineWidth = 0.5;
  ctx.shadowBlur = 4 + intensity * 8;
  ctx.shadowColor = `rgba(120, 80, 255, 0.3)`;
  for (let i = 0; i < lc; i++) {
    const y = cy - hs + (i + 1) * (size / (lc + 1)); const fi = Math.floor((i / lc) * L * 0.5); const amp = (fd[fi] / 255) * 25 * intensity;
    ctx.beginPath();
    for (let x = cx - hs; x <= cx + hs; x += 2) { const nx = (x - cx) / hs; const wy = y + amp * Math.sin(nx * Math.PI * (2 + i % 3)) * Math.cos(i * 0.5); if (x === cx - hs) ctx.moveTo(x, wy); else ctx.lineTo(x, wy); }
    ctx.stroke();
  }
  for (let i = 0; i < lc; i++) {
    const x = cx - hs + (i + 1) * (size / (lc + 1)); const fi = Math.floor(L * 0.5 + (i / lc) * L * 0.5); const amp = (fd[Math.min(fi, L - 1)] / 255) * 25 * intensity;
    ctx.beginPath();
    for (let y = cy - hs; y <= cy + hs; y += 2) { const ny = (y - cy) / hs; const wx = x + amp * Math.sin(ny * Math.PI * (2 + i % 3)) * Math.cos(i * 0.7); if (y === cy - hs) ctx.moveTo(wx, y); else ctx.lineTo(wx, y); }
    ctx.stroke();
  } ctx.restore();
}

function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, intensity: number) {
  ctx.save();
  ctx.strokeStyle = `rgba(200, 180, 255, ${0.012 + intensity * 0.02})`;
  ctx.lineWidth = 0.5;
  const offset = (t * 30) % 4;
  for (let y = offset; y < h; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();
}

function drawGradientBg(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Deep dark blue-violet ambient gradient
  const grd = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
  grd.addColorStop(0, '#0c0a18');
  grd.addColorStop(0.4, '#080614');
  grd.addColorStop(0.8, '#04030a');
  grd.addColorStop(1, '#020108');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, w, h);

  // Subtle animated color shift
  const hue = 240 + Math.sin(t * 0.08) * 15; // 225-255 range (blue to violet)
 const blob = ctx.createRadialGradient(
    w * (0.45 + Math.sin(t * 0.15) * 0.1),
    h * (0.4 + Math.cos(t * 0.12) * 0.08),
    0,
    w * 0.5, h * 0.5, w * 0.5
  );
  blob.addColorStop(0, `hsla(${hue}, 60%, 8%, 0.25)`);
  blob.addColorStop(0.5, `hsla(${hue + 20}, 50%, 5%, 0.1)`);
  blob.addColorStop(1, 'transparent');
  ctx.fillStyle = blob;
  ctx.fillRect(0, 0, w, h);
}

export default function CymaticsVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smooth = useRef({ m: 2, n: 3, i: 0.3, r: 0 });
  const t0 = useRef(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const resize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      canvas.width = vw;
      canvas.height = vh;
      canvas.style.width = `${vw}px`;
      canvas.style.height = `${vh}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 100));
    let raf = 0;

    const loop = () => {
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) { raf = requestAnimationFrame(loop); return; }
      const w = canvas.width, h = canvas.height;
      const time = (Date.now() - t0.current) / 1000;
      const state = usePlayerStore.getState();
      const data = state.frequencyData || new Uint8Array(128);
      const hasAudio = state.isPlaying && state.frequencyData;

      // Gradient background
      drawGradientBg(ctx, w, h, time);

      // Scanlines
      drawScanlines(ctx, w, h, time, hasAudio ? 1 : 0.3);

      if (hasAudio) {
        const tgt = getMode(data, time);
        const s = smooth.current;
        s.m += (tgt.m - s.m) * 0.05;
        s.n += (tgt.n - s.n) * 0.05;
        s.i += (tgt.intensity - s.i) * 0.08;
        s.r += (tgt.rotation - s.r) * 0.04;

        const ms = Math.min(w, h) * 0.85, cx = w / 2, cy = h / 2;

        // Primary pattern with glow
        drawChladni(ctx, cx, cy, ms, s.m, s.n, s.i, s.r, 0.45 + s.i * 0.4, true);
        // Secondary (offset)
        const sm = MODES[Math.min(Math.floor(s.m + s.n) % MODES.length, MODES.length - 1)];
        drawChladni(ctx, cx, cy, ms * 0.6, sm[0], sm[1], s.i * 0.5, -s.r * 0.7, 0.1 + s.i * 0.12, true);

        // Grid overlay on bass
        let be = 0; const be2 = Math.floor(data.length * 0.15);
        for (let i = 0; i < be2; i++) be += data[i] / 255;
        be /= be2 || 1;
        if (be > 0.25) drawGrid(ctx, cx, cy, ms * 0.9, be * 0.8, data);

        // Corner crosshairs
        ctx.save();
        ctx.strokeStyle = `rgba(160, 100, 255, ${0.08 + s.i * 0.15})`;
        ctx.lineWidth = 0.5;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(140, 80, 255, 0.3)';
        const ch = 40 + s.i * 60;
        const corners = [[20,20,1,1],[w-20,20,-1,1],[20,h-20,1,-1],[w-20,h-20,-1,-1]];
        for (const [x,y,dx,dy] of corners) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ch * dx, y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + ch * dy); ctx.stroke();
        }
        ctx.restore();
      } else {
        // Idle breathing pattern
        const cx = w / 2, cy = h / 2;
        const bs = Math.min(w, h) * (0.35 + Math.sin(time * 0.4) * 0.06);
        const im = 2 + Math.floor(Math.sin(time * 0.12) * 1.5);
        const in2 = 3 + Math.floor(Math.cos(time * 0.1) * 1.5);
        drawChladni(ctx, cx, cy, bs, im, in2, 0.18 + Math.sin(time * 0.25) * 0.06, time * 0.012, 0.1, true);
        drawChladni(ctx, cx, cy, bs * 0.5, 4, 5, 0.08, -time * 0.008, 0.04, false);

        // Corner brackets (idle)
        ctx.save();
        ctx.strokeStyle = 'rgba(140, 100, 255, 0.06)';
        ctx.lineWidth = 0.5;
        const ch2 = 30;
        const corners = [[16,16,1,1],[w-16,16,-1,1],[16,h-16,1,-1],[w-16,h-16,-1,-1]];
        for (const [x,y,dx,dy] of corners) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ch2 * dx, y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + ch2 * dy); ctx.stroke();
        }
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize); cancelAnimationFrame(raf); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      suppressHydrationWarning
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
