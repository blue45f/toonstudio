/**
 * 시각 회귀 픽셀 diff 표준 모듈 — odiff-bin 단일 판정.
 *
 * 배경 (라이브러리 스카우트 REPORT §3.2): 시각 감사 스크립트마다 스크린샷
 * 비교 방식이 달랐다. 캡처만 하고 베이스라인 비교가 없는 감사
 * (audit-sitewide-visual-ux, audit-auth-modal-visual-ux)가 있는가 하면,
 * e2e/studio-3d-visual-verification.spec.ts처럼 브라우저 안에서 320×240으로
 * 축소해 채널 delta>3을 세는 손구현도 있었다. 이 모듈이 베이스라인 회귀
 * 판정의 유일한 경로다: 옵션은 여기서 동결하고 호출자는 바꿀 수 없다.
 *
 * 범위 밖: studio-3d의 visiblePngDelta는 베이스라인 회귀가 아니라
 * "렌더가 실제로 변했는가"를 재는 라이브 변경 감지라 의미가 반대이고
 * 흰 배경 합성(알파) 전제도 달라 이 표준으로 옮기지 않는다.
 *
 * 결정성: 같은 두 PNG + 같은 버전(odiff-bin 4.5.0 핀) + 동결 옵션이면
 * 판정은 항상 같다. 시각/난수/환경값을 판정에 넣지 않는다.
 */
import path from "node:path";

/** odiff 색차 임계 (0..1). 호출자 재정의 금지 — 표준값 하나로 고정. */
export const ODIFF_THRESHOLD = 0.1;
/** 허용 픽셀 diff 비율 상한 (%). 이 이하의 pixel-diff는 통과로 본다. */
export const ODIFF_MAX_DIFF_PERCENTAGE = 0.1;
/** diff 이미지에서 달라진 픽셀을 칠할 색. */
export const ODIFF_DIFF_COLOR = "#ff0000";

/**
 * 모든 비교에 쓰는 동결 옵션. odiff-bin의 ODiffOptions 키와 1:1이다
 * (odiff.d.ts 4.5.0 확인): threshold / antialiasing / failOnLayoutDiff /
 * noFailOnFsErrors / diffColor. noFailOnFsErrors 덕분에 없는 파일은
 * throw가 아니라 reason:"file-not-exists" 결과로 돌아와 판정이 균일하다.
 */
export const ODIFF_OPTIONS = Object.freeze({
  threshold: ODIFF_THRESHOLD,
  antialiasing: true,
  failOnLayoutDiff: true,
  noFailOnFsErrors: true,
  diffColor: ODIFF_DIFF_COLOR,
});

function assertMaxDiffPercentage(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`maxDiffPercentage는 0..100 사이 수여야 합니다: ${value}`);
  }
  return value;
}

/**
 * odiff 원시 결과(ODiffResult)를 표준 판정으로 정규화하는 순수 함수.
 * - match:true            → status "match", pass
 * - pixel-diff ≤ 허용치  → status "within-tolerance", pass
 * - pixel-diff > 허용치  → status "pixel-diff", fail
 * - layout-diff           → status "layout-diff", fail (허용치 적용 없음)
 * - file-not-exists       → status "file-not-exists", fail
 */
export function normalizeOdiffResult(result, { maxDiffPercentage = ODIFF_MAX_DIFF_PERCENTAGE } = {}) {
  const allowed = assertMaxDiffPercentage(maxDiffPercentage);
  if (!result || typeof result !== "object") throw new Error("odiff 결과가 객체가 아닙니다.");
  if (result.match === true) {
    return { pass: true, status: "match", reason: null, diffCount: 0, diffPercentage: 0, maxDiffPercentage: allowed };
  }
  if (result.reason === "pixel-diff") {
    const diffPercentage = Number(result.diffPercentage);
    const diffCount = Number(result.diffCount);
    if (!Number.isFinite(diffPercentage) || !Number.isFinite(diffCount)) {
      throw new Error("odiff pixel-diff 결과에 diffCount/diffPercentage가 없습니다.");
    }
    const pass = diffPercentage <= allowed;
    return {
      pass,
      status: pass ? "within-tolerance" : "pixel-diff",
      reason: "pixel-diff",
      diffCount,
      diffPercentage,
      maxDiffPercentage: allowed,
    };
  }
  if (result.reason === "layout-diff") {
    return { pass: false, status: "layout-diff", reason: "layout-diff", diffCount: null, diffPercentage: null, maxDiffPercentage: allowed };
  }
  if (result.reason === "file-not-exists") {
    return { pass: false, status: "file-not-exists", reason: "file-not-exists", diffCount: null, diffPercentage: null, maxDiffPercentage: allowed, file: result.file ?? null };
  }
  throw new Error(`알 수 없는 odiff 결과입니다: ${JSON.stringify(result)}`);
}

/**
 * 스크린샷 한 쌍을 표준 옵션으로 비교한다. threshold 등 엔진 옵션은
 * 인자로 받지 않는다(표준화의 핵심). 표면별 마스킹이 필요한 경우에만
 * ignoreRegions를 받으며, 허용 비율은 감사 정책값이라 호출자가 정한다.
 * odiff-bin은 무겁고(네이티브 바이너리) 테스트 환경에 없을 수 있어
 * 실제 비교 시점에만 lazy import 한다 — 순수 판정 함수는 import 없이 쓸 수 있다.
 */
export async function compareScreenshotWithOdiff(baselinePath, actualPath, diffPath, { maxDiffPercentage = ODIFF_MAX_DIFF_PERCENTAGE, ignoreRegions } = {}) {
  assertMaxDiffPercentage(maxDiffPercentage);
  const { compare } = await import("odiff-bin");
  const options = ignoreRegions?.length ? { ...ODIFF_OPTIONS, ignoreRegions } : ODIFF_OPTIONS;
  const result = await compare(baselinePath, actualPath, diffPath, options);
  return { ...normalizeOdiffResult(result, { maxDiffPercentage }), baselinePath, actualPath, diffPath };
}

/** 파일명(상대경로) 순으로 정렬된 항목들을 순서대로 비교해 판정 배열을 돌려준다. */
export async function compareScreenshotBatch(entries, options = {}) {
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  const verdicts = [];
  for (const entry of sorted) {
    const verdict = await compareScreenshotWithOdiff(entry.baselinePath, entry.actualPath, entry.diffPath, options);
    verdicts.push({ name: entry.name, ...verdict });
  }
  return verdicts;
}

/** CLI/감사 공용: 디렉터리 쌍에서 같은 상대경로의 PNG 쌍 목록을 만든다. */
export function pairScreenshotsByName(baselineNames, actualNames, { baselineDir, actualDir, diffDir }) {
  const baseline = new Set(baselineNames);
  const actual = new Set(actualNames);
  const names = [...new Set([...baseline, ...actual])].sort((a, b) => a.localeCompare(b));
  return names.map((name) => ({
    name,
    baselinePath: path.join(baselineDir, name),
    actualPath: path.join(actualDir, name),
    diffPath: path.join(diffDir, name),
    missing: baseline.has(name) && actual.has(name) ? null : baseline.has(name) ? "actual" : "baseline",
  }));
}

/** 누락 쌍까지 포함한 배치 요약. pass는 전 항목 통과일 때만 true. */
export function summarizeVerdicts(verdicts) {
  const failed = verdicts.filter((verdict) => !verdict.pass);
  return {
    pass: failed.length === 0,
    total: verdicts.length,
    passed: verdicts.length - failed.length,
    failed: failed.length,
    failures: failed.map((verdict) => ({ name: verdict.name, status: verdict.status, diffPercentage: verdict.diffPercentage ?? null })),
  };
}
