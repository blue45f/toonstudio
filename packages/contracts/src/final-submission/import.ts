import { checkJsonInput } from "./schema";
import { reconcileFinalSubmissionBoard } from "./transitions";
import { parseFinalSubmissionBoard } from "./validation";

import type { BoardState, FinalSubmissionParseResult } from "./types";

/** Sites JSON 또는 보드 JSON을 검토용 사본으로 변환한다. 서버 저장은 별도 명시 작업이다. */
export function importFinalSubmissionBoard(value: unknown, targetRevision: number, previous?: BoardState): FinalSubmissionParseResult {
  if (!Number.isSafeInteger(targetRevision) || targetRevision < 0) return { ok: false, errors: ["어드민 서버의 현재 저장 버전을 먼저 확인해 주세요."] };
  const unsafe = checkJsonInput(value);
  if (unsafe) return { ok: false, errors: [unsafe] };
  const raw = value && typeof value === "object" && "board" in value ? value.board : value;
  const parsed = parseFinalSubmissionBoard(raw);
  if (!parsed.ok) return parsed;
  const candidate = { ...parsed.value, revision: targetRevision, updatedAt: previous?.updatedAt ?? "" };
  const next = previous ? reconcileFinalSubmissionBoard(candidate, previous) : candidate;
  return parseFinalSubmissionBoard(next, previous);
}
