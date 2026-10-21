/**
 * 저장 시각의 상대 표기 판정 — 저장 상태 바가 "저장됨 · 방금"처럼
 * 마지막 receipt 시각을 사람이 읽는 신선도로 바꾸는 순수 함수.
 *
 * 왜 별도 모듈인가 (호스트 패치 묶음 B1, 2026-10-22):
 * - 체크리스트 판정은 "저장됨 · 방금" 한 줄이다. 절대 시각("오후 3:12")만으로는
 *   방금 저장된 것인지 한 시간 전 것인지 첫눈에 구분되지 않는다.
 * - 경계는 표시 전용이다: 60초 미만은 "방금", 60분 미만은 "N분 전",
 *   그 이상은 기존처럼 절대 시각으로 떨어진다 (호출부가 포맷한다).
 * - 시계 오차로 receipt 가 미래인 경우(diff < 0)도 "방금"으로 읽는다 —
 *   저장 직후의 표시가 음수 분으로 보이는 것보다는 안전하다.
 */

export type StudioSavedRecency =
  | { readonly kind: "just-now" }
  | { readonly kind: "minutes-ago"; readonly minutes: number }
  | { readonly kind: "clock" };

const JUST_NOW_WINDOW_MS = 60_000;
const MINUTES_WINDOW_MS = 3_600_000;

export function resolveSavedRecency(lastSavedAt: number, nowMs: number): StudioSavedRecency {
  if (!Number.isFinite(lastSavedAt) || lastSavedAt <= 0) return { kind: "clock" };
  const diff = nowMs - lastSavedAt;
  if (diff < JUST_NOW_WINDOW_MS) return { kind: "just-now" };
  if (diff < MINUTES_WINDOW_MS) {
    return { kind: "minutes-ago", minutes: Math.floor(diff / 60_000) };
  }
  return { kind: "clock" };
}
