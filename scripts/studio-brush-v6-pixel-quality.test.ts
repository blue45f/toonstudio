import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { decodePng, encodePng } from "image-js";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

import pressureBaseline from "./fixtures/studio-chemy-v1-pressure/baseline.json";
import originalSourceManifest from "./fixtures/studio-chemy-v1-pressure/original-source-manifest.json";
import { checkLegacyChemyV1Pressure, inspectLegacyChemyPrimitives, observeChemyPixels, type ChemyPressureBaseline, type ChemyPressureObservation } from "./lib/studio-chemy-v1-pressure-policy";
import { brushV6InkDistance, brushV6InkField, brushV6InkStatistics, brushV6RelativeInkError } from "./studio-brush-v6-pixel-quality";
import { assertOriginalChemyManifest, compareOriginalChemyBytePairs, finalizeOriginalChemyReferenceRun, instrumentOriginalChemyEntry, originalChemyRequestAllowed, originalChemySha256 } from "./verify-studio-chemy-v1-original-linux-reference.mjs";

describe("V6 material pixel comparison", () => {
  it("does not count a different paper texture as a painted brush", () => {
    const roughPaper = new Uint8ClampedArray([240, 230, 220, 255, 100, 95, 90, 255]);
    const blank = brushV6InkField(roughPaper.slice(), roughPaper);
    expect(brushV6InkStatistics(blank)).toEqual({ paintedPixels: 0, inkMass: 0 });
  });

  it("rejects an opacity-only duplicate while preserving spatial material differences", () => {
    const first = new Float32Array([0, 0.2, 0.4, 0]);
    const opacityVariant = new Float32Array([0, 0.1, 0.2, 0]);
    const textured = new Float32Array([0.2, 0, 0.4, 0]);
    expect(brushV6InkDistance(first, opacityVariant)).toBe(0);
    expect(brushV6InkDistance(first, textured)).toBeCloseTo(1 / 3);
    expect(brushV6InkDistance(first, textured)).toBe(brushV6InkDistance(textured, first));
  });

  it("detects light pigment and alpha removal and rejects mismatched buffers", () => {
    const paper = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    const painted = new Uint8ClampedArray([200, 200, 200, 255, 100, 100, 100, 100]);
    expect(brushV6InkStatistics(brushV6InkField(painted, paper)).paintedPixels).toBe(2);
    expect(() => brushV6InkField(painted, paper.slice(1))).toThrow("matching RGBA");
    expect(() => brushV6InkDistance(new Float32Array(1), new Float32Array(2))).toThrow("matching dimensions");
  });

  it("rejects a blank, shifted, or changed replay even when total pigment mass matches", () => {
    const paper = [255, 255, 255, 255], original = [255, 155, 155, 255];
    expect(brushV6RelativeInkError(paper, original, original)).toBe(0);
    expect(brushV6RelativeInkError(paper, original, [254, 155, 155, 254])).toBe(0.01);
    expect(brushV6RelativeInkError(paper, original, paper)).toBe(1);
    expect(brushV6RelativeInkError(paper, original, [155, 255, 255, 155])).toBe(2);
    expect(brushV6RelativeInkError(paper, original, [255, 55, 255, 255])).toBe(1);
    expect(() => brushV6RelativeInkError(paper, original, [])).toThrow("matching dimensions");
  });
});

describe("Chemy V1 검토 계약: 관측 객체 음성 회귀이며 engine mutation 실행은 아님", () => {
  const baseline: ChemyPressureBaseline = pressureBaseline;
  const valid = (): ChemyPressureObservation => ({
    environment: structuredClone(baseline.environment), snapshot: structuredClone(baseline.snapshot),
    sourceSha256: { ...baseline.sourceSha256 },
    geometrySha256: { low: baseline.orderedGeometrySha256, high: baseline.orderedGeometrySha256 },
    pixels: structuredClone(baseline.pixels),
    primitive: { countLow: 1758, countHigh: 1758, proportionalityViolations: 0, invalidMarks: 0,
      opacitySha256: { ...baseline.opacitySha256 } }, alphaMonotonicViolations: 0,
  });
  it("합격 관측도 이전 15% 보장은 미충족이며 사용자 결정 범위를 명시한다", () => {
    const result = checkLegacyChemyV1Pressure(valid(), baseline);
    expect(result.ok).toBe(true); expect(result.evaluated).toBe(true);
    expect(result.originalAggregatePasses).toBe(false);
    expect(result.originalAggregateGateRetained).toBe(false);
    expect(result.approvalStatus).toBe("owner-approved-2026-11-05");
  });
  const negatives: [string, (actual: ChemyPressureObservation) => void][] = [
    ["같은 low 픽셀을 high에도 전달", (a) => { a.pixels.high = { ...a.pixels.low }; }],
    ["필압 무시 관측", (a) => { a.primitive.proportionalityViolations = 1758; }],
    ["필압 trace 상수화", (a) => { a.snapshot.mappedPressures = [0.5, 0.5]; }],
    ["low/high 반전", (a) => { a.sourceSha256 = { low: a.sourceSha256.high, high: a.sourceSha256.low }; }],
    ["mark 누락", (a) => { a.primitive.countHigh--; }],
    ["순서·기하 변경", (a) => { a.geometrySha256.high = "0".repeat(64); }],
    ["동일 alpha mass인 RGB 순서 변경", (a) => { a.pixels.high.rgbaSha256 = "1".repeat(64); }],
    ["공통 opacity 배율 drift", (a) => { a.primitive.opacitySha256.low = "2".repeat(64); }],
    ["seed 변경", (a) => { a.snapshot.seed++; }],
    ["보정 pressure 잘못 전달", (a) => { a.snapshot.mappedPressures = [0.15, 0.85]; }],
    ["material version 변경", (a) => { a.snapshot.materialVersion = 2; }],
    ["crop 크기 변경", (a) => { a.snapshot.width--; }],
    ["PNG fixture 누락", (a) => { a.pixels.low.fixturePngSha256 = ""; }],
    ["saturation histogram 손상", (a) => { a.pixels.high.histogramSha256 = "3".repeat(64); }],
    ["겹침 뒤 alpha 역전", (a) => { a.alphaMonotonicViolations = 1; }],
  ];
  it.each(negatives)("%s를 정상 환경에서 거부한다", (_label, mutate) => {
    const actual = valid(); expect(checkLegacyChemyV1Pressure(actual, baseline).ok).toBe(true);
    mutate(actual); const result = checkLegacyChemyV1Pressure(actual, baseline);
    expect(result.evaluated).toBe(true); expect(result.ok).toBe(false);
  });
  it("Linux 미검증은 mutation kill이 아니라 미평가 실패다", () => {
    const actual = valid(); actual.environment = { ...actual.environment, platform: "linux", architecture: "x64" };
    const result = checkLegacyChemyV1Pressure(actual, baseline);
    expect(result.ok).toBe(false); expect(result.evaluated).toBe(false);
  });
  it("골든 누락·손상과 승인 의미 누락을 거부한다", () => {
    expect(checkLegacyChemyV1Pressure(valid(), null).ok).toBe(false);
    const changed = structuredClone(baseline); changed.pixels.low.rgbaSha256 = "broken";
    expect(checkLegacyChemyV1Pressure(valid(), changed).ok).toBe(false);
    changed.contract.originalMinimumRetained = true;
    expect(checkLegacyChemyV1Pressure(valid(), changed).ok).toBe(false);
  });
  it("실제 fixture PNG bytes와 raw RGBA 지문을 구분해 고정한다", () => {
    for (const side of ["low", "high"] as const) {
      const bytes = readFileSync(new URL("./fixtures/studio-chemy-v1-pressure/" + side + ".png", import.meta.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(baseline.pixels[side].fixturePngSha256);
      expect(baseline.pixels[side].fixturePngSha256).not.toBe(baseline.pixels[side].rgbaSha256);
    }
  });
  it("단일 관측의 alpha 채널 합과 해시를 독립 Node crypto로 확인한다", async () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 64, 100, 110, 120, 255]);
    const result = await observeChemyPixels(rgba, "0".repeat(64));
    expect(result.alphaMass).toBe(319); expect(result.visiblePixels).toBe(2);
    expect(result.rgbaSha256).toBe(createHash("sha256").update(rgba).digest("hex"));
    await expect(observeChemyPixels(new Uint8ClampedArray(3), "")).rejects.toThrow();
  });
  it("sqrt 비례와 절대 opacity 지문은 서로 다른 보장을 검사한다", async () => {
    const ratio = Math.sqrt(baseline.snapshot.mappedPressures[1]! / baseline.snapshot.mappedPressures[0]!);
    const low = [{ x: 0, y: 0, secondaryMix: 0, opacity: 0.3 }, { x: 1, y: 1, secondaryMix: 1, opacity: 0.4 }];
    const high = low.map((m) => ({ ...m, opacity: m.opacity * ratio }));
    const original = await inspectLegacyChemyPrimitives(low, high, baseline.snapshot.mappedPressures);
    expect(original.proportionalityViolations).toBe(0);
    const drift = await inspectLegacyChemyPrimitives(low.map((m) => ({ ...m, opacity: m.opacity * 0.9 })),
      high.map((m) => ({ ...m, opacity: m.opacity * 0.9 })), baseline.snapshot.mappedPressures);
    expect(drift.proportionalityViolations).toBe(0);
    expect(drift.opacitySha256).not.toEqual(original.opacitySha256);
    const ignored = await inspectLegacyChemyPrimitives(low, low, baseline.snapshot.mappedPressures);
    expect(ignored.proportionalityViolations).toBeGreaterThan(0);
    const linear = await inspectLegacyChemyPrimitives(low,
      low.map((m) => ({ ...m, opacity: m.opacity * ratio * ratio })), baseline.snapshot.mappedPressures);
    expect(linear.proportionalityViolations).toBeGreaterThan(0);
  });
  it.each([[], [NaN, NaN], [0, 0], [0.9, 0.2], [Number.MIN_VALUE, Number.MAX_VALUE]].map((mapped) => [mapped]))("유효하지 않은 mapped %j를 정상 비례로 처리하지 않는다", async (mapped) => {
    const marks = [{ x: 0, y: 0, secondaryMix: 0, opacity: 0.3 }];
    expect((await inspectLegacyChemyPrimitives(marks, marks, mapped)).invalidMarks).toBeGreaterThan(0);
  });
});


describe("고정 원래 Chemy 소스의 독립 Linux 비교 경계", () => {
  it("57개 고정 commit/tree/entry와 안전한 폐쇄 집합만 받는다", () => {
    expect(assertOriginalChemyManifest(originalSourceManifest).files).toHaveLength(57);
    for (const mutate of [
      (m: typeof originalSourceManifest) => { m.sourceCommit = "0".repeat(40); },
      (m: typeof originalSourceManifest) => { m.files[1]!.path = m.files[0]!.path; },
      (m: typeof originalSourceManifest) => { m.files[0]!.path = "apps/web/src/../escape.ts"; },
      (m: typeof originalSourceManifest) => { m.files[0]!.sha256 = "missing"; },
      (m: typeof originalSourceManifest) => { m.totalSourceBytes++; },
    ]) { const changed = structuredClone(originalSourceManifest); mutate(changed); expect(() => assertOriginalChemyManifest(changed)).toThrow(); }
  });
  it("entry 지문을 검사하고 원본은 export 선언만 덧붙인다", () => {
    const source = "const element = 1, draw = 2, planStudioMaterialBrush = 3;";
    expect(instrumentOriginalChemyEntry(source, originalChemySha256(source))).toBe(source + "\nexport { element as __qaElement, draw as __qaDraw, planStudioMaterialBrush as __qaPlan };\n");
    expect(() => instrumentOriginalChemyEntry(source + " ", originalChemySha256(source))).toThrow();
  });
  const bytes = () => Object.fromEntries((["low", "high"] as const).map((side) => {
    const png = readFileSync(new URL("./fixtures/studio-chemy-v1-pressure/" + side + ".png", import.meta.url));
    return [side, { inputSha256: pressureBaseline.sourceSha256[side], geometrySha256: pressureBaseline.orderedGeometrySha256,
      opacitySha256: pressureBaseline.opacitySha256[side], raw: Uint8Array.from(decodePng(png).getRawImage().data), png: Uint8Array.from(png) }];
  })) as Record<"low" | "high", { inputSha256: string; geometrySha256: string; opacitySha256: string; raw: Uint8Array; png: Uint8Array }>;
  it("PNG 압축 bytes가 달라도 각 decode가 자기 raw와 같으면 허용한다", () => {
    const original = bytes(), current = bytes();
    current.low.png = encodePng(decodePng(current.low.png));
    expect(originalChemySha256(current.low.png)).not.toBe(originalChemySha256(original.low.png));
    expect(compareOriginalChemyBytePairs(original, current).low.exact).toBe(true);
  });
  it("동일 alpha mass의 단일 RGB delta 1도 거부한다", () => {
    const original = bytes(), current = bytes(); current.high.raw[0] ^= 1;
    expect(() => compareOriginalChemyBytePairs(original, current)).toThrow("raw RGBA");
  });
  it("양쪽 raw가 같아도 자기 PNG decode 불일치를 거부한다", () => {
    const original = bytes(), current = bytes(); original.low.raw[0] ^= 1; current.low.raw[0] ^= 1;
    expect(() => compareOriginalChemyBytePairs(original, current)).toThrow("PNG decode");
  });
  it.each(["inputSha256", "geometrySha256", "opacitySha256"] as const)("%s positive control 변경을 거부한다", (field) => {
    const original = bytes(), current = bytes(); current.high[field] = "0".repeat(64);
    expect(() => compareOriginalChemyBytePairs(original, current)).toThrow(field);
  });
  it("원래 manifest 밖 @fs 파일과 현재 소스·API·외부·다른 port를 차단한다", () => {
    const origin = "http://127.0.0.1:51999", source = "apps/web/src/frozen.ts", files = new Set(["/reference/" + source]);
    const allowed = (url: string) => originalChemyRequestAllowed(url, origin, new Set([source]), files, ["/cache", "/pinned/mixbox"]);
    expect(allowed(origin + "/" + source)).toBe(true);
    expect(allowed(origin + "/@fs/reference/" + source)).toBe(true);
    expect(allowed(origin + "/@fs/cache/deps/mixbox.js?v=1")).toBe(true);
    expect(allowed(origin + "/@fs/pinned/mixbox/mixbox.js")).toBe(true);
    for (const path of ["/@fs/reference/UNLISTED.ts", "/apps/web/src/unlisted.ts", "/@fs/current/apps/web/src/frozen.ts", "/@fs/pinned/mixbox-other/mixbox.js", "/api/works", "/@fs/cache/user.env"]) expect(allowed(origin + path)).toBe(false);
    expect(allowed("http://127.0.0.1:4111/" + source)).toBe(false);
    expect(allowed("https://example.com/" + source)).toBe(false);
    expect(allowed("invalid URL")).toBe(false);
  });
});


describe("원래 Chemy 진단의 실패·정리 전달", () => {
  it("원래 오류와 fence·브라우저 실패가 있어도 서버 종료와 receipt 저장을 모두 시도한다", async () => {
    const order: string[] = [], receipt = { exitCode: 0 }, original = new Error("원래 수집 오류");
    let actual: unknown;
    try { await finalizeOriginalChemyReferenceRun(receipt, [
      { name: "fence", run() { order.push("fence"); throw new Error("source drift"); } },
      { name: "browser", async run() { order.push("browser"); throw new Error("close rejected"); } },
      { name: "server", run() { order.push("server"); } },
    ], () => { order.push("receipt"); expect(receipt.exitCode).toBe(1); }, [original]); }
    catch (error) { actual = error; }
    expect(order).toEqual(["fence", "browser", "server", "receipt"]);
    expect(actual).toBeInstanceOf(AggregateError);
    expect((actual as AggregateError).errors).toHaveLength(3);
    expect((actual as AggregateError).errors[0]).toBe(original);
    expect(receipt.exitCode).toBe(1);
  });
  it("원래 오류가 없는 fence 실패도 receipt 뒤 nonzero 오류로 전달한다", async () => {
    const receipt = { exitCode: 0 }; let saved = false;
    await expect(finalizeOriginalChemyReferenceRun(receipt, [{ name: "fence", run() { throw new Error("source drift"); } }], () => { saved = true; })).rejects.toBeInstanceOf(AggregateError);
    expect(saved).toBe(true); expect(receipt.exitCode).toBe(1);
  });
  it.each(["browser", "server"])("%s close reject도 다른 정리와 receipt 뒤 nonzero로 전달한다", async (failed) => {
    const receipt = { exitCode: 0 }, order: string[] = [];
    await expect(finalizeOriginalChemyReferenceRun(receipt, ["browser", "server"].map((name) => ({ name, async run() { order.push(name); if (name === failed) throw new Error("close rejected"); } })), () => { order.push("receipt"); })).rejects.toBeInstanceOf(AggregateError);
    expect(order).toEqual(["browser", "server", "receipt"]); expect(receipt.exitCode).toBe(1);
  });
  it("receipt 저장 자체의 실패를 성공으로 숨기지 않는다", async () => {
    const receipt = { exitCode: 0 };
    await expect(finalizeOriginalChemyReferenceRun(receipt, [], () => { throw new Error("disk failure"); })).rejects.toBeInstanceOf(AggregateError);
    expect(receipt.exitCode).toBe(1);
  });
  it("모든 정리와 receipt 저장이 성공하면 exitCode 0으로 종료한다", async () => {
    const receipt = { exitCode: 1 }; let saved = false, cleaned = false;
    await finalizeOriginalChemyReferenceRun(receipt, [{ name: "cleanup", run() { cleaned = true; } }], () => { saved = true; });
    expect(saved).toBe(true); expect(cleaned).toBe(true); expect(receipt.exitCode).toBe(0);
  });
});


describe("원래 Chemy Linux 참조의 CI 소비 경계", () => {
  it("PR·push의 정확한 두 입력과 failure-only 180초 참조 단계를 연결한다", () => {
    const document = parseDocument(readFileSync(new URL("../.github/workflows/studio-material-morphology.yml", import.meta.url), "utf8"), { uniqueKeys: true });
    expect(document.errors).toEqual([]);
    const workflow = document.toJS() as { on: Record<string, { paths: string[] }>; jobs: Record<string, { "runs-on": string; "timeout-minutes": number; steps: { name?: string; if?: string; run?: string; "timeout-minutes"?: number; "continue-on-error"?: boolean; with?: { path?: string } }[] }> };
    for (const event of ["pull_request", "push"]) {
      const paths = workflow.on[event]!.paths;
      for (const file of ["scripts/verify-studio-chemy-v1-original-linux-reference.mjs", "scripts/fixtures/studio-chemy-v1-pressure/original-source-manifest.json"]) expect(paths.filter((path) => path === file)).toHaveLength(1);
      for (const name of ["baseline.json", "low.png", "high.png"]) expect(paths).toContain("scripts/fixtures/studio-chemy-v1-pressure/" + name);
    }
    const job = workflow.jobs["material-morphology"]!;
    expect(job["runs-on"]).toBe("ubuntu-24.04"); expect(job["timeout-minutes"]).toBe(35);
    const index = job.steps.findIndex((step) => step.name === "같은 Linux job에서 고정 원래 Chemy 소스 두 Canvas 비교"), step = job.steps[index]!;
    expect(index).toBeGreaterThan(0); expect(step.if).toBe("failure()"); expect(step["timeout-minutes"]).toBe(5); expect(step["continue-on-error"]).toBeUndefined();
    expect(step.run?.replace(/\s+/gu, " ").trim()).toBe('timeout --signal=TERM --kill-after=10s 180s node scripts/verify-studio-chemy-v1-original-linux-reference.mjs --current "$RUNNER_TEMP/studio-material-morphology/legacy-chemy-pressure-only" --out "$RUNNER_TEMP/studio-material-morphology/original-linux-reference"');
    expect(job.steps[index - 1]!.name).toBe("실패 뒤 Chemy V1 원본 두 Canvas 수집");
    expect(job.steps[index + 1]!.if).toBe("always()");
    expect(job.steps[index + 1]!.with?.path).toBe("${{ runner.temp }}/studio-material-morphology");
    expect(job.steps.find((item) => item.name === "Verify six hybrid topology engines, thirty materials and twelve symmetry combinations")?.run).toBe("node scripts/verify-studio-hybrid-topology.mjs");
  });
});
