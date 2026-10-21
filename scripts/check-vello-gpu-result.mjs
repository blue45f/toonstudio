#!/usr/bin/env node
/**
 * Vello 실 GPU 프로브 결과 판정기 (백로그 D3, 2026-10-22).
 *
 * 입력: `toon-vello-fork-browser-probe.test.ts` 하니스가 기록한
 * `tests/benchmarks/results/toon-vello-fork.json`.
 * 출력: 실 GPU 확정 / CPU 폴백 / 불완전 을 구분한 판정과, CPU 폴백일 때
 * 원인 항목화 절차(docs/engines/vello-real-gpu-measurement.md §5)로
 * 이어지는 분류 코드를 함께 낸다.
 *
 * 판정 원칙:
 * - `adapter.deviceType`이 "Cpu"면 그 실행은 소프트웨어 렌더링(SwiftShader
 *   등)이라 실 GPU 측정이 아니다. 패리티가 통과해도 D3는 닫히지 않는다.
 * - 교환 비용(exchangeCost)은 기록 항목일 뿐 합격/불합격을 가르지 않는다.
 * - 결과 JSON의 forkTrack이 현행 핀(wgpu 30.0.1)과 다르면, 잰 대상이
 *   포팅 전 빌드일 수 있어 판정을 보류한다(STALE).
 *
 * 사용법:
 *   node scripts/check-vello-gpu-result.mjs [--result <json path>] [--json]
 * 종료 코드: 0 실 GPU 확정 · 1 게이트 실패(패리티/불완전/구세대) · 3 CPU 폴백(재측정 필요)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** 현행 핀 — docs/engines/vello-baseline.md §0·§3.2와 쌍으로 유지한다. */
export const CURRENT_FORK_TRACK = Object.freeze({
  vendorIncludes: "wgpu 30.0.1",
  upstreamCrateSha256: "527ccdf43dd5b2e8676eed9984ce00e2bbb0a1b85b70c1969dcb6cd2eb55ab9e",
});

export const GPU_RESULT_VERDICTS = Object.freeze({
  REAL_GPU: "REAL_GPU",
  CPU_FALLBACK: "CPU_FALLBACK",
  STALE: "STALE",
  INCOMPLETE: "INCOMPLETE",
  PARITY_FAILED: "PARITY_FAILED",
});

/**
 * 결과 JSON을 판정한다. 순수 함수 — 파일 읽기는 CLI만 한다.
 * 반환: { verdict, ok, checks: [{id, ok, detail}], cpuFallbackCauses: string[] }
 * cpuFallbackCauses는 deviceType=Cpu일 때 §5 체크리스트의 후보 코드다.
 */
export function evaluateVelloGpuResult(result) {
  const checks = [];
  const push = (id, ok, detail) => checks.push({ id, ok, detail });

  if (result === null || typeof result !== "object") {
    return {
      verdict: GPU_RESULT_VERDICTS.INCOMPLETE,
      ok: false,
      checks: [{ id: "shape", ok: false, detail: "결과가 JSON 객체가 아닙니다." }],
      cpuFallbackCauses: [],
    };
  }

  const adapter = result.adapter ?? {};
  const deviceType = typeof adapter.deviceType === "string" ? adapter.deviceType : "";
  push("shape.measuredAt", typeof result.measuredAt === "string", `measuredAt=${result.measuredAt ?? "(없음)"}`);
  push("shape.browser", typeof result.browser?.version === "string", `browser=${result.browser?.version ?? "(없음)"} · launch=${result.browser?.launch ?? "(없음)"}`);
  push("adapter.present", deviceType.length > 0, `adapter=${JSON.stringify(adapter)}`);

  // 구세대 결과(포팅 전 빌드 측정)는 실 GPU 여부는 물론 패리티도 현행 근거가 못 된다.
  const vendor = typeof result.forkTrack?.vendor === "string" ? result.forkTrack.vendor : "";
  const sha = typeof result.forkTrack?.upstreamCrateSha256 === "string" ? result.forkTrack.upstreamCrateSha256 : "";
  const trackCurrent = vendor.includes(CURRENT_FORK_TRACK.vendorIncludes)
    && sha === CURRENT_FORK_TRACK.upstreamCrateSha256;
  push(
    "track.current-pin",
    trackCurrent,
    `vendor="${vendor}" · upstreamCrateSha256=${sha || "(없음)"} (현행 기대: wgpu 30.0.1 / ${CURRENT_FORK_TRACK.upstreamCrateSha256.slice(0, 12)}…)`,
  );

  // 패리티 게이트 — 하니스 단언과 같은 기준.
  push("parity.adoption", result.adoption?.adoptedFlag === true && result.adoption?.sameDeviceObject === true,
    `adoptedFlag=${result.adoption?.adoptedFlag} · sameDeviceObject=${result.adoption?.sameDeviceObject}`);
  push("parity.l4-classic", result.l4TextureSharing?.bindingAccepted === true && (result.l4TextureSharing?.validationError ?? null) === null,
    `bindingAccepted=${result.l4TextureSharing?.bindingAccepted} · validationError=${result.l4TextureSharing?.validationError ?? null}`);
  push("parity.l4-hybrid", result.hybridSparseStrip?.bindingAccepted === true && (result.hybridSparseStrip?.validationError ?? null) === null,
    `bindingAccepted=${result.hybridSparseStrip?.bindingAccepted} · validationError=${result.hybridSparseStrip?.validationError ?? null}`);
  push("parity.hybrid-fuzzy", typeof result.hybridSparseStrip?.maxFuzzyMismatchPct === "number" && result.hybridSparseStrip.maxFuzzyMismatchPct <= 0.6,
    `maxFuzzyMismatchPct=${result.hybridSparseStrip?.maxFuzzyMismatchPct} (게이트 ≤0.6)`);
  push("parity.pixel-equal", result.pixelParityVsL0Lane?.equal === true,
    `equal=${result.pixelParityVsL0Lane?.equal} · detail=${result.pixelParityVsL0Lane?.detail ?? null}`);
  const rows = Array.isArray(result.exchangeCost) ? result.exchangeCost : [];
  push("shape.exchange-cost-rows", rows.length === 3 && rows.every((row) => typeof row.exchangeSpeedupVsL0 === "number"),
    `exchangeCost ${rows.length}행 (기록 항목 — 합격 판정에는 쓰지 않는다)`);

  const parityOk = checks.filter((check) => check.id.startsWith("parity.")).every((check) => check.ok);
  const shapeOk = checks.filter((check) => check.id.startsWith("shape.") || check.id.startsWith("adapter.")).every((check) => check.ok);

  // 판정 우선순위: 형식이 깨졌으면 INCOMPLETE, 패리티가 깨졌으면 그게 먼저다.
  // CPU 폴백은 트랙 메타데이터가 낡았어도 그대로 분류한다(소프트웨어 렌더링이라는
  // 사실이 더 중요한 신호이고, 트랙 실패는 checks에 별도로 남는다). 실 GPU인데
  // 트랙이 낡았으면 "현행 빌드를 잰 것"으로 확정할 수 없어 STALE로 보류한다.
  let verdict;
  if (!shapeOk) verdict = GPU_RESULT_VERDICTS.INCOMPLETE;
  else if (!parityOk) verdict = GPU_RESULT_VERDICTS.PARITY_FAILED;
  else if (deviceType === "Cpu") verdict = GPU_RESULT_VERDICTS.CPU_FALLBACK;
  else if (!trackCurrent) verdict = GPU_RESULT_VERDICTS.STALE;
  else verdict = GPU_RESULT_VERDICTS.REAL_GPU;

  return {
    verdict,
    ok: verdict === GPU_RESULT_VERDICTS.REAL_GPU,
    checks,
    cpuFallbackCauses: verdict === GPU_RESULT_VERDICTS.CPU_FALLBACK
      ? ["C-1", "C-2", "C-3", "C-4", "C-5"]
      : [],
  };
}

function parseArgs(argv) {
  const args = { result: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--result") { args.result = argv[index + 1] ?? null; index += 1; }
    else if (value === "--json") args.json = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`알 수 없는 인자: ${value}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write("사용법: node scripts/check-vello-gpu-result.mjs [--result <json path>] [--json]\n");
    return 0;
  }
  const resultPath = resolve(
    args.result ?? fileURLToPath(new URL("../tests/benchmarks/results/toon-vello-fork.json", import.meta.url)),
  );
  if (!existsSync(resultPath)) {
    process.stderr.write(
      `[vello-gpu-result] 결과 JSON이 없습니다: ${resultPath}\n`
      + "  먼저 프로브를 실행하세요: TOON_VELLO_FORK_PROBE=1 pnpm exec vitest run packages/studio-engine-vello/src/__tests__/toon-vello-fork-browser-probe.test.ts\n",
    );
    return 2;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resultPath, "utf8"));
  } catch (error) {
    process.stderr.write(`[vello-gpu-result] 결과 JSON을 읽지 못했습니다: ${error.message}\n`);
    return 2;
  }
  const evaluation = evaluateVelloGpuResult(parsed);
  if (args.json) {
    process.stdout.write(`${JSON.stringify({ resultPath, ...evaluation }, null, 2)}\n`);
  } else {
    for (const check of evaluation.checks) {
      process.stdout.write(`[vello-gpu-result] ${check.ok ? "통과" : "실패"} ${check.id} — ${check.detail}\n`);
    }
    process.stdout.write(`[vello-gpu-result] 판정: ${evaluation.verdict}\n`);
    if (evaluation.verdict === GPU_RESULT_VERDICTS.CPU_FALLBACK) {
      process.stdout.write(
        "  CPU 폴백입니다 — 실 GPU 측정이 아닙니다. docs/engines/vello-real-gpu-measurement.md §5의 원인 항목화(C-1~C-5)를 순서대로 확인하세요.\n",
      );
    }
    if (evaluation.verdict === GPU_RESULT_VERDICTS.STALE) {
      process.stdout.write(
        "  구세대 빌드를 잰 결과일 수 있습니다 — pkg-gpu INTEGRITY 대조 후 현행 핀으로 다시 실행하세요 (같은 문서 §3).\n",
      );
    }
  }
  if (evaluation.verdict === GPU_RESULT_VERDICTS.REAL_GPU) return 0;
  if (evaluation.verdict === GPU_RESULT_VERDICTS.CPU_FALLBACK) return 3;
  return 1;
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`[vello-gpu-result] 실행 오류 — ${error.message}\n`);
    process.exitCode = 2;
  }
}
