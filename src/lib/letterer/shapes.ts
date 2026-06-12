// ============== SHAPE GEOMETRY ==============
// Pure functions producing SVG path strings. No DOM access — fully unit-testable
// and shared verbatim between the live SVG editor and the Canvas2D export pipeline
// (via Path2D), guaranteeing the export is pixel-faithful to the editing view.

import { Balloon } from "../model/types";

/** Deterministic seeded RNG (mulberry32) so "organic" jitter is stable per balloon. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const fmt = (n: number) => Math.round(n * 100) / 100;

/** Ellipse as a polybezier; supports Blambot #019 organic hand-drawn jitter. */
export function ellipsePath(
  cx: number, cy: number, rx: number, ry: number,
  organic = false, seed = 1,
): string {
  const segments = organic ? 16 : 8;
  const rnd = mulberry32(seed);
  const jitterAmp = organic ? Math.min(rx, ry) * 0.035 : 0;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const j = jitterAmp ? (rnd() - 0.5) * 2 * jitterAmp : 0;
    pts.push([cx + (rx + j) * Math.cos(a), cy + (ry + j) * Math.sin(a)]);
  }
  // Catmull-Rom → cubic Bezier for a smooth closed curve through the points.
  let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2[0])} ${fmt(p2[1])}`;
  }
  return d + " Z";
}

export function rectPath(cx: number, cy: number, rx: number, ry: number, radius = 8): string {
  const x = cx - rx, y = cy - ry, w = rx * 2, h = ry * 2;
  const r = Math.min(radius, w / 2, h / 2);
  return (
    `M ${fmt(x + r)} ${fmt(y)} H ${fmt(x + w - r)} Q ${fmt(x + w)} ${fmt(y)}, ${fmt(x + w)} ${fmt(y + r)}` +
    ` V ${fmt(y + h - r)} Q ${fmt(x + w)} ${fmt(y + h)}, ${fmt(x + w - r)} ${fmt(y + h)}` +
    ` H ${fmt(x + r)} Q ${fmt(x)} ${fmt(y + h)}, ${fmt(x)} ${fmt(y + h - r)}` +
    ` V ${fmt(y + r)} Q ${fmt(x)} ${fmt(y)}, ${fmt(x + r)} ${fmt(y)} Z`
  );
}

/** Thought-cloud: bumps arranged around an ellipse perimeter. */
export function cloudPath(cx: number, cy: number, rx: number, ry: number, seed = 1): string {
  const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const bumps = Math.max(8, Math.min(26, Math.round(circumference / 38)));
  let d = "";
  for (let i = 0; i < bumps; i++) {
    const a0 = (i / bumps) * Math.PI * 2;
    const a1 = ((i + 1) / bumps) * Math.PI * 2;
    const x0 = cx + rx * Math.cos(a0), y0 = cy + ry * Math.sin(a0);
    const x1 = cx + rx * Math.cos(a1), y1 = cy + ry * Math.sin(a1);
    const am = (a0 + a1) / 2;
    const bump = 1.22; // bump apex sits 22% beyond the base ellipse
    const mx = cx + rx * bump * Math.cos(am), my = cy + ry * bump * Math.sin(am);
    if (i === 0) d = `M ${fmt(x0)} ${fmt(y0)}`;
    d += ` Q ${fmt(mx)} ${fmt(my)}, ${fmt(x1)} ${fmt(y1)}`;
  }
  return d + " Z";
}

/** Burst/shout: alternating outer spikes and inner notches. */
export function burstPath(cx: number, cy: number, rx: number, ry: number, seed = 1): string {
  const rnd = mulberry32(seed);
  const spikes = Math.max(10, Math.min(22, Math.round((rx + ry) / 18)));
  let d = "";
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const outer = i % 2 === 0;
    const k = outer ? 1.08 + rnd() * 0.1 : 0.78 + rnd() * 0.06;
    const x = cx + rx * k * Math.cos(a);
    const y = cy + ry * k * Math.sin(a);
    d += i === 0 ? `M ${fmt(x)} ${fmt(y)}` : ` L ${fmt(x)} ${fmt(y)}`;
  }
  return d + " Z";
}

export function balloonBodyPath(b: Balloon): string {
  const seed = seedFromString(b.id);
  switch (b.shape) {
    case "rect":
      return rectPath(b.cx, b.cy, b.rx, b.ry);
    case "cloud":
      return cloudPath(b.cx, b.cy, b.rx, b.ry, seed);
    case "burst":
      return burstPath(b.cx, b.cy, b.rx, b.ry, seed);
    default:
      return ellipsePath(b.cx, b.cy, b.rx, b.ry, b.organic, seed);
  }
}

/** Point on the balloon's bounding ellipse along the direction of angle `a`. */
function edgePoint(b: Balloon, a: number): [number, number] {
  return [b.cx + b.rx * Math.cos(a), b.cy + b.ry * Math.sin(a)];
}

/** Classic pointed tail: two base points on the rim, curved to the tip. */
export function pointTailPath(b: Balloon): string {
  const ang = Math.atan2(b.tailY - b.cy, b.tailX - b.cx);
  // Half-width expressed as an angular offset proportional to tail width.
  const spread = Math.min(0.6, (b.tailW / 2) / Math.max(b.rx, b.ry));
  const [x1, y1] = edgePoint(b, ang - spread);
  const [x2, y2] = edgePoint(b, ang + spread);
  // Control points pull the tail sides into a gentle concave curve.
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const c1x = mx + (b.tailX - mx) * 0.4 + (x1 - mx) * 0.45;
  const c1y = my + (b.tailY - my) * 0.4 + (y1 - my) * 0.45;
  const c2x = mx + (b.tailX - mx) * 0.4 + (x2 - mx) * 0.45;
  const c2y = my + (b.tailY - my) * 0.4 + (y2 - my) * 0.45;
  return (
    `M ${fmt(x1)} ${fmt(y1)} Q ${fmt(c1x)} ${fmt(c1y)}, ${fmt(b.tailX)} ${fmt(b.tailY)}` +
    ` Q ${fmt(c2x)} ${fmt(c2y)}, ${fmt(x2)} ${fmt(y2)} Z`
  );
}

export interface TailBubble { cx: number; cy: number; r: number; }

/** Thought-balloon bubble trail: shrinking circles from rim toward the tip. */
export function bubbleTrail(b: Balloon): TailBubble[] {
  const ang = Math.atan2(b.tailY - b.cy, b.tailX - b.cx);
  const [sx, sy] = edgePoint(b, ang);
  const dist = Math.hypot(b.tailX - sx, b.tailY - sy);
  const count = Math.max(2, Math.min(5, Math.round(dist / 28)));
  const out: TailBubble[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 0.5);
    const r = Math.max(2, (b.tailW / 2) * (1 - t * 0.75));
    out.push({ cx: sx + (b.tailX - sx) * t, cy: sy + (b.tailY - sy) * t, r });
  }
  return out;
}

/** Off-panel tail: a curving swoop that narrows toward the (unseen) speaker. */
export function offPanelTailPath(b: Balloon): string {
  const ang = Math.atan2(b.tailY - b.cy, b.tailX - b.cx);
  const spread = Math.min(0.5, (b.tailW / 2) / Math.max(b.rx, b.ry));
  const [x1, y1] = edgePoint(b, ang - spread);
  const [x2, y2] = edgePoint(b, ang + spread);
  const dx = b.tailX - b.cx, dy = b.tailY - b.cy;
  // Perpendicular bow to give the characteristic swoosh.
  const px = -dy, py = dx;
  const norm = Math.hypot(px, py) || 1;
  const bow = Math.hypot(dx, dy) * 0.25;
  const bx = (px / norm) * bow, by = (py / norm) * bow;
  return (
    `M ${fmt(x1)} ${fmt(y1)}` +
    ` C ${fmt(x1 + bx)} ${fmt(y1 + by)}, ${fmt(b.tailX + bx * 0.5)} ${fmt(b.tailY + by * 0.5)}, ${fmt(b.tailX)} ${fmt(b.tailY)}` +
    ` C ${fmt(b.tailX + bx * 0.2)} ${fmt(b.tailY + by * 0.2)}, ${fmt(x2 + bx * 0.5)} ${fmt(y2 + by * 0.5)}, ${fmt(x2)} ${fmt(y2)} Z`
  );
}
