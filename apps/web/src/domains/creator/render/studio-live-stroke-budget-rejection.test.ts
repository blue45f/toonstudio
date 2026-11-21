import { afterEach, describe, expect, it, vi } from "vitest";

import { getI18nRuntimeTranslationSources, useI18n } from "@/shared/lib/i18n";

import { StudioLiveStrokeRenderBackendCoordinator } from "../live/studio-live-stroke-render-backend";
import { studioRejectedLiveSurfaceMessage } from "../studio-rejected-stroke-recovery-host";

import { createStudioLiveStrokeGpuAudit, studioLiveSourceJournalFailureReason } from "./studio-live-stroke-gpu-audit";

import type { StudioLiveStrokeBackendAuditSession } from "../studio-page-editor-types";

const initialLanguage = useI18n.getState().lang;
afterEach(() => useI18n.setState({ lang: initialLanguage }));

function auditFixture() {
  const sessions = new Map<string, StudioLiveStrokeBackendAuditSession>();
  const onSelectedEngineUnavailable = vi.fn();
  const audit = createStudioLiveStrokeGpuAudit({
    gpuCanvasShadowVisibleRef: { current: false },
    gpuLiveAcceptedRequestIdRef: { current: null },
    gpuLiveInkPinnedRef: { current: true },
    gpuPinReceiptWatchdogRef: { current: null },
    liveDraftLayerRef: { current: null },
    liveStrokeBackendAuditActiveIdRef: { current: null },
    liveStrokeBackendAuditEarlyGpuReceiptsRef: { current: new Map() },
    liveStrokeBackendAuditGpuOwnersRef: { current: new Map() },
    liveStrokeBackendAuditSessionsRef: { current: sessions },
    pendingGpuDrawAuthoritiesRef: { current: [] },
    pendingGpuStrokesRef: { current: [] },
    onSelectedEngineUnavailable,
    setWebGpuAuthority: vi.fn(),
    webGpuCanvasHandleRef: { current: null },
  });
  return { audit, sessions, onSelectedEngineUnavailable };
}

describe("장획 예산 거절", () => {
  it.each(["variation-budget", "source-advance-budget"] as const)("%s를 장치 장애로 바꾸지 않는다", (reason) => {
    expect(studioLiveSourceJournalFailureReason(reason)).toBe("stroke-budget-exceeded");
    expect(studioLiveSourceJournalFailureReason("invalid-coordinate")).toBe("request-failed");
  });

  it("첫 프레임 제출 전 예산 초과도 현재 epoch만 중단한다", () => {
    const coordinator = new StudioLiveStrokeRenderBackendCoordinator();
    const begin = coordinator.pointerDown({ strokeId: "long-stroke", backend: "webgpu" });
    expect(begin.status).toBe("accepted");
    const epoch = begin.next.epoch;
    const before = coordinator.getSnapshot();
    expect(coordinator.reportGpuFailure({
      epoch: epoch - 1, strokeId: "long-stroke", reason: "stroke-budget-exceeded",
    }).status).toBe("rejected");
    expect(coordinator.getSnapshot()).toBe(before);
    expect(coordinator.reportGpuFailure({
      epoch, strokeId: "another-stroke", reason: "stroke-budget-exceeded",
    }).status).toBe("rejected");
    expect(coordinator.getSnapshot()).toBe(before);
    expect(coordinator.reportGpuFailure({
      epoch, strokeId: "long-stroke", reason: "stroke-budget-exceeded",
    })).toMatchObject({
      status: "accepted",
      next: {
        pinnedBackend: "webgpu", presentationBackend: null,
        canvasShadowRetained: true, canvasShadowVisible: false,
        unavailableReason: "stroke-budget-exceeded",
      },
    });
  });

  it("영수증을 받은 뒤 요청 토큰이 없어도 예산 사유를 복구 콜백까지 유지한다", () => {
    const { audit, sessions, onSelectedEngineUnavailable } = auditFixture();
    expect(audit.beginLiveStrokeBackendAudit("long-stroke", "webgpu")).toBe(true);
    expect(audit.registerLiveStrokeGpuRequest("long-stroke", "frame:1")).toBe(true);
    expect(audit.receiveLiveStrokeGpuAuditReceipt({
      requestId: "frame:1", fingerprint: "frame:1", backend: "webgpu", complete: true,
      strokeCount: 1, dabCount: 1, physicalWidth: 64, physicalHeight: 64,
    }).status).toBe("accepted");
    expect(sessions.get("long-stroke")?.gpuRequest).toBeNull();
    expect(audit.reportLiveStrokeGpuAuditFailure(
      studioLiveSourceJournalFailureReason("variation-budget"), undefined, "long-stroke",
    )).toBe(true);
    expect(onSelectedEngineUnavailable).toHaveBeenCalledExactlyOnceWith("stroke-budget-exceeded", "long-stroke");
    expect(sessions.get("long-stroke")?.coordinator.getSnapshot()).toMatchObject({
      presentationBackend: null, unavailableReason: "stroke-budget-exceeded",
    });
    audit.cancelAllLiveStrokeBackendAudits();
    audit.cancelGpuPinnedRequestWatchdog();
  });

  it.each([
    { label: "사라진 획", requestId: undefined, strokeId: "retired-stroke" },
    { label: "빈 획 식별자", requestId: undefined, strokeId: "" },
    { label: "알 수 없는 요청", requestId: "retired-request", strokeId: undefined },
    { label: "현재 획과 알 수 없는 요청", requestId: "retired-request", strokeId: "stroke-b" },
    { label: "서로 다른 요청·획 소유자", requestId: "frame:a", strokeId: "stroke-b" },
    { label: "식별자 없는 예산 거절", requestId: undefined, strokeId: undefined },
  ])("$label 실패를 현재 획에 다시 연결하지 않는다", ({ requestId, strokeId }) => {
    const { audit, sessions, onSelectedEngineUnavailable } = auditFixture();
    try {
      expect(audit.beginLiveStrokeBackendAudit("stroke-a", "webgpu")).toBe(true);
      expect(audit.registerLiveStrokeGpuRequest("stroke-a", "frame:a")).toBe(true);
      expect(audit.sealLiveStrokeBackendAudit("stroke-a")).toBe(true);
      expect(audit.beginLiveStrokeBackendAudit("stroke-b", "webgpu")).toBe(true);
      expect(audit.registerLiveStrokeGpuRequest("stroke-b", "frame:b")).toBe(true);
      const beforeA = sessions.get("stroke-a")?.coordinator.getSnapshot();
      const beforeB = sessions.get("stroke-b")?.coordinator.getSnapshot();

      expect(audit.reportLiveStrokeGpuAuditFailure("stroke-budget-exceeded", requestId, strokeId)).toBe(false);
      expect(sessions.get("stroke-a")?.coordinator.getSnapshot()).toBe(beforeA);
      expect(sessions.get("stroke-b")?.coordinator.getSnapshot()).toBe(beforeB);
      expect(onSelectedEngineUnavailable).not.toHaveBeenCalled();
    } finally {
      audit.cancelAllLiveStrokeBackendAudits();
      audit.cancelGpuPinnedRequestWatchdog();
    }
  });

  it("요청과 획이 같은 소유자를 가리킬 때만 그 획을 중단한다", () => {
    const { audit, sessions, onSelectedEngineUnavailable } = auditFixture();
    try {
      expect(audit.beginLiveStrokeBackendAudit("stroke-a", "webgpu")).toBe(true);
      expect(audit.registerLiveStrokeGpuRequest("stroke-a", "frame:a")).toBe(true);
      expect(audit.sealLiveStrokeBackendAudit("stroke-a")).toBe(true);
      expect(audit.beginLiveStrokeBackendAudit("stroke-b", "webgpu")).toBe(true);
      const beforeB = sessions.get("stroke-b")?.coordinator.getSnapshot();

      expect(audit.reportLiveStrokeGpuAuditFailure("stroke-budget-exceeded", "frame:a", "stroke-a")).toBe(true);
      expect(onSelectedEngineUnavailable).toHaveBeenCalledExactlyOnceWith("stroke-budget-exceeded", "stroke-a");
      expect(sessions.get("stroke-b")?.coordinator.getSnapshot()).toBe(beforeB);
    } finally {
      audit.cancelAllLiveStrokeBackendAudits();
      audit.cancelGpuPinnedRequestWatchdog();
    }
  });

  it.each(["device-lost", "surface-lost"] as const)("식별자 없는 %s만 현재 획에 적용한다", (reason) => {
    const { audit, onSelectedEngineUnavailable } = auditFixture();
    try {
      expect(audit.beginLiveStrokeBackendAudit("stroke-b", "webgpu")).toBe(true);
      expect(audit.reportLiveStrokeGpuAuditFailure(reason)).toBe(true);
      expect(onSelectedEngineUnavailable).toHaveBeenCalledExactlyOnceWith(reason, "stroke-b");
    } finally {
      audit.cancelAllLiveStrokeBackendAudits();
      audit.cancelGpuPinnedRequestWatchdog();
    }
  });

  it.each(["ko", "en", "zz"])("%s에서 처리 한도와 실제 복구 가능 여부를 안내한다", (lang) => {
    useI18n.setState({ lang });
    const retained = studioRejectedLiveSurfaceMessage("WebGPU", "surface-lost", true, "stroke-budget-exceeded");
    const cancelled = studioRejectedLiveSurfaceMessage("WebGPU", "surface-lost", false, "stroke-budget-exceeded");
    expect(retained).not.toContain("surface-lost");
    expect(cancelled).not.toContain("surface-lost");
    expect(retained).not.toContain("studio.strokeRecovery");
    if (lang === "ko") {
      expect(retained).toContain("'획 복구'에서 복구할 수 있습니다");
      expect(retained).toContain("대칭 수를 줄여");
      expect(cancelled).toContain("현재 획을 취소했습니다");
      expect(cancelled).not.toContain("복구할 수 있습니다");
    } else {
      expect(retained).toContain("Stroke Recovery");
      expect(retained).toContain("reduce the symmetry count");
      expect(cancelled).toContain("was cancelled");
      expect(cancelled).not.toContain("Stroke Recovery");
    }
  });

  it("예산 복구 안내 두 키를 다른 언어의 영어 번역 원문으로 등록한다", () => {
    const sources = getI18nRuntimeTranslationSources();
    expect(sources).toContainEqual({ key: "studio.strokeRecovery.budgetSalvaged", locale: "en" });
    expect(sources).toContainEqual({ key: "studio.strokeRecovery.budgetCancelled", locale: "en" });
  });
});
