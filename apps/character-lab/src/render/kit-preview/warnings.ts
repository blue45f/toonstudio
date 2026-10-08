/**
 * 키트 프리뷰 경고 형식(순수). 검사·병합·브라우저 단계가 모두 같은 구조로 경고를 모아 JSON 요약의 `warnings`에 싣는다.
 * `severity`: error = 앱 로더가 거부하거나 렌더가 틀릴 것, warn = 규약 위반·품질 위험, info = 알아 둘 사실.
 */

export type PreviewWarningSeverity = "info" | "warn" | "error";

export interface PreviewWarning {
  /** 기계 판별용 코드(kebab-case). 앱 로더 실패 코드(`kit-joint-mismatch` 등)와 같은 이름을 쓸 수 있는 곳은 같게 쓴다. */
  readonly code: string;
  readonly severity: PreviewWarningSeverity;
  /** 어느 입력·단계에서 났는지(GLB 파일 이름·`merge`·`runtime` 등) */
  readonly source: string;
  readonly messageKo: string;
}

export function makeWarning(source: string, code: string, messageKo: string, severity: PreviewWarningSeverity = "warn"): PreviewWarning {
  return { code, severity, source, messageKo };
}

/** 같은 (code, source, message) 중복을 제거하고 심각도 → 코드 순으로 안정 정렬한다. */
export function sortWarnings(warnings: readonly PreviewWarning[]): PreviewWarning[] {
  const rank: Readonly<Record<PreviewWarningSeverity, number>> = { error: 0, warn: 1, info: 2 };
  const seen = new Set<string>();
  const unique: PreviewWarning[] = [];
  for (const warning of warnings) {
    const key = `${warning.severity}|${warning.code}|${warning.source}|${warning.messageKo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(warning);
  }
  return unique
    .map((warning, index) => ({ warning, index }))
    .sort((a, b) => rank[a.warning.severity] - rank[b.warning.severity] || a.warning.code.localeCompare(b.warning.code) || a.index - b.index)
    .map((entry) => entry.warning);
}
