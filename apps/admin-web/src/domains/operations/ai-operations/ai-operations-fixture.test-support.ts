import { newAiItem } from "./ai-operations-model";

import type { AiOperationsView, BoardSnapshot } from "@toonstudio/contracts/ai-operations";

/** 운영 메일·계정·알림 원문이 없는 합성 검증 자료. */
export function aiFixture(): BoardSnapshot {
  const item = { ...newAiItem("model"), id: "synthetic-model", title: "합성 Cloudflare 모델", nextAction: "합성 호출 경로 확인", sourceIds: ["synthetic-code"] };
  return { meta: { title: "합성 운영 보드", snapshotAt: "2026-01-01T00:00:00Z", mainSha: "a".repeat(40), mainCommitUrl: `https://github.com/blue45f/toonstudio/commit/${"a".repeat(40)}`, deadline: "", noticeUrl: "https://example.com/notice", caveats: ["테스트용 합성 자료"] }, items: [item], sources: [{ id: "synthetic-code", title: "합성 코드 근거", url: "https://example.com/evidence", kind: "코드", observedAt: "2026-01-01T00:00:00Z", scope: "테스트용 근거" }] };
}
export function aiFixtureView(canEdit = true): AiOperationsView { return { snapshot: aiFixture(), revision: 3, updatedAt: "2026-01-02T00:00:00Z", canEdit, audit: [] }; }
