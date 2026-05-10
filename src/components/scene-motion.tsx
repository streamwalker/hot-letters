import { useEffect, useState, type CSSProperties } from "react";
import shipLarge from "@/assets/ship-large.png";
import shipSmall from "@/assets/ship-small.png";

/* Deterministic pseudo-random helper so SSR and CSR render identical markup. */
function rnd(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/* ---------- City windows + beacons (login only) ----------
   The cityscape sits in the lower-left ~half of the desktop bg image. We
   sprinkle small "lit window" dots inside that rough rect and have a few
   slow blinking rooftop beacons. Positions are deterministic but varied. */
export function CityTwinkle() {
  const windows = Array.from({ length: 50 }, (_, i) => {
    // Rough cityscape bbox (% of viewport) for the desktop bg art —
    // tall buildings sit roughly in the center-right of the window view.
    const left = 38 + rnd(i * 1.7) * 30;           // 38% – 68%
    const top = 14 + rnd(i * 2.3) * 50;            // 14% – 64%
    const w = 2 + Math.floor(rnd(i * 3.1) * 3);    // 2–4 px
    const h = 2 + Math.floor(rnd(i * 4.7) * 4);    // 2–5 px
    const dur = 3 + rnd(i * 5.9) * 6;              // 3–9 s
    const delay = rnd(i * 7.3) * 6;
    const tint = rnd(i * 11) > 0.7
      ? "radial-gradient(ellipse at center, rgba(180,220,255,0.95) 0%, rgba(120,180,255,0.5) 60%, rgba(120,180,255,0) 100%)"
      : undefined;
    return { i, left, top, w, h, dur, delay, tint };
  });
  const beacons = Array.from({ length: 6 }, (_, i) => ({
    i,
    left: 40 + rnd(i * 13.1) * 26,
    top: 12 + rnd(i * 17.3) * 18,
    delay: rnd(i * 19.7) * 5,
  }));
  return (
    <div
      aria-hidden
      className="city-twinkle-layer"
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}
    >
      {windows.map((w) => (
        <span
          key={`w${w.i}`}
          className="city-window"
          style={{
            left: `${w.left}%`,
            top: `${w.top}%`,
            width: w.w,
            height: w.h,
            animationDuration: `${w.dur}s`,
            animationDelay: `${w.delay}s`,
            ...(w.tint ? { background: w.tint } : null),
          }}
        />
      ))}
      {beacons.map((b) => (
        <span
          key={`b${b.i}`}
          className="city-beacon"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Drifting ships ---------- */
type ShipDef = {
  i: number;
  src: string;
  size: number;        // px width
  top: string;         // CSS top
  dur: number;         // seconds across viewport
  delay: number;
  dir: "ltr" | "rtl";
  opacity: number;
};

export function Ships({ count = 5, faint = false }: { count?: number; faint?: boolean }) {
  const ships = Array.from({ length: count }, (_, i) => {
    const isLarge = i === 0;
    const dir: "ltr" | "rtl" = i % 2 === 0 ? "ltr" : "rtl";
    const variant = rnd(i * 13.7) > 0.5 ? "a" : "b";
    const baseSize = isLarge ? 280 : 70 + Math.floor(rnd(i * 3.7) * 80); // 70–150
    const opacity = (faint ? 0.25 : 0.85) * (isLarge ? 1 : 0.9);
    return {
      i,
      src: isLarge ? shipLarge : shipSmall,
      size: baseSize,
      top: `${4 + rnd(i * 5.3) * 22}%`, // upper sky band
      dur: isLarge ? 75 : 30 + rnd(i * 9.1) * 25,
      delay: -rnd(i * 11.7) * 30,
      anim: `ship-curve-${dir}-${variant}`,
      opacity,
    };
  });
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {ships.map((s) => (
        <img
          key={s.i}
          src={s.src}
          alt=""
          className="ship"
          loading="lazy"
          style={{
            top: s.top,
            left: 0,
            width: s.size,
            height: "auto",
            ["--ship-op" as string]: String(s.opacity),
            animation: `${s.anim} ${s.dur}s ease-in-out ${s.delay}s infinite`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- Points of light traversing the scene ---------- */
export function PointsOfLight({ count = 10 }: { count?: number }) {
  const dots = Array.from({ length: count }, (_, i) => {
    const startTop = 5 + rnd(i * 2.1) * 60;
    const dur = 14 + rnd(i * 4.3) * 14;
    const delay = -rnd(i * 6.7) * 20;
    const dir = rnd(i * 8.9) > 0.5 ? 1 : -1;
    const ex = (40 + rnd(i * 10.3) * 50) * dir; // vw
    const mx = ex * 0.5;
    const my = -10 - rnd(i * 12.7) * 40;
    const startLeft = dir === 1 ? -5 : 105;
    return { i, startTop, startLeft, dur, delay, ex, mx, my };
  });
  return (
    <div
      aria-hidden
      style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", overflow: "hidden" }}
    >
      {dots.map((d) => (
        <span
          key={d.i}
          className="pol"
          style={{
            top: `${d.startTop}%`,
            left: `${d.startLeft}%`,
            ["--pol-mx" as string]: `${d.mx}vw`,
            ["--pol-my" as string]: `${d.my}px`,
            ["--pol-ex" as string]: `${d.ex}vw`,
            animation: `pol-orbit ${d.dur}s ease-in-out ${d.delay}s infinite`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- Console screen with live-changing data ----------
   Renders a small CRT-style readout: a scrolling waveform, hex dump,
   and a percentage counter. Updates every ~400ms. */
const BARS = "▁▂▃▄▅▆▇█";
const HEX = "0123456789ABCDEF";

function genWaveform(seed: number, width: number) {
  let out = "";
  for (let i = 0; i < width; i++) {
    out += BARS[Math.floor(rnd(seed + i * 0.37) * BARS.length)];
  }
  return out;
}
function genHex(seed: number, width: number) {
  let out = "";
  for (let i = 0; i < width; i++) {
    if (i > 0 && i % 4 === 0) out += " ";
    out += HEX[Math.floor(rnd(seed + i * 1.13) * HEX.length)];
  }
  return out;
}

type ConsoleScreenProps = {
  style: CSSProperties;
  tint?: "green" | "amber" | "cyan";
  width?: number;     // chars per line
  rows?: number;
  label?: string;
  intervalMs?: number;
};

export function ConsoleScreen({
  style,
  tint = "green",
  width = 18,
  rows = 4,
  label = "SYS",
  intervalMs = 420,
}: ConsoleScreenProps) {
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  // Render deterministic SSR frame, then update on client tick.
  const seed = mounted ? tick * 7.13 : 1;
  const wave = genWaveform(seed, width);
  const hex1 = genHex(seed + 5, width - 4);
  const hex2 = genHex(seed + 11, width - 4);
  const pct = mounted ? Math.floor(rnd(seed + 17) * 100) : 42;
  const tintClass = tint === "amber" ? "amber" : tint === "cyan" ? "cyan" : "";

  const lines = [
    `${label}  ${String(pct).padStart(2, "0")}%`,
    wave,
    hex1,
    hex2,
  ].slice(0, rows);

  return (
    <div className={`console-screen ${tintClass}`} style={style} aria-hidden>
      {lines.join("\n")}
    </div>
  );
}
