// ============== TEXT FITTING ENGINE ==============
// Pure, injectable-measurement text layout. The measure function is passed in,
// so the algorithms run identically in the browser (canvas measureText) and in
// unit tests (synthetic measurer). Reproduces the legacy platform's behavior:
//   - lens balancer for ovals (~1.75:1 target aspect, narrow first/last lines)
//   - rectangular balancer for rect/cloud/burst (~1.7:1 target)
//   - auto-shrink: -6% per attempt, floor at max(55% of original, 8px)
//   - line height 1.18 × font size
//   - per-shape safe-area insets (burst .22 / cloud .16 / oval .10 / box .08)

import { Balloon, ShapeInsets, shapeInsetCategory } from "../model/types";

export interface FontSpec {
  font: string;
  size: number;
  weight: number;
  italic: "normal" | "italic";
  tracking: number;
}

export type MeasureFn = (text: string, spec: FontSpec) => number;

export interface FitResult {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  /** True if even the minimum size could not contain the text. */
  overflow: boolean;
}

export const LINE_HEIGHT_FACTOR = 1.18;
export const SHRINK_STEP = 0.94; // -6% per attempt
export const MIN_SHRINK = 0.55; // never below 55% of requested size
export const MIN_FONT_PX = 8;
const TARGET_ASPECT_OVAL = 1.75;
const TARGET_ASPECT_RECT = 1.7;

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Greedy wrap of words into lines no wider than budget (best effort). */
export function wrapToBudget(
  words: string[], budget: number, spec: FontSpec, measure: MeasureFn,
): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? cur + " " + w : w;
    if (cur && measure(candidate, spec) > budget) {
      lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function maxLineWidth(lines: string[], spec: FontSpec, measure: MeasureFn): number {
  let m = 0;
  for (const l of lines) m = Math.max(m, measure(l, spec));
  return m;
}

/** Whether a break before `word` lands on sentence punctuation (rewarded). */
function sentenceAligned(prevLine: string): boolean {
  return /[.!?…,;:]$/.test(prevLine.trim());
}

interface Candidate { lines: string[]; score: number; }

/**
 * Lens balancer: choose the wrap whose silhouette best fills an oval —
 * wide middle lines, narrower first/last lines, aspect near 1.75:1.
 */
export function balanceLens(text: string, spec: FontSpec, measure: MeasureFn): string[] {
  const words = tokenize(text);
  if (words.length <= 1) return words;
  const total = measure(words.join(" "), spec);
  const lineH = spec.size * LINE_HEIGHT_FACTOR;
  let best: Candidate | null = null;
  for (let n = 1; n <= Math.min(10, words.length); n++) {
    for (const k of [1.0, 1.12, 1.25]) {
      const budget = (total / n) * k;
      const lines = wrapToBudget(words, budget, spec, measure);
      if (lines.length === 0) continue;
      const widths = lines.map((l) => measure(l, spec));
      const wMax = Math.max(...widths);
      const aspect = wMax / (lines.length * lineH);
      let score = Math.abs(aspect - TARGET_ASPECT_OVAL);
      // Penalize wide first/last lines (they must fit the narrow oval ends).
      if (lines.length >= 3) {
        score += Math.max(0, widths[0] / wMax - 0.8) * 1.5;
        score += Math.max(0, widths[widths.length - 1] / wMax - 0.8) * 1.5;
      }
      // Reward sentence-aligned breaks.
      for (let i = 0; i < lines.length - 1; i++) {
        if (sentenceAligned(lines[i])) score -= 0.05;
      }
      if (!best || score < best.score) best = { lines, score };
    }
  }
  return best ? best.lines : [words.join(" ")];
}

/**
 * Rectangular balancer: minimize max line width for the line count whose
 * block aspect is closest to 1.7:1.
 */
export function balanceRect(text: string, spec: FontSpec, measure: MeasureFn): string[] {
  const words = tokenize(text);
  if (words.length <= 1) return words;
  const total = measure(words.join(" "), spec);
  const lineH = spec.size * LINE_HEIGHT_FACTOR;
  let best: Candidate | null = null;
  for (let n = 1; n <= Math.min(10, words.length); n++) {
    const budget = (total / n) * 1.1;
    const lines = wrapToBudget(words, budget, spec, measure);
    const wMax = maxLineWidth(lines, spec, measure);
    const aspect = wMax / (lines.length * lineH);
    const score = Math.abs(aspect - TARGET_ASPECT_RECT);
    if (!best || score < best.score) best = { lines, score };
  }
  return best ? best.lines : [words.join(" ")];
}

/** Half-width of the safe ellipse at vertical offset yOff from center. */
export function ellipseHalfWidthAt(rx: number, ry: number, yOff: number): number {
  const t = 1 - (yOff * yOff) / (ry * ry);
  return t <= 0 ? 0 : rx * Math.sqrt(t);
}

/** Does this block of lines fit inside the safe area of the balloon? */
export function blockFits(
  lines: string[], spec: FontSpec, measure: MeasureFn,
  shape: string, rx: number, ry: number, inset: number,
): boolean {
  const lineH = spec.size * LINE_HEIGHT_FACTOR;
  const blockH = lines.length * lineH;
  const rxS = rx * (1 - inset);
  const ryS = ry * (1 - inset);
  if (blockH > 2 * ryS) return false;
  if (shape === "rect") {
    for (const l of lines) if (measure(l, spec) > 2 * rxS) return false;
    return true;
  }
  // Oval-family: each line must fit the ellipse chord at its own Y position.
  const top = -blockH / 2;
  for (let i = 0; i < lines.length; i++) {
    const yCenter = top + (i + 0.5) * lineH;
    const half = ellipseHalfWidthAt(rxS, ryS, yCenter);
    if (measure(lines[i], spec) > 2 * half) return false;
  }
  return true;
}

export function effectiveInset(b: Balloon, insets: ShapeInsets): number {
  if (b.edgeInset != null) return b.edgeInset;
  return insets[shapeInsetCategory(b.shape)];
}

/**
 * Full fit: balance lines for the shape, then auto-shrink in 6% steps until
 * the block fits the safe area, flooring at max(55%, 8px).
 */
export function fitText(
  b: Balloon, insets: ShapeInsets, measure: MeasureFn,
): FitResult {
  const text = b.text || "";
  if (!text.trim()) {
    return { lines: [], fontSize: b.size, lineHeight: b.size * LINE_HEIGHT_FACTOR, overflow: false };
  }
  const inset = effectiveInset(b, insets);
  const minSize = Math.max(MIN_FONT_PX, b.size * MIN_SHRINK);
  let size = b.size;
  let lastLines: string[] = [text];
  for (let attempt = 0; attempt < 24; attempt++) {
    const spec: FontSpec = {
      font: b.font, size, weight: b.weight, italic: b.italic, tracking: b.tracking,
    };
    const lines =
      b.shape === "ellipse" || b.shape === "cloud"
        ? balanceLens(text, spec, measure)
        : balanceRect(text, spec, measure);
    lastLines = lines;
    if (blockFits(lines, spec, measure, b.shape, b.rx, b.ry, inset)) {
      return { lines, fontSize: size, lineHeight: size * LINE_HEIGHT_FACTOR, overflow: false };
    }
    const next = size * SHRINK_STEP;
    if (next < minSize) break;
    size = next;
  }
  return {
    lines: lastLines, fontSize: size, lineHeight: size * LINE_HEIGHT_FACTOR, overflow: true,
  };
}
