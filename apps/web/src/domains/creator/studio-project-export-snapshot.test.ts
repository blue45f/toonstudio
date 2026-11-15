import { describe, expect, it } from "vitest";

import { createInitialStudioProjectDiagnosticSource } from "./studio-project-diagnostic-source-defaults";
import {
  createStudioProjectExportSnapshot,
  estimateStudioExportBytes,
  recommendedStudioExportDraft,
  summarizeStudioExportPreExportScope,
  type StudioManuscriptExportFacts,
} from "./studio-project-export-snapshot";

function projectState() {
  const initial = createInitialStudioProjectDiagnosticSource(
    "project-12",
    "2026-09-11T03:00:00.000Z",
  );
  return {
    ...initial,
    assets: [
      { id: "asset-ok", status: "allowed" as const },
      { id: "asset-review", status: "warning" as const },
      { id: "asset-blocked", status: "blocked" as const },
    ],
    localization: [
      { locale: "en-US", status: "blocked" as const, blockingIssueCount: 2, warningIssueCount: 1 },
    ],
    reviewSession: {
      ...initial.reviewSession,
      threads: [{
        id: "thread-1",
        kind: "comment" as const,
        targetId: "cut-34",
        status: "open" as const,
        messages: [{
          id: "message-1",
          authorId: "reviewer",
          body: "확인 필요",
          createdAt: "2026-09-11T03:01:00.000Z",
        }],
        resolvedBy: null,
        resolvedAt: null,
      }],
    },
  };
}

describe("project export snapshot", () => {
  it("uses destination defaults and splits long webtoon output at policy boundaries", () => {
    const draft = recommendedStudioExportDraft("project-12", "webtoon-platform");
    const snapshot = createStudioProjectExportSnapshot(projectState(), draft);

    expect(draft.width).toBe(800);
    expect(snapshot.segmentHeights).toEqual([12_800, 12_800, 12_800]);
  });

  it("derives rights, localization and unresolved review truth from one project state", () => {
    const snapshot = createStudioProjectExportSnapshot(
      projectState(),
      recommendedStudioExportDraft("project-12", "social"),
    );

    expect(snapshot.rightsBlockedAssetIds).toEqual(["asset-blocked"]);
    expect(snapshot.rightsWarningAssetIds).toEqual(["asset-review"]);
    expect(snapshot.localizationBlockingIssues).toBe(2);
    expect(snapshot.unresolvedComments).toBe(1);
  });

  it("separates actual manuscript resolution and selection order from platform recommendation and byte estimate", () => {
    const manuscript: StudioManuscriptExportFacts = {
      sourceAuthority: "manuscript-snapshot",
      documentId: "doc-ep1",
      documentTitle: "1화 원고",
      localEditorHref: "/studio/p/project-12/d/doc-ep1?workspace=comic",
      pages: [
        { pageNumber: 1, id: "p1", label: "표지", width: 720, height: 1280 },
        { pageNumber: 2, id: "p2", label: "도입", width: 720, height: 1620 },
        { pageNumber: 3, id: "p3", label: "클라이맥스", width: 720, height: 1280 },
      ],
    };

    const recommended = recommendedStudioExportDraft("project-12", "webtoon-platform", {
      documentId: "doc-ep1",
      sourceWidth: 720,
      sourceHeight: 1280 + 1280,
    });
    expect(recommended.width).toBe(800);
    // 720 -> 800 배율(1.111)로 실제 선택 2페이지(2560px) 높이를 비례 환산하며 고정 38,400px을 섞지 않는다.
    expect(recommended.height).toBe(Math.round(2560 * 1.111));

    const summary = summarizeStudioExportPreExportScope({
      target: "webtoon-platform",
      draft: {
        ...recommended,
        format: "jpg",
        estimatedFileSizeBytes: estimateStudioExportBytes({
          width: recommended.width,
          height: recommended.height,
          format: "jpg",
        }),
      },
      manuscript,
      selectionMode: "custom",
      selectionExpression: "3, 1, 3",
      customEstimateOverride: false,
    });

    expect(summary.actual.selectionValid).toBe(true);
    expect(summary.actual.selectedPageIndices).toEqual([0, 2]);
    expect(summary.actual.selectionOrderSequenceKo).toBe("1페이지(표지) → 3페이지(클라이맥스)");
    expect(summary.actual.selectionReorderedToDocumentOrder).toBe(true);
    expect(summary.actual.plannedExportScale).toBe(1.111);
    expect(summary.actual.plannedOutputWidth).toBe(800);
    expect(summary.actual.plannedFirstPageOutputHeight).toBe(Math.round(1280 * 1.111));
    expect(summary.actual.plannedTotalOutputHeight).toBe(Math.round(2560 * 1.111));

    expect(summary.platformRecommendation.exactWidth).toBe(800);
    expect(summary.platformRecommendation.maxSegmentHeight).toBe(12_800);
    expect(summary.estimate.isEstimate).toBe(true);
    expect(summary.estimate.isUserOverridden).toBe(false);
    expect(summary.estimate.segmentCount).toBe(1);
  });
});
