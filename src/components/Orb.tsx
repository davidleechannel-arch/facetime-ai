

import { useEffect, useRef } from "react";

export type OrbState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "reconnecting" | "ended" | "error";

type Props = {
  state?: OrbState;
  levels?: () => { input: number; output: number };
  className?: string;
  label?: string;
};

const LAYERS = [
  { color: [43, 212, 180], phase: 0, speed: 0.6, size: 1 },
  { color: [124, 140, 255], phase: 2.1, speed: -0.45, size: 0.94 },
  { color: [255, 179, 138], phase: 4.2, speed: 0.35, size: 0.82 },
];

/**
 * The companion's presence: layered soft blobs that breathe when idle,
 * ripple with your voice while listening, swirl while thinking and swell
 * with the assistant's own voice while speaking.
 */
export function Orb({ state = "idle", levels, className, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelsRef = useRef(levels);
  stateRef.current = state;
  levelsRef.current = levels;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let energy = 0;
    let spin = 0;
    let swell = 1;
    let last = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const s = stateRef.current;
      const lv = levelsRef.current?.() ?? { input: 0, output: 0 };
      const target = s === "speaking" ? 0.35 + lv.output : s === "listening" ? lv.input * 0.9 : s === "thinking" ? 0.25 : 0;
      energy += (target - energy) * Math.min(1, dt * (target > energy ? 14 : 5));
      const spinRate = s === "thinking" ? 2.4 : s === "connecting" || s === "reconnecting" ? 1.6 : 0.5;
      spin += dt * spinRate * (reduced ? 0.25 : 1);
      const swellTarget = s === "speaking" ? 1.06 : s === "thinking" ? 0.97 : s === "ended" || s === "error" ? 0.8 : 1;
      swell += (swellTarget - swell) * Math.min(1, dt * 4);

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.max(1, Math.min(w, h) * 0.34 * swell);
      ctx.clearRect(0, 0, w, h);

      // Halo
      const halo = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.45);
      const haloAlpha = 0.16 + energy * 0.22;
      halo.addColorStop(0, `rgba(124,140,255,${haloAlpha})`);
      halo.addColorStop(1, "rgba(124,140,255,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      const breathe = reduced ? 0 : Math.sin(now / 1400) * 0.02;
      const amp = (reduced ? 0.015 : 0.035) + energy * (reduced ? 0.04 : 0.13);
      const dim = s === "ended" || s === "error" ? 0.45 : 1;

      for (const layer of LAYERS) {
        const r0 = R * layer.size * (1 + breathe);
        const rot = spin * layer.speed + layer.phase;
        ctx.beginPath();
        const N = 72;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const wobble =
            Math.sin(a * 3 + rot * 1.7 + now / 900) * 0.5 +
            Math.sin(a * 5 - rot * 1.3 + now / 1300) * 0.3 +
            Math.sin(a * 2 + rot) * 0.2;
          const r = r0 * (1 + wobble * amp);
          const x = cx + Math.cos(a + rot * 0.2) * r;
          const y = cy + Math.sin(a + rot * 0.2) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const ox = cx + Math.cos(rot) * R * 0.25;
        const oy = cy + Math.sin(rot) * R * 0.25;
        const g = ctx.createRadialGradient(ox, oy, 0, cx, cy, r0 * 1.15);
        const [r, gg, b] = layer.color;
        g.addColorStop(0, `rgba(${r},${gg},${b},${0.95 * dim})`);
        g.addColorStop(0.7, `rgba(${r},${gg},${b},${0.42 * dim})`);
        g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Specular highlight gives the orb some depth.
      const hl = ctx.createRadialGradient(cx - R * 0.32, cy - R * 0.38, 0, cx - R * 0.32, cy - R * 0.38, R * 0.7);
      hl.addColorStop(0, `rgba(255,255,255,${0.32 * dim})`);
      hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} role="img" aria-label={label || `Assistant is ${state}`} style={{ display: "block" }} />;
}
