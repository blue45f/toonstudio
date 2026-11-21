// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPinnedReviewPreview } from "../virtual-space/StudioPinnedReviewPreview";
import {
  CRECO_STAGE_CATALOG,
  addPinRedlineFeedback,
  approveAndCloseStageVersion,
  buildCanvasJumpPayload,
  commitImmutableVersion,
  createInitialCrecoWorkspaceState,
  findStageAndVersion,
  publishPrivateFeedbackDrafts,
  resolveCanonicalShareTarget,
  setCanonicalShareMode,
  setCompareLayoutMode,
  setCompareSlots,
  setCompareSyncMode,
  setCompareWipePercent,
  summarizeVersionDiff,
  syncCompareScroll,
  updateFeedbackStatus,
} from "./creco-version-compare-engine";
import {
  CRECO_SHORTCUT_DEFINITIONS,
  WEBTOON_PLATFORM_SPECS,
  aggregateWorkerLeadTimeMetrics,
  buildMultiSpecExportManifest,
  calculateSeatEconomics,
  createInitialGovernanceState,
  evaluateStageAclAndLog,
  generateFreeAssistantShadingPreview,
  mapCrecoViewerShortcut,
  updateMemberStageAcl,
  validateSecurityShareLink,
} from "./creco-shading-acl-audit-engine";
import { StudioCrecoCollabViewerPanel } from "./StudioCrecoCollabViewerPanel";

vi.mock("../virtual-space/studio-virtual-space-review-preview", () => ({
  getStudioVirtualSpaceReviewPreview: vi.fn(async () => ({
    ok: false,
    reason: "preview-unavailable",
  })),
}));

afterEach(() => {
  cleanup();
});

describe("CRECO++ 5계층 불변 버전 트리 & 단일 공유 링크", () => {
  it("초기 5계층 트리가 8대 공정과 기본 4열 비교(콘티7차·선화1차·식자3차·일본어3차)를 구성한다", () => {
    const state = createInitialCrecoWorkspaceState();
    expect(state.tree.episode.stages).toHaveLength(CRECO_STAGE_CATALOG.length);
    expect(state.compare.slots.map((slot) => slot.versionId)).toEqual([
      "storyboard-conti-v7",
      "lineart-v1",
      "lettering-v3",
      "loc-ja-v3",
    ]);
  });

  it("1클릭 불변 버전 생성 시 이전 v1..vN 기록을 100% 보존하며 vN+1을 추가한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const beforeLineart = findStageAndVersion(initial.tree, "lineart").stage;
    const beforeV1 = beforeLineart?.versions[0];
    expect(beforeLineart?.versions).toHaveLength(1);

    const { nextState, createdVersion } = commitImmutableVersion(initial, {
      stageId: "lineart",
      authorName: "박하린(선화)",
      summary: "컷 1 어깨 실루엣 6% 확장 보정",
      workMinutes: 28,
      updatedCutIndices: [0],
    });

    const afterLineart = findStageAndVersion(nextState.tree, "lineart").stage;
    expect(afterLineart?.versions).toHaveLength(2);
    expect(afterLineart?.versions[0]).toEqual(beforeV1);
    expect(createdVersion.versionNumber).toBe(2);
    expect(createdVersion.parentVersionId).toBe("lineart-v1");
    expect(createdVersion.artifacts[0]?.changeBadge).toBe("updated");
    expect(createdVersion.artifacts[1]?.changeBadge).toBe("unchanged");
  });

  it("신규 컷을 추가하며 커밋하면 새 컷은 new 배지로 기록된다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const { createdVersion } = commitImmutableVersion(initial, {
      stageId: "storyboard-conti",
      authorName: "김도현(콘티)",
      summary: "컷 5 보너스 엔딩 추가",
      workMinutes: 20,
      addedCutTitle: "컷 5 · 봉인 문양 잔상",
    });

    expect(createdVersion.artifacts).toHaveLength(5);
    expect(createdVersion.artifacts[4]?.changeBadge).toBe("new");
    expect(createdVersion.artifacts[4]?.title).toContain("컷 5");
  });

  it("단일 공유 링크는 최신 승인본을 자동 추적하며 파일명 혼선 위험 0%를 보장한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const firstShare = resolveCanonicalShareTarget(initial);
    expect(firstShare.resolvedVersion?.versionId).toBe("lettering-v3");
    expect(firstShare.filenameConfusionRiskPct).toBe(0);

    const { nextState } = commitImmutableVersion(initial, {
      stageId: "lettering",
      authorName: "한소율(식자)",
      summary: "효과음 4차 최종 승인본",
      workMinutes: 15,
      markApproved: true,
    });
    const nextShare = resolveCanonicalShareTarget(nextState);
    expect(nextShare.url).toBe(firstShare.url);
    expect(nextShare.resolvedVersion?.versionId).toBe("lettering-v4");
  });

  it("단일 공유 링크를 지정 버전 고정(pinned) 모드로 전환해도 같은 URL에서 해당 버전을 가리킨다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const pinnedState = setCanonicalShareMode(initial, "pinned", "storyboard-conti", "storyboard-conti-v3");
    const resolved = resolveCanonicalShareTarget(pinnedState);
    expect(resolved.mode).toBe("pinned");
    expect(resolved.resolvedVersion?.versionId).toBe("storyboard-conti-v3");
  });

  it("2단계 공정 마감 승인 시 기여도를 100% 정규화하고 공개 피드백을 일괄 해결한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const { nextState, autoResolvedCount } = approveAndCloseStageVersion(initial, {
      stageId: "lineart",
      versionId: "lineart-v1",
      approverName: "오태훈(담당 PD)",
      resolveOpenPublicFeedbacks: true,
      contributors: [
        { name: "박하린(선화)", sharePct: 3 },
        { name: "김도현(콘티)", sharePct: 1 },
      ],
    });

    expect(autoResolvedCount).toBe(1);
    const closed = findStageAndVersion(nextState.tree, "lineart", "lineart-v1").version;
    expect(closed?.lifecycle).toBe("stage-closed");
    const sum = closed?.contributors.reduce((acc, item) => acc + item.sharePct, 0);
    expect(sum).toBe(100);
    expect(nextState.feedbacks.find((fb) => fb.id === "pin-101")?.status).toBe("resolved");
  });
});

describe("CRECO++ 4열 다중 공정 동시 동기 비교 · 가로 오버뷰 · 와이프 핸들", () => {
  it("동시 비교 슬롯은 중복을 제거하고 최대 4열로 제한한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const updated = setCompareSlots(initial, [
      { stageId: "storyboard-conti" },
      { stageId: "storyboard-conti" },
      { stageId: "lineart" },
      { stageId: "bg3d" },
      { stageId: "coloring" },
      { stageId: "lettering" },
    ]);
    expect(updated.compare.slots).toHaveLength(4);
    expect(updated.compare.slots.map((s) => s.stageId)).toEqual([
      "storyboard-conti",
      "lineart",
      "bg3d",
      "coloring",
    ]);
  });

  it("all-lock(A) 모드는 4개 레인의 스크롤 비율과 활성 컷을 완전 일치시킨다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const synced = syncCompareScroll(initial.compare, "lane-1", 0.65, 2);
    expect(synced.activeCutIndex).toBe(2);
    expect(Object.values(synced.slotScrollRatios)).toEqual([0.65, 0.65, 0.65, 0.65]);
  });

  it("offset-keep(S) 모드는 각 창이 유지하던 수동 스크롤 오프셋 차이를 보존한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const seeded = {
      ...setCompareSyncMode(initial.compare, "offset-keep"),
      slotScrollRatios: { "lane-1": 0.1, "lane-2": 0.3, "lane-3": 0.2, "lane-4": 0.4 },
    };
    const synced = syncCompareScroll(seeded, "lane-1", 0.3, 1);
    expect(synced.slotScrollRatios["lane-1"]).toBeCloseTo(0.3, 5);
    expect(synced.slotScrollRatios["lane-2"]).toBeCloseTo(0.5, 5);
    expect(synced.slotScrollRatios["lane-3"]).toBeCloseTo(0.4, 5);
    expect(synced.slotScrollRatios["lane-4"]).toBeCloseTo(0.6, 5);
  });

  it("height-ratio(P) 모드는 공정별 높이 비율에 맞춰 비례 동기화한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const proportional = setCompareSyncMode(initial.compare, "height-ratio");
    const synced = syncCompareScroll(proportional, "lane-1", 0.5, 1);
    expect(synced.slotScrollRatios["lane-1"]).toBe(0.5);
    expect(synced.slotScrollRatios["lane-4"]).toBeGreaterThan(0.5);
  });

  it("세로 비교 ↔ 가로 오버뷰 ↔ 와이프 비교 레이아웃 전환을 지원한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const horizontal = setCompareLayoutMode(initial.compare, "horizontal-overview");
    expect(horizontal.layoutMode).toBe("horizontal-overview");
    const wipe = setCompareLayoutMode(horizontal, "wipe-compare");
    expect(wipe.layoutMode).toBe("wipe-compare");
  });

  it("와이프 핸들을 0~100%로 클램핑하고 수정 전/후 차이 요약을 계산한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    expect(setCompareWipePercent(initial.compare, -25).wipePercent).toBe(0);
    expect(setCompareWipePercent(initial.compare, 145).wipePercent).toBe(100);

    const before = findStageAndVersion(initial.tree, "storyboard-conti", "storyboard-conti-v7").version;
    const after = findStageAndVersion(initial.tree, "lineart", "lineart-v1").version;
    const diff = summarizeVersionDiff(before, after);
    expect(diff.updatedCuts).toBe(4);
    expect(diff.summaryLines[0]).toContain("콘티 7차 → 선화 1차");
  });
});

describe("CRECO++ 핀 · 레드라인 피드백 · 0.1초 캔버스 레이어 직결 점프", () => {
  it("좌표 클램핑된 핀과 벡터 드로잉 레드라인 피드백을 생성한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const { nextState, createdFeedback } = addPinRedlineFeedback(initial, {
      stageId: "lineart",
      versionId: "lineart-v1",
      cutIndex: 1,
      xPct: 120,
      yPct: -10,
      authorName: "오태훈(담당 PD)",
      assigneeName: "박하린(선화)",
      body: "손가락 각도 수정 요청",
      importance: "required",
      strokes: [
        {
          id: "s-new",
          widthPx: 3,
          tone: "crimson",
          points: [
            { xPct: 10, yPct: 20 },
            { xPct: 110, yPct: 30 },
          ],
        },
      ],
    });

    expect(createdFeedback.xPct).toBe(100);
    expect(createdFeedback.yPct).toBe(0);
    expect(createdFeedback.strokes[0]?.points[1]?.xPct).toBe(100);
    expect(nextState.feedbacks.length).toBe(initial.feedbacks.length + 1);
  });

  it("피드백 해결 상태(open → in-progress → resolved)를 정확히 전이한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const inProgress = updateFeedbackStatus(initial, "pin-101", "in-progress", "박하린(선화)");
    expect(inProgress.feedbacks.find((f) => f.id === "pin-101")?.status).toBe("in-progress");

    const resolved = updateFeedbackStatus(inProgress, "pin-101", "resolved", "박하린(선화)");
    const item = resolved.feedbacks.find((f) => f.id === "pin-101");
    expect(item?.status).toBe("resolved");
    expect(item?.resolvedBy).toBe("박하린(선화)");
  });

  it("비공개 초안 피드백을 일괄 발행(publishPrivateFeedbackDrafts)한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const { nextState, publishedCount } = publishPrivateFeedbackDrafts(initial, "오태훈(담당 PD)");
    expect(publishedCount).toBe(1);
    expect(nextState.feedbacks.every((f) => f.visibility === "public")).toBe(true);
  });

  it("핀 클릭 시 외부 파일 업로드 없이 toonstudio.canvas-jump.v1 직결 점프 페이로드를 생성한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    const jump = buildCanvasJumpPayload(initial, "pin-101");
    expect(jump).not.toBeNull();
    expect(jump?.schema).toBe("toonstudio.canvas-jump.v1");
    expect(jump?.requiresExternalUpload).toBe(false);
    expect(jump?.estimatedLatencyMs).toBeLessThanOrEqual(100);
    expect(jump?.layerId).toBe("layer-ink-vector-c1");
    expect(jump?.deepLinkUri).toContain("toonstudio://canvas/proj-moonlight-atelier/ep-042");
  });

  it("존재하지 않는 핀 ID에 대해서는 null을 반환한다", () => {
    const initial = createInitialCrecoWorkspaceState();
    expect(buildCanvasJumpPayload(initial, "pin-missing")).toBeNull();
  });
});

describe("CRECO++ ₩0 무료 AI 어시스턴트 음영 생성 엔진", () => {
  it("2K/4K 무료 AI 음영을 ₩0·0토큰으로 생성하고 타사 유료 토큰 절감치를 계산한다", () => {
    const preview2k = generateFreeAssistantShadingPreview({
      cutIndex: 0,
      lightDirection: "top-left",
      edgeStyle: "cel-hard",
      shadowDensityPct: 60,
      rimLightPct: 45,
      tonePresetId: "indigo-dusk",
      resolution: "2K",
      outputMode: "merged",
      wipePercent: 50,
    });
    const preview4k = generateFreeAssistantShadingPreview({
      cutIndex: 0,
      lightDirection: "backlight",
      edgeStyle: "soft-gradient",
      shadowDensityPct: 75,
      rimLightPct: 80,
      tonePresetId: "sunset-amber",
      resolution: "4K",
      outputMode: "separate-alpha",
      wipePercent: 72,
    });

    expect(preview2k.costKrw).toBe(0);
    expect(preview2k.tokenCost).toBe(0);
    expect(preview2k.crecoEquivalentTokens).toBe(40);
    expect(preview4k.costKrw).toBe(0);
    expect(preview4k.crecoEquivalentTokens).toBe(55);
  });

  it("광원 방향에 따라 그림자 벡터와 그라데이션 각도를 결정적으로 산출한다", () => {
    const left = generateFreeAssistantShadingPreview({
      cutIndex: 1,
      lightDirection: "left",
      edgeStyle: "cel-hard",
      shadowDensityPct: 50,
      rimLightPct: 30,
      tonePresetId: "slate-ink",
      resolution: "2K",
      outputMode: "merged",
      wipePercent: 40,
    });
    const right = generateFreeAssistantShadingPreview({
      cutIndex: 1,
      lightDirection: "right",
      edgeStyle: "cel-hard",
      shadowDensityPct: 50,
      rimLightPct: 30,
      tonePresetId: "slate-ink",
      resolution: "2K",
      outputMode: "merged",
      wipePercent: 40,
    });

    expect(left.shadowVectorX).toBeGreaterThan(0);
    expect(right.shadowVectorX).toBeLessThan(0);
    expect(left.gradientAngleDeg).not.toBe(right.gradientAngleDeg);
  });

  it("셀 하드 엣지와 소프트 그라데이션 엣지의 CSS 그라데이션 및 클램핑을 구분한다", () => {
    const hard = generateFreeAssistantShadingPreview({
      cutIndex: 0,
      lightDirection: "optimal",
      edgeStyle: "cel-hard",
      shadowDensityPct: 140,
      rimLightPct: -20,
      tonePresetId: "warm-plum",
      resolution: "4K",
      outputMode: "separate-alpha",
      wipePercent: 180,
    });
    const soft = generateFreeAssistantShadingPreview({
      cutIndex: 0,
      lightDirection: "optimal",
      edgeStyle: "soft-gradient",
      shadowDensityPct: 50,
      rimLightPct: 50,
      tonePresetId: "warm-plum",
      resolution: "4K",
      outputMode: "separate-alpha",
      wipePercent: 50,
    });

    expect(hard.shadowDensityPct).toBe(100);
    expect(hard.rimLightPct).toBe(0);
    expect(hard.wipePercent).toBe(100);
    expect(hard.gradientCss).toContain("54%");
    expect(soft.gradientCss).toContain("96%");
    expect(hard.shadowFillOklch).toContain("oklch(");
  });

  it("합쳐진 결과물과 분리 투명 레이어 요약 문구를 정확히 구분한다", () => {
    const sep = generateFreeAssistantShadingPreview({
      cutIndex: 2,
      lightDirection: "top",
      edgeStyle: "cel-hard",
      shadowDensityPct: 60,
      rimLightPct: 40,
      tonePresetId: "indigo-dusk",
      resolution: "4K",
      outputMode: "separate-alpha",
      wipePercent: 60,
    });
    expect(sep.summaryText).toContain("분리 투명 레이어");
    expect(sep.summaryText).toContain("₩0 무과금");
  });
});

describe("CRECO++ 세부 공정 ACL · 보안 공유 링크 · 해시 체인 활동 로그", () => {
  it("₩0 무제한 시트 경제성 계산기가 타사 유료 시트 수와 ToonStudio ₩0을 정확히 산출한다", () => {
    const gov = createInitialGovernanceState();
    const econ = calculateSeatEconomics(gov.members);
    expect(econ.totalMembers).toBe(5);
    expect(econ.crecoRequiredPaidSeats).toBe(4);
    expect(econ.crecoFreeGuests).toBe(1);
    expect(econ.toonStudioPaidSeats).toBe(0);
    expect(econ.toonStudioCostKrw).toBe(0);
    expect(econ.unlimitedSeats).toBe(true);
  });

  it("제한된 편집 권한(limited-edit) 외주 작업자는 upload는 허용되고 download/approve는 차단된다", () => {
    const gov = createInitialGovernanceState();
    const uploadRes = evaluateStageAclAndLog(gov, {
      memberId: "mem-color-sub",
      stageId: "coloring",
      action: "upload",
    });
    expect(uploadRes.allowed).toBe(true);

    const downloadRes = evaluateStageAclAndLog(uploadRes.nextState, {
      memberId: "mem-color-sub",
      stageId: "coloring",
      action: "download",
    });
    expect(downloadRes.allowed).toBe(false);
    expect(downloadRes.logEntry.outcome).toBe("denied");

    const approveRes = evaluateStageAclAndLog(downloadRes.nextState, {
      memberId: "mem-color-sub",
      stageId: "coloring",
      action: "approve",
    });
    expect(approveRes.allowed).toBe(false);
  });

  it("공정 권한을 edit으로 승격하면 download가 즉시 허용된다", () => {
    const gov = createInitialGovernanceState();
    const upgraded = updateMemberStageAcl(gov, "mem-color-sub", "coloring", "edit");
    const res = evaluateStageAclAndLog(upgraded, {
      memberId: "mem-color-sub",
      stageId: "coloring",
      action: "download",
    });
    expect(res.allowed).toBe(true);
  });

  it("만료된 보안 공유 링크는 열람을 차단한다", () => {
    const gov = createInitialGovernanceState();
    const check = validateSecurityShareLink(gov.sharePolicy, {
      nowIso: "2026-12-05T00:00:00Z",
      providedPassword: gov.sharePolicy.password,
      ndaAccepted: true,
      wantsDownload: false,
    });
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("만료");
  });

  it("잘못된 비밀번호 또는 NDA 미동의 시 보안 공유 링크 접근을 차단한다", () => {
    const gov = createInitialGovernanceState();
    const badPw = validateSecurityShareLink(gov.sharePolicy, {
      nowIso: "2026-11-22T10:00:00Z",
      providedPassword: "WRONG",
      ndaAccepted: true,
      wantsDownload: false,
    });
    expect(badPw.allowed).toBe(false);
    expect(badPw.reason).toContain("비밀번호");

    const noNda = validateSecurityShareLink(gov.sharePolicy, {
      nowIso: "2026-11-22T10:00:00Z",
      providedPassword: gov.sharePolicy.password,
      ndaAccepted: false,
      wantsDownload: false,
    });
    expect(noNda.allowed).toBe(false);
    expect(noNda.reason).toContain("NDA");
  });

  it("다운로드 차단 링크에서 다운로드를 거부하고 열람 시 동적 워터마크를 발급한다", () => {
    const gov = createInitialGovernanceState();
    const blockedDownload = validateSecurityShareLink(gov.sharePolicy, {
      nowIso: "2026-11-22T10:00:00Z",
      providedPassword: gov.sharePolicy.password,
      ndaAccepted: true,
      wantsDownload: true,
    });
    expect(blockedDownload.allowed).toBe(false);
    expect(blockedDownload.reason).toContain("다운로드가 차단");

    const allowedView = validateSecurityShareLink(gov.sharePolicy, {
      nowIso: "2026-11-22T10:00:00Z",
      providedPassword: gov.sharePolicy.password,
      ndaAccepted: true,
      wantsDownload: false,
    });
    expect(allowedView.allowed).toBe(true);
    expect(allowedView.watermarkText).toContain("피코마_일본편집부");
    expect(allowedView.watermarkText).toContain("2026-11-22");
  });

  it("활동 로그가 이전 해시(prevHash)와 현재 해시(entryHash)의 불변 체인을 유지한다", () => {
    const gov = createInitialGovernanceState();
    const r1 = evaluateStageAclAndLog(gov, {
      memberId: "mem-pd",
      stageId: "lineart",
      action: "approve",
      leadTimeMinutes: 12,
    });
    const r2 = evaluateStageAclAndLog(r1.nextState, {
      memberId: "mem-buyer",
      stageId: "lettering",
      action: "comment",
      leadTimeMinutes: 24,
    });
    expect(r2.logEntry.prevHash).toBe(r1.logEntry.entryHash);
    expect(r2.logEntry.seq).toBe(r1.logEntry.seq + 1);
  });

  it("작업자별 리드타임 성과와 허용/차단 통계를 정확히 집계한다", () => {
    const gov = createInitialGovernanceState();
    const metrics = aggregateWorkerLeadTimeMetrics(gov.auditLogs);
    const pd = metrics.find((m) => m.actorName === "오태훈(담당 PD)");
    expect(pd).toBeDefined();
    expect(pd?.avgLeadTimeMinutes).toBe(20);
    expect(pd?.approvalsCount).toBe(1);
    expect(pd?.slaStatus).toBe("fast");
  });
});

describe("CRECO++ 단축키 매퍼 & 6대 플랫폼 규격/대타 인수인계 매니페스트", () => {
  it("J/K/C/H/F/S/V 단축키 7종을 대소문자 무관하게 정확히 매핑한다", () => {
    expect(CRECO_SHORTCUT_DEFINITIONS).toHaveLength(7);
    expect(mapCrecoViewerShortcut({ key: "j" })).toBe("next-cut");
    expect(mapCrecoViewerShortcut({ key: "K" })).toBe("prev-cut");
    expect(mapCrecoViewerShortcut({ key: "c" })).toBe("toggle-compare");
    expect(mapCrecoViewerShortcut({ key: "h" })).toBe("toggle-horizontal-overview");
    expect(mapCrecoViewerShortcut({ key: "f" })).toBe("toggle-pin-feedback");
    expect(mapCrecoViewerShortcut({ key: "s" })).toBe("toggle-ai-shading");
    expect(mapCrecoViewerShortcut({ key: "v" })).toBe("create-version");
  });

  it("입력 필드 포커스 또는 조합키(Ctrl/Meta/Alt) 입력 시 단축키를 무시한다", () => {
    expect(mapCrecoViewerShortcut({ key: "j", targetTagName: "INPUT" })).toBeNull();
    expect(mapCrecoViewerShortcut({ key: "v", targetTagName: "TEXTAREA" })).toBeNull();
    expect(mapCrecoViewerShortcut({ key: "c", isContentEditable: true })).toBeNull();
    expect(mapCrecoViewerShortcut({ key: "c", ctrlKey: true })).toBeNull();
    expect(mapCrecoViewerShortcut({ key: "s", metaKey: true })).toBeNull();
  });

  it("6대 웹툰 플랫폼 전체 규격의 다중 내보내기 매니페스트를 생성한다", () => {
    const manifest = buildMultiSpecExportManifest({
      projectAbbreviation: "MOON",
      episodeNumber: 42,
      versionLabel: "식자 3차",
      versionDigest: "vhash_abcdef01",
      cutCount: 4,
      unresolvedPinCount: 2,
      platformIds: WEBTOON_PLATFORM_SPECS.map((s) => s.platformId),
      resizeMode: "fixed-slice",
      quality: "best",
      includeThumbnails: true,
      includeHandoffPack: false,
    });
    expect(manifest.platforms).toHaveLength(6);
    expect(manifest.filePrefix).toBe("MOON_EP042_식자_3차");
    expect(manifest.platforms[0]?.sliceCount).toBe(8);
  });

  it("대타·이어그리기 인수인계 패키지 포함 시 ₩0 게스트 시트와 미해결 핀 수를 첨부한다", () => {
    const manifest = buildMultiSpecExportManifest({
      projectAbbreviation: "MOON",
      episodeNumber: 42,
      versionLabel: "선화 1차",
      versionDigest: "vhash_12345678",
      cutCount: 4,
      unresolvedPinCount: 3,
      platformIds: ["naver-webtoon", "piccoma-linemanga"],
      resizeMode: "original",
      quality: "high",
      includeThumbnails: true,
      includeHandoffPack: true,
    });
    expect(manifest.platforms[0]?.outputWidthPx).toBe(1600);
    expect(manifest.handoffPack.enabled).toBe(true);
    expect(manifest.handoffPack.guestSeatCostKrw).toBe(0);
    expect(manifest.handoffPack.unresolvedPinCount).toBe(3);
  });
});

describe("StudioCrecoCollabViewerPanel UI 인터랙션 & 지연 로딩 통합", () => {
  it("1클릭 불변 버전 생성 버튼 클릭 시 기존 버전을 유지한 채 버전 수가 증가한다", () => {
    render(<StudioCrecoCollabViewerPanel />);
    expect(screen.getByTestId("ccv-active-version-count").textContent).toBe("1");

    fireEvent.change(screen.getByTestId("ccv-version-summary-input"), {
      target: { value: "선화 2차 외투 보정" },
    });
    fireEvent.click(screen.getByTestId("ccv-commit-version-btn"));

    expect(screen.getByTestId("ccv-active-version-count").textContent).toBe("2");
    const listText = screen.getByTestId("ccv-version-history-list").textContent ?? "";
    expect(listText).toContain("선화 2차");
    expect(listText).toContain("선화 1차");
  });

  it("가로 한눈에 오버뷰 및 0~100% 와이프 핸들 비교 전환이 동작한다", () => {
    render(<StudioCrecoCollabViewerPanel />);
    fireEvent.click(screen.getByTestId("ccv-layout-horizontal"));
    expect(screen.getByTestId("ccv-compare-lanes").getAttribute("data-layout")).toBe(
      "horizontal-overview",
    );

    fireEvent.click(screen.getByTestId("ccv-layout-wipe"));
    expect(screen.getByTestId("ccv-wipe-compare-stage")).toBeDefined();
    fireEvent.change(screen.getByTestId("ccv-compare-wipe-slider"), { target: { value: "78" } });
    expect(screen.getByTestId("ccv-wipe-compare-stage").textContent).toContain("78%");
    expect(screen.getByTestId("ccv-version-diff-summary").textContent).toContain("콘티 7차");
  });

  it("핀·레드라인 등록, 해결 완료, 0.1초 캔버스 직결 점프(toonstudio.canvas-jump.v1)가 동작한다", () => {
    const onCanvasJump = vi.fn();
    render(<StudioCrecoCollabViewerPanel onCanvasJump={onCanvasJump} />);

    fireEvent.change(screen.getByTestId("ccv-pin-body-input"), {
      target: { value: "배경 난간 투시 보정" },
    });
    fireEvent.click(screen.getByTestId("ccv-add-pin-btn"));
    expect(screen.getByTestId("ccv-feedback-list").textContent).toContain("배경 난간 투시 보정");

    fireEvent.click(screen.getByTestId("ccv-jump-btn-pin-101"));
    expect(onCanvasJump).toHaveBeenCalledOnce();
    expect(onCanvasJump.mock.calls[0]?.[0]?.schema).toBe("toonstudio.canvas-jump.v1");
    expect(screen.getByTestId("ccv-canvas-jump-banner").textContent).toContain(
      "toonstudio.canvas-jump.v1",
    );

    fireEvent.click(screen.getByTestId("ccv-resolve-btn-pin-101"));
    expect(screen.getByTestId("ccv-resolve-btn-pin-101").textContent).toBe("다시 열기");
  });

  it("단축키 J/K/C/H/F/S/V 입력으로 뷰어 동작을 즉시 제어한다", () => {
    render(<StudioCrecoCollabViewerPanel />);
    expect(screen.getByTestId("ccv-active-cut-indicator").textContent).toContain("컷 1 / 4");

    fireEvent.keyDown(window, { key: "j" });
    expect(screen.getByTestId("ccv-active-cut-indicator").textContent).toContain("컷 2 / 4");

    fireEvent.keyDown(window, { key: "k" });
    expect(screen.getByTestId("ccv-active-cut-indicator").textContent).toContain("컷 1 / 4");

    fireEvent.keyDown(window, { key: "h" });
    expect(screen.getByTestId("ccv-compare-lanes").getAttribute("data-layout")).toBe(
      "horizontal-overview",
    );

    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByTestId("ccv-wipe-compare-stage")).toBeDefined();

    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByTestId("ccv-pin-mode-toggle").getAttribute("aria-pressed")).toBe("true");

    fireEvent.keyDown(window, { key: "v" });
    expect(screen.getByTestId("ccv-active-version-count").textContent).toBe("2");

    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByTestId("ccv-shading-cost-pill").textContent).toContain("₩0 무과금");
  });

  it("무료 AI 음영 탭, ACL·활동 로그 탭, 6대 플랫폼·대타 내보내기 탭 인터랙션이 동작한다", () => {
    render(<StudioCrecoCollabViewerPanel />);

    // 1) 무료 AI 음영 스튜디오
    fireEvent.click(screen.getByTestId("ccv-tab-ai-shading"));
    fireEvent.change(screen.getByTestId("ccv-light-select"), { target: { value: "backlight" } });
    fireEvent.change(screen.getByTestId("ccv-shading-wipe-slider"), { target: { value: "82" } });
    fireEvent.click(screen.getByTestId("ccv-approve-shading-btn"));
    expect(screen.getByTestId("ccv-shading-summary").textContent).toContain("역광 실루엣");
    expect(screen.getByTestId("ccv-status-notice").textContent).toContain("₩0으로 승인");

    // 2) ACL 및 활동 로그
    fireEvent.click(screen.getByTestId("ccv-tab-acl-audit"));
    fireEvent.change(screen.getByTestId("ccv-acl-member-select"), {
      target: { value: "mem-color-sub" },
    });
    fireEvent.change(screen.getByTestId("ccv-acl-stage-select"), {
      target: { value: "coloring" },
    });
    fireEvent.change(screen.getByTestId("ccv-acl-action-select"), {
      target: { value: "download" },
    });
    fireEvent.click(screen.getByTestId("ccv-run-acl-check-btn"));
    expect(screen.getByTestId("ccv-audit-log-table").textContent).toContain("차단");
    expect(screen.getByTestId("ccv-leadtime-metrics").textContent).toContain("평균 리드타임");

    // 3) 6대 플랫폼 & 대타 인수인계 내보내기
    fireEvent.click(screen.getByTestId("ccv-tab-export-handoff"));
    fireEvent.click(screen.getByTestId("ccv-export-build-btn"));
    expect(screen.getByTestId("ccv-handoff-checklist").textContent).toContain("게스트 시트 ₩0");
  });

  it("StudioPinnedReviewPreview 접이식 패널을 열면 CRECO++ 뷰어가 lazyRetry로 지연 마운트된다", async () => {
    const subject = {
      schemaVersion: 1 as const,
      workId: "work-creco",
      projectId: "proj-moonlight-atelier",
      artifactId: "artifact-ep42",
      reviewId: "review-ep42",
      revisionId: "snapshot-ep42",
      rootGraphHash: "a".repeat(64),
    };
    render(<StudioPinnedReviewPreview subject={subject} onRevoked={vi.fn()} />);

    const disclosure = screen.getByTestId("studio-creco-collab-viewer-disclosure") as HTMLDetailsElement;
    expect(screen.queryByTestId("studio-creco-collab-viewer-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-creco-collab-viewer-panel")).toBeDefined();
    });
  });
});
