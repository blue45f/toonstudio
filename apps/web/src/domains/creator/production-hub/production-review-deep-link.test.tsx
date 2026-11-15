// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedShareView } from "@toonstudio/studio-project-model/pinned-review-share";

import { StudioPinnedReviewSharePage } from "../review-share/StudioPinnedReviewSharePage";
import { createProductionDemoProject } from "./production-demo";
import { ProductionGrandAtelierCollabHub } from "./ProductionGrandAtelierCollabHub";
import {
  buildProductionReviewDeepLinkPath,
  parseProductionReviewDeepLinkParams,
  resolvePinnedCutFromParams,
  resolvePinnedSubmissionFromParams,
  resolveSubmissionRevisionFreshness,
} from "./production-review-deep-link-model";
import { ProductionReviewSurface } from "./ProductionReviewSurface";

const shareMocks = vi.hoisted(() => ({ view: vi.fn(), image: vi.fn(), feedback: vi.fn() }));
vi.mock("../review-share/studio-pinned-review-share-client", () => ({
  viewPinnedReviewShare: shareMocks.view,
  loadPinnedReviewSharePage: shareMocks.image,
  submitPinnedReviewShareFeedback: shareMocks.feedback,
}));

const TOKEN = "C".repeat(43);
const SHARE_PAGES = [
  { ordinal: 0, sha256: "a".repeat(64), byteLength: 4, mediaType: "image/png" as const, width: 800, height: 1200 },
  { ordinal: 2, sha256: "b".repeat(64), byteLength: 5, mediaType: "image/webp" as const, width: 900, height: 1300 },
];

const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn((blob: Blob) => `blob:deep-link-${blob.size}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
});

afterAll(() => {
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
  else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
  else Reflect.deleteProperty(URL, "revokeObjectURL");
});

beforeEach(() => {
  vi.resetAllMocks();
  const demoShare: PinnedShareView = {
    id: "11111111-1111-4111-8111-111111111111",
    title: "12화 외부 고정 검수",
    instructions: "3페이지를 확인해 주세요.",
    purpose: "external-review",
    role: "commenter",
    watermark: true,
    rightsStatement: "",
    revisionFingerprint: "d".repeat(64),
    expiresAt: "2030-09-23T00:00:00.000Z",
    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    pages: SHARE_PAGES,
    feedback: [],
  };
  shareMocks.view.mockResolvedValue(demoShare);
  shareMocks.image.mockImplementation(async (_access: unknown, ordinal: number) => new Blob([`p-${ordinal}`], { type: "image/png" }));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("검수 링크 동일 회차·컷·리비전 복귀 및 최신본 혼동 방지 ([19])", () => {
  it("딥링크 모델은 중복·불일치 파라미터를 fail-closed로 거부하고 구버전 고정본과 최신본을 정확히 구분한다", () => {
    const aggregate = createProductionDemoProject();
    const parsedDup = parseProductionReviewDeepLinkParams("?episode=episode-12&cut=cut-12-001&cut=cut-12-002");
    expect(parsedDup.duplicateKeys).toEqual(["cut"]);

    const cuts = aggregate.cutPlans.filter((c) => c.episodeId === "episode-12" && c.status !== "superseded");
    expect(resolvePinnedCutFromParams({ cuts, requestedCutId: "cut-12-002" })).toEqual({
      explicit: true,
      cutId: "cut-12-002",
      issue: null,
    });
    expect(resolvePinnedCutFromParams({ cuts, requestedCutId: "cut-99-999" })).toEqual({
      explicit: true,
      cutId: null,
      issue: "missing-cut",
    });

    const ep12Subs = aggregate.submissions.filter((s) => s.deliverableId.includes("12") || s.deliverableId.includes("sample"));
    const conflict = resolvePinnedSubmissionFromParams({
      allDeliverableSubmissions: ep12Subs,
      requestedSubmissionId: "submission-thumbnail-12-r2",
      requestedRevisionId: "thumbnail-episode-12-r1",
    });
    expect(conflict).toEqual({ explicit: true, matched: null, issue: "revision-conflict" });

    const r1 = aggregate.submissions.find((s) => s.id === "submission-thumbnail-12-r1")!;
    const r2 = aggregate.submissions.find((s) => s.id === "submission-thumbnail-12-r2")!;
    const oldFreshness = resolveSubmissionRevisionFreshness(aggregate, r1);
    const latestFreshness = resolveSubmissionRevisionFreshness(aggregate, r2);
    expect(oldFreshness.kind).toBe("historical");
    if (oldFreshness.kind === "historical") {
      expect(oldFreshness.latestSubmission?.id).toBe("submission-thumbnail-12-r2");
    }
    expect(latestFreshness.kind).toBe("latest");
  });

  it("더미 작가와 더미 PD 컨텍스트에서 구버전 검수 링크 열람 시 동일 회차·컷·리비전을 가리키고 최신본과 혼동되지 않는다", () => {
    const aggregate = createProductionDemoProject();
    const execute = vi.fn().mockResolvedValue(undefined);
    const deepUrl = buildProductionReviewDeepLinkPath({
      projectId: "sample-project",
      episodeId: "episode-12",
      cutId: "cut-12-002",
      submissionId: "submission-thumbnail-12-r1",
      revisionId: "thumbnail-episode-12-r1",
    });

    // 1. 더미 작가 컨텍스트
    const writerRender = render(
      <MemoryRouter initialEntries={[deepUrl]}>
        <Routes>
          <Route
            path="/production/projects/:projectId/review"
            element={
              <ProductionReviewSurface
                aggregate={aggregate}
                execute={execute}
                canEdit
                roleLens="story"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const writerWorkspace = writerRender.container.querySelector("[data-production-review-workspace]")!;
    expect(writerWorkspace.getAttribute("data-review-episode-id")).toBe("episode-12");
    expect(writerWorkspace.getAttribute("data-review-cut-id")).toBe("cut-12-002");
    expect(writerWorkspace.getAttribute("data-review-submission-id")).toBe("submission-thumbnail-12-r1");
    expect(writerWorkspace.getAttribute("data-review-revision-id")).toBe("thumbnail-episode-12-r1");
    expect(writerWorkspace.querySelector('[data-review-revision-freshness="historical"]')).not.toBeNull();
    cleanup();

    // 2. 더미 PD 컨텍스트에서 동일 링크 진입 시 100% 일치 + 구버전 승인 잠금 + 1클릭 최신본 전환
    const pdRender = render(
      <MemoryRouter initialEntries={[deepUrl]}>
        <Routes>
          <Route
            path="/production/projects/:projectId/review"
            element={
              <ProductionReviewSurface
                aggregate={aggregate}
                execute={execute}
                canEdit
                roleLens="producer"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const pdWorkspace = pdRender.container.querySelector("[data-production-review-workspace]")!;
    expect(pdWorkspace.getAttribute("data-review-episode-id")).toBe("episode-12");
    expect(pdWorkspace.getAttribute("data-review-cut-id")).toBe("cut-12-002");
    expect(pdWorkspace.getAttribute("data-review-submission-id")).toBe("submission-thumbnail-12-r1");
    expect(pdWorkspace.getAttribute("data-review-revision-id")).toBe("thumbnail-episode-12-r1");
    expect(screen.getByRole("region", { name: "이전 고정 리비전 열람 안내" }).textContent).toContain("thumbnail-episode-12-r2");

    // 구버전에서는 승인 버튼이 비활성화되어야 한다.
    const approveBtn = screen.getByRole("button", { name: "승인" }) as HTMLButtonElement;
    expect(approveBtn.disabled).toBe(true);

    // 최신본(2차) 열기 클릭 시 동일 컷(cut-12-002)을 유지한 채 최신 제출본으로 전환
    fireEvent.click(pdWorkspace.querySelector('[data-review-switch-to-latest="true"]')!);
    expect(pdWorkspace.getAttribute("data-review-cut-id")).toBe("cut-12-002");
    expect(pdWorkspace.getAttribute("data-review-submission-id")).toBe("submission-thumbnail-12-r2");
    expect(pdWorkspace.querySelector('[data-review-revision-freshness="latest"]')).not.toBeNull();
    expect((screen.getByRole("button", { name: "승인" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("존재하지 않는 컷이나 충돌하는 리비전 파라미터는 조용히 대체하지 않고 불일치 경고를 표시한다", () => {
    const aggregate = createProductionDemoProject();
    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/review?episode=episode-12&cut=cut-99-999&submission=submission-thumbnail-12-r2&revision=thumbnail-episode-12-r1"]}>
        <Routes>
          <Route
            path="/production/projects/:projectId/review"
            element={<ProductionReviewSurface aggregate={aggregate} execute={vi.fn()} canEdit roleLens="producer" />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const mismatchAlert = document.querySelector('[data-review-link-mismatch="true"]');
    expect(mismatchAlert).not.toBeNull();
    expect(mismatchAlert?.textContent).toContain("cut-99-999");
    expect(mismatchAlert?.textContent).toContain("submission-thumbnail-12-r2");
  });

  it("협업 관제실(/production)에서도 구버전 검수 링크 진입 시 대상 컷·리비전을 복원하고 최신본 승인을 잠근다", () => {
    render(
      <MemoryRouter initialEntries={["/production?episode=episode-12&cut=cut-03&revision=v12-lineart-pass"]}>
        <ProductionGrandAtelierCollabHub />
      </MemoryRouter>,
    );
    const banner = document.querySelector('[data-collab-review-freshness="historical"]')!;
    expect(banner).not.toBeNull();
    expect(banner.getAttribute("data-collab-cut-id")).toBe("cut-03");
    expect(banner.getAttribute("data-collab-revision-id")).toBe("v12-lineart-pass");
    expect(screen.getByRole("tab", { name: /컷 03/u }).getAttribute("aria-selected")).toBe("true");

    // 편집자·PD 역할로 전환해도 구버전 고정 열람 중에는 승인이 잠긴다.
    fireEvent.click(screen.getByTestId("collab-role-editor-pd"));
    expect((screen.getByTestId("collab-hub-approve-btn") as HTMLButtonElement).disabled).toBe(true);

    // 최신본으로 전환하면 동일 컷(cut-03)에서 최신 v14-color-fix가 열리고 PD 승인이 활성화된다.
    fireEvent.click(screen.getByTestId("collab-hub-switch-latest-revision"));
    expect(document.querySelector('[data-collab-review-freshness="latest"]')?.getAttribute("data-collab-revision-id")).toBe("v14-color-fix");
    expect((screen.getByTestId("collab-hub-approve-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("외부 고정 검수 공유창(/production/pinned-review)도 ?page= 쿼리로 지정된 고정 페이지를 정확히 복원한다", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[`/production/pinned-review?page=3#token=${TOKEN}`]}>
          <Routes>
            <Route path="/production/pinned-review" element={<StudioPinnedReviewSharePage />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    await waitFor(() => expect(shareMocks.image).toHaveBeenCalledWith({ token: TOKEN }, 2, expect.any(AbortSignal)));
    expect(await screen.findByRole("img", { name: "3페이지 고정 검수 이미지" })).toBeTruthy();
  });
});
