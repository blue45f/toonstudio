import { describe, expect, it } from "vitest";

import {
  appendMultiboardCommand,
  createEpisodeMultiboardScene,
  createMultiboardCommandStream,
  detectConcurrentBoardHotspots,
  evaluateMultiboardViewportLod,
  fitCameraToBoards,
  projectSpatialMinimap,
  sampleTimelapseKeyframes,
  scrubMultiboardCommandStream,
  stepFollowPeerCamera,
  updateMultiboardTileCache,
  type MultiboardCameraState,
  type SpatialPeerPresence,
  type SpatialStickyPin,
} from "./studio-spatial-multiboard-viewport";

describe("studio-spatial-multiboard-viewport", () => {
  it("60컷 에피소드 공간 멀티보드에서 줌 단계별 LOD 프록시 타일 전환과 동시 live-full 상한을 유지한다", () => {
    const scene = createEpisodeMultiboardScene("ep-12", 60, {
      columns: 6,
      cutWidth: 800,
      cutHeight: 1280,
      includeReferenceSideboards: true,
    });
    expect(scene.boards).toHaveLength(62);

    // 1) 전체 조감(Bird's-eye): 모든 컷이 가시이지만 축소되어 proxy-256으로 가볍게 유지
    const overviewCam = fitCameraToBoards(scene.boards, 1440, 900);
    const overviewLod = evaluateMultiboardViewportLod(scene, overviewCam);
    expect(overviewLod.visibleCount).toBe(62);
    expect(overviewLod.proxy256Count).toBe(62);
    expect(overviewLod.liveFullCount).toBe(0);

    // 2) 중간 확대: 뷰포트 밖 보드는 culled, 보이는 보드는 proxy-512
    const midCam: MultiboardCameraState = {
      centerX: 1200,
      centerY: 1200,
      zoom: 0.3,
      viewportWidthPx: 1440,
      viewportHeightPx: 900,
    };
    const midLod = evaluateMultiboardViewportLod(scene, midCam);
    expect(midLod.culledCount).toBeGreaterThan(40);
    expect(midLod.proxy512Count).toBeGreaterThan(0);

    // 3) 근접 작업 확대: 중심 근접 보드 최대 2개만 live-full, 나머지는 proxy-512 강등
    const closeCam: MultiboardCameraState = {
      centerX: 900,
      centerY: 640,
      zoom: 0.75,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
    };
    const closeLod = evaluateMultiboardViewportLod(scene, closeCam, {
      maxSimultaneousLiveBoards: 2,
    });
    expect(closeLod.liveFullCount).toBeLessThanOrEqual(2);
    expect(closeLod.liveFullCount).toBeGreaterThanOrEqual(1);
    expect(closeLod.culledCount).toBeGreaterThan(50);
  });

  it("VRAM 예산 초과 시 비가시·오래된 보드부터 LRU 프록시 타일 캐시에서 축출한다", () => {
    const scene = createEpisodeMultiboardScene("ep-cache", 12, { columns: 4 });
    const camA: MultiboardCameraState = {
      centerX: 400,
      centerY: 640,
      zoom: 0.75,
      viewportWidthPx: 1200,
      viewportHeightPx: 900,
    };
    const camB: MultiboardCameraState = {
      centerX: 3000,
      centerY: 3200,
      zoom: 0.75,
      viewportWidthPx: 1200,
      viewportHeightPx: 900,
    };

    const lodA = evaluateMultiboardViewportLod(scene, camA, { maxSimultaneousLiveBoards: 1 });
    const lodB = evaluateMultiboardViewportLod(scene, camB, { maxSimultaneousLiveBoards: 1 });

    const step1 = updateMultiboardTileCache(
      { budgetBytes: 8 * 1024 * 1024, tick: 0, entries: {} },
      lodA,
    );
    expect(Object.keys(step1.nextCache.entries).length).toBeGreaterThan(0);

    const step2 = updateMultiboardTileCache(step1.nextCache, lodB);
    expect(step2.evictedBoardIds.length).toBeGreaterThan(0);
    expect(step2.usedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  });

  it("팀원 공간 미니맵 아바타 클러스터링, 미해결 스티키 핀 투영, 1클릭 Follow 추적·수동 해제를 처리한다", () => {
    const scene = createEpisodeMultiboardScene("ep-team", 6, { columns: 3 });
    const cam = fitCameraToBoards(scene.boards, 1280, 720);

    const peers: SpatialPeerPresence[] = [
      {
        userId: "u-ink",
        displayName: "선화 작가",
        badgeToken: "accent",
        worldX: 400,
        worldY: 500,
        cameraCenterX: 400,
        cameraCenterY: 600,
        cameraZoom: 0.85,
        activeBoardId: "cut-01",
        pointerMode: "pointer-avatar-name",
        isDrawing: true,
        lastActiveAtMs: 1000,
      },
      {
        userId: "u-color",
        displayName: "채색 작가",
        badgeToken: "cool",
        worldX: 420,
        worldY: 515,
        cameraCenterX: 420,
        cameraCenterY: 620,
        cameraZoom: 0.85,
        activeBoardId: "cut-01",
        pointerMode: "pointer-name",
        lastActiveAtMs: 1005,
      },
      {
        userId: "u-letter",
        displayName: "식자 담당",
        badgeToken: "good",
        worldX: 2200,
        worldY: 1800,
        cameraCenterX: 2200,
        cameraCenterY: 1800,
        cameraZoom: 1.0,
        activeBoardId: "cut-06",
        pointerMode: "pointer",
        lastActiveAtMs: 1010,
      },
      {
        userId: "u-hidden",
        displayName: "숨김 관찰자",
        badgeToken: "warn",
        worldX: 2200,
        worldY: 1800,
        cameraCenterX: 2200,
        cameraCenterY: 1800,
        cameraZoom: 1.0,
        pointerMode: "none",
        lastActiveAtMs: 1012,
      },
    ];

    const pins: SpatialStickyPin[] = [
      {
        id: "pin-1",
        boardId: "cut-01",
        worldX: 350,
        worldY: 400,
        authorUserId: "u-ink",
        text: "역광 림라이트 추가 필요",
        resolved: false,
        createdAtMs: 900,
      },
      {
        id: "pin-2",
        boardId: "cut-02",
        worldX: 1200,
        worldY: 400,
        authorUserId: "u-color",
        text: "완료된 메모",
        resolved: true,
        createdAtMs: 910,
      },
    ];

    const minimap = projectSpatialMinimap(scene, cam, peers, pins, 240, 160);
    expect(minimap.boards).toHaveLength(6);
    expect(minimap.unresolvedPinMarkers).toHaveLength(1);
    expect(minimap.unresolvedPinMarkers[0]!.pinId).toBe("pin-1");
    // 인접한 u-ink + u-color 2명은 1개 클러스터로 병합, 멀리 떨어진 u-letter는 별도 클러스터, u-hidden은 제외
    expect(minimap.peerClusters).toHaveLength(2);
    const bigCluster = minimap.peerClusters.find((c) => c.memberUserIds.length === 2);
    expect(bigCluster?.memberUserIds).toEqual(["u-ink", "u-color"]);

    // 1클릭 Follow 추적
    const step1 = stepFollowPeerCamera(
      cam,
      { followingUserId: "u-letter", smoothFactor01: 0.5 },
      peers,
      false,
    );
    expect(step1.detachedByManualInput).toBe(false);
    expect(step1.nextCamera.centerX).toBeGreaterThan(cam.centerX);
    expect(step1.nextCamera.zoom).toBeGreaterThan(cam.zoom);

    // 사용자가 수동 팬/줌하면 즉시 Follow 해제
    const manualDetach = stepFollowPeerCamera(
      step1.nextCamera,
      step1.nextFollow,
      peers,
      true,
    );
    expect(manualDetach.detachedByManualInput).toBe(true);
    expect(manualDetach.nextFollow.followingUserId).toBeNull();
  });

  it("커맨드 스트림 타임라인 스크러버가 체크포인트 복원·잠금 보호·타임랩스·충돌 핫스팟을 정확히 계산한다", () => {
    const initial = createEpisodeMultiboardScene("ep-stream", 2, { columns: 2, nowMs: 1000 });
    let stream = createMultiboardCommandStream(initial, 3);

    stream = appendMultiboardCommand(stream, {
      actorUserId: "u-a",
      timestampMs: 2000,
      action: { kind: "board-move", boardId: "cut-01", x: 120, y: 80 },
    });
    stream = appendMultiboardCommand(stream, {
      actorUserId: "u-b",
      timestampMs: 2500,
      action: { kind: "stroke-commit", boardId: "cut-01", strokeId: "s-1" },
    });
    stream = appendMultiboardCommand(stream, {
      actorUserId: "u-a",
      timestampMs: 3000,
      action: { kind: "board-lock", boardId: "cut-01", locked: true },
    }); // seq 3 -> 체크포인트 생성
    stream = appendMultiboardCommand(stream, {
      actorUserId: "u-b",
      timestampMs: 9000,
      action: { kind: "board-move", boardId: "cut-01", x: 999, y: 999 }, // 잠김 상태이므로 무시
    });
    stream = appendMultiboardCommand(stream, {
      actorUserId: "u-b",
      timestampMs: 9500,
      action: {
        kind: "pin-add",
        pin: {
          id: "pin-review",
          boardId: "cut-02",
          worldX: 1100,
          worldY: 300,
          authorUserId: "u-b",
          text: "대사 말풍선 위치 확인",
          resolved: false,
          createdAtMs: 9500,
        },
      },
    });
    stream = appendMultiboardCommand(stream, {
      actorUserId: "u-a",
      timestampMs: 10000,
      action: { kind: "pin-resolve", pinId: "pin-review", resolved: true },
    }); // seq 6 -> 체크포인트 생성

    expect(stream.checkpoints.map((c) => c.seq)).toEqual([0, 3, 6]);

    // 최신 시점 검증: 잠긴 cut-01은 (120, 80) 유지, pin-review는 해결 완료
    const latest = scrubMultiboardCommandStream(stream, 6);
    expect(latest.usedCheckpointSeq).toBe(6);
    expect(latest.replayedCommandCount).toBe(0);
    const cut1Latest = latest.snapshot.boards.find((b) => b.id === "cut-01");
    expect(cut1Latest?.x).toBe(120);
    expect(cut1Latest?.locked).toBe(true);
    expect(cut1Latest?.strokeCount).toBe(1);
    expect(latest.snapshot.pins[0]?.resolved).toBe(true);

    // 과거 시점(seq 2) 스크럽: 잠금 전, 스트로크 1개, 핀 0개
    const past = scrubMultiboardCommandStream(stream, 2);
    expect(past.usedCheckpointSeq).toBe(0);
    expect(past.replayedCommandCount).toBe(2);
    expect(past.snapshot.boards.find((b) => b.id === "cut-01")?.locked).toBe(false);
    expect(past.snapshot.pins).toHaveLength(0);
    expect(past.stateHash).not.toBe(latest.stateHash);

    // 타임랩스 4프레임 샘플링
    const timelapse = sampleTimelapseKeyframes(stream, 4);
    expect(timelapse.map((f) => f.appliedSeq)).toEqual([0, 2, 4, 6]);

    // 5초 창 내 cut-01 동시 편집 핫스팟(seq 1..3, u-a & u-b) 탐지
    const hotspots = detectConcurrentBoardHotspots(stream, 5000);
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0]!.boardId).toBe("cut-01");
    expect(hotspots[0]!.startSeq).toBe(1);
    expect(hotspots[0]!.endSeq).toBe(3);
    expect(hotspots[0]!.actorUserIds).toEqual(["u-a", "u-b"]);
  });
});
