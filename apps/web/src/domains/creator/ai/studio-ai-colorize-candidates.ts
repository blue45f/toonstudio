/**
 * studio-ai-colorize-candidates.ts — 채색 후보 비교 세션 상태 기계 (순수 모듈, fetch 없음).
 *
 * 클라우드 채색은 1회 호출에 결과 1장이므로, 후보 비교는 호출을 여러 번
 * 돌려 결과를 모아두는 방식으로 구현한다. 이 모듈은 그 "모으고 고르기"의
 * 상태만 담당한다. 실제 호출·적용은 호출부가 맡으며, 과금은 호출부의
 * 기존 경로(BYOK는 사용자 키, 서버 경로는 게이트+크레딧)를 그대로 따른다.
 * 과금 폭주 방지: 후보 수 상한을 기본 3으로 고정한다.
 */

export interface StudioAiColorizeCandidate {
  readonly id: string;
  readonly dataUrl: string;
  readonly prompt: string;
  readonly createdAt: number;
}

export type StudioAiColorizeCandidateStatus = "idle" | "collecting" | "ready";

export interface StudioAiColorizeCandidateSession {
  readonly candidates: readonly StudioAiColorizeCandidate[];
  readonly selectedId: string | null;
  readonly status: StudioAiColorizeCandidateStatus;
  readonly cap: number;
}

export const STUDIO_AI_COLORIZE_CANDIDATE_CAP = 3;

export type StudioAiColorizeCandidateResult =
  | { readonly ok: true; readonly session: StudioAiColorizeCandidateSession }
  | { readonly ok: false; readonly reason: "cap_reached" | "not_found" | "empty_result" };

export function createColorizeCandidateSession(
  cap: number = STUDIO_AI_COLORIZE_CANDIDATE_CAP,
): StudioAiColorizeCandidateSession {
  return {
    candidates: Object.freeze([]),
    selectedId: null,
    status: "idle",
    cap: Math.max(1, Math.floor(cap)),
  };
}

export function addColorizeCandidate(
  session: StudioAiColorizeCandidateSession,
  candidate: StudioAiColorizeCandidate,
): StudioAiColorizeCandidateResult {
  if (!candidate.dataUrl) return { ok: false, reason: "empty_result" };
  if (session.candidates.length >= session.cap) {
    return { ok: false, reason: "cap_reached" };
  }
  const candidates = Object.freeze([...session.candidates, candidate]);
  return {
    ok: true,
    session: {
      ...session,
      candidates,
      selectedId: session.selectedId ?? candidate.id,
      status: "collecting",
    },
  };
}

export function selectColorizeCandidate(
  session: StudioAiColorizeCandidateSession,
  candidateId: string,
): StudioAiColorizeCandidateResult {
  const found = session.candidates.find(
    (candidate) => candidate.id === candidateId,
  );
  if (!found) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    session: { ...session, selectedId: candidateId, status: "ready" },
  };
}

export function selectedColorizeCandidate(
  session: StudioAiColorizeCandidateSession,
): StudioAiColorizeCandidate | null {
  if (!session.selectedId) return null;
  return (
    session.candidates.find(
      (candidate) => candidate.id === session.selectedId,
    ) ?? null
  );
}

/** 후보 1장당 과금 단위 1로 계산한 세션 과금 단위 수. 단가는 호출부가 적용한다. */
export function colorizeCandidateCostUnits(
  session: StudioAiColorizeCandidateSession,
): number {
  return session.candidates.length;
}
