// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_STAGE_BRAND, COLLAB_ROLE_LANES, CURSOR_TARGET_HZ, DEFAULT_BRANCH_VARIANTS,
  DEFAULT_SIMULATION_EPOCH_MS, DEFAULT_SPATIAL_PINS, KILN_EXPORT_BRAND,
  LOOM_OFFLINE_COLLAB_SCHEMA_VERSION, LOOM_SYNC_BRAND, MAX_VOICE_PIN_SECONDS,
  OFFLINE_CAPABILITY_BOUNDARY, OFFLINE_STACK_LAYERS, STROKE_DELTA_FRAME_BYTES,
  StudioLoomOfflineCollabPanel, TILE_SIZE_PX, TOON_CORE_BRAND,
  addSpatialPin, adoptEpisodeBranch, compareHlcTimestamp, evaluateLiveCursorTelemetry,
  evaluateRealtimeTeamCollabSession, exportLoomOfflineCollabJson, formatOklch,
  generateE2eeForensicReviewLink, getDefaultCollabRoleLanes, getDefaultSpatialPins,
  getDefaultTimeMachineSnapshots, getEpisodeBranchVariant, getOfflineCapabilityBoundary,
  isVioletHueDeg, normalizeOfflineSimulationInput, requestLayerLockHandoff,
  rollbackToTimeMachineSnapshot, runOfflineOutageSimulation, sanitizeNonVioletOklch,
  toggleSpatialPinStatus, verifyForensicReviewLink,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("1. 비행기 모드 6단계 무결성 시뮬레이션 & WAL 크래시 0-손실 복구", () => {
  it("기본 오프라인 시뮬레이션(100 스트로크·18 레이어·6 3D 배치)이 6단계 모두 PASS이고 손실 0바이트를 증명한다", () => {
    const report = runOfflineOutageSimulation();
    expect(report.schemaVersion).toBe(LOOM_OFFLINE_COLLAB_SCHEMA_VERSION);
    expect(report.brand).toBe(LOOM_SYNC_BRAND);
    expect(report.totalLocalOperations).toBe(124);
    expect(report.walFramesCommitted).toBe(124);
    expect(report.walFramesRecovered).toBe(124);
    expect(report.lostBytes).toBe(0);
    expect(report.lostOperations).toBe(0);
    expect(report.zeroByteLossVerified).toBe(true);
    expect(report.stages).toHaveLength(6);
    expect(report.stages.every((stage) => stage.status === "pass")).toBe(true);
  });

  it("갑작스런 탭 크래시 시뮬레이션에서도 SQLite WASM WAL + OPFS CAS 체크섬으로 100% 무손실 복구된다", () => {
    const report = runOfflineOutageSimulation({ offlineStrokeCount: 250, layerEditCount: 30, stage3dPlacementCount: 12, simulateTabCrash: true });
    expect(report.totalLocalOperations).toBe(292);
    expect(report.walFramesRecovered).toBe(292);
    expect(report.lostBytes).toBe(0);
    expect(report.stages[3]?.titleKo).toContain("크래시");
  });

  it("재연결 시 전체 캔버스가 아닌 변경된 256×256 타일만 RLE-Delta 압축 업로드해 대역폭을 대폭 절감한다", () => {
    const report = runOfflineOutageSimulation({ canvasWidthPx: 2048, canvasHeightPx: 4096, offlineStrokeCount: 100 });
    expect(TILE_SIZE_PX).toBe(256);
    expect(report.tilesX).toBe(8);
    expect(report.tilesY).toBe(16);
    expect(report.totalCanvasTiles).toBe(128);
    expect(report.dirtyTileCount).toBeGreaterThan(0);
    expect(report.dirtyTileCount).toBeLessThan(report.totalCanvasTiles);
    expect(report.rleDeltaUploadBytes).toBeLessThan(report.dirtyTilesRawBytes);
    expect(report.rleDeltaUploadBytes).toBeLessThan(report.fullCanvasRawBytes);
    expect(report.bandwidthSavedPercent).toBeGreaterThan(90);
  });

  it("온라인 재연결 HLC CRDT 델타 재생이 원격 동시 연산과 교환법칙으로 100% 결정적 수렴한다", () => {
    const report = runOfflineOutageSimulation({ offlineStrokeCount: 100, simulateRemoteConcurrentOps: 45 });
    expect(report.remoteConcurrentOperations).toBe(45);
    expect(report.localMergedHash).toBe(report.remoteMergedHash);
    expect(report.convergenceRatePercent).toBe(100);
    expect(report.unresolvedConflictCount).toBe(0);
  });

  it("compareHlcTimestamp가 물리시각 → 논리카운터 → 노드ID 전순서를 일관되게 정렬한다", () => {
    const a = { physicalMs: 1000, logical: 0, nodeId: "a" };
    const b = { physicalMs: 1000, logical: 1, nodeId: "a" };
    const c = { physicalMs: 1000, logical: 1, nodeId: "b" };
    const d = { physicalMs: 1005, logical: 0, nodeId: "a" };
    expect(compareHlcTimestamp(a, b)).toBeLessThan(0);
    expect(compareHlcTimestamp(b, c)).toBeLessThan(0);
    expect(compareHlcTimestamp(c, d)).toBeLessThan(0);
    expect(compareHlcTimestamp(c, c)).toBe(0);
  });

  it("Multi-Tab Leader Lock이 다중 탭 환경에서 단일 리더만 쓰기 허용하고 대기 탭을 펜싱한다", () => {
    const report = runOfflineOutageSimulation({ peerTabCount: 5 });
    expect(report.leaderTabId).toBe("tab-leader-01");
    expect(report.standbyTabsFenced).toBe(4);
    expect(report.stages[1]?.metricLabel).toContain("대기 4탭");
  });

  it("SW 미설치 최초 방문(swInstalledBeforeOutage: false)에서는 1단계를 정직하게 WARN으로 표시한다", () => {
    const report = runOfflineOutageSimulation({ swInstalledBeforeOutage: false });
    expect(report.coldInstallBlocked).toBe(true);
    expect(report.stages[0]?.status).toBe("warn");
    expect(report.stages[0]?.summaryKo).toContain("최초 1회");
  });

  it("실제 ToonStudio 7계층 오프라인 스택 정합성과 비정상 입력 클램프(원본 불변)를 보장한다", () => {
    expect(OFFLINE_STACK_LAYERS.map((l) => l.id)).toEqual([
      "sw-precache-shell", "coop-coep-isolation", "portable-emergency-canvas",
      "sqlite-wasm-wal", "opfs-cas-tiles", "multitab-leader-lock", "hlc-crdt-delta-replay",
    ]);
    expect(OFFLINE_STACK_LAYERS.some((l) => l.artifactRef.includes("/offline-draw/portable.html"))).toBe(true);
    const frozen = Object.freeze({
      offlineStrokeCount: Number.NaN, layerEditCount: -10, stage3dPlacementCount: 999,
      canvasWidthPx: 100, canvasHeightPx: Number.POSITIVE_INFINITY, peerTabCount: 99,
    });
    const norm = normalizeOfflineSimulationInput(frozen);
    expect(norm.clamped).toBe(true);
    expect(norm.offlineStrokeCount).toBe(100);
    expect(norm.layerEditCount).toBe(0);
    expect(norm.stage3dPlacementCount).toBe(64);
    expect(norm.canvasWidthPx).toBe(512);
    expect(norm.peerTabCount).toBe(8);
    expect(Number.isNaN(frozen.offlineStrokeCount)).toBe(true);
  });
});

describe("2. 정직한 오프라인 가능/불가 경계 검증", () => {
  it("OFFLINE_CAPABILITY_BOUNDARY가 오프라인 100% 가능 항목과 네트워크 필요 항목을 명확히 구분한다", () => {
    const offlineOnly = OFFLINE_CAPABILITY_BOUNDARY.filter((i) => i.tier === "offline-100-percent");
    const networkNeeded = OFFLINE_CAPABILITY_BOUNDARY.filter((i) => i.tier === "network-required");
    expect(offlineOnly.length).toBeGreaterThanOrEqual(5);
    expect(networkNeeded.length).toBeGreaterThanOrEqual(4);
  });

  it("오프라인 가능 목록에 드로잉·3D/CAD·OPFS 저장·온디바이스 NPU·비상 캔버스가 모두 포함된다", () => {
    const ids = OFFLINE_CAPABILITY_BOUNDARY.filter((i) => i.tier === "offline-100-percent").map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([
      "offline-drawing-layers", "offline-3d-cad-stage", "offline-opfs-wal-save",
      "offline-ondevice-npu-export", "offline-portable-emergency",
    ]));
  });

  it("네트워크 필요 목록에 최초 SW 설치 방문·클라우드 LLM·원격 팀 동기화·외부 결제가 정직하게 명시된다", () => {
    const ids = OFFLINE_CAPABILITY_BOUNDARY.filter((i) => i.tier === "network-required").map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([
      "net-initial-sw-install", "net-cloud-llm", "net-remote-team-sync", "net-external-payment",
    ]));
  });

  it("getOfflineCapabilityBoundary 및 getDefaultCollabRoleLanes는 방어적 사본을 반환한다", () => {
    const beforeBoundary = JSON.stringify(getOfflineCapabilityBoundary());
    const bCopy = getOfflineCapabilityBoundary();
    Reflect.set(bCopy[0] as object, "titleKo", "변조");
    expect(JSON.stringify(getOfflineCapabilityBoundary())).toBe(beforeBoundary);

    const beforeLanes = JSON.stringify(getDefaultCollabRoleLanes());
    const lCopy = getDefaultCollabRoleLanes();
    Reflect.set(lCopy[0] as object, "memberNameKo", "변조");
    expect(JSON.stringify(getDefaultCollabRoleLanes())).toBe(beforeLanes);
  });
});

describe("3. 4역할 레이어·컷 소프트 락 분업 레인 & 덮어쓰기 0건", () => {
  it("선화·밑색·3D 배경·식자 4역할 레인이 정본 ID와 비바이올렛 OKLCH로 등록된다", () => {
    expect(COLLAB_ROLE_LANES.map((l) => l.roleId)).toEqual(["lineart", "flat-color", "bg-3d", "lettering-sfx"]);
    for (const lane of COLLAB_ROLE_LANES) {
      expect(isVioletHueDeg(lane.accentOklch.h)).toBe(false);
      expect(lane.lockStatus).toBe("locked-active");
    }
  });

  it("타 역할이 잠긴 레이어 편집·핸드오프를 요청하면 덮어쓰기를 차단하고 handoff-requested로 전환한다", () => {
    const lanes = getDefaultCollabRoleLanes();
    const res = requestLayerLockHandoff(lanes, "layer-lineart-01", "flat-color", "request");
    expect(res.overwritePrevented).toBe(true);
    const updated = res.lanes.find((l) => l.layerId === "layer-lineart-01");
    expect(updated?.lockStatus).toBe("handoff-requested");
    expect(updated?.ownerRoleId).toBe("lineart");
    expect(updated?.pendingRequesterRoleId).toBe("flat-color");
  });

  it("락 핸드오프 승인 시 레이어 소유권이 요청자에게 안전하게 이양된다", () => {
    const req = requestLayerLockHandoff(getDefaultCollabRoleLanes(), "layer-bg3d-03", "lineart", "request");
    const approved = requestLayerLockHandoff(req.lanes, "layer-bg3d-03", "lineart", "approve");
    const updated = approved.lanes.find((l) => l.layerId === "layer-bg3d-03");
    expect(updated?.ownerRoleId).toBe("lineart");
    expect(updated?.lockStatus).toBe("locked-active");
    expect(updated?.pendingRequesterRoleId).toBeNull();
  });

  it("락 핸드오프 반려 시 기존 소유자의 소프트 락이 유지된다", () => {
    const req = requestLayerLockHandoff(getDefaultCollabRoleLanes(), "layer-sfx-04", "flat-color", "request");
    const rejected = requestLayerLockHandoff(req.lanes, "layer-sfx-04", "flat-color", "reject");
    const updated = rejected.lanes.find((l) => l.layerId === "layer-sfx-04");
    expect(updated?.ownerRoleId).toBe("lettering-sfx");
    expect(updated?.lockStatus).toBe("locked-active");
    expect(updated?.pendingRequesterRoleId).toBeNull();
  });

  it("이미 소유한 역할의 중복 요청은 덮어쓰기 경고를 울리지 않고 상태를 유지한다", () => {
    const res = requestLayerLockHandoff(getDefaultCollabRoleLanes(), "layer-lineart-01", "lineart", "request");
    expect(res.overwritePrevented).toBe(false);
    expect(res.lanes[0]?.lockStatus).toBe("locked-active");
  });

  it.each(["__proto__", "constructor", "missing-layer"])("미등록 레이어 키 %s 또는 잘못된 역할을 RangeError로 차단한다", (badKey) => {
    expect(() => requestLayerLockHandoff(getDefaultCollabRoleLanes(), badKey, "lineart", "request")).toThrow(RangeError);
    expect(() => Reflect.apply(requestLayerLockHandoff, null, [getDefaultCollabRoleLanes(), "layer-lineart-01", badKey, "request"])).toThrow(RangeError);
  });
});

describe("4. 캔버스 공간 핀 · 10초 음성 메모 · 빨간펜 해결 토글", () => {
  it("기본 공간 핀들이 정규화 좌표(0..1)와 10초 이하 음성 메모 규칙을 준수한다", () => {
    expect(DEFAULT_SPATIAL_PINS).toHaveLength(3);
    for (const pin of DEFAULT_SPATIAL_PINS) {
      expect(pin.xNorm).toBeGreaterThan(0);
      expect(pin.xNorm).toBeLessThan(1);
      expect(pin.yNorm).toBeGreaterThan(0);
      expect(pin.yNorm).toBeLessThan(1);
      expect(pin.voiceMemoDurationSec).toBeLessThanOrEqual(MAX_VOICE_PIN_SECONDS);
      expect(pin.redlinePoints.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("toggleSpatialPinStatus가 open → resolved → open 상태 전환을 순수하게 수행한다", () => {
    const initial = getDefaultSpatialPins();
    const resolved = toggleSpatialPinStatus(initial, "pin-ep12-01");
    expect(resolved.find((p) => p.id === "pin-ep12-01")?.status).toBe("resolved");
    expect(initial.find((p) => p.id === "pin-ep12-01")?.status).toBe("open");
    const reopened = toggleSpatialPinStatus(resolved, "pin-ep12-01");
    expect(reopened.find((p) => p.id === "pin-ep12-01")?.status).toBe("open");
  });

  it("수정 완료 시 빨간펜 일괄 숨김(hideResolvedRedlines)이 해결된 핀만 오버레이에서 제외한다", () => {
    const hiddenReport = evaluateRealtimeTeamCollabSession({ hideResolvedRedlines: true });
    const shownReport = evaluateRealtimeTeamCollabSession({ hideResolvedRedlines: false });
    expect(hiddenReport.openPinCount).toBe(2);
    expect(hiddenReport.resolvedPinCount).toBe(1);
    expect(hiddenReport.visibleRedlinePinCount).toBe(2);
    expect(shownReport.visibleRedlinePinCount).toBe(3);
  });

  it("addSpatialPin이 초과 좌표와 10초 초과 음성 길이를 안전하게 클램프한다", () => {
    const next = addSpatialPin(getDefaultSpatialPins(), {
      cutId: "C-03", xNorm: 1.8, yNorm: -0.5, authorRoleId: "lineart", assigneeRoleId: "bg-3d",
      noteKo: "원근 보정", noteEn: "Fix perspective", voiceMemoDurationSec: 42,
    });
    expect(next).toHaveLength(4);
    const added = next[3];
    expect(added?.xNorm).toBe(0.94);
    expect(added?.yNorm).toBe(0.08);
    expect(added?.voiceMemoDurationSec).toBe(MAX_VOICE_PIN_SECONDS);
    expect(added?.status).toBe("open");
  });

  it("미등록 공간 핀 ID 토글 시 RangeError를 발생시킨다", () => {
    expect(() => toggleSpatialPinStatus(getDefaultSpatialPins(), "unknown-pin")).toThrow(RangeError);
  });
});

describe("5. 120Hz 16B 라이브 커서 · Follow Mode · A/B 브랜치 디프 & 타임머신 롤백", () => {
  it("120Hz 16B 스트로크 델타 프레임 패킹의 대역폭과 종단 지연 예산을 정확히 계산한다", () => {
    const telemetry = evaluateLiveCursorTelemetry(getDefaultCollabRoleLanes(), null);
    expect(telemetry.frameBytes).toBe(STROKE_DELTA_FRAME_BYTES);
    expect(telemetry.targetHz).toBe(CURSOR_TARGET_HZ);
    expect(telemetry.perMemberBytesPerSec).toBe(1920);
    expect(telemetry.teamTotalBytesPerSec).toBe(7680);
    expect(telemetry.teamTotalKbps).toBeCloseTo(61.4, 1);
    expect(telemetry.latencyBudgetMs.totalMs).toBeLessThan(20);
    expect(telemetry.spotlightActive).toBe(false);
  });

  it("따라보기(Follow Mode / Spotlight)가 대상 작가의 커서 좌표로 카메라 뷰포트를 고정한다", () => {
    const lanes = getDefaultCollabRoleLanes();
    const bg3d = lanes.find((l) => l.roleId === "bg-3d");
    const telemetry = evaluateLiveCursorTelemetry(lanes, "bg-3d");
    expect(telemetry.spotlightActive).toBe(true);
    expect(telemetry.followTargetRoleId).toBe("bg-3d");
    expect(telemetry.viewportFocusXNorm).toBe(bg3d?.cursorXNorm);
    expect(telemetry.viewportFocusYNorm).toBe(bg3d?.cursorYNorm);
    expect(telemetry.viewportZoomPercent).toBe(165);
  });

  it("에피소드 A/B안 비주얼 디프 브랜치들이 비바이올렛 OKLCH 틴트와 KilnExport 준비 상태를 가진다", () => {
    expect(DEFAULT_BRANCH_VARIANTS).toHaveLength(3);
    for (const branch of DEFAULT_BRANCH_VARIANTS) {
      expect(isVioletHueDeg(branch.previewTintOklch.h)).toBe(false);
      expect(isVioletHueDeg(branch.rimAccentOklch.h)).toBe(false);
      expect(branch.kilnExportReady).toBe(true);
    }
    expect(getEpisodeBranchVariant("branch-b-moonlit-noir").contrastRatio).toBeGreaterThan(10);
  });

  it("1-클릭 브랜치 채택 시 불변 타임머신 스냅샷이 누적된다", () => {
    const initial = getDefaultTimeMachineSnapshots();
    const adopted = adoptEpisodeBranch(initial, "branch-b-moonlit-noir");
    expect(adopted.adoptedBranch.id).toBe("branch-b-moonlit-noir");
    expect(adopted.snapshots).toHaveLength(initial.length + 1);
    expect(adopted.snapshots[adopted.snapshots.length - 1]?.branchId).toBe("branch-b-moonlit-noir");
  });

  it("타임머신 롤백이 지정 스냅샷의 브랜치 상태를 비파괴 복원한다", () => {
    const snaps = getDefaultTimeMachineSnapshots();
    const restored = rollbackToTimeMachineSnapshot(snaps, "snap-01-base");
    expect(restored.restoredBranch.id).toBe("main-cut-baseline");
    expect(restored.restoredSnapshot.id).toBe("snap-01-base");
  });

  it("미등록 브랜치 ID나 스냅샷 ID는 RangeError로 차단한다", () => {
    expect(() => Reflect.apply(getEpisodeBranchVariant, null, ["__proto__"])).toThrow(RangeError);
    expect(() => rollbackToTimeMachineSnapshot(getDefaultTimeMachineSnapshots(), "missing-snap")).toThrow(RangeError);
  });
});

describe("6. E2EE(WebCrypto AES-GCM-256) 키 핑거프린트 & 포렌식 워터마크 만료 링크", () => {
  it("서버가 평문을 열람할 수 없는 AES-GCM-256 E2EE 링크와 키 핑거프린트를 생성한다", () => {
    const link = generateE2eeForensicReviewLink({ episodeId: "EP-012-ROOFTOP", viewerHandle: "pd-han@review.local", expiresInHours: 24 });
    expect(link.cipherSuite).toBe("AES-GCM-256");
    expect(link.ivBytes).toBe(12);
    expect(link.authTagBits).toBe(128);
    expect(link.serverCanReadPlaintext).toBe(false);
    expect(link.keyFingerprint).toMatch(/^E2EE:[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/u);
    expect(link.reviewUrl).toContain("#key=");
  });

  it("외부 검수 링크 포렌식 워터마크에 열람자 식별자와 만료 UTC 시각이 자동 삽입된다", () => {
    const link = generateE2eeForensicReviewLink({ viewerHandle: "editor-seo@review.local", expiresInHours: 12, nowEpochMs: DEFAULT_SIMULATION_EPOCH_MS });
    expect(link.watermarkText).toContain("editor-seo@review.local");
    expect(link.watermarkText).toContain("2026-11-27 00:00 UTC");
    expect(link.watermarkText).toContain("WM-");
  });

  it("verifyForensicReviewLink가 만료 전에는 유효, 만료 후에는 자동 파기를 판정한다", () => {
    const link = generateE2eeForensicReviewLink({ expiresInHours: 12, nowEpochMs: DEFAULT_SIMULATION_EPOCH_MS });
    const activeCheck = verifyForensicReviewLink(link, DEFAULT_SIMULATION_EPOCH_MS + 3600 * 1000);
    const expiredCheck = verifyForensicReviewLink(link, DEFAULT_SIMULATION_EPOCH_MS + 13 * 3600 * 1000);
    expect(activeCheck.valid).toBe(true);
    expect(activeCheck.isExpired).toBe(false);
    expect(expiredCheck.valid).toBe(false);
    expect(expiredCheck.isExpired).toBe(true);
  });

  it("포렌식 워터마크 텍스트 변조 시 무결성 다이제스트 검증이 즉시 차단한다", () => {
    const link = generateE2eeForensicReviewLink({ nowEpochMs: DEFAULT_SIMULATION_EPOCH_MS });
    const tampered = { ...link, watermarkText: `${link.watermarkText} TAMPERED` };
    const verdict = verifyForensicReviewLink(tampered, DEFAULT_SIMULATION_EPOCH_MS + 1000);
    expect(verdict.valid).toBe(false);
    expect(verdict.watermarkDigestValid).toBe(false);
  });

  it("만료 시간 범위를 1~168시간으로 클램프하고 빈 식별자를 안전 기본값으로 보정한다", () => {
    const low = generateE2eeForensicReviewLink({ viewerHandle: "   ", expiresInHours: -5 });
    const high = generateE2eeForensicReviewLink({ expiresInHours: 999 });
    expect(low.viewerHandle).toBe("pd-kim@studio-review.local");
    expect(low.expiresInHours).toBe(1);
    expect(high.expiresInHours).toBe(168);
  });
});

describe("7. JSON 내보내기 & StudioLoomOfflineCollabPanel UI 인터랙션", () => {
  it("exportLoomOfflineCollabJson이 4대 고유 브랜드와 모든 검증 모듈을 포함한 유효 JSON을 반환한다", () => {
    const bundle = exportLoomOfflineCollabJson();
    const parsed = JSON.parse(bundle.json) as typeof bundle.payload;
    expect(parsed.schemaVersion).toBe(LOOM_OFFLINE_COLLAB_SCHEMA_VERSION);
    expect(parsed.brands).toEqual([LOOM_SYNC_BRAND, ATELIER_STAGE_BRAND, TOON_CORE_BRAND, KILN_EXPORT_BRAND]);
    expect(parsed.offlineSimulation.lostBytes).toBe(0);
    expect(parsed.realtimeCollab.zeroOverwriteGuaranteed).toBe(true);
  });

  it("props 없이 기본 한국어 렌더링 및 locale='en' 영문 렌더링이 모두 정상 동작한다", () => {
    const { rerender } = render(<StudioLoomOfflineCollabPanel />);
    expect(screen.getByTestId("studio-loom-offline-collab-panel")).toBeTruthy();
    expect(screen.getByTestId("network-state-pill").textContent).toContain("온라인");
    expect(screen.getByTestId("offline-boundary-available")).toBeTruthy();
    expect(screen.getByTestId("offline-boundary-network-required")).toBeTruthy();

    rerender(<StudioLoomOfflineCollabPanel locale="en" />);
    expect(screen.getByTestId("network-state-pill").textContent).toContain("Online");
  });

  it("원클릭 비행기 모드 차단 → 오프라인 스트로크 추가 → 강제 크래시 WAL 복구 → 온라인 RLE-Delta 병합 흐름이 동작한다", () => {
    const onOfflineChange = vi.fn();
    render(<StudioLoomOfflineCollabPanel onOfflineStateChange={onOfflineChange} />);

    fireEvent.click(screen.getByTestId("toggle-airplane-mode-btn"));
    expect(screen.getByTestId("loom-collab-canvas-svg").getAttribute("data-offline-mode")).toBe("true");
    expect(onOfflineChange).toHaveBeenCalledWith(true, expect.objectContaining({ lostBytes: 0 }));

    fireEvent.click(screen.getByTestId("add-offline-strokes-btn"));
    expect(screen.getByTestId("add-offline-strokes-btn").textContent).toContain("125회");

    fireEvent.click(screen.getByTestId("trigger-crash-recovery-btn"));
    expect(screen.getByTestId("loom-collab-canvas-svg").getAttribute("data-merge-phase")).toBe("wal-recovered");
    expect(screen.getByTestId("kpi-lost-bytes").textContent).toBe("0 B");

    fireEvent.click(screen.getByTestId("reconnect-delta-merge-btn"));
    expect(screen.getByTestId("loom-collab-canvas-svg").getAttribute("data-offline-mode")).toBe("false");
    expect(screen.getByTestId("loom-collab-canvas-svg").getAttribute("data-merge-phase")).toBe("merged");
  });

  it("4인 분업 레인에서 따라보기(Follow Mode)와 소프트 락 핸드오프 요청/승인이 SVG와 상태 배지에 반영된다", () => {
    render(<StudioLoomOfflineCollabPanel />);
    expect(screen.queryByTestId("svg-spotlight-frame")).toBeNull();

    fireEvent.click(screen.getByTestId("follow-role-bg-3d"));
    expect(screen.getByTestId("loom-collab-canvas-svg").getAttribute("data-follow-role")).toBe("bg-3d");
    expect(screen.getByTestId("svg-spotlight-frame")).toBeTruthy();

    fireEvent.click(screen.getByTestId("handoff-request-layer-lineart-01"));
    expect(screen.getByTestId("overwrite-guard-badge").textContent).toContain("1회");
    expect(screen.getByTestId("handoff-approve-layer-lineart-01")).toBeTruthy();

    fireEvent.click(screen.getByTestId("handoff-approve-layer-lineart-01"));
    expect(screen.getByTestId("handoff-status-notice").textContent).toContain("flat-color");
  });

  it("공간 핀 해결 토글과 완료 빨간펜 숨김 토글이 SVG 빨간펜 오버레이를 즉시 갱신한다", () => {
    render(<StudioLoomOfflineCollabPanel />);
    expect(screen.getByTestId("svg-redline-pin-ep12-01")).toBeTruthy();
    expect(screen.queryByTestId("svg-redline-pin-ep12-03")).toBeNull();

    fireEvent.click(screen.getByTestId("toggle-pin-pin-ep12-01"));
    expect(screen.queryByTestId("svg-redline-pin-ep12-01")).toBeNull();

    fireEvent.click(screen.getByTestId("toggle-hide-resolved-redlines"));
    expect(screen.getByTestId("svg-redline-pin-ep12-01")).toBeTruthy();
    expect(screen.getByTestId("svg-redline-pin-ep12-03")).toBeTruthy();

    fireEvent.click(screen.getByTestId("add-spatial-pin-btn"));
    expect(screen.getByTestId("pin-card-pin-ep12-04")).toBeTruthy();
  });

  it("A/B안 비주얼 디프 전환, 1-클릭 채택, 타임머신 롤백이 즉시 반영된다", () => {
    render(<StudioLoomOfflineCollabPanel />);
    fireEvent.click(screen.getByTestId("branch-btn-branch-b-moonlit-noir"));
    expect(screen.getByTestId("loom-collab-canvas-svg").getAttribute("data-branch-id")).toBe("branch-b-moonlit-noir");

    fireEvent.click(screen.getByTestId("adopt-branch-btn"));
    expect(screen.getByTestId("adopted-branch-badge").textContent).toContain("B안");

    fireEvent.click(screen.getByTestId("rollback-snap-01-base"));
    expect(screen.getByTestId("adopted-branch-badge").textContent).toContain("기준 원고");
  });

  it("E2EE 열람자 식별자·만료 시간·워터마크 밀도 변경 및 JSON 미리보기 토글이 동작한다", () => {
    render(<StudioLoomOfflineCollabPanel />);
    fireEvent.change(screen.getByTestId("e2ee-viewer-input"), { target: { value: "pd-lee@studio-review.local" } });
    fireEvent.click(screen.getByTestId("expiry-hours-72"));
    fireEvent.click(screen.getByTestId("wm-density-strict"));

    expect(screen.getByTestId("forensic-watermark-preview").textContent).toContain("pd-lee@studio-review.local");
    expect(screen.getByTestId("forensic-watermark-preview").textContent).toContain("2026-11-29 12:00 UTC");

    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.getByTestId("loom-collab-json-preview").textContent).toContain(LOOM_OFFLINE_COLLAB_SCHEMA_VERSION);
  });

  it("클립보드 복사 실패 알림 → 재시도 성공 및 언마운트 중 콜백 차단을 안전하게 처리한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioLoomOfflineCollabPanel />);

    fireEvent.click(screen.getByTestId("export-loom-collab-json-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    fireEvent.click(screen.getByTestId("export-loom-collab-json-btn"));
    await waitFor(() => expect(screen.getByTestId("export-loom-collab-json-btn").textContent).toContain("JSON 복사됨"));

    cleanup();
    let resolveCopy: (() => void) | undefined;
    const pendingWrite = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    const onExportJson = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText: pendingWrite } });
    const view = render(<StudioLoomOfflineCollabPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("export-loom-collab-json-btn"));
    view.unmount();
    await act(async () => { resolveCopy?.(); });
    expect(onExportJson).not.toHaveBeenCalled();
  });
});

describe("8. 정적 디자인 계약 · 파일 크기 상한 · 바이올렛 0% · 고유 브랜드 청정 검증", () => {
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const engineSrc = readFileSync(path.join(dir, "loom-offline-collab-engine.ts"), "utf8");
  const panelSrc = readFileSync(path.join(dir, "StudioLoomOfflineCollabPanel.tsx"), "utf8");
  const indexSrc = readFileSync(path.join(dir, "index.ts"), "utf8");
  const testSrc = readFileSync(path.join(dir, "loom-offline-collab.test.tsx"), "utf8");

  it("4개 소유 파일이 줄 수 상한을 모두 준수한다(엔진<=740, 패널<=680, 배럴<=80, 테스트<=740)", () => {
    expect(engineSrc.split("\n").length).toBeLessThanOrEqual(740);
    expect(panelSrc.split("\n").length).toBeLessThanOrEqual(680);
    expect(indexSrc.split("\n").length).toBeLessThanOrEqual(80);
    expect(testSrc.split("\n").length).toBeLessThanOrEqual(740);
  });

  it("원시 hex/rgb/hsl 색상 0건 및 바이올렛(265~325°) 0% 계약을 위반하지 않는다", () => {
    for (const src of [engineSrc, panelSrc, indexSrc]) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/u);
    }
    const safeLow = sanitizeNonVioletOklch({ l: 0.52, c: 0.14, h: 270 });
    const safeHigh = sanitizeNonVioletOklch({ l: 0.52, c: 0.14, h: 315 });
    expect(isVioletHueDeg(safeLow.h)).toBe(false);
    expect(isVioletHueDeg(safeHigh.h)).toBe(false);
    expect(formatOklch(safeLow)).toMatch(/^oklch\(/u);

    const oklchMatches = [...`${engineSrc}\n${panelSrc}`.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)];
    for (const match of oklchMatches) {
      expect(isVioletHueDeg(Number(match[1]))).toBe(false);
    }
  });

  it("금지 패턴(transition-all·Sparkles·Web Storage·기본 빈 객체 props·원시 Tailwind 색)이 0건이고 접근성 토큰을 사용한다", () => {
    for (const src of [engineSrc, panelSrc, indexSrc]) {
      expect(src).not.toMatch(/\btransition-all\b/u);
      expect(src).not.toMatch(/\b(?:localStorage|sessionStorage)\b/u);
      expect(src).not.toMatch(/Sparkles/u);
      expect(src).not.toMatch(/\b0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b(?:bg|text|border)-(?:red|blue|green|purple|violet|indigo|slate|gray|zinc|amber|emerald)-\d{2,3}\b/u);
    }
    expect(panelSrc).not.toMatch(/function\s+StudioLoomOfflineCollabPanel\s*\([^)]*=\s*\{\s*\}/u);
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("4개 소유 파일 전체가 100% ToonStudio 고유 브랜드(LoomSync·AtelierStage·ToonCore·KilnExport)만 사용하고 외부 브랜드명 0건이다", () => {
    const allSources = `${engineSrc}\n${panelSrc}\n${indexSrc}\n${testSrc}`.toLowerCase();
    expect(engineSrc).toContain("LoomSync");
    expect(engineSrc).toContain("AtelierStage");
    expect(engineSrc).toContain("ToonCore");
    expect(engineSrc).toContain("KilnExport");

    const forbiddenExternalBrands = [
      ["vel", "lo"], ["hoku", "sai"], ["sk", "ia"], ["thor", "vg"],
      ["pro", "create"], ["photo", "shop"], ["mag", "ma"], ["reb", "elle"],
      ["blen", "der"], ["shapr", "3d"], ["clip", "studio"], ["fig", "ma"],
      ["mi", "ro"], ["not", "ion"], ["dis", "cord"], ["sl", "ack"],
    ].map(([a, b]) => `${a}${b}`);

    for (const token of forbiddenExternalBrands) {
      expect(allSources).not.toContain(token);
    }
  });
});
