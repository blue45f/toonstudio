import type { MobileReaderAuditResult, MobileReaderCutInput } from "./mobile-reader-sim-engine";

/** 예제의 이차 컷 겹침 계산과 DOM 크기를 제한한다. */
export const MAX_READER_CUTS = 200;
export function assertReaderCuts(cuts: readonly MobileReaderCutInput[]): void {
  if (!Array.isArray(cuts) || cuts.length > MAX_READER_CUTS) throw new RangeError("독자 예제는 최대 200컷입니다.");
  const seen = new Set<string>();
  for (const cut of cuts) {
    if (typeof cut.id !== "string" || !cut.id.trim() || cut.id.length > 256 || seen.has(cut.id)) throw new TypeError("컷 ID는 비어 있지 않은 고유 문자열이어야 합니다.");
    seen.add(cut.id);
    if (typeof cut.labelKo !== "string" || typeof cut.labelEn !== "string" || cut.labelKo.length > 10000 || cut.labelEn.length > 10000) throw new TypeError("컷 설명은 10000자 이내 문자열이어야 합니다.");
    if (!["white-paper", "off-white", "tinted", "dark-noir"].includes(cut.backgroundTone)
      || !["hard-white-border", "soft-vignette", "full-bleed-dark", "gutter-fade"].includes(cut.edgeTreatment)
      || !["top", "middle", "bottom-edge"].includes(cut.captionPlacement)) throw new TypeError("지원하지 않는 컷 표시 옵션입니다.");
  }
}

function sameModel(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "number") return Number.isFinite(actual) && actual === expected;
  if (actual === expected) return true;
  if (Array.isArray(actual)) return Array.isArray(expected) && actual.length === expected.length && actual.every((value, index) => sameModel(value, expected[index]));
  if (actual === null || expected === null || typeof actual !== "object" || typeof expected !== "object") return false;
  const keys = Object.keys(actual);
  return keys.length === Object.keys(expected).length && keys.every((key) => Object.hasOwn(expected, key) && sameModel(Reflect.get(actual, key), Reflect.get(expected, key)));
}

/** 외부 분석 객체를 내보내기 전에 현재 계산 모델의 결과와 대조한다. */
export function assertReaderAuditMatches(actual: MobileReaderAuditResult, expected: MobileReaderAuditResult): void {
  if (!sameModel(actual, expected)) throw new TypeError("현재 독자 계산 모델과 일치하지 않는 감사 결과입니다.");
}
