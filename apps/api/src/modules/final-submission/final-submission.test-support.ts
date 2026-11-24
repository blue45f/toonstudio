import { randomUUID } from "node:crypto";

import { createEmptyFinalSubmissionBoard, type BoardState, type SaveFinalSubmissionRequest } from "@toonstudio/contracts/final-submission";

/** 실제 파일명·링크·계정·신청 내용을 포함하지 않는 API 테스트 전용 기록. */
export function submissionRequest(board: BoardState = createEmptyFinalSubmissionBoard(), summary = "점검 기록 저장"): SaveFinalSubmissionRequest {
  return { board: structuredClone(board), expectedRevision: board.revision, mutationId: randomUUID(), summary };
}
