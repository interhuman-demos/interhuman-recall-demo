"use client";

import { useRef, useEffect, useCallback, useState } from "react";

const SIZE_RADII: Record<number, number> = { 1: 0.28, 2: 0.52, 3: 0.88 };

interface DitherAnimationData {
  w: number;
  h: number;
  cellSize: number;
  gap: number;
  fps: number;
  palette: [number, number, number][];
  frames: Uint16Array[];
  cols: number;
  cellCount: number;
}

function decode(base64: string): DitherAnimationData {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  let o = 0;
  const r8 = () => raw[o++]!;
  const r16 = () => {
    const v = raw[o]! | (raw[o + 1]! << 8);
    o += 2;
    return v;
  };

  o += 2;
  r8();
  const w = r16();
  const h = r16();
  const cellSize = r8();
  const gap = r8() / 10;
  const fps = r8();
  const fc = r16();
  const ps = r16();

  const palette: [number, number, number][] = [];
  for (let i = 0; i < ps; i++) palette.push([r8(), r8(), r8()]);

  const cols = Math.floor(w / cellSize);
  const cellCount = cols * Math.floor(h / cellSize);

  const frames: Uint16Array[] = [];
  let prev = new Uint16Array(cellCount);

  for (let f = 0; f < fc; f++) {
    const g = new Uint16Array(cellCount);
    if (f === 0) {
      for (let i = 0; i < cellCount; i++) g[i] = (r8() << 8) | r8();
    } else {
      g.set(prev);
      const n = r16();
      for (let i = 0; i < n; i++) {
        const ci = r16();
        g[ci] = (r8() << 8) | r8();
      }
    }
    frames.push(g);
    prev = g;
  }

  return { w, h, cellSize, gap, fps, palette, frames, cols, cellCount };
}

interface DitherAnimationProps {
  data: string;
  className?: string;
  color?: string;
  playing?: boolean;
}

export function DitherAnimation({
  data,
  className,
  color,
  playing = false,
}: DitherAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<DitherAnimationData | null>(null);
  const frameRef = useRef(0);
  const dirRef = useRef(1);
  const rafRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [visible, setVisible] = useState(false);

  const getAnim = useCallback(() => {
    if (!animRef.current) {
      animRef.current = decode(data);
    }
    return animRef.current;
  }, [data]);

  const syncSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const bw = Math.round(rect.width * dpr);
    const bh = Math.round(rect.height * dpr);

    if (sizeRef.current.w !== bw || sizeRef.current.h !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      sizeRef.current = { w: bw, h: bh };
    }
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const anim = animRef.current;
    if (!canvas || !anim) return;

    syncSize();

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w, h, cellSize, gap, palette, frames, cols, cellCount } = anim;
    const { w: bw, h: bh } = sizeRef.current;

    const scale = Math.max(bw / w, bh / h);
    const ox = (bw - w * scale) / 2;
    const oy = (bh - h * scale) / 2;

    ctx.clearRect(0, 0, bw, bh);

    const g = frames[frameRef.current]!;
    const ec = cellSize - gap;

    for (let i = 0; i < cellCount; i++) {
      const p = g[i]!;
      if (!p) continue;
      const sz = (p >> 8) & 3;
      const ci = p & 255;
      if (!sz) continue;

      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = ox + (col * cellSize + cellSize / 2) * scale;
      const y = oy + (row * cellSize + cellSize / 2) * scale;
      const r = (ec / 2) * SIZE_RADII[sz]! * scale;

      if (color) {
        ctx.fillStyle = color;
      } else {
        const pal = palette[ci];
        ctx.fillStyle = pal ? `rgb(${pal[0]},${pal[1]},${pal[2]})` : "#757575";
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
    }

    frameRef.current += dirRef.current;
    if (frameRef.current >= frames.length - 1) dirRef.current = -1;
    else if (frameRef.current <= 0) dirRef.current = 1;
  }, [color, syncSize]);

  useEffect(() => {
    if (!playing || !visible) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    getAnim();
    drawFrame();
    lastFrameTimeRef.current = performance.now();

    const anim = animRef.current;
    if (!anim) return;

    const interval = 1000 / anim.fps;

    function tick(timestamp: number) {
      if (timestamp - lastFrameTimeRef.current >= interval) {
        lastFrameTimeRef.current = timestamp;
        drawFrame();
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, visible, getAnim, drawFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!!entry?.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={[
        "pointer-events-none transition-opacity duration-300",
        playing ? "opacity-100" : "opacity-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
