/**
 * studio-ai-candidate-apply.ts — 채색 후보 선택 확정 (순수 모듈, fetch 없음).
 *
 * 채색 후보 세션(studio-ai-colorize-candidates.ts)은 모으고 고르기까지만
 * 담당하고, 실제 적용은 호출부의 몫이었다. 이 모듈은 그 적용 결정을
 * 순수하게 만든다. 세션이 ready 상태이고 선택된 후보가 있으며 결과가
 * 비어 있지 않을 때만 적용 페이로드를 돌려준다. 실제 src 교체(patchEl
 * 등)는 호출부가 기존 채색 적용 경로로 수행한다. 과금 단위는 후보 수와
 * 같으며, 단가는 호출부가 적용한다.
 */

import type {
  StudioAiColorizeCandidate,
  StudioAiColorizeCandidateSession,
} from "./studio-ai-colorize-candidates";
import { colorizeCandidateCostUnits } from "./studio-ai-colorize-candidates";

export interface StudioAiCandidateApplyPlan {
  readonly dataUrl: string;
  readonly candidateId: string;
  readonly costUnits: number;
}

export type StudioAiCandidateApplyResult =
  | { readonly ok: true; readonly plan: StudioAiCandidateApplyPlan }
  | {
      readonly ok: false;
      readonly reason: "not_ready" | "no_selection" | "empty_result";
    };

/** 선택된 후보를 적용 페이로드로 바꾼다. ready 상태가 아니면 거부한다. */
export function resolveColorizeCandidateApply(
  session: StudioAiColorizeCandidateSession,
): StudioAiCandidateApplyResult {
  if (session.status !== "ready") return { ok: false, reason: "not_ready" };
  const selected: StudioAiColorizeCandidate | null =
    session.selectedId === null
      ? null
      : (session.candidates.find(
          (candidate) => candidate.id === session.selectedId,
        ) ?? null);
  if (!selected) return { ok: false, reason: "no_selection" };
  if (!selected.dataUrl) return { ok: false, reason: "empty_result" };
  return {
    ok: true,
    plan: {
      dataUrl: selected.dataUrl,
      candidateId: selected.id,
      costUnits: colorizeCandidateCostUnits(session),
    },
  };
}
