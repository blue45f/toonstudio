// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { createEmptyStudioAiProvenanceDocument } from "../ai/studio-ai-provenance";
import { buildStudioPublishPreflightInput, executeStudioPublishPackageExport } from "../export/studio-publish-package-export";
import { DEFAULT_STUDIO_PUBLISH_COMPLIANCE, validateStudioPublishCompliance,
  type StudioPublishComplianceChecklist } from "../studio-publish-compliance";
import { DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, getStudioPublishPlatformPreset,
  planStudioPublishPackage, type StudioPublishPackageDestination } from "../studio-publish-package";
import { validateStudioPublishPreflight, type StudioPublishAiUsage } from "../studio-publish-preflight";
import { StudioPublishPackagePanel } from "../StudioPublishPackagePanel";
import { resolveStudioPublishPackageReadiness } from "./studio-publish-package-readiness";

// 명시적인 시험 답변이며 실제 작품의 권리 확인을 대신하지 않는다.
const confirmed: StudioPublishComplianceChecklist = {
  version: 1, audienceRating: "all",
  contentFlags: { sexualContent: false, violence: false, strongLanguage: false },
  ownershipRightsConfirmed: true, referenceRightsConfirmed: true,
  thirdParty: { used: false, licensesConfirmed: false, attributionNotes: "" },
  aiDisclosureConfirmed: true, policyReviewConfirmed: true,
};

function scenario(destination: StudioPublishPackageDestination = "generic", aiUsage: StudioPublishAiUsage = "none",
  compliance: StudioPublishComplianceChecklist = DEFAULT_STUDIO_PUBLISH_COMPLIANCE) {
  const preset = getStudioPublishPlatformPreset(destination);
  const pages = Array.from({ length: 6 }, (_, index) => ({
    id: `cut-${index + 1}`, elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1080,
    review: { status: "approved" as const, locked: true },
  }));
  const settings = { ...DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, destination, aiUsage,
    aiDisclosure: aiUsage === "none" ? "" : "시험용 AI 보조 사용 고지", includeCredits: false,
    requestedThumbnailSlots: preset.thumbnails.filter((thumbnail) => thumbnail.required).map((thumbnail) => thumbnail.slot),
    policyReviewConfirmed: true, thumbnailSafetyConfirmed: true };
  const plan = planStudioPublishPackage({
    settings, seriesTitle: "여섯 컷의 인사", episodeTitle: "다시 만난 아침",
    canvases: pages.map((page) => ({ id: page.id, width: 720, height: page.canvasH })),
    episodeImages: pages.map((page) => ({ id: `render:${page.id}`, sourceCanvasId: page.id,
      mimeType: "image/png", width: preset.episode.targetWidth ?? 720, height: 1080, byteSize: 100, sha256: "a".repeat(64) })),
    thumbnails: preset.thumbnails.filter((thumbnail) => thumbnail.required).map((thumbnail) => ({
      id: thumbnail.slot, sourceCanvasId: pages[0].id, slot: thumbnail.slot,
      mimeType: thumbnail.allowedMimeTypes[0], width: thumbnail.width, height: thumbnail.height, byteSize: 100,
    })),
  });
  const snapshot = { title: "여섯 컷의 인사", tagsText: "단편", publishAiUsage: aiUsage,
    publishAiDisclosure: settings.aiDisclosure, commentThreads: [] };
  const preflight = validateStudioPublishPreflight(buildStudioPublishPreflightInput(snapshot, [], pages), destination);
  const complianceResult = validateStudioPublishCompliance(compliance, destination, { aiUsage });
  return { plan, pages, snapshot, compliance, preflight, complianceResult,
    readiness: resolveStudioPublishPackageReadiness(plan, preflight, complianceResult) };
}

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(cleanup);

describe("패키지 화면과 실제 생성 경계의 필수 점검", () => {
  it("파일 계획 오류가 없어도 자체 확인 7개가 남으면 준비 완료로 표시하지 않고 답변을 보존한다", () => {
    const before = structuredClone(DEFAULT_STUDIO_PUBLISH_COMPLIANCE);
    const result = scenario();
    expect(result.plan.canExport).toBe(true);
    expect(result.preflight.canPublish).toBe(true);
    expect(result.readiness).toMatchObject({ canExport: false, packageErrorCount: 0, blockingIssueCount: 7 });
    expect(result.readiness.humanConfirmationErrors).toHaveLength(7);
    expect(DEFAULT_STUDIO_PUBLISH_COMPLIANCE).toEqual(before);
  });

  it("현재 목적지의 검사 결과가 없거나 이전 목적지 결과이면 파일 생성을 허용하지 않는다", () => {
    const generic = scenario("generic", "none", confirmed);
    const webtoon = scenario("webtoon", "none", confirmed);
    expect(resolveStudioPublishPackageReadiness(generic.plan, null, generic.complianceResult).canExport).toBe(false);
    expect(resolveStudioPublishPackageReadiness(generic.plan, generic.preflight, null).canExport).toBe(false);
    expect(resolveStudioPublishPackageReadiness(webtoon.plan, generic.preflight, generic.complianceResult))
      .toMatchObject({ canExport: false, checksAvailable: false });
  });

  it.each(["generic", "webtoon", "tapas"] as const)("%s의 필수 점검과 자체 답변이 완료된 경우만 내보내기를 허용한다", (destination) => {
    const result = scenario(destination, "none", confirmed);
    expect(result.plan.canExport).toBe(true);
    expect(result.readiness).toMatchObject({ canExport: true, checksAvailable: true, blockingIssueCount: 0 });
  });

  it("AI 사용을 켜면 고지 확인을 다시 요구하고 Tapas 생성물 차단을 그대로 표시한다", () => {
    const answers = { ...confirmed, aiDisclosureConfirmed: false };
    const none = scenario("generic", "none", answers);
    const assisted = scenario("generic", "assisted", answers);
    const generated = scenario("tapas", "generated", confirmed);
    expect(none.readiness.canExport).toBe(true);
    expect(assisted.readiness.canExport).toBe(false);
    expect(assisted.readiness.humanConfirmationErrors.map((issue) => issue.code)).toContain("AI_DISCLOSURE_UNCONFIRMED");
    expect(generated.readiness.canExport).toBe(false);
    expect(generated.readiness.structuralErrors.map((issue) => issue.code)).toContain("TAPAS_AI_GENERATED_CONTENT_PROHIBITED");
    expect(answers.aiDisclosureConfirmed).toBe(false);
  });

  it("남은 사람 확인 항목과 이동 동선을 미리 보여 주고 생성 버튼은 답변 완료 후에만 활성화한다", () => {
    const initial = scenario();
    const begin = vi.fn(), review = vi.fn();
    const props = { open: true, onClose: vi.fn(), settings: initial.plan.settings, onSettingsChange: vi.fn(),
      plan: initial.plan, preflightResult: initial.preflight, complianceResult: initial.complianceResult,
      onBeginExport: begin, onReviewRequiredChecks: review };
    const view = render(<StudioPublishPackagePanel {...props} />);
    expect(screen.queryByText("내보내기 가능")).toBeNull();
    expect(screen.getByText(/사람이 직접 확인할 필수 항목/u).textContent).toContain("7");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "패키지 내보내기" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "패키지 내보내기" }));
    expect(begin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "필수 점검 열기" }));
    expect(review).toHaveBeenCalledOnce();
    expect(screen.getByText(initial.complianceResult.errors[0].message)).toBeTruthy();
    const ready = scenario("generic", "none", confirmed);
    view.rerender(<StudioPublishPackagePanel {...props} plan={ready.plan} preflightResult={ready.preflight} complianceResult={ready.complianceResult} />);
    expect(screen.getByText("내보내기 가능")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "패키지 내보내기" }).disabled).toBe(false);
    expect(begin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "패키지 내보내기" }));
    expect(begin).toHaveBeenCalledExactlyOnceWith(ready.plan);
  });

  it.each([
    ["generic", "none"], ["webtoon", "assisted"], ["tapas", "generated"],
  ] as const)("UI가 막은 %s/%s 상태는 실제 export도 캡처 전에 같은 개수로 막는다", async (destination, aiUsage) => {
    const result = scenario(destination, aiUsage);
    const capture = vi.fn(), watermark = vi.fn(), status = vi.fn(), setError = vi.fn(), preflight = vi.fn();
    await executeStudioPublishPackageExport({
      ...result.snapshot, pages: result.pages, currentPageId: result.pages[0].id, episodeTitle: "다시 만난 아침",
      effectivePublishPackageSettings: result.plan.settings, publishPackagePlan: result.plan,
      publishPackageExportBusy: false, publishCompliance: result.compliance,
      aiProvenance: createEmptyStudioAiProvenanceDocument(), ensureSharedDocumentAvailableForExport: () => true,
      ensureWatermarkLoaded: watermark, handleCapturePagesForPreset: capture, currentPublishPackageCreditsText: () => "",
      setPublishPackageExportStatus: status, setPublishPackageExportProgress: vi.fn(), setPublishPackageExportBusy: vi.fn(),
      setPublishPackageOpen: vi.fn(), setPublishPreflightOpen: preflight, setError,
    });
    // Tapas의 생성물은 파일 계획 자체에서도 차단되므로 더 앞선 동일한 경계를 유지한다.
    expect(result.readiness.canExport).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(watermark).not.toHaveBeenCalled();
    if (result.plan.canExport) {
      expect(preflight).toHaveBeenCalledWith(true);
      expect(setError).toHaveBeenCalledWith(`게시 전 필수 점검 ${result.readiness.blockingIssueCount}개를 확인해 주세요.`);
    } else {
      expect(result.readiness.packageErrorCount).toBeGreaterThan(0);
    }
  });
});
