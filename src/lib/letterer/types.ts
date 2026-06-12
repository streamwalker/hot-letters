// ============== LETTERER DATA MODEL (ported from Hot Letters v2) ==============
// Minimal type surface required by the ported pure modules (shapes, textfit).
// Lives alongside the existing letterer-app.js runtime — these types are an
// opt-in, strongly-typed contract for new TS code that consumes the same
// balloon shape the legacy app produces. Keep field names identical to the
// fields written by src/letterer-app.js so the modules can be fed live data
// without a translation layer.

export type BalloonShape = "ellipse" | "rect" | "cloud" | "burst";
export type TailStyle = "point" | "bubbles" | "offpanel";

export interface Balloon {
  id: string;
  text: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tailX: number;
  tailY: number;
  shape: BalloonShape;
  fill: string;
  stroke: string;
  strokeW: number;
  font: string;
  size: number;
  weight: number;
  italic: "normal" | "italic";
  tracking: number;
  textColor: string;
  tail: boolean;
  tailStyle: TailStyle;
  tailW: number;
  outline: "solid" | "dashed";
  organic: boolean;
  /** Text inset fraction 0..0.4, or null = auto (per-shape default). */
  edgeInset: number | null;
}

export interface ShapeInsets {
  burst: number;
  cloud: number;
  oval: number;
  box: number;
}

export const DEFAULT_SHAPE_INSETS: ShapeInsets = {
  burst: 0.22,
  cloud: 0.16,
  oval: 0.1,
  box: 0.08,
};

export function shapeInsetCategory(shape: string): keyof ShapeInsets {
  const s = (shape || "ellipse").toLowerCase();
  if (s === "burst") return "burst";
  if (s === "cloud") return "cloud";
  if (s === "rect" || s === "box" || s === "caption" || s === "square") return "box";
  return "oval";
}
