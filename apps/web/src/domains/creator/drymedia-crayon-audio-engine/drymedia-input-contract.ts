import type { DryMediaLabConfig, DryMediaLabSession, DryMediaPaperId, DualScalePaperGrainLut } from "./drymedia-crayon-audio-engine";

const papers = ["rough-cold-press", "kent-smooth", "hanji-mulberry", "croquis-tooth"];
const brushes = ["wax-crayon", "oil-pastel", "graphite-4b", "charcoal-stick", "dry-sumi-bristle", "colored-pencil-prism"];

/** 고정 길이 LUT를 빌려 쓰며 다른 종이로 대체하거나 입력 버퍼를 고치지 않는다. */
export function assertPaperLut(lut: DualScalePaperGrainLut, paperId?: DryMediaPaperId): void {
  if (!papers.includes(lut.paperId) || (paperId !== undefined && lut.paperId !== paperId) || lut.size !== 256 ||
    [lut.macroFiber, lut.microTooth, lut.combinedHeight].some((v) => !(v instanceof Float32Array) || v.length !== 65536)) {
    throw new Error("256×256 종이 LUT 형식·종이가 일치하지 않습니다.");
  }
}
export function canonicalConfig(config: DryMediaLabConfig): DryMediaLabConfig {
  const fields = [
    [config.pressure, 0.05, 1], [config.tiltDeg, 15, 90], [config.speedPxPerSec, 60, 3200],
    [config.overlapPasses, 1, 4], [config.grainIntensity, 0, 1], [config.crumbIntensity, 0, 1], [config.foleyVolume, 0, 1],
  ];
  if (!brushes.includes(config.brushId) || !papers.includes(config.paperId) || typeof config.foleyMuted !== "boolean" ||
    !Number.isInteger(config.overlapPasses) || fields.some(([v, lo, hi]) => v === undefined || lo === undefined || hi === undefined || !Number.isFinite(v) || v < lo || v > hi)) {
    throw new Error("레시피 설정이 지원 범위를 벗어났습니다.");
  }
  return { brushId: config.brushId, paperId: config.paperId, pressure: config.pressure, tiltDeg: config.tiltDeg,
    speedPxPerSec: config.speedPxPerSec, overlapPasses: config.overlapPasses, grainIntensity: config.grainIntensity,
    crumbIntensity: config.crumbIntensity, foleyVolume: config.foleyVolume, foleyMuted: config.foleyMuted };
}
export function assertRecipeSession(session: DryMediaLabSession): void {
  if (!["clean", "previewing", "applied", "reverted"].includes(session.status) || !Number.isSafeInteger(session.appliedCount) || session.appliedCount < 0 ||
    !Array.isArray(session.history) || session.history.length > 12 || typeof session.canApply !== "boolean" || typeof session.canRevert !== "boolean") throw new Error("레시피 세션 형식이 잘못됐습니다.");
  canonicalConfig(session.committed);
  if (session.preview !== null) canonicalConfig(session.preview);
  session.history.forEach(canonicalConfig);
}
/** 계산 모형의 제한된 정본 필드만 비교한다. 외부 추가 메타데이터는 복사하지 않는다. */
export function assertModelMatches(actual: unknown, expected: unknown): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error("계산 결과 배열이 현재 입력과 다릅니다.");
    expected.forEach((v, i) => assertModelMatches(actual[i], v));
  } else if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") throw new Error("계산 결과 형식이 다릅니다.");
    for (const key of Object.keys(expected)) {
      assertModelMatches(Reflect.get(actual, key), Reflect.get(expected, key));
    }
  } else if (actual !== expected) throw new Error("계산 결과가 현재 레시피 입력과 다릅니다.");
}
