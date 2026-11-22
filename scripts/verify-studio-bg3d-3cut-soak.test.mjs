import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildStudio3dAuditMarkdown,
  classifyStudio3dFailedRequest,
  groupStudio3dFailedRequests,
  normalizeAuditRequestUrl,
  parseStudio3dAuditArgs,
} from "./audit-studio-3d-production.mjs";
import {
  DEFAULT_MAX_HEAP_LEAK_RATIO,
  DEFAULT_SOAK_CYCLES,
  buildAcceleratedSoakReport,
  clampCanvasDprForSoak,
  computeRgbaSsim,
  evaluateSoakHeapLeak,
  evaluateThreeCutPixelRegression,
  formatAcceleratedSoakMarkdown,
  parseSoakCliArgs,
  runDryRunSelfCheck,
  sha256Hex,
} from "./verify-studio-bg3d-3cut-soak.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOAK_SCRIPT = path.resolve(HERE, "verify-studio-bg3d-3cut-soak.mjs");
const AUDIT_SCRIPT = path.resolve(HERE, "audit-studio-3d-production.mjs");

function makeRgba(width, height, seed, alpha = 255) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      pixels[idx] = (x * 13 + y * 7 + seed * 37) % 256;
      pixels[idx + 1] = (x * 5 + y * 19 + seed * 53) % 256;
      pixels[idx + 2] = (x * 23 + y * 3 + seed * 71) % 256;
      pixels[idx + 3] = alpha;
    }
  }
  return { width, height, pixels };
}

function makeFakePng(label, rgba) {
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from(label, "utf8"),
    Buffer.from(rgba.pixels),
  ]);
}

test("모바일 DPR=3 캔버스 안전 클램프는 <= 2x 및 MAX_TEXTURE_SIZE 이하를 강제한다", () => {
  const mobile = clampCanvasDprForSoak(3, 4096, { cssWidth: 390, cssHeight: 844 });
  assert.equal(mobile.effectiveDpr, 2);
  assert.equal(mobile.wasClamped, true);
  assert.equal(mobile.exceedsMaxTextureSize, false);
  assert.ok(mobile.warningCodes.includes("high-dpr-capped"));
  assert.equal(mobile.bitmapWidth, 780);
  assert.equal(mobile.bitmapHeight, 1688);

  const constrained = clampCanvasDprForSoak(3, 2048, { cssWidth: 1440, cssHeight: 1000 });
  assert.ok(constrained.effectiveDpr < 2);
  assert.ok(constrained.bitmapWidth <= 2048);
  assert.ok(constrained.bitmapHeight <= 2048);
  assert.equal(constrained.exceedsMaxTextureSize, false);
  assert.ok(constrained.warningCodes.includes("webgl-max-texture-size-clamped"));
});

test("3컷 PNG 바이트 SHA-256 + RGBA SSIM 회귀 계약은 정상 변경 통과·2·3컷 변형·1컷 미갱신·중복 기준선을 판별한다", () => {
  const c1Base = makeRgba(24, 24, 1);
  const c1Mut = makeRgba(24, 24, 8);
  const c2Base = makeRgba(24, 24, 2);
  const c3Base = makeRgba(24, 24, 3);

  const sameSsim = computeRgbaSsim(c2Base, makeRgba(24, 24, 2));
  assert.equal(sameSsim.sha256Match, true);
  assert.equal(sameSsim.ssim, 1);
  assert.equal(sha256Hex(c2Base.pixels), sameSsim.baselineSha256);

  const pass = evaluateThreeCutPixelRegression([
    { cutId: "cut-1", role: "mutated", baselinePngBytes: makeFakePng("c1-b", c1Base), candidatePngBytes: makeFakePng("c1-m", c1Mut), baselineRgba: c1Base, candidateRgba: c1Mut },
    { cutId: "cut-2", role: "unchanged", baselinePngBytes: makeFakePng("c2", c2Base), candidatePngBytes: makeFakePng("c2", c2Base), baselineRgba: c2Base, candidateRgba: c2Base },
    { cutId: "cut-3", role: "unchanged", baselinePngBytes: makeFakePng("c3", c3Base), candidatePngBytes: makeFakePng("c3", c3Base), baselineRgba: c3Base, candidateRgba: c3Base },
  ]);
  assert.equal(pass.passed, true);
  assert.equal(pass.distinctBaselineHashes, 3);
  assert.deepEqual(pass.failures, []);

  // 2컷이 1컷 변경 카메라에 오염된 회귀
  const bleedFail = evaluateThreeCutPixelRegression([
    { cutId: "cut-1", role: "mutated", baselinePngBytes: makeFakePng("c1-b", c1Base), candidatePngBytes: makeFakePng("c1-m", c1Mut), baselineRgba: c1Base, candidateRgba: c1Mut },
    { cutId: "cut-2", role: "unchanged", baselinePngBytes: makeFakePng("c2", c2Base), candidatePngBytes: makeFakePng("c1-m", c1Mut), baselineRgba: c2Base, candidateRgba: c1Mut },
    { cutId: "cut-3", role: "unchanged", baselinePngBytes: makeFakePng("c3", c3Base), candidatePngBytes: makeFakePng("c3", c3Base), baselineRgba: c3Base, candidateRgba: c3Base },
  ]);
  assert.equal(bleedFail.passed, false);
  assert.ok(bleedFail.failures.some((msg) => msg.includes("cut-2")));

  // 1컷이 갱신되지 않고 기준선 1·2컷 해시도 중복된 결함
  const staleFail = evaluateThreeCutPixelRegression([
    { cutId: "cut-1", role: "mutated", baselinePngBytes: makeFakePng("dup", c1Base), candidatePngBytes: makeFakePng("dup", c1Base), baselineRgba: c1Base, candidateRgba: c1Base },
    { cutId: "cut-2", role: "unchanged", baselinePngBytes: makeFakePng("dup", c1Base), candidatePngBytes: makeFakePng("dup", c1Base), baselineRgba: c1Base, candidateRgba: c1Base },
    { cutId: "cut-3", role: "unchanged", baselinePngBytes: makeFakePng("c3", c3Base), candidatePngBytes: makeFakePng("c3", c3Base), baselineRgba: c3Base, candidateRgba: c3Base },
  ]);
  assert.equal(staleFail.passed, false);
  assert.ok(staleFail.failures.some((msg) => msg.includes("cut-1")));
  assert.ok(staleFail.failures.some((msg) => msg.includes("고유 해시")));
});

test("500회 컷 전환(10시간 가속) 소크 리포트 계약: <= 5% 힙 누수 통과 및 > 5%·미해제 핸들·오류 실패", () => {
  const options = parseSoakCliArgs(["--dry-run", "--cycles", "500"]);
  assert.equal(options.cycles, DEFAULT_SOAK_CYCLES);
  assert.equal(options.maxHeapLeakRatio, DEFAULT_MAX_HEAP_LEAK_RATIO);

  const dryReport = runDryRunSelfCheck(options);
  assert.equal(dryReport.passed, true);
  assert.equal(dryReport.completedCycles, 500);
  assert.equal(dryReport.simulatedHours, 10);
  assert.equal(dryReport.heapLeak.withinThreshold, true);
  assert.ok(dryReport.heapLeak.leakRatio <= 0.05);

  const md = formatAcceleratedSoakMarkdown(dryReport);
  assert.match(md, /500\/500회/);
  assert.match(md, /10시간/);
  assert.match(md, /PASS/);

  // > 5% 힙 누수 + 미해제 핸들 + 런타임 오류 동시 탐지
  const leaky = evaluateSoakHeapLeak([
    { cycle: 25, usedBytes: 50_000_000 },
    { cycle: 250, usedBytes: 53_500_000 },
    { cycle: 500, usedBytes: 54_000_000 },
  ]);
  assert.equal(leaky.withinThreshold, false);
  assert.equal(leaky.leakPercent, 8);

  const failedReport = buildAcceleratedSoakReport({
    mode: "dry-run",
    targetCycles: 500,
    completedCycles: 500,
    activeHandleDelta: 2,
    dprGuard: dryReport.dprGuard,
    preSoakThreeCut: dryReport.preSoakThreeCut,
    postSoakThreeCut: dryReport.postSoakThreeCut,
    heapLeak: leaky,
    consoleErrors: ["WebGL context lost"],
    pageErrors: [],
  });
  assert.equal(failedReport.passed, false);
  assert.ok(failedReport.failures.some((msg) => msg.includes("JS 힙 증가율 초과")));
  assert.ok(failedReport.failures.some((msg) => msg.includes("미해제 임시 리소스 핸들")));
  assert.ok(failedReport.failures.some((msg) => msg.includes("런타임 오류")));
});

test("CLI --dry-run 실행은 브라우저 기동·파일 쓰기 없이 결정론 JSON을 출력하고 exit 0을 반환한다", () => {
  const nonexistentDir = path.resolve(HERE, "__nonexistent-bg3d-soak-dry-run-dir__");
  const stdout = execFileSync(
    process.execPath,
    [SOAK_SCRIPT, "--dry-run", "--json", "--cycles", "500", "--output", nonexistentDir],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.passed, true);
  assert.equal(parsed.completedCycles, 500);
  assert.equal(existsSync(nonexistentDir), false);

  const auditDry = execFileSync(
    process.execPath,
    [AUDIT_SCRIPT, "--dry-run", "--targets", "mobile", "--url", "http://127.0.0.1:4173/studio"],
    { encoding: "utf8" },
  );
  const parsedAudit = JSON.parse(auditDry);
  assert.equal(parsedAudit.mode, "dry-run");
  assert.equal(parsedAudit.targets.length, 1);
  assert.equal(parsedAudit.targets[0].name, "mobile");
});

test("모바일 3D 감사 Failed requests 분류·그룹화는 ERR_ABORTED 취소와 실제 404/네트워크 오류를 분리 보고한다", () => {
  const cleanUrl = normalizeAuditRequestUrl("https://www.toonstudio.cloud/studio/bg3d?room=secret-room&token=abc#frag");
  assert.equal(cleanUrl.normalizedUrl, "https://www.toonstudio.cloud/studio/bg3d");
  assert.equal(cleanUrl.pathname, "/studio/bg3d");
  assert.equal(cleanUrl.hasQuery, true);

  const abortedItem = classifyStudio3dFailedRequest({
    url: "https://www.toonstudio.cloud/assets/StudioBackground3D-CkAKVtJJ.js",
    method: "GET",
    resourceType: "script",
    error: "net::ERR_ABORTED",
    phase: "navigation-to-character",
  });
  assert.equal(abortedItem.category, "aborted-navigation-or-prefetch");
  assert.equal(abortedItem.actionable, false);

  const netItem = classifyStudio3dFailedRequest({
    url: "https://www.toonstudio.cloud/assets/missing-prop.glb",
    method: "GET",
    resourceType: "fetch",
    error: "net::ERR_CONNECTION_REFUSED",
    phase: "surface-settle",
  });
  assert.equal(netItem.category, "network-or-dns-error");
  assert.equal(netItem.actionable, true);

  const mobileFailed = [
    ...Array.from({ length: 13 }, (_, idx) => ({
      url: `https://www.toonstudio.cloud/assets/chunk-${idx % 3}.js`,
      method: "GET",
      resourceType: "script",
      error: "net::ERR_ABORTED",
      phase: "navigation-to-character",
    })),
    {
      url: "https://www.toonstudio.cloud/assets/missing-prop.glb?v=1",
      method: "GET",
      resourceType: "fetch",
      error: "net::ERR_FAILED",
      phase: "surface-settle",
    },
  ];
  const grouped = groupStudio3dFailedRequests(mobileFailed, [
    { url: "https://www.toonstudio.cloud/assets/missing-prop.glb?v=1", status: 404 },
  ]);
  assert.equal(grouped.totalCount, 14);
  assert.equal(grouped.abortedCount, 13);
  assert.equal(grouped.actionableCount, 1);
  assert.equal(grouped.httpErrorCount, 1);
  // 실행 가능한 오류가 비차단 ERR_ABORTED보다 항상 먼저 정렬된다.
  assert.equal(grouped.groups[0].actionable, true);
  assert.equal(grouped.groups[0].pathname, "/assets/missing-prop.glb");

  const markdown = buildStudio3dAuditMarkdown({
    generatedAt: "2026-11-23T00:00:00.000Z",
    url: "https://www.toonstudio.cloud/studio",
    summary: {
      navigationFailures: 0,
      pageErrors: 0,
      brokenImages: 0,
      upscaledImages: 0,
      blurryCanvases: 0,
      webglTargets: 1,
      threeDEntrypoints: 11,
    },
    failures: [],
    targets: [
      {
        name: "mobile",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        openedSurface: { text: "3D 장면 만들기" },
        canvases: [],
        images: [],
        consoleErrors: [],
        failedRequests: mobileFailed,
        failedRequestSummary: grouped,
        httpErrors: [{ url: "https://www.toonstudio.cloud/assets/missing-prop.glb?v=1", status: 404 }],
      },
    ],
  });
  assert.match(markdown, /Failed requests: 14/);
  assert.match(markdown, /aborted\(ERR_ABORTED\)=13, actionable\(network\/policy\)=1, httpErrors\(4xx\/5xx\)=1/);
  assert.match(markdown, /\[ACTIONABLE\]\[network-or-dns-error\]/);
  assert.match(markdown, /\[HTTP 404\] \/assets\/missing-prop\.glb/);

  assert.throws(() => parseStudio3dAuditArgs(["--url", "javascript:alert(1)"]), /http\/https/);
});
