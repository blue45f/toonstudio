import { beforeAll, describe, expect, it } from "vitest";

import { LIBMYPAINT_PRIME_DTIME_SECONDS, createLibMypaintIncrementalStrokeSession } from "../libmypaint";
import { loadLibMypaint } from "../libmypaint/index";

import type { LibMypaintBrushDocument } from "../libmypaint";
import type { LibMypaintRaw } from "../libmypaint/index";

let lmp: LibMypaintRaw;
beforeAll(async () => { lmp = await loadLibMypaint(); });

/** slow_tracking 이 있는 최소 문서: 새 브러시는 추적 커서가 (0, 0)에서 출발한다. */
const slowTracking: LibMypaintBrushDocument = { settings: {
  radius_logarithmic: { base_value: Math.log(4), inputs: {} },
  opaque: { base_value: 0.9, inputs: {} },
  slow_tracking: { base_value: 1, inputs: {} },
} };

function render(document: LibMypaintBrushDocument, primeAtFirstSample?: boolean) {
  const session = createLibMypaintIncrementalStrokeSession(lmp, document,
    { width: 256, height: 128, seed: 7, finishTailSteps: 0, ...(primeAtFirstSample === undefined ? {} : { primeAtFirstSample }) });
  try {
    session.append([
      { x: 150, y: 70, pressure: 0.7, tiltX: 0, tiltY: 0, tMs: 0 },
      { x: 170, y: 70, pressure: 0.7, tiltX: 0, tiltY: 0, tMs: 16 },
    ]);
    return session.finish();
  } finally { session.dispose(); }
}

function inkIn(frame: Uint8Array, x0: number, y0: number, x1: number, y1: number): number {
  let total = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) total += frame[(y * 256 + x) * 4 + 3]!;
  return total;
}

describe("libmypaint first-sample priming", () => {
  it("uses a dtime above libmypaint's 5 s reset threshold", () => {
    expect(LIBMYPAINT_PRIME_DTIME_SECONDS).toBeGreaterThan(5);
  });

  it("keeps the default feed byte-identical and starts tracked brushes at the stroke when asked", () => {
    const unprimed = render(slowTracking);
    expect(Buffer.compare(Buffer.from(unprimed), Buffer.from(render(slowTracking, false)))).toBe(0);
    expect(inkIn(unprimed, 0, 0, 60, 40)).toBeGreaterThan(0);
    const primed = render(slowTracking, true);
    expect(inkIn(primed, 0, 0, 60, 40)).toBe(0);
    expect(inkIn(primed, 130, 50, 190, 90)).toBeGreaterThan(0);
  });

  it("does not change a brush without slow tracking beyond the reset it would get anyway", () => {
    const plain: LibMypaintBrushDocument = { settings: { radius_logarithmic: { base_value: Math.log(4), inputs: {} } } };
    const unprimed = render(plain), primed = render(plain, true);
    expect(inkIn(unprimed, 0, 0, 120, 50)).toBe(0);
    expect(inkIn(primed, 0, 0, 120, 50)).toBe(0);
    expect(inkIn(primed, 130, 50, 190, 90)).toBeGreaterThan(0);
  });
});
