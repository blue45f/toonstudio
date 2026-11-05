import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { decodePng, encodePng } from "image-js";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

import { BRUSH_STUDIO_V6_TOPOLOGIES } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-topology-catalog";

import pressureBaseline from "./fixtures/studio-chemy-v1-pressure/baseline.json";
import linuxPressureBaseline from "./fixtures/studio-chemy-v1-pressure/linux-x64/baseline.json";
import originalSourceManifest from "./fixtures/studio-chemy-v1-pressure/original-source-manifest.json";
import { selectLegacyChemyV1PressureBaseline } from "./lib/studio-chemy-v1-pressure-baselines";
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

describe("전체 topology의 다른 33종 하한과 승인한 Chemy 배선 계약: AST·가짜 VM 응답", () => {
  const file = ts.createSourceFile("studio-hybrid-topology-browser.ts",
    readFileSync(new URL("./studio-hybrid-topology-browser.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const audit = file.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === "auditStudioHybridTopology");
  const loop = audit?.body?.statements.find((node): node is ts.ForOfStatement =>
    ts.isForOfStatement(node) && node.expression.getText(file) === "BRUSH_STUDIO_V6_TOPOLOGIES.entries()");
  const isPressureGate = (node: ts.Statement) => {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
    const [condition] = node.expression.arguments;
    return node.expression.expression.getText(file) === "check" && !!condition && ts.isBinaryExpression(condition)
      && condition.left.getText(file) === "pressureRatio";
  };

  it("실제 AST의 하한·수집·실패 전달 분기를 가짜 정책 응답으로 검사하며 engine 픽셀 검증은 아니다", async () => {
    if (!loop || !ts.isBlock(loop.statement)) throw new Error("전체 topology 감사 루프가 필요합니다.");
    expect(loop.statement.statements.filter(isPressureGate)).toHaveLength(0);
    const branches = loop.statement.statements.filter((node): node is ts.IfStatement =>
      ts.isIfStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && node.expression.left.getText(file) === "topology.recipeId"
      && ts.isStringLiteral(node.expression.right) && node.expression.right.text === "klecks-chemy");
    expect(branches).toHaveLength(1);
    const branch = branches[0];
    if (!branch || !ts.isBlock(branch.thenStatement) || !branch.elseStatement || !ts.isBlock(branch.elseStatement)) {
      throw new Error("Chemy 고정 정책과 다른 topology의 하한을 나누는 실제 if/else가 필요합니다.");
    }
    const pressureGates = branch.elseStatement.statements.filter(isPressureGate);
    expect(pressureGates).toHaveLength(1);
    const gate = pressureGates[0];
    if (!gate) throw new Error("다른 33종의 실제 압력 gate가 필요합니다.");
    const ratios = [[1, false], [1.1323929288472774, false], [1.15, false],
      [1.150001, true], [NaN, false]] as const;
    // 실제 else 문장을 실행한다. Chemy에 옛 15% 하한을 다시 적용하지 않는다.
    for (const [pressureRatio, expected] of ratios) {
      const checks: boolean[] = [];
      runInNewContext(gate.getText(file), {
        topology: { recipeId: "control-topology" }, pressureRatio,
        check: (ok: boolean) => { checks.push(ok); },
      });
      expect(checks, "control-topology: " + pressureRatio).toEqual([expected]);
    }
    // 아래 VM은 정책 응답만 가짜다. 실제 renderer·PNG·원본 참조의 증거로 계산하지 않는다.
    for (const [pressureRatio] of ratios) {
      for (const mode of ["valid", "RGBchanged", "throw"] as const) {
        const checks: { ok: boolean; message: string }[] = [], collected: unknown[][] = [];
        const environment = { browser: "fake", platform: "fake", architecture: "fake" };
        const lowSource = { name: "low-source" }, highSource = { name: "high-source" };
        const light = { name: "low-canvas" }, heavy = { name: "high-canvas" };
        const inputs = [environment, lowSource, highSource, light, heavy];
        await runInNewContext("(async () => { " + branch.getText(file) + " })()", {
          topology: { recipeId: "klecks-chemy" }, pressureRatio, environment, lowSource, highSource, light, heavy,
          legacyPressurePolicy: undefined,
          collectLegacyChemyPressure: async (...args: unknown[]) => {
            collected.push(args);
            if (mode === "throw") throw new Error("collection failed");
            return { failures: mode === "RGBchanged" ? ["RGBchanged"] : [] };
          },
          check: (ok: boolean, message: string) => { checks.push({ ok, message }); },
        });
        expect(collected, mode + ": " + pressureRatio).toHaveLength(1);
        expect(collected[0]).toHaveLength(inputs.length);
        for (const [index, input] of inputs.entries()) expect(collected[0]?.[index]).toBe(input);
        if (mode === "valid") {
          expect(checks, "가짜 valid 정책에는 옛 aggregate 하한을 적용하지 않는다: " + pressureRatio).toEqual([]);
        } else if (mode === "RGBchanged") {
          expect(checks).toEqual([{ ok: false, message: "klecks-chemy: RGBchanged" }]);
        } else {
          expect(checks).toEqual([{ ok: false,
            message: "klecks-chemy: legacy pressure policy failed: Error: collection failed" }]);
        }
      }
    }
  });

  it("전체 보고서는 승인한 Chemy만 원래 하한을 포기한 고정 정책으로 기록한다", () => {
    const result = audit?.body?.statements.find(ts.isReturnStatement)?.expression;
    if (!result || !ts.isObjectLiteralExpression(result)) throw new Error("전체 감사 보고서가 필요합니다.");
    const policy = result.properties.find((node): node is ts.PropertyAssignment =>
      ts.isPropertyAssignment(node) && node.name.getText(file) === "chemyPressurePolicy");
    if (!policy) throw new Error("전체 감사의 압력 계약 보고가 필요합니다.");
    expect(runInNewContext("(" + policy.initializer.getText(file) + ")")).toEqual({
      originalMinimumExclusive: 1.15, originalMinimumRetained: false, approvalStatus: "owner-approved-2026-11-05",
    });
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
  it("Linux 관측에 Mac 골든을 직접 적용하면 미평가 실패다", () => {
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
  it("PR·push의 원래 참조·OS별 입력과 failure-only 180초 참조 단계를 연결한다", () => {
    const document = parseDocument(readFileSync(new URL("../.github/workflows/studio-material-morphology.yml", import.meta.url), "utf8"), { uniqueKeys: true });
    expect(document.errors).toEqual([]);
    const workflow = document.toJS() as { on: Record<string, { paths: string[] }>; jobs: Record<string, { "runs-on": string; "timeout-minutes": number; steps: { name?: string; if?: string; run?: string; "timeout-minutes"?: number; "continue-on-error"?: boolean; with?: { path?: string } }[] }> };
    for (const event of ["pull_request", "push"]) {
      const paths = workflow.on[event]!.paths;
      for (const file of ["scripts/verify-studio-chemy-v1-original-linux-reference.mjs", "scripts/fixtures/studio-chemy-v1-pressure/original-source-manifest.json",
        "scripts/lib/studio-chemy-v1-pressure-baselines.ts", "scripts/fixtures/studio-chemy-v1-pressure/linux-x64/baseline.json",
        "scripts/fixtures/studio-chemy-v1-pressure/linux-x64/low.png", "scripts/fixtures/studio-chemy-v1-pressure/linux-x64/high.png",
      ]) expect(paths.filter((path) => path === file)).toHaveLength(1);
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


describe("검증한 Chemy V1 환경의 골든 선택과 실제 PNG 경계", () => {
  const variants = [
    { name: "darwin-arm64", baseline: pressureBaseline, fixtureDirectory: "",
      rgba: { low: "4864d1efb7d08ab3c44157626f8939bc5ebc8fde78680bf45e0b3705b31f6773",
        high: "abcb8641227cb4e00064f62f621a653da8c0744c5fad42f9807a7cf5fd4eb8b6" },
      png: { low: "177f7858dc2ee0b9d534648923f045ae9c226eeaa09cffdb37ed40091ca571db",
        high: "51dc4fd65ab236f3073fd78e3aa806be0d82a1b2c67bb7e0f20586340a2ef5c6" } },
    { name: "linux-x64", baseline: linuxPressureBaseline, fixtureDirectory: "linux-x64/",
      rgba: { low: "74540e0ccc12dbc498510822fd4eff4bb076a2b6c5b0b0c394ff936fea8a5afb",
        high: "feedec57875a354721759c936f86d0c29fb70575817c33be352b947723161c93" },
      png: { low: "5c09298a21841f9eadaad4b73541751199e4d95eb0a2c8e6e18935e62e25bbc5",
        high: "4df0563aa84082faf463b428549c5d549efd7e6303428b8ffce07e704d36bc61" } },
  ] as const;
  const observation = (baseline: ChemyPressureBaseline): ChemyPressureObservation => ({
    environment: structuredClone(baseline.environment), snapshot: structuredClone(baseline.snapshot),
    sourceSha256: { ...baseline.sourceSha256 },
    geometrySha256: { low: baseline.orderedGeometrySha256, high: baseline.orderedGeometrySha256 },
    pixels: structuredClone(baseline.pixels),
    primitive: { countLow: baseline.snapshot.markCount, countHigh: baseline.snapshot.markCount,
      proportionalityViolations: 0, invalidMarks: 0, opacitySha256: { ...baseline.opacitySha256 } },
    alphaMonotonicViolations: 0,
  });
  const fixture = (directory: string, side: "low" | "high") => {
    const url = new URL("./fixtures/studio-chemy-v1-pressure/" + directory + side + ".png", import.meta.url);
    const png = readFileSync(url), raw = decodePng(png).getRawImage();
    expect(raw).toMatchObject({ width: 640, height: 480, channels: 4, bitDepth: 8 });
    expect(raw.data).toHaveLength(1_228_800);
    return { url, png, rgba: Uint8ClampedArray.from(raw.data) };
  };
  it.each(variants)("$name의 정확한 세 환경 값과 PNG 폴더를 함께 선택한다", ({ baseline, fixtureDirectory }) => {
    const selected = selectLegacyChemyV1PressureBaseline(baseline.environment);
    if (!selected) throw new Error("검증한 환경의 골든을 선택해야 합니다.");
    expect(selected.baseline).toBe(baseline);
    expect(selected.fixtureDirectory).toBe(fixtureDirectory);
    for (const side of ["low", "high"] as const) {
      expect(new URL("./fixtures/studio-chemy-v1-pressure/" + selected.fixtureDirectory + side + ".png", import.meta.url).pathname)
        .toBe(new URL("./fixtures/studio-chemy-v1-pressure/" + fixtureDirectory + side + ".png", import.meta.url).pathname);
    }
  });
  const unknownEnvironments: [string, Parameters<typeof selectLegacyChemyV1PressureBaseline>[0]][] = [
    ["환경 누락", undefined], ["환경 null", null], ["세 값 누락", {}],
    ["browser 누락", { platform: "linux", architecture: "x64" }],
    ["platform 누락", { browser: "156.0.8078.4", architecture: "x64" }],
    ["architecture 누락", { browser: "156.0.8078.4", platform: "linux" }],
    ["다른 browser patch", { browser: "156.0.8078.5", platform: "linux", architecture: "x64" }],
    ["축약 browser", { browser: "156.0.8078", platform: "linux", architecture: "x64" }],
    ["Mac x64", { browser: "156.0.8078.4", platform: "darwin", architecture: "x64" }],
    ["Linux arm64", { browser: "156.0.8078.4", platform: "linux", architecture: "arm64" }],
    ["Windows x64", { browser: "156.0.8078.4", platform: "win32", architecture: "x64" }],
    ["OS 대소문자", { browser: "156.0.8078.4", platform: "Linux", architecture: "x64" }],
    ["빈 architecture", { browser: "156.0.8078.4", platform: "linux", architecture: "" }],
  ];
  it.each(unknownEnvironments)("%s는 다른 환경으로 대체하지 않고 미평가 실패로 남긴다", (_label, environment) => {
    const selected = selectLegacyChemyV1PressureBaseline(environment);
    expect(selected).toBeNull();
    expect(checkLegacyChemyV1Pressure(observation(pressureBaseline), selected?.baseline ?? null))
      .toMatchObject({ ok: false, evaluated: false });
  });
  it.each(variants)("$name의 실제 PNG decode와 전체 RGBA·alpha 관측은 고정 골든과 정확히 같다", async ({ baseline, fixtureDirectory, rgba, png }) => {
    const selected = selectLegacyChemyV1PressureBaseline(baseline.environment);
    if (!selected) throw new Error("검증한 환경의 골든을 선택해야 합니다.");
    const actual = observation(baseline);
    for (const side of ["low", "high"] as const) {
      const image = fixture(selected.fixtureDirectory, side);
      const pngSha256 = createHash("sha256").update(image.png).digest("hex");
      const rgbaSha256 = createHash("sha256").update(image.rgba).digest("hex");
      expect(image.url.pathname.endsWith("/studio-chemy-v1-pressure/" + fixtureDirectory + side + ".png")).toBe(true);
      expect(pngSha256).toBe(png[side]); expect(pngSha256).toBe(baseline.pixels[side].fixturePngSha256);
      expect(rgbaSha256).toBe(rgba[side]); expect(rgbaSha256).toBe(baseline.pixels[side].rgbaSha256);
      expect(pngSha256).not.toBe(rgbaSha256);
      actual.pixels[side] = await observeChemyPixels(image.rgba, pngSha256);
      expect(actual.pixels[side]).toEqual(baseline.pixels[side]);
    }
    const result = checkLegacyChemyV1Pressure(actual, selected.baseline);
    expect(result).toMatchObject({ ok: true, evaluated: true, originalAggregatePasses: false,
      originalAggregateGateRetained: false, approvalStatus: "owner-approved-2026-11-05" });
  });
  it("두 환경의 입력·순서 기하·절대 opacity·alpha 계약은 같고 RGB 골든만 분리한다", () => {
    for (const key of ["policy", "contractChange", "snapshot", "sourceSha256", "orderedGeometrySha256",
      "geometrySerialization", "referenceLaw", "opacitySha256", "contract", "approval"] as const) {
      expect(linuxPressureBaseline[key]).toEqual(pressureBaseline[key]);
    }
    for (const side of ["low", "high"] as const) {
      for (const key of ["alphaMass", "visiblePixels", "opaquePixels", "alphaAtLeast95PercentPixels", "histogramSha256"] as const) {
        expect(linuxPressureBaseline.pixels[side][key]).toBe(pressureBaseline.pixels[side][key]);
      }
      expect(linuxPressureBaseline.pixels[side].rgbaSha256).not.toBe(pressureBaseline.pixels[side].rgbaSha256);
      expect(linuxPressureBaseline.pixels[side].fixturePngSha256).not.toBe(pressureBaseline.pixels[side].fixturePngSha256);
    }
  });
  it.each(variants)("$name에서 다른 OS 골든이나 환경만 바꾼 다른 OS 픽셀을 거부한다", ({ baseline }) => {
    const other = baseline.environment.platform === "linux" ? pressureBaseline : linuxPressureBaseline;
    const actual = observation(other);
    expect(checkLegacyChemyV1Pressure(actual, baseline)).toMatchObject({ ok: false, evaluated: false });
    actual.environment = structuredClone(baseline.environment);
    const forged = checkLegacyChemyV1Pressure(actual, baseline);
    expect(forged).toMatchObject({ ok: false, evaluated: true });
    expect(forged.failures).toContain("low rgbaSha256 golden missing or changed");
    expect(forged.failures).toContain("high rgbaSha256 golden missing or changed");
  });
  it.each(variants.flatMap((variant) => (["low", "high"] as const).map((side) => ({ ...variant, side }))))(
    "$name/$side에서 alpha가 같아도 실제 단일 RGB 값 1 변화는 거부한다", async ({ baseline, fixtureDirectory, side }) => {
      const original = fixture(fixtureDirectory, side), actual = observation(baseline);
      const before = await observeChemyPixels(original.rgba, baseline.pixels[side].fixturePngSha256);
      expect(before).toEqual(baseline.pixels[side]);
      original.rgba[0] = (original.rgba[0] ?? 0) ^ 1;
      actual.pixels[side] = await observeChemyPixels(original.rgba, baseline.pixels[side].fixturePngSha256);
      expect(actual.pixels[side].alphaMass).toBe(before.alphaMass);
      expect(actual.pixels[side].histogramSha256).toBe(before.histogramSha256);
      expect(actual.pixels[side].rgbaSha256).not.toBe(before.rgbaSha256);
      const result = checkLegacyChemyV1Pressure(actual, baseline);
      expect(result).toMatchObject({ ok: false, evaluated: true });
      expect(result.failures).toContain(side + " rgbaSha256 golden missing or changed");
    },
  );
  it.each(variants)("$name에서도 공통 고정 입력·기하·절대 opacity·alpha 변경을 거부한다", ({ baseline }) => {
    const mutations: [string, (actual: ChemyPressureObservation) => void][] = [
      ["carrier", (actual) => { actual.snapshot.carrier += "-changed"; }],
      ["seed", (actual) => { actual.snapshot.seed++; }],
      ["mapped pressure", (actual) => { actual.snapshot.mappedPressures = [0.15, 0.85]; }],
      ["source", (actual) => { actual.sourceSha256.low = "0".repeat(64); }],
      ["geometry", (actual) => { actual.geometrySha256.high = "0".repeat(64); }],
      ["opacity", (actual) => { actual.primitive.opacitySha256.low = "0".repeat(64); }],
      ["sqrt relation", (actual) => { actual.primitive.proportionalityViolations++; }],
      ["alpha monotonicity", (actual) => { actual.alphaMonotonicViolations++; }],
    ];
    for (const [label, mutate] of mutations) {
      const actual = observation(baseline);
      expect(checkLegacyChemyV1Pressure(actual, baseline).ok, label).toBe(true);
      mutate(actual);
      expect(checkLegacyChemyV1Pressure(actual, baseline), label).toMatchObject({ ok: false, evaluated: true });
    }
  });
  it("Mac 골든·원래 observer·57개 manifest와 원래 dependency pins를 수정하지 않는다", () => {
    const fingerprints = {
      "./fixtures/studio-chemy-v1-pressure/baseline.json": "f058fd6bc648d228a437c905d39a582fe5aabb8b30ff565d973e7f3f897c21b7",
      "./fixtures/studio-chemy-v1-pressure/low.png": "177f7858dc2ee0b9d534648923f045ae9c226eeaa09cffdb37ed40091ca571db",
      "./fixtures/studio-chemy-v1-pressure/high.png": "51dc4fd65ab236f3073fd78e3aa806be0d82a1b2c67bb7e0f20586340a2ef5c6",
      "./lib/studio-chemy-v1-pressure-policy.ts": "673f09cd8fe33e84c41c4956f0061f78fbd429041e54f672bd8440eedb1dc1f0",
      "./fixtures/studio-chemy-v1-pressure/original-source-manifest.json": "ba746dde22e686351d3e9475e9e0d07a5a6b107a834d74d6706607a29c06350b",
    };
    for (const [path, sha256] of Object.entries(fingerprints)) {
      expect(createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex")).toBe(sha256);
    }
    expect(originalSourceManifest.sourceFileCount).toBe(57);
    expect(originalSourceManifest.sourceCommit).toBe("289effabfebec9fcb215063bc1a6eddee989e98a");
    expect(originalSourceManifest.sourceTree).toBe("682884bddd2c4be61b048483b825f26a138a76b8");
    expect(originalSourceManifest.dependencies).toEqual({
      mixbox: { version: "2.0.0",
        integrity: "sha512-IfiwKB67dvzHv2XGjK/awiOOawNgi5VVoE+/ZMH8xedGrt9S8e91tvAIB2leq6fZPdlmGsG/j/nQTMAO8kKw2Q==",
        tarball: "https://registry.npmjs.org/mixbox/-/mixbox-2.0.0.tgz" },
      "spectral.js": { version: "3.0.0" }, colormix: { version: "3.2.0" },
      vite: { version: "8.3.4" }, playwright: { version: "1.64.1" },
    });
  });
  it("browser는 선택한 PNG 폴더만 읽고 나머지 33종의 15% 하한을 유지한다", () => {
    const source = readFileSync(new URL("./studio-hybrid-topology-browser.ts", import.meta.url), "utf8");
    expect(source).toContain("const selected = selectLegacyChemyV1PressureBaseline(environment);");
    expect(source).toContain('if (!selected) throw new Error("legacy pixel environment unverified; frozen baseline unavailable");');
    expect(source).toContain('fetch("/scripts/fixtures/studio-chemy-v1-pressure/" + fixtureDirectory + name + ".png")');
    expect(source).toContain("inspectLegacyChemyPrimitives(lowMarks, highMarks, baseline.snapshot.mappedPressures)");
    expect(source).toContain("checkLegacyChemyV1Pressure(observation, baseline)");
    expect(source).not.toContain("CHEMY_PRESSURE_BASELINE");
    expect(source).toMatch(/if \(topology\.recipeId === "klecks-chemy"\) \{[\s\S]+?\} else \{\s+check\(pressureRatio > 1\.15,/u);
    expect(BRUSH_STUDIO_V6_TOPOLOGIES).toHaveLength(34);
    expect(BRUSH_STUDIO_V6_TOPOLOGIES.filter((topology) => topology.recipeId === "klecks-chemy")).toHaveLength(1);
    expect(BRUSH_STUDIO_V6_TOPOLOGIES.filter((topology) => topology.recipeId !== "klecks-chemy")).toHaveLength(33);
    for (const { baseline } of variants) expect(baseline.contract).toEqual({
      originalMinimumExclusive: 1.15, originalMinimumRetained: false, approvalStatus: "owner-approved-2026-11-05",
    });
  });
});
