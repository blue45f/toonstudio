import { describe, expect, it } from "vitest";

import {
  evaluateArtJamStrokeMilestone,
  normalizeHuddleVideoOverlayConfig,
  projectCollaboratorPointerBadge,
  STUDIO_ARTJAM_STROKE_MILESTONES,
  STUDIO_ARTJAM_TEMPLATES,
  STUDIO_MAGMA_POINTER_DISPLAY_MODES,
  StudioLayerTakeoverCoordinator,
  StudioPersonalLayerVisibilityStore,
} from "./studio-magma-collaboration";

describe("studio-magma-collaboration (Magma 멀티플레이어 포인터·로컬 레이어 가시성·소유권·ArtJam)", () => {
  it("5종 포인터 프레즌스 표시 모드(pointer-name/pointer/none/pointer-avatar-name/pointer-avatar)를 정확히 투영한다", () => {
    expect(STUDIO_MAGMA_POINTER_DISPLAY_MODES).toHaveLength(5);

    const peer = {
      userId: "u-1",
      displayName: "김웹툰 어시스턴트 작가",
      colorHex: "#6366f1",
      x: 320,
      y: 480,
    };

    const fullBadge = projectCollaboratorPointerBadge(peer, "pointer-avatar-name");
    expect(fullBadge.visible).toBe(true);
    expect(fullBadge.showCursorIcon).toBe(true);
    expect(fullBadge.showAvatarBadge).toBe(true);
    expect(fullBadge.showNameLabel).toBe(true);
    expect(fullBadge.avatarInitials).toBe("김어");

    const pointerOnly = projectCollaboratorPointerBadge(peer, "pointer");
    expect(pointerOnly.visible).toBe(true);
    expect(pointerOnly.showCursorIcon).toBe(true);
    expect(pointerOnly.showAvatarBadge).toBe(false);
    expect(pointerOnly.showNameLabel).toBe(false);

    const hidden = projectCollaboratorPointerBadge(peer, "none");
    expect(hidden.visible).toBe(false);
    expect(hidden.showCursorIcon).toBe(false);
  });

  it("개인별 로컬 레이어 가시성(visibleLocally)이 전역 가시성(visibleGlobally)을 오염시키지 않고 독립 토글된다", () => {
    const store = new StudioPersonalLayerVisibilityStore();
    const sharedSketchLayer = { layerId: "layer-sketch", visibleGlobally: true };

    // 초기 상태: 전역 true 그대로
    expect(store.resolveVisibility(sharedSketchLayer).effectiveVisible).toBe(true);
    expect(store.resolveVisibility(sharedSketchLayer).isLocallyOverridden).toBe(false);

    // 내 화면에서만 로컬 숨김 토글
    const toggledOff = store.togglePersonalVisibility(sharedSketchLayer);
    expect(toggledOff.effectiveVisible).toBe(false);
    expect(toggledOff.visibleGlobally).toBe(true);
    expect(toggledOff.isLocallyOverridden).toBe(true);

    // 다시 토글하면 전역 상태와 일치하므로 오버라이드가 자동 정리됨
    const toggledBack = store.togglePersonalVisibility(sharedSketchLayer);
    expect(toggledBack.effectiveVisible).toBe(true);
    expect(toggledBack.isLocallyOverridden).toBe(false);
  });

  it("레이어 소유권 인수·대기 큐(pendingLayerOwns)·일괄 인수(takeOverAllAvailableLayers)·관리자 강제 회수를 처리한다", () => {
    const coordinator = new StudioLayerTakeoverCoordinator();
    coordinator.registerLayer("layer-ink", "user-a", true, 1000);
    coordinator.registerLayer("layer-bg", null, false, 1000);
    coordinator.registerLayer("layer-tone", "user-c", false, 1000);

    // 일반 에디터가 잠긴 레이어 요청 시 pending 큐에 등록
    const pendingRes = coordinator.requestLayerOwnership({
      layerId: "layer-ink",
      requesterUserId: "user-b",
      role: "editor",
      nowMs: 1100,
    });
    expect(pendingRes.status).toBe("queued-pending");
    expect(pendingRes.ownerUserId).toBe("user-a");
    expect(pendingRes.pendingRequesterIds).toEqual(["user-b"]);

    // user-a가 소유권을 해제하면 대기 큐 1순위 user-b에게 자동 승계
    const released = coordinator.releaseLayerOwnership("layer-ink", 1200);
    expect(released?.ownerUserId).toBe("user-b");
    expect(released?.pendingRequesterIds).toHaveLength(0);

    // 관리자가 강제 회수(force: true)
    const forced = coordinator.requestLayerOwnership({
      layerId: "layer-ink",
      requesterUserId: "admin-1",
      role: "moderator",
      force: true,
      nowMs: 1300,
    });
    expect(forced.status).toBe("force-taken-over");
    expect(forced.ownerUserId).toBe("admin-1");

    // 가용 레이어 일괄 인수
    const batchAcquired = coordinator.takeOverAllAvailableLayers("user-d", 1400);
    expect(batchAcquired).toContain("layer-bg");
    expect(batchAcquired).toContain("layer-tone");
  });

  it("Huddle 투명 비디오 오버레이 정규화 및 ArtJam 11단계 스트로크 마일스톤(150~204,800획)을 판별한다", () => {
    const hud = normalizeHuddleVideoOverlayConfig({
      enableVideoTransparency: true,
      overlayOpacity01: 0.65,
    });
    expect(hud.overlayOpacity01).toBeCloseTo(0.65, 3);

    expect(STUDIO_ARTJAM_STROKE_MILESTONES).toEqual([
      150, 300, 600, 1200, 3200, 6400, 12800, 25600, 51200, 102400, 204800,
    ]);

    const crossed = evaluateArtJamStrokeMilestone(1190, 1205);
    expect(crossed.newlyCrossedMilestone).toBe(1200);
    expect(crossed.reachedMilestone).toBe(1200);
    expect(crossed.nextMilestone).toBe(3200);
    expect(crossed.celebrationMessageKo).toContain("1,200획");

    expect(STUDIO_ARTJAM_TEMPLATES).toHaveLength(3);
  });
});
