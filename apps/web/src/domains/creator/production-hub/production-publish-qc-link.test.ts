import { describe, expect, it } from "vitest";

import type { EpisodeQcChecklist } from "./production-episode-qc";
import {
  buildEpisodePublishQcSnapshot,
  buildStudioPublishHref,
  buildStudioPublishHrefFromChecklist,
  episodePublishQcReviewHref,
  episodeQcBlockedForPreflight,
  parseEpisodePublishQcSnapshot,
} from "./production-publish-qc-link";

function checklist(overrides: Partial<EpisodeQcChecklist> = {}): EpisodeQcChecklist {
  return {
    episodeId: "episode-13",
    published: false,
    ready: true,
    passedCount: 2,
    applicableCount: 2,
    blockedCount: 0,
    releaseAt: "2026-10-02T09:00:00.000Z",
    items: [
      { id: "story-lock", label: { ko: "스토리 확정", en: "Story locked" }, status: "pass", detail: { ko: "", en: "" }, target: null },
      { id: "review-gate", label: { ko: "검수 승인 (공개 전 필수)", en: "Review approval (required)" }, status: "pass", detail: { ko: "", en: "" }, target: null },
      { id: "dialogue-spellcheck", label: { ko: "대사 맞춤법 검사", en: "Dialogue spellcheck" }, status: "skipped", detail: { ko: "", en: "" }, target: null },
    ],
    ...overrides,
  };
}

function paramsOf(href: string): URLSearchParams {
  return new URLSearchParams(href.slice(href.indexOf("?") + 1));
}

describe("review → publish QC handoff (F-5)", () => {
  it("체크리스트에서 스냅샷을 만들고 ready를 blocked에서 재계산한다", () => {
    const snapshot = buildEpisodePublishQcSnapshot("project-1", checklist());
    expect(snapshot).toMatchObject({
      projectId: "project-1",
      episodeId: "episode-13",
      ready: true,
      passedIds: ["story-lock", "review-gate"],
      blockedIds: [],
      skippedIds: ["dialogue-spellcheck"],
    });
  });

  it("링크에 회차 맥락과 QC 상태가 실리고 그대로 복원된다", () => {
    const href = buildStudioPublishHrefFromChecklist("project-1", checklist());
    expect(href.startsWith("/studio/publish?")).toBe(true);
    const restored = parseEpisodePublishQcSnapshot(paramsOf(href));
    expect(restored).toEqual(buildEpisodePublishQcSnapshot("project-1", checklist()));
  });

  it("막힌 항목이 있으면 ready=false이고 사전검사 입력에 라벨과 함께 들어간다", () => {
    const blocked = checklist({
      ready: false,
      blockedCount: 1,
      items: [
        { id: "review-gate", label: { ko: "검수 승인 (공개 전 필수)", en: "Review approval (required)" }, status: "blocked", detail: { ko: "", en: "" }, target: { kind: "surface", surface: "review" } },
      ],
    });
    const snapshot = buildEpisodePublishQcSnapshot("project-1", blocked);
    expect(snapshot.ready).toBe(false);
    expect(episodeQcBlockedForPreflight(snapshot)).toEqual([
      { id: "review-gate", label: "검수 승인 (공개 전 필수)" },
    ]);
    const restored = parseEpisodePublishQcSnapshot(paramsOf(buildStudioPublishHref(snapshot)));
    expect(restored?.ready).toBe(false);
    expect(restored?.blockedIds).toEqual(["review-gate"]);
  });

  it("맥락이 없거나 손상된 쿼리는 인계 없음(null)으로 수렴한다", () => {
    expect(parseEpisodePublishQcSnapshot(new URLSearchParams(""))).toBeNull();
    expect(parseEpisodePublishQcSnapshot(new URLSearchParams("episodeId=episode-13&qcPassed=story-lock"))).toBeNull();
    expect(parseEpisodePublishQcSnapshot(new URLSearchParams("projectId=p&episodeId=e&qcPassed=unknown-id"))).toBeNull();
    // 통과와 막힘에 같은 항목이 동시에 있으면 모순이라 버린다.
    expect(parseEpisodePublishQcSnapshot(new URLSearchParams("projectId=p&episodeId=e&qcPassed=story-lock&qcBlocked=story-lock"))).toBeNull();
    expect(parseEpisodePublishQcSnapshot(new URLSearchParams("projectId=p&episodeId=e"))).toBeNull();
  });

  it("검수로 돌아가는 경로는 회차 룸이다", () => {
    const snapshot = buildEpisodePublishQcSnapshot("project 1", checklist());
    expect(episodePublishQcReviewHref(snapshot)).toBe(
      "/production/projects/project%201/episodes/episode-13",
    );
  });
});
