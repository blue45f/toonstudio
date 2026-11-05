/** Browser audit of the actual product Canvas/streaming/SVG material paths. Synthetic pen input only. */
import { planStudioMaterialBrush, renderStudioMaterialBrush, renderStudioMaterialBrushMarks, StudioMaterialBrushPlanner, studioMaterialBrushMarksToSvg, type StudioMaterialBrushElement } from "../apps/web/src/domains/creator/brush/studio-material-brush-runtime";
import { createBrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { mapBrushStudioV6Pressure, normalizeBrushStudioV6MaterialConfig } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V6_TOPOLOGIES } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-topology-catalog";

import { selectLegacyChemyV1PressureBaseline } from "./lib/studio-chemy-v1-pressure-baselines";
import { checkLegacyChemyV1Pressure, chemySha256, inspectLegacyChemyPrimitives, observeChemyPixels, type ChemyPressureEnvironment, type ChemyPressureObservation } from "./lib/studio-chemy-v1-pressure-policy";

function canvas(width = 640, height = 480) { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; }
function element(id: string, pressure?: number): StudioMaterialBrushElement {
  const program = createBrushStudioV6Program(id);
  const material = normalizeBrushStudioV6MaterialConfig({ ...program, tuning: { ...program.tuning,
    size: 44, spacing: 0.07, primaryColor: "#273444", secondaryColor: "#c2805c", particleCount: 2048,
    bristleStrands: 64, patternDensity: 0.65, patternScale: 1.2, patternJitter: 0.6 } })!;
  const points: number[] = [], pressures: number[] = [], tiltXs: number[] = [], tiltYs: number[] = [];
  for (let i = 0; i < 96; i++) {
    const t = i / 95; points.push(70 + t * 490, 240 + Math.sin(t * Math.PI * 2) * 35);
    pressures.push(pressure ?? 0.1 + 0.8 * Math.sin(Math.PI * t)); tiltXs.push(20); tiltYs.push(10);
  }
  return { points, pressures, tiltXs, tiltYs, stroke: "#273444", strokeWidth: 44, opacity: 0.9,
    brushEnginePrograms: { version: 1, material } };
}
function draw(source: StudioMaterialBrushElement, dpr = 1, live = false) {
  const target = canvas(640 * dpr, 480 * dpr), ctx = target.getContext("2d")!; ctx.scale(dpr, dpr);
  const start = performance.now();
  if (live) {
    const planner = new StudioMaterialBrushPlanner();
    for (let i = 1; i <= source.points.length / 2; i++) planner.appendBatches({ ...source,
      points: source.points.slice(0, i * 2), pressures: source.pressures?.slice(0, i),
      tiltXs: source.tiltXs?.slice(0, i), tiltYs: source.tiltYs?.slice(0, i),
    }, (marks) => renderStudioMaterialBrushMarks(ctx, marks, source.symmetry));
  } else renderStudioMaterialBrush(ctx, source);
  const submitMs = performance.now() - start;
  const rgba = ctx.getImageData(0, 0, target.width, target.height).data;
  let mass = 0, visible = 0;
  for (let i = 3; i < rgba.length; i += 4) { mass += rgba[i]!; if (rgba[i]! > 4) visible++; }
  return { target, rgba, mass, visible, submitMs };
}
/** 실패한 원래 입력과 Canvas만 보존한다. PNG 바이트와 raw RGBA 지문은 다른 값이다. */
export async function captureStudioHybridPressureFailure(
  id: string, lowSource: StudioMaterialBrushElement, highSource: StudioMaterialBrushElement,
  low: ReturnType<typeof draw>, high: ReturnType<typeof draw>,
) {
  const sha256 = async (bytes: ArrayLike<number>) => Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const capture = async (source: StudioMaterialBrushElement, image: ReturnType<typeof draw>) => {
    const marks = planStudioMaterialBrush(source);
    return {
      inputSha256: await sha256(new TextEncoder().encode(JSON.stringify(source))),
      rawRgbaSha256: await sha256(image.rgba),
      primitive: {
        count: marks.length,
        orderedGeometrySha256: await sha256(new TextEncoder().encode(JSON.stringify(marks.map(({ opacity: _opacity, ...mark }) => mark)))),
        opacitySha256: await sha256(new TextEncoder().encode(JSON.stringify(marks.map((mark) => mark.opacity)))),
      },
      width: image.target.width, height: image.target.height,
      alphaMass: image.mass, visiblePixels: image.visible,
      pngDataUrl: image.target.toDataURL("image/png"),
    };
  };
  return { id, low: await capture(lowSource, low), high: await capture(highSource, high) };
}

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return Infinity;
  let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!); return sum;
}
function alphaDistance(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let massA = 0, massB = 0; for (let i = 3; i < a.length; i += 4) { massA += a[i]!; massB += b[i]!; }
  let sum = 0; for (let i = 3; i < a.length; i += 4) sum += Math.abs(a[i]! / Math.max(1, massA) - b[i]! / Math.max(1, massB));
  return sum / 2;
}
async function svgPixels(source: StudioMaterialBrushElement) {
  const marks = planStudioMaterialBrush(source), target = canvas();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">${studioMaterialBrushMarksToSvg(marks, source.symmetry)}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const ctx = target.getContext("2d")!; ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, 640, 480).data;
  } finally { URL.revokeObjectURL(url); }
}


/** 원본 입력·계획·raw RGBA 관측. PNG 해시는 fixture 무결성만 의미한다. */
async function collectLegacyChemyPressure(
  environment: ChemyPressureEnvironment | undefined,
  lowSource: StudioMaterialBrushElement, highSource: StudioMaterialBrushElement,
  light: ReturnType<typeof draw>, heavy: ReturnType<typeof draw>,
) {
  if (!environment) throw new Error("legacy pixel environment metadata is required");
  const selected = selectLegacyChemyV1PressureBaseline(environment);
  if (!selected) throw new Error("legacy pixel environment unverified; frozen baseline unavailable");
  const { baseline, fixtureDirectory } = selected;
  const lowMarks = planStudioMaterialBrush(lowSource), highMarks = planStudioMaterialBrush(highSource);
  const fixtureSha = async (name: string) => {
    const response = await fetch("/scripts/fixtures/studio-chemy-v1-pressure/" + fixtureDirectory + name + ".png");
    if (!response.ok) throw new Error(name + " frozen PNG fixture unavailable: " + response.status);
    return chemySha256(new Uint8Array(await response.arrayBuffer()));
  };
  const material = lowSource.brushEnginePrograms!.material!;
  const geometry = (marks: typeof lowMarks) => JSON.stringify(marks.map(({ opacity: _opacity, ...mark }) => mark));
  let alphaMonotonicViolations = 0;
  for (let i = 3; i < light.rgba.length; i += 4) if (heavy.rgba[i]! < light.rgba[i]!) alphaMonotonicViolations++;
  const observation: ChemyPressureObservation = {
    environment,
    snapshot: { materialVersion: material.version, carrier: material.slots.carrier, seed: material.seed,
      sampleCount: lowSource.points.length / 2, rawPressures: [lowSource.pressures![0]!, highSource.pressures![0]!],
      mappedPressures: [mapBrushStudioV6Pressure(lowSource.pressures![0]!, material.input),
        mapBrushStudioV6Pressure(highSource.pressures![0]!, material.input)],
      markCount: lowMarks.length, width: light.target.width, height: light.target.height },
    sourceSha256: { low: await chemySha256(JSON.stringify(lowSource)), high: await chemySha256(JSON.stringify(highSource)) },
    geometrySha256: { low: await chemySha256(geometry(lowMarks)), high: await chemySha256(geometry(highMarks)) },
    pixels: { low: await observeChemyPixels(light.rgba, await fixtureSha("low")),
      high: await observeChemyPixels(heavy.rgba, await fixtureSha("high")) },
    primitive: await inspectLegacyChemyPrimitives(lowMarks, highMarks, baseline.snapshot.mappedPressures),
    alphaMonotonicViolations,
  };
  return { ...checkLegacyChemyV1Pressure(observation, baseline), observation };
}

/** 외부 검토용: 원래 640×480 low/high 두 draw만 실행한다. */
export async function auditStudioLegacyChemyV1Pressure(environment: ChemyPressureEnvironment) {
  const lowSource = element("klecks-chemy", 0.15), highSource = element("klecks-chemy", 0.85);
  const light = draw(lowSource), heavy = draw(highSource);
  // 환경·골든 판정이 실패해도 이미 그린 원본 두 Canvas를 진단 자료로 남긴다. 재그리기는 없다.
  const captured = await captureStudioHybridPressureFailure("klecks-chemy", lowSource, highSource, light, heavy);
  let policy: Awaited<ReturnType<typeof collectLegacyChemyPressure>> | { ok: false; evaluated: false; failures: string[] };
  try { policy = await collectLegacyChemyPressure(environment, lowSource, highSource, light, heavy); }
  catch (error) { policy = { ok: false, evaluated: false, failures: ["legacy pressure policy failed: " + String(error)] }; }
  return { ...policy, backend: "real-browser-canvas2d", cases: [{ id: "klecks-chemy", legacyPressurePolicy: policy }],
    successfulDrawCalls: { low: 1, high: 1 }, reviewOnly: true,
    scope: "명시적 Chemy V1 압력 진단: 원래 low/high 두 draw만 수집하며 미평가 실패와 기존 판정을 유지한다.",
    pressureFailureArtifacts: [{ ...captured,
      low: { ...captured.low, input: lowSource, rawRgba: Array.from(light.rgba) },
      high: { ...captured.high, input: highSource, rawRgba: Array.from(heavy.rgba) } }],
    pressureFailureArtifactErrors: [],
  };
}

export async function auditStudioHybridTopology(environment?: ChemyPressureEnvironment) {
  const failures: string[] = [], cases = [], times: number[] = [], planTimes: number[] = [];
  const pressureFailureArtifacts: Awaited<ReturnType<typeof captureStudioHybridPressureFailure>>[] = [];
  const pressureFailureArtifactErrors: { id: string; error: string }[] = [];
  const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
  const sheet = canvas(1280, 1620), sheetCtx = sheet.getContext("2d")!;
  sheetCtx.fillStyle = "#fff"; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
  const shapes: { id: string; rgba: Uint8ClampedArray }[] = [];
  draw(element(BRUSH_STUDIO_V6_TOPOLOGIES[0]!.recipeId));
  for (const [index, topology] of BRUSH_STUDIO_V6_TOPOLOGIES.entries()) {
    const source = element(topology.recipeId), retained = draw(source);
    const replay = draw(JSON.parse(JSON.stringify(source)) as StudioMaterialBrushElement);
    check(difference(retained.rgba, replay.rgba) === 0, `${topology.recipeId}: JSON replay mismatch`);
    check(retained.visible > 100, `${topology.recipeId}: insufficient visible paint`);
    const liveDifferences: number[] = [];
    for (const dpr of [1, 2, 3]) {
      const full = dpr === 1 ? retained : draw(source, dpr), live = draw(source, dpr, true);
      const diff = difference(full.rgba, live.rgba); liveDifferences.push(diff);
      check(diff === 0, `${topology.recipeId}: DPR ${dpr} streaming mismatch (${diff})`);
    }
    const lowSource = element(topology.recipeId, 0.15), light = draw(lowSource);
    const highSource = element(topology.recipeId, 0.85), heavy = draw(highSource);
    const pressureRatio = heavy.mass / Math.max(1, light.mass);
    let legacyPressurePolicy: Awaited<ReturnType<typeof collectLegacyChemyPressure>> | undefined;
    if (topology.recipeId === "klecks-chemy") {
      try {
        legacyPressurePolicy = await collectLegacyChemyPressure(environment, lowSource, highSource, light, heavy);
        for (const failure of legacyPressurePolicy.failures) check(false, topology.recipeId + ": " + failure);
      } catch (error) { check(false, topology.recipeId + ": legacy pressure policy failed: " + String(error)); }
    } else {
      check(pressureRatio > 1.15, `${topology.recipeId}: ineffective pressure (${pressureRatio})`);
    }
    // 이전 하한 미달의 원본 증거는 승인된 계약과 별도로 계속 보존한다.
    if (!(pressureRatio > 1.15)) {
      try {
        pressureFailureArtifacts.push(await captureStudioHybridPressureFailure(topology.recipeId, lowSource, highSource, light, heavy));
      } catch (error) {
        pressureFailureArtifactErrors.push({ id: topology.recipeId, error: String(error) });
      }
    }
    const svgDistance = alphaDistance(retained.rgba, await svgPixels(source));
    check(svgDistance < 0.06, `${topology.recipeId}: SVG alpha-distance ${svgDistance}`);
    const hybridCases = [];
    for (const deposition of ["deposit-ink", "deposit-marker", "deposit-dry", "deposit-wet", "deposit-oil"]) {
      const material = source.brushEnginePrograms!.material!;
      const hybrid: StudioMaterialBrushElement = { ...source, brushEnginePrograms: { version: 1, material: {
        ...material, slots: { ...material.slots, deposition, surface: "surface-coldpress", finish: ["finish-neon"] },
        tuning: { ...material.tuning, wetness: 0.8, diffusion: 0.65, relief: 0.7, granulation: 0.6 },
      } } };
      const full = draw(hybrid), live = draw(hybrid, 1, true), saved = draw(JSON.parse(JSON.stringify(hybrid)) as StudioMaterialBrushElement);
      const diff = difference(full.rgba, live.rgba) + difference(full.rgba, saved.rgba);
      check(diff === 0, `${topology.recipeId}/${deposition}: hybrid replay mismatch`);
      check(full.visible > 100, `${topology.recipeId}/${deposition}: empty hybrid`);
      hybridCases.push({ deposition, replayDifference: diff, visiblePixels: full.visible });
    }
    const symmetryCases = [];
    for (const type of ["vertical", "kaleidoscope"] as const) {
      const mirrored: StudioMaterialBrushElement = { ...source, symmetry: { type, centerX: 320, centerY: 240, radialCount: 3 } };
      const full = draw(mirrored), live = draw(mirrored, 1, true);
      const diff = difference(full.rgba, live.rgba), svgDistance = alphaDistance(full.rgba, await svgPixels(mirrored));
      check(diff === 0, `${topology.recipeId}/${type}: symmetry live mismatch`);
      check(svgDistance < 0.06, `${topology.recipeId}/${type}: symmetry SVG mismatch`);
      symmetryCases.push({ type, liveDifference: diff, svgAlphaDistance: svgDistance });
    }
    for (let trial = 0; trial < 5; trial++) {
      const start = performance.now(), marks = planStudioMaterialBrush(source);
      planTimes.push(performance.now() - start);
      const target = canvas(), ctx = target.getContext("2d")!, submit = performance.now();
      renderStudioMaterialBrushMarks(ctx, marks); times.push(performance.now() - submit);
    }
    shapes.push({ id: topology.recipeId, rgba: retained.rgba });
    const x = index % 2 * 640, y = Math.floor(index / 2) * 540;
    sheetCtx.fillStyle = "#17212e"; sheetCtx.font = "bold 22px sans-serif";
    sheetCtx.fillText(topology.label, x + 22, y + 32);
    sheetCtx.font = "13px sans-serif"; sheetCtx.fillText(topology.recipeId, x + 22, y + 53);
    sheetCtx.drawImage(retained.target, x, y + 60);
    cases.push({ id: topology.recipeId, liveDifferences, jsonDifference: difference(retained.rgba, replay.rgba),
      svgAlphaDistance: svgDistance, pressureMassRatio: pressureRatio, legacyPressurePolicy, visiblePixels: retained.visible,
      markCount: planStudioMaterialBrush(source).length, hybridCases, symmetryCases });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  let minimumDistance = Infinity, pairs = 0, closestPair: string[] = [];
  for (let i = 0; i < shapes.length; i++) for (let j = 0; j < i; j++) {
    const distance = alphaDistance(shapes[i]!.rgba, shapes[j]!.rgba); pairs++;
    if (distance < minimumDistance) { minimumDistance = distance; closestPair = [shapes[i]!.id, shapes[j]!.id]; }
    check(distance > 0.1, `${shapes[i]!.id}/${shapes[j]!.id}: convergent geometry (${distance})`);
  }
  const p95 = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)]!;
  const performanceResult = { planningP95: p95(planTimes), submissionP95: p95(times), trials: times.length, excludesReadback: true };
  check(performanceResult.planningP95 < 33, "planner exceeds 33ms freeze guard");
  check(performanceResult.submissionP95 < 50, "submission exceeds 50ms freeze guard");
  return { backend: "real-browser-canvas2d", cases, distinctness: { pairs, minimumDistance, closestPair, opacityNormalized: true },
    performance: performanceResult, failures, pressureFailureArtifacts, pressureFailureArtifactErrors,
    chemyPressurePolicy: { originalMinimumExclusive: 1.15, originalMinimumRetained: false, approvalStatus: "owner-approved-2026-11-05" },
    scope: "Chemy V1 preserves legacy pixels instead of its former 15% floor. Synthetic input only; no physical pen, fluid-grid or WebGPU latency claim", sheets: [sheet.toDataURL("image/png")] };
}
