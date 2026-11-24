// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ACOUSTIC_ZONE_LIST,
  ACOUSTIC_ZONE_PROFILES,
  SpatialBinauralAudioGraph,
  SpatialDeskCrdtStateMachine,
  StudioSpatialStagePanel,
  computeInverseSquareAttenuation,
  computeLightboxCutPose,
  computeSabineRt60Sec,
  createDefaultListenerState,
  createDefaultPeerSources,
  createDefaultSpatialDeskMachine,
  createDefaultStudioWalls,
  createSafeSpatialAudioGraph,
  evaluateAcousticStageMix,
  evaluatePeerSpatialAudio,
  evaluateWallOcclusion,
  probeSpatialComputingRuntime,
  type AcousticWallSegment,
  type SpatialAudioContextLike,
  type SpatialBiquadFilterNodeLike,
  type SpatialGainNodeLike,
  type SpatialPannerNodeLike,
  type SpatialPeerAudioSource,
} from "./index";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function createMockAudioContext(): {
  readonly ctx: SpatialAudioContextLike;
  readonly panners: SpatialPannerNodeLike[];
  readonly filters: SpatialBiquadFilterNodeLike[];
  readonly gains: SpatialGainNodeLike[];
  readonly listenerPositions: { x: number; y: number; z: number }[];
} {
  const panners: SpatialPannerNodeLike[] = [];
  const filters: SpatialBiquadFilterNodeLike[] = [];
  const gains: SpatialGainNodeLike[] = [];
  const listenerPositions: { x: number; y: number; z: number }[] = [];

  const makeParam = (initial = 0) => ({
    value: initial,
    setTargetAtTime(target: number) {
      this.value = target;
    },
  });

  const ctx: SpatialAudioContextLike = {
    currentTime: 0,
    destination: { connect: () => undefined },
    listener: {
      setPosition: (x, y, z) => {
        listenerPositions.push({ x, y, z });
      },
      setOrientation: () => undefined,
    },
    createGain: () => {
      const node: SpatialGainNodeLike = {
        gain: makeParam(1),
        connect: () => undefined,
        disconnect: () => undefined,
      };
      gains.push(node);
      return node;
    },
    createBiquadFilter: () => {
      const node: SpatialBiquadFilterNodeLike = {
        type: "lowpass",
        frequency: makeParam(20000),
        Q: makeParam(0.707),
        connect: () => undefined,
        disconnect: () => undefined,
      };
      filters.push(node);
      return node;
    },
    createPanner: () => {
      const node: SpatialPannerNodeLike = {
        panningModel: "equalpower",
        distanceModel: "linear",
        refDistance: 1,
        maxDistance: 10000,
        rolloffFactor: 1,
        positionX: makeParam(0),
        positionY: makeParam(0),
        positionZ: makeParam(0),
        connect: () => undefined,
        disconnect: () => undefined,
      };
      panners.push(node);
      return node;
    },
  };

  return { ctx, panners, filters, gains, listenerPositions };
}

describe("1. 3D HRTF 바이노럴 공간 음향 스테이지 물리 엔진", () => {
  it("거리 제곱역법칙(Inverse-Square Law)에 따라 거리 2배·4배 증가 시 파워 1/4·1/16 및 -6.02dB·-12.04dB 감쇄한다", () => {
    const d1 = computeInverseSquareAttenuation(1, 1, 20);
    const d2 = computeInverseSquareAttenuation(2, 1, 20);
    const d4 = computeInverseSquareAttenuation(4, 1, 20);

    expect(d1.powerRatio).toBeCloseTo(1, 5);
    expect(d1.attenuationDb).toBeCloseTo(0, 2);

    expect(d2.powerRatio).toBeCloseTo(0.25, 5);
    expect(d2.amplitudeGain).toBeCloseTo(0.5, 5);
    expect(d2.attenuationDb).toBeCloseTo(-6.02, 2);

    expect(d4.powerRatio).toBeCloseTo(0.0625, 5);
    expect(d4.amplitudeGain).toBeCloseTo(0.25, 5);
    expect(d4.attenuationDb).toBeCloseTo(-12.04, 2);
  });

  it("공기 흡음 로우패스 컷오프 주파수는 리스너와 음원 사이 거리가 멀어질수록 단조 감소한다", () => {
    const listener = createDefaultListenerState();
    const nearSource: SpatialPeerAudioSource = {
      peerId: "near",
      displayNameKo: "근거리",
      roleKo: "스케치",
      position: { x: 0, y: 1.55, z: -0.6 },
      activity: "sketch-pencil",
      intensity: 0.8,
      muted: false,
    };
    const farSource: SpatialPeerAudioSource = {
      ...nearSource,
      peerId: "far",
      position: { x: 0, y: 1.55, z: -7.6 },
    };

    const nearEval = evaluatePeerSpatialAudio(nearSource, listener, "wood-atelier", []);
    const farEval = evaluatePeerSpatialAudio(farSource, listener, "wood-atelier", []);

    expect(farEval.distanceM).toBeGreaterThan(nearEval.distanceM);
    expect(farEval.airLowpassHz).toBeLessThan(nearEval.airLowpassHz);
    expect(farEval.distanceGain).toBeLessThan(nearEval.distanceGain);
  });

  it("벽체 차음(Occlusion)은 교차 시 dB 감쇄와 로우패스 하향을 누적 적용하며 개방 시 즉시 직달 음선으로 복원된다", () => {
    const listenerPos = { x: 0, y: 1.55, z: 0 };
    const sourcePos = { x: 4, y: 1.55, z: 0 };
    const walls: readonly AcousticWallSegment[] = [
      {
        id: "w1",
        labelKo: "유리 파티션",
        material: "glass-partition",
        start: { x: 1.5, z: -2 },
        end: { x: 1.5, z: 2 },
        occlusionDb: 9,
        lowpassHz: 3200,
        active: true,
      },
      {
        id: "w2",
        labelKo: "방음 부스 벽",
        material: "acoustic-booth-wall",
        start: { x: 2.8, z: -2 },
        end: { x: 2.8, z: 2 },
        occlusionDb: 22,
        lowpassHz: 1150,
        active: true,
      },
    ];

    const firstWall = walls[0];
    expect(firstWall).toBeDefined();
    const singleWall = evaluateWallOcclusion(
      listenerPos,
      sourcePos,
      firstWall ? [firstWall] : [],
      16000,
    );
    expect(singleWall.occludingWallIds).toEqual(["w1"]);
    expect(singleWall.occlusionDb).toBe(9);
    expect(singleWall.effectiveLowpassHz).toBe(3200);

    const doubleWall = evaluateWallOcclusion(listenerPos, sourcePos, walls, 16000);
    expect(doubleWall.occludingWallIds).toEqual(["w1", "w2"]);
    expect(doubleWall.occlusionDb).toBe(31);
    expect(doubleWall.effectiveLowpassHz).toBeLessThan(1150);

    const openedWalls = walls.map((wall) => ({ ...wall, active: false }));
    const openResult = evaluateWallOcclusion(listenerPos, sourcePos, openedWalls, 16000);
    expect(openResult.occludingWallIds).toEqual([]);
    expect(openResult.occlusionDb).toBe(0);
    expect(openResult.effectiveLowpassHz).toBe(16000);
  });

  it("4종 음향 구역(목재 아틀리에·정숙 자료실·방음 허들 부스·야외 루프탑 테라스)의 물리 RT60과 잔향 믹스가 명확히 차별화된다", () => {
    expect(ACOUSTIC_ZONE_LIST).toHaveLength(4);

    const wood = ACOUSTIC_ZONE_PROFILES["wood-atelier"];
    const archive = ACOUSTIC_ZONE_PROFILES["quiet-archive"];
    const huddle = ACOUSTIC_ZONE_PROFILES["soundproof-huddle"];
    const rooftop = ACOUSTIC_ZONE_PROFILES["rooftop-terrace"];

    // Sabine RT60 일관성 및 물리적 잔향 서열 검증
    expect(wood.rt60Sec).toBe(
      computeSabineRt60Sec(wood.volumeM3, wood.surfaceAreaM2, wood.averageAbsorptionCoeff),
    );
    expect(wood.rt60Sec).toBeGreaterThan(archive.rt60Sec);
    expect(archive.rt60Sec).toBeGreaterThan(huddle.rt60Sec);
    expect(huddle.rt60Sec).toBeGreaterThan(rooftop.rt60Sec);

    // 동일 음원에 대해 목재 아틀리에의 잔향 송신이 방음 허들 부스보다 훨씬 크다
    const listener = createDefaultListenerState();
    const peer = createDefaultPeerSources()[0];
    expect(peer).toBeDefined();
    if (!peer) return;
    const woodMix = evaluatePeerSpatialAudio(peer, listener, "wood-atelier", []);
    const huddleMix = evaluatePeerSpatialAudio(peer, listener, "soundproof-huddle", []);
    expect(woodMix.reverbSendGain).toBeGreaterThan(huddleMix.reverbSendGain);
  });

  it("HRTF 방위 패닝과 ITD가 우측(+), 좌측(-), 정면(0) 부호를 정확히 유지하며 리스너 180° 회전 시 반전된다", () => {
    const baseListener = { position: { x: 0, y: 1.55, z: 0 }, yawDeg: 0, pitchDeg: 0 };
    const rightPeer: SpatialPeerAudioSource = {
      peerId: "right",
      displayNameKo: "우측 동료",
      roleKo: "잉킹",
      position: { x: 3, y: 1.55, z: 0 },
      activity: "ink-pen",
      intensity: 0.9,
      muted: false,
    };
    const leftPeer: SpatialPeerAudioSource = {
      ...rightPeer,
      peerId: "left",
      position: { x: -3, y: 1.55, z: 0 },
    };
    const frontPeer: SpatialPeerAudioSource = {
      ...rightPeer,
      peerId: "front",
      position: { x: 0, y: 1.55, z: -3 },
    };

    const rightEval = evaluatePeerSpatialAudio(rightPeer, baseListener, "wood-atelier", []);
    const leftEval = evaluatePeerSpatialAudio(leftPeer, baseListener, "wood-atelier", []);
    const frontEval = evaluatePeerSpatialAudio(frontPeer, baseListener, "wood-atelier", []);

    expect(rightEval.azimuthDeg).toBeCloseTo(90, 1);
    expect(rightEval.stereoPan).toBeGreaterThan(0.95);
    expect(rightEval.itdUs).toBeGreaterThan(0);

    expect(leftEval.azimuthDeg).toBeCloseTo(-90, 1);
    expect(leftEval.stereoPan).toBeLessThan(-0.95);
    expect(leftEval.itdUs).toBeLessThan(0);

    expect(frontEval.azimuthDeg).toBeCloseTo(0, 1);
    expect(frontEval.stereoPan).toBe(0);
    expect(frontEval.itdUs).toBe(0);

    // 리스너가 180도 뒤로 돌면 기존 우측 음원은 좌측(-)으로 반전
    const turnedListener = { ...baseListener, yawDeg: 180 };
    const turnedRightEval = evaluatePeerSpatialAudio(
      rightPeer,
      turnedListener,
      "wood-atelier",
      [],
    );
    expect(turnedRightEval.stereoPan).toBeLessThan(-0.95);
    expect(turnedRightEval.itdUs).toBeLessThan(0);
  });

  it("어쿠스틱 믹스 라우터가 연필/펜 ASMR · 발소리 · 음성 허들 채널을 분리 라우팅하고 음소거를 반영한다", () => {
    const listener = createDefaultListenerState();
    const peers = createDefaultPeerSources();
    const walls = createDefaultStudioWalls();

    const report = evaluateAcousticStageMix("wood-atelier", listener, peers, walls, {
      ambientAsmrLevel: 0.8,
    });

    const seoyeon = report.peerMixes.find((m) => m.peerId === "peer-seoyeon");
    const taehyun = report.peerMixes.find((m) => m.peerId === "peer-taehyun");
    const jisu = report.peerMixes.find((m) => m.peerId === "peer-jisu");

    expect(seoyeon?.pencilPenAsmrGain).toBeGreaterThan(0);
    expect(seoyeon?.footstepGain).toBe(0);
    expect(seoyeon?.voiceGain).toBe(0);

    expect(taehyun?.footstepGain).toBeGreaterThan(0);
    expect(taehyun?.pencilPenAsmrGain).toBe(0);

    expect(jisu?.voiceGain).toBeGreaterThan(0);
    expect(jisu?.occlusionDb).toBe(22);

    // 음소거 시 모든 출력 게인이 0이며 비가청 상태가 된다
    const jisuPeer = peers[2];
    expect(jisuPeer).toBeDefined();
    if (!jisuPeer) return;
    const mutedJisu = evaluatePeerSpatialAudio(
      { ...jisuPeer, muted: true },
      listener,
      "wood-atelier",
      walls,
    );
    expect(mutedJisu.voiceGain).toBe(0);
    expect(mutedJisu.audible).toBe(false);
  });

  it("WebAudio PannerNode 그래프 빌더가 panningModel='HRTF'와 로우패스·리스너 동기화를 구성하며 headless 폴백도 안전하다", () => {
    const mock = createMockAudioContext();
    const listener = createDefaultListenerState();
    const peers = createDefaultPeerSources();
    const walls = createDefaultStudioWalls();
    const report = evaluateAcousticStageMix("quiet-archive", listener, peers, walls);

    const graph = new SpatialBinauralAudioGraph({
      audioContext: mock.ctx,
      zoneId: "quiet-archive",
      listener,
    });
    const snapshot = graph.syncStageMix(report, peers);

    expect(snapshot.backend).toBe("webaudio");
    expect(snapshot.channelCount).toBe(peers.length);
    expect(mock.panners).toHaveLength(peers.length);
    for (const panner of mock.panners) {
      expect(panner.panningModel).toBe("HRTF");
      expect(panner.distanceModel).toBe("inverse");
    }
    expect(mock.filters).toHaveLength(peers.length);
    expect(mock.listenerPositions.length).toBeGreaterThan(0);

    graph.dispose();
    expect(graph.getSnapshot().disposed).toBe(true);

    // SSR / AudioContext 미지원 환경 안전 폴백 검증
    const fallbackGraph = createSafeSpatialAudioGraph("rooftop-terrace");
    const fbSnap = fallbackGraph.syncStageMix(report, peers);
    expect(fbSnap.backend).toBe("headless-fallback");
    expect(fbSnap.channelCount).toBe(peers.length);
  });
});

describe("2. 공간 컴퓨팅 플로팅 라이트박스 · 3D 피드백 스티커 · CRDT 동기화", () => {
  it("WebXR 런타임 프로브가 AR·VR·데스크톱 3D 폴백 환경을 예외 없이 판별한다", async () => {
    const arCap = await probeSpatialComputingRuntime({
      xr: {
        isSessionSupported: async (mode) => mode === "immersive-ar",
      },
    });
    expect(arCap.mode).toBe("webxr-ar");
    expect(arCap.supportsSpatialAnchors).toBe(true);

    const desktopCap = await probeSpatialComputingRuntime(null);
    expect(desktopCap.mode).toBe("desktop-3d-workbench");
    expect(desktopCap.supportsImmersiveAr).toBe(false);
  });

  it("공중 플로팅 라이트박스 배치(아크/그리드) 시 핀 고정 컷은 위치를 보존하고 미고정 컷만 재배치한다", () => {
    const machine = createDefaultSpatialDeskMachine("peer-a");
    const before = machine.getSnapshot();
    const pinnedCutBefore = before.cuts.find((c) => c.cutId === "cut-01");
    const unpinnedCutBefore = before.cuts.find((c) => c.cutId === "cut-02");
    expect(pinnedCutBefore?.pinned).toBe(true);
    expect(unpinnedCutBefore?.pinned).toBe(false);

    machine.arrangeAllCuts("dual-row-grid");
    const after = machine.getSnapshot();
    const pinnedCutAfter = after.cuts.find((c) => c.cutId === "cut-01");
    const unpinnedCutAfter = after.cuts.find((c) => c.cutId === "cut-02");

    expect(after.layoutMode).toBe("dual-row-grid");
    expect(pinnedCutAfter?.pose).toEqual(pinnedCutBefore?.pose);
    expect(unpinnedCutAfter?.pose).not.toEqual(unpinnedCutBefore?.pose);

    // 핀 해제 및 단계 전이 검증
    machine.toggleCutPin("cut-01", false);
    machine.advanceCutStage("cut-03");
    const updated = machine.getSnapshot();
    expect(updated.cuts.find((c) => c.cutId === "cut-01")?.pinned).toBe(false);
    expect(updated.cuts.find((c) => c.cutId === "cut-03")?.stage).toBe("inked");
  });

  it("3D 공간 고정 피드백 스티커를 컷에 부착하고 해결 상태를 토글할 수 있다", () => {
    const machine = new SpatialDeskCrdtStateMachine("peer-director");
    const pose = computeLightboxCutPose(0, 2, "curved-arc");
    machine.upsertCut({
      cutId: "cut-10",
      cutNumber: 10,
      titleKo: "지하철 창문 반사 컷",
      sceneTagKo: "하이라이트",
      stage: "inked",
      pose,
      pinned: true,
      layerCount: 11,
    });

    machine.attachFeedbackSticker({
      stickerId: "st-100",
      cutId: "cut-10",
      authorNameKo: "연출가",
      category: "continuity",
      bodyKo: "이전 컷과 스카프 매듭 좌우 방향을 맞춰 주세요.",
      anchorPosition: { x: 0.12, y: 1.44, z: -1.42 },
    });

    const snap1 = machine.getSnapshot();
    expect(snap1.unresolvedStickerCount).toBe(1);
    expect(snap1.stickers[0]?.cutId).toBe("cut-10");

    machine.toggleStickerResolved("st-100", true);
    const snap2 = machine.getSnapshot();
    expect(snap2.unresolvedStickerCount).toBe(0);
    expect(snap2.stickers[0]?.resolved).toBe(true);
  });

  it("2명의 동료가 서로 다른 순서로 컷 핀·스티커·3D 포인터 CRDT 연산을 병합해도 동일 상태와 해시로 수렴한다", () => {
    const peerA = createDefaultSpatialDeskMachine("peer-alpha");
    const peerB = new SpatialDeskCrdtStateMachine("peer-beta");
    peerB.mergeOperations(peerA.exportOperations());

    // 동시 오프라인 편집: peerA와 peerB가 같은 컷과 서로 다른 스티커·포인터를 동시 수정
    const opA1 = peerA.toggleCutPin("cut-02", true);
    const opA2 = peerA.attachFeedbackSticker({
      stickerId: "st-concurrent-a",
      cutId: "cut-02",
      authorNameKo: "알파",
      category: "composition",
      bodyKo: "눈동자 하이라이트 위치 상향",
      anchorPosition: { x: -0.2, y: 1.5, z: -1.4 },
    });
    const opA3 = peerA.updatePeerPointer({
      peerId: "peer-alpha",
      displayNameKo: "알파",
      rayOrigin: { x: -0.5, y: 1.2, z: 0 },
      rayTarget: { x: -0.2, y: 1.4, z: -1.4 },
      hoveredCutId: "cut-02",
      drawingOnTable: true,
      activeToolKo: "HB 연필",
      deskContactM: { x: -0.3, y: 0.92, z: -0.5 },
    });

    const opB1 = peerB.toggleCutPin("cut-02", false);
    const opB2 = peerB.attachFeedbackSticker({
      stickerId: "st-concurrent-b",
      cutId: "cut-03",
      authorNameKo: "베타",
      category: "lighting",
      bodyKo: "배경 가로등 역광 강화",
      anchorPosition: { x: 0.35, y: 1.4, z: -1.42 },
    });
    const opB3 = peerB.updatePeerPointer({
      peerId: "peer-beta",
      displayNameKo: "베타",
      rayOrigin: { x: 0.6, y: 1.2, z: 0 },
      rayTarget: { x: 0.35, y: 1.38, z: -1.4 },
      hoveredCutId: "cut-03",
      drawingOnTable: false,
      activeToolKo: "레이저 포인터",
      deskContactM: { x: 0.35, y: 0.92, z: -0.5 },
    });

    const opsFromA = [opA1, opA2, opA3].filter((op): op is NonNullable<typeof op> => op !== null);
    const opsFromB = [opB1, opB2, opB3].filter((op): op is NonNullable<typeof op> => op !== null);

    // 역순·중복 병합 시에도 완벽한 수렴 및 멱등성 검증
    peerA.mergeOperations([...opsFromB].reverse());
    peerB.mergeOperations([...opsFromA]);
    const duplicateApplied = peerA.mergeOperations(opsFromB);
    expect(duplicateApplied).toBe(0);

    const snapA = peerA.getSnapshot();
    const snapB = peerB.getSnapshot();

    expect(snapA.convergenceDigest).toBe(snapB.convergenceDigest);
    expect(snapA.cuts).toEqual(snapB.cuts);
    expect(snapA.stickers).toEqual(snapB.stickers);
    expect(snapA.pointers).toEqual(snapB.pointers);
  });
});

describe("3. StudioSpatialStagePanel UI 상호작용 및 품질 가드", () => {
  it("4종 음향 구역 전환 · 리스너 이동 · 벽체 차음 개폐가 실시간 음향 지표에 반영된다", () => {
    render(createElement(StudioSpatialStagePanel));

    expect(screen.getByText(/가상 스튜디오 3D HRTF 공간 음향/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /2D 탑다운 공간 음향 스테이지 맵/ })).toBeTruthy();

    // 방음 허들 부스 전환
    const huddleBtn = screen.getByRole("button", { name: /방음 허들 부스/ });
    fireEvent.click(huddleBtn);
    expect(huddleBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/방음 허들 부스\(RT60/)).toBeTruthy();

    // 리스너 오른쪽 이동 클릭 -> 좌표 표기 갱신 확인
    expect(screen.getByText(/위치 \(0\.0m, 0\.4m\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "리스너 오른쪽 이동" }));
    expect(screen.getByText(/위치 \(0\.8m, 0\.4m\)/)).toBeTruthy();

    // 허들 부스 방음 유리벽 개방 토글 -> 버튼 aria-pressed 해제 및 상태 텍스트 반영
    const glassWallBtn = screen.getByRole("button", { name: /허들 부스 방음 유리벽/ });
    expect(glassWallBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(glassWallBtn);
    expect(glassWallBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("공간 라이트박스 컷 배치 추가 · 핀 고정 토글 · 3D 피드백 스티커 고정이 정상 동작한다", () => {
    render(createElement(StudioSpatialStagePanel));

    // 컷 배치 추가 (4컷 -> 5컷)
    fireEvent.click(screen.getByRole("button", { name: /컷 배치/ }));
    expect(screen.getByText(/#5 5컷 · 신규 공간 스토리보드/)).toBeTruthy();

    // 2열 그리드 배치 전환
    const gridBtn = screen.getByRole("button", { name: "2열 그리드" });
    fireEvent.click(gridBtn);
    expect(gridBtn.getAttribute("aria-pressed")).toBe("true");

    // 3D 피드백 스티커 입력 및 고정
    const input = screen.getByLabelText("3D 피드백 스티커 내용");
    fireEvent.change(input, { target: { value: "빗방울 반사 하이라이트 추가" } });
    fireEvent.click(screen.getByRole("button", { name: "스티커 고정" }));
    expect(screen.getByText("빗방울 반사 하이라이트 추가")).toBeTruthy();
  });

  it("모듈 내 모든 소스 파일이 800줄 이하이며 원시 색상·transition-all·Sparkles·WebStorage·private store가 0건이다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/virtual-space-spatial");
    const files = readdirSync(dir).filter(
      (name) => (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts"),
    );

    expect(files.length).toBeGreaterThanOrEqual(4);

    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgb\s*\(|\bhsl\s*\(/;
    const rawTailwindPaletteRegex =
      /\b(?:bg|text|border|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?\b/;

    for (const file of files) {
      const content = readFileSync(resolve(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} must be <= 800 lines`).toBeLessThanOrEqual(800);
      expect(content.includes("transition-all"), `${file} must not use transition-all`).toBe(false);
      expect(content.includes("Sparkles"), `${file} must not use Sparkles`).toBe(false);
      expect(content.includes("localStorage"), `${file} must not use localStorage`).toBe(false);
      expect(content.includes("sessionStorage"), `${file} must not use sessionStorage`).toBe(false);
      expect(
        /\bprivate\s+(?:readonly\s+)?store\b/.test(content),
        `${file} must not declare private store field`,
      ).toBe(false);

      if (file.endsWith(".tsx")) {
        expect(rawColorRegex.test(content), `${file} must not contain raw hex/rgb/hsl`).toBe(false);
        expect(
          rawTailwindPaletteRegex.test(content),
          `${file} must use Calm Atelier semantic tokens only`,
        ).toBe(false);
      }
    }
  });
});
