import { describe, expect, it } from "vitest";

import {
  SemanticHistoryDagTracker,
  auditEpisodeQualityAndConsistency,
  deltaEOklab,
  detectGradientBanding,
  detectSharpInkCorners,
  diffHistoryCheckpoints,
  evaluateCatmullRomCentripetal,
  srgbToOklab,
  upscaleLineartPolylines,
  wcagContrastRatio,
  type CharacterModelSheet,
  type HistoryLayerSnapshot,
  type HistoryTileRef,
  type InkStrokeSample,
} from "./index";

const tile = (tileKey: string, contentHash: string, byteLength: number = 65536): HistoryTileRef => ({ tileKey, contentHash, byteLength });

describe("Wave 35 — 곡률 보존형 벡터 선화 업스케일러", () => {
  it("구심성 Catmull-Rom 평가기가 양 끝점(t=0, t=1)을 정확히 통과하고 불균일 간격에서도 단위 접선을 산출한다", () => {
    const p0: InkStrokeSample = { x: 0, y: 0, pressure: 0.1, widthPx: 0.4 };
    const p1: InkStrokeSample = { x: 100, y: 10, pressure: 0.35, widthPx: 1.2 };
    const p2: InkStrokeSample = { x: 104, y: 14, pressure: 0.75, widthPx: 2.4 };
    const p3: InkStrokeSample = { x: 240, y: -20, pressure: 0.95, widthPx: 3.0 };
    const atStart = evaluateCatmullRomCentripetal(p0, p1, p2, p3, 0);
    const atMid = evaluateCatmullRomCentripetal(p0, p1, p2, p3, 0.5);
    const atEnd = evaluateCatmullRomCentripetal(p0, p1, p2, p3, 1);

    expect(atStart.x).toBeCloseTo(p1.x, 9);
    expect(atStart.y).toBeCloseTo(p1.y, 9);
    expect(atEnd.x).toBeCloseTo(p2.x, 9);
    expect(atEnd.y).toBeCloseTo(p2.y, 9);
    expect(Math.hypot(atMid.unitTangent.x, atMid.unitTangent.y)).toBeCloseTo(1, 9);
    expect(atMid.x).toBeGreaterThan(99);
    expect(atMid.x).toBeLessThan(106);
  });

  it("직각 옷깃(90°)과 예리한 머리카락 끝(내각 < 30°)은 모서리로 검출하고 완만한 볼선 원호는 제외한다", () => {
    const collarAndSpike: readonly InkStrokeSample[] = [
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 50, y: 80 }, { x: 58, y: 38 },
    ];
    const corners = detectSharpInkCorners(collarAndSpike, { sharpCornerMinTurnDeg: 45 });
    expect(corners.map((c) => c.pointIndex)).toEqual([1, 3]);
    expect(corners[0]?.turnAngleDeg).toBeCloseTo(90, 5);
    expect(corners[1]?.interiorAngleDeg).toBeLessThan(30);

    const smoothCheekArc = Array.from({ length: 13 }, (_, i) => {
      const rad = (i / 12) * (Math.PI * 0.5);
      return { x: Math.cos(rad) * 80, y: Math.sin(rad) * 80 };
    });
    expect(detectSharpInkCorners(smoothCheekArc, { sharpCornerMinTurnDeg: 45 })).toHaveLength(0);
  });

  it("2x·4x 고배율 업스케일 시 의도된 펜선 뾰족 모서리 좌표 오차를 0px로 고정해 뭉개짐을 막는다", () => {
    const sharpStroke: readonly InkStrokeSample[] = [
      { x: 10, y: 10, pressure: 0.2, widthPx: 0.8 },
      { x: 50, y: 10, pressure: 0.9, widthPx: 2.2 },
      { x: 50, y: 60, pressure: 0.7, widthPx: 1.8 },
      { x: 18, y: 24, pressure: 0.15, widthPx: 0.5 },
    ];
    for (const scaleFactor of [2, 4]) {
      const report = upscaleLineartPolylines([{ strokeId: "collar-ink", points: sharpStroke }], { scaleFactor, subdivisionsPerSpan: 6 });
      expect(report.totalPreservedSharpCorners).toBe(2);
      expect(report.maxCornerDriftPx).toBeLessThan(1e-9);
      const flagged = report.strokes[0]?.points.filter((pt) => pt.isSharpCorner) ?? [];
      expect(flagged).toHaveLength(2);
      expect(flagged[0]?.x).toBeCloseTo(50 * scaleFactor, 9);
      expect(flagged[1]?.y).toBeCloseTo(60 * scaleFactor, 9);
    }
  });

  it("4x 원호 선화 업스케일 시 단순 선형 확대 대비 원 반지름 계단 오차(현 오차)를 대폭 축소한다", () => {
    const radius = 50;
    const coarseArc: InkStrokeSample[] = [];
    for (let i = 0; i <= 6; i += 1) {
      const theta = (i / 6) * (Math.PI * 0.75);
      coarseArc.push({ x: radius * Math.cos(theta), y: radius * Math.sin(theta) });
    }

    const report = upscaleLineartPolylines([{ strokeId: "eye-lid-curve", points: coarseArc }], {
      scaleFactor: 4,
      subdivisionsPerSpan: 4,
    });
    const targetRadius = radius * 4;
    const pts = report.strokes[0]?.points ?? [];
    expect(pts.length).toBeGreaterThan(coarseArc.length * 3);

    let splineRadialErrSum = 0;
    for (const pt of pts) splineRadialErrSum += Math.abs(Math.hypot(pt.x, pt.y) - targetRadius);
    const meanSplineErr = splineRadialErrSum / pts.length;

    const pA = coarseArc[2];
    const pB = coarseArc[3];
    const linearMidR = pA && pB ? Math.hypot((pA.x + pB.x) * 2, (pA.y + pB.y) * 2) : 0;
    expect(meanSplineErr).toBeLessThan(Math.abs(targetRadius - linearMidR) * 0.25);
  });

  it("펜촉 진입·이탈 빼기(Taper) 구간의 필압과 선폭을 음수 언더슈트 없이 단조롭게 보간한다", () => {
    const taperedStroke: readonly InkStrokeSample[] = [
      { x: 0, y: 0, pressure: 0.04, widthPx: 0.12 },
      { x: 20, y: 4, pressure: 0.35, widthPx: 0.9 },
      { x: 45, y: 12, pressure: 0.85, widthPx: 2.4 },
      { x: 70, y: 18, pressure: 1.0, widthPx: 3.0 },
    ];

    const report = upscaleLineartPolylines([{ strokeId: "gpen-taper", points: taperedStroke }], {
      scaleFactor: 4,
      subdivisionsPerSpan: 5,
    });
    const pts = report.strokes[0]?.points ?? [];
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1];
      const curr = pts[i];
      if (!prev || !curr) continue;
      expect(curr.pressure).toBeGreaterThanOrEqual(prev.pressure - 1e-9);
      expect(curr.widthPx).toBeGreaterThanOrEqual(prev.widthPx - 1e-9);
      expect(curr.pressure).toBeLessThanOrEqual(1);
    }
  });

  it("폐곡선(closed: true) 윤곽선 순환 보간과 optical-crisp 고해상도 세선 보정을 지원한다", () => {
    const loop: InkStrokeSample[] = [];
    for (let k = 0; k < 12; k += 1) {
      const angle = (k / 12) * Math.PI * 2;
      loop.push({ x: 30 * Math.cos(angle), y: 20 * Math.sin(angle), pressure: 0.8, widthPx: 2.0 });
    }
    const prop = upscaleLineartPolylines([{ strokeId: "iris", points: loop, closed: true }], {
      scaleFactor: 4,
      subdivisionsPerSpan: 4,
      strokeWidthScaleMode: "proportional",
    });
    const crisp = upscaleLineartPolylines([{ strokeId: "iris", points: loop, closed: true }], {
      scaleFactor: 4,
      subdivisionsPerSpan: 4,
      strokeWidthScaleMode: "optical-crisp",
    });

    expect(prop.strokes[0]?.points.length).toBe(48);
    expect(prop.strokes[0]?.maxWidthPx).toBeCloseTo(8.0, 6);
    expect(crisp.strokes[0]?.maxWidthPx).toBeLessThan(prop.strokes[0]?.maxWidthPx ?? 0);
  });
});

describe("Wave 35 — 시맨틱 히스토리 DAG 및 제로카피 A/B 룩데브 브랜치 추적기", () => {
  const createBaseLayers = (): readonly HistoryLayerSnapshot[] => [
    { layerId: "layer-sketch", nameKo: "콘티 스케치", stage: "sketch", blendMode: "normal", opacity: 0.45, visible: true, zIndex: 0, tiles: { "0:0": tile("0:0", "hash-sketch-00"), "0:1": tile("0:1", "hash-sketch-01") } },
    { layerId: "layer-ink", nameKo: "주선 펜터치", stage: "ink", blendMode: "normal", opacity: 1, visible: true, zIndex: 1, tiles: { "0:0": tile("0:0", "hash-ink-00"), "0:1": tile("0:1", "hash-ink-01") } },
    { layerId: "layer-flat", nameKo: "캐릭터 밑색", stage: "flat-color", blendMode: "normal", opacity: 1, visible: true, zIndex: 2, tiles: { "0:0": tile("0:0", "hash-flat-00") } },
  ];

  it("동일 작업 단계(ink)와 시간 창 내 연속 미세 브러시 획들을 단일 시맨틱 체크포인트로 병합한다", () => {
    const tracker = new SemanticHistoryDagTracker({
      initialLayers: createBaseLayers(),
      initialTimestampMs: 1000,
      policy: { coalesceWindowMs: 2000, maxOpsPerCheckpoint: 16 },
    });

    for (let i = 1; i <= 5; i += 1) {
      tracker.recordMicroEdit({
        opId: `ink-stroke-${i}`,
        timestampMs: 1000 + i * 300,
        stage: "ink",
        labelKo: "속눈썹 선 추가",
        targetLayerId: "layer-ink",
        updatedTiles: { "0:0": tile("0:0", `hash-ink-rev-${i}`) },
      });
    }

    expect(tracker.getAllCheckpoints()).toHaveLength(2);
    expect(tracker.getBranchHead().coalescedOpIds).toHaveLength(5);
    expect(tracker.getBranchHead().layers["layer-ink"]?.tiles["0:0"]?.contentHash).toBe("hash-ink-rev-5");
  });

  it("창작 단계 전환(ink -> flat-color) 또는 시간 창 초과 시 새 DAG 노드를 분기한다", () => {
    const tracker = new SemanticHistoryDagTracker({
      initialLayers: createBaseLayers(),
      initialTimestampMs: 0,
      policy: { coalesceWindowMs: 1500 },
    });

    const n1 = tracker.recordMicroEdit({ opId: "op-1", timestampMs: 200, stage: "ink", labelKo: "펜선 정리", targetLayerId: "layer-ink" });
    const n2 = tracker.recordMicroEdit({ opId: "op-2", timestampMs: 500, stage: "flat-color", labelKo: "피부 밑색", targetLayerId: "layer-flat" });
    const n3 = tracker.recordMicroEdit({ opId: "op-3", timestampMs: 4000, stage: "flat-color", labelKo: "의상 밑색", targetLayerId: "layer-flat" });

    expect(n2.parentCheckpointId).toBe(n1.checkpointId);
    expect(n3.parentCheckpointId).toBe(n2.checkpointId);
    expect(tracker.getAllCheckpoints()).toHaveLength(4);
  });

  it("핀 고정(pinCheckpoint)된 체크포인트는 후속 미세 편집에 덮어써지지 않고 새 자식 노드를 만든다", () => {
    const tracker = new SemanticHistoryDagTracker({ initialLayers: createBaseLayers(), initialTimestampMs: 100 });
    const first = tracker.recordMicroEdit({ opId: "ink-1", timestampMs: 200, stage: "ink", labelKo: "1차 펜선", targetLayerId: "layer-ink" });
    tracker.pinCheckpoint(first.checkpointId, "1차 선화 컨펌본");
    const second = tracker.recordMicroEdit({ opId: "ink-2", timestampMs: 350, stage: "ink", labelKo: "잔머리 보강", targetLayerId: "layer-ink" });

    expect(second.checkpointId).not.toBe(first.checkpointId);
    expect(second.parentCheckpointId).toBe(first.checkpointId);
    expect(tracker.getCheckpoint(first.checkpointId)?.titleKo).toBe("1차 선화 컨펌본");
  });

  it("석양·달빛 A/B 룩데브 브랜치 분기 시 변경 없는 밑그림·선화·밑색 타일 해시를 제로카피로 공유한다", () => {
    const tracker = new SemanticHistoryDagTracker({ initialLayers: createBaseLayers(), initialTimestampMs: 1000 });
    const baseHeadId = tracker.getBranchHead("main").checkpointId;

    tracker.createBranch("lookdev-sunset", baseHeadId, true);
    tracker.recordMicroEdit({
      opId: "sunset-glow",
      timestampMs: 1500,
      stage: "lighting",
      labelKo: "석양 역광",
      targetLayerId: "layer-lighting",
      layerPatch: { nameKo: "석양 조명", blendMode: "overlay", opacity: 0.75, zIndex: 3 },
      updatedTiles: { "0:0": tile("0:0", "hash-sunset-light-00") },
    });

    tracker.createBranch("lookdev-moonlight", baseHeadId, true);
    tracker.recordMicroEdit({
      opId: "moon-glow",
      timestampMs: 1800,
      stage: "lighting",
      labelKo: "푸른 달빛",
      targetLayerId: "layer-lighting",
      layerPatch: { nameKo: "달빛 조명", blendMode: "multiply", opacity: 0.65, zIndex: 3 },
      updatedTiles: { "0:0": tile("0:0", "hash-moon-light-00") },
    });

    const stats = tracker.getStorageDeduplicationStats();
    expect(stats.uniqueTileHashCount).toBe(7);
    expect(stats.sharedAcrossBranchesHashCount).toBe(5);
    expect(stats.savedBytes).toBeGreaterThan(65536 * 8);
    expect(stats.zeroCopySharingRatio).toBeGreaterThan(0.5);
  });

  it("diffHistoryCheckpoints가 추가·삭제·수정·무변경 레이어와 변경된 타일 키를 정밀 계산한다", () => {
    const tracker = new SemanticHistoryDagTracker({ initialLayers: createBaseLayers(), initialTimestampMs: 0 });
    const root = tracker.getBranchHead("main");

    tracker.recordMicroEdit({ opId: "del-sketch", timestampMs: 100, stage: "sketch", labelKo: "콘티 삭제", targetLayerId: "layer-sketch", removeLayer: true });
    const afterEdit = tracker.recordMicroEdit({
      opId: "mod-flat",
      timestampMs: 300,
      stage: "lighting",
      labelKo: "투명도 조정",
      targetLayerId: "layer-flat",
      layerPatch: { opacity: 0.85 },
      updatedTiles: { "0:1": tile("0:1", "hash-flat-01-new") },
    });

    const diff = diffHistoryCheckpoints(root, afterEdit);
    expect(diff.removedLayers.map((l) => l.layerId)).toEqual(["layer-sketch"]);
    expect(diff.unchangedLayerIds).toEqual(["layer-ink"]);
    expect(diff.modifiedLayers[0]?.metadataChangedFields).toContain("opacity");
    expect(diff.modifiedLayers[0]?.changedTileKeys).toEqual(["0:1"]);
    expect(diff.modifiedLayers[0]?.unchangedTileKeys).toEqual(["0:0"]);
  });

  it("A/B 브랜치의 조명 레이어만 main 브랜치로 원클릭 비파괴 선택 복원하고 다른 레이어는 지킨다", () => {
    const tracker = new SemanticHistoryDagTracker({ initialLayers: createBaseLayers(), initialTimestampMs: 0 });
    const forkId = tracker.getBranchHead("main").checkpointId;

    tracker.recordMicroEdit({
      opId: "main-ink-polish",
      timestampMs: 200,
      stage: "ink",
      labelKo: "주선 디테일업",
      targetLayerId: "layer-ink",
      updatedTiles: { "0:0": tile("0:0", "hash-main-ink-v2") },
    });

    tracker.createBranch("lookdev-dramatic", forkId, true);
    const dramaticHead = tracker.recordMicroEdit({
      opId: "dramatic-rim",
      timestampMs: 400,
      stage: "lighting",
      labelKo: "림라이트 실험",
      targetLayerId: "layer-rimlight",
      layerPatch: { nameKo: "림라이트", blendMode: "add", opacity: 0.8, zIndex: 4 },
      updatedTiles: { "0:0": tile("0:0", "hash-rimlight-00") },
    });

    const restoredMain = tracker.restoreSelectedLayers({
      targetBranchName: "main",
      sourceCheckpointId: dramaticHead.checkpointId,
      layerIds: ["layer-rimlight"],
      timestampMs: 600,
    });

    expect(restoredMain.restoredFromCheckpointId).toBe(dramaticHead.checkpointId);
    expect(restoredMain.layers["layer-ink"]?.tiles["0:0"]?.contentHash).toBe("hash-main-ink-v2");
    expect(restoredMain.layers["layer-rimlight"]?.tiles["0:0"]?.contentHash).toBe("hash-rimlight-00");
  });

  it("서로 다른 A/B 룩데브 브랜치 헤드 간 최근접 공통 조상(LCA)을 정확히 찾는다", () => {
    const tracker = new SemanticHistoryDagTracker({ initialLayers: createBaseLayers(), initialTimestampMs: 0 });
    const commonNode = tracker.recordMicroEdit({ opId: "shared-ink", timestampMs: 100, stage: "ink", labelKo: "공통 선화", targetLayerId: "layer-ink" });

    tracker.createBranch("branch-a", commonNode.checkpointId, true);
    const headA = tracker.recordMicroEdit({ opId: "a-1", timestampMs: 300, stage: "shading", labelKo: "셀 명암", targetLayerId: "layer-flat" });

    tracker.createBranch("branch-b", commonNode.checkpointId, true);
    const headB = tracker.recordMicroEdit({ opId: "b-1", timestampMs: 400, stage: "shading", labelKo: "수채 명암", targetLayerId: "layer-flat" });

    expect(tracker.findLowestCommonAncestor(headA.checkpointId, headB.checkpointId)?.checkpointId).toBe(commonNode.checkpointId);
  });
});

describe("Wave 35 — 캐릭터 설정표 일관성 및 출고 전 품질 가드", () => {
  const heroSheet: CharacterModelSheet = {
    characterId: "char-seojun",
    nameKo: "강서준",
    canonicalPalette: {
      hair: { r: 28, g: 34, b: 56 },
      eyes: { r: 196, g: 52, b: 64 },
      skin: { r: 245, g: 218, b: 198 },
      coat: { r: 44, g: 68, b: 62 },
    },
    asymmetricTraits: [
      { kind: "scar", canonicalSide: "left", labelKo: "왼쪽 눈썹 흉터" },
      { kind: "mole", canonicalSide: "right", labelKo: "오른쪽 눈물점" },
      { kind: "eyepatch", canonicalSide: "left", labelKo: "왼쪽 전술 안대" },
      { kind: "parted-hair", canonicalSide: "right", labelKo: "오른쪽 7:3 가르마" },
      { kind: "dominant-hand-prop", canonicalSide: "right", labelKo: "오른손 단검" },
    ],
  };

  it("srgbToOklab 및 deltaEOklab이 영점·대칭성을 만족하고 미세 차이와 오채색을 구분한다", () => {
    const navy = { r: 28, g: 34, b: 56 };
    const nearNavy = { r: 30, g: 35, b: 58 };
    const wrongPurple = { r: 92, g: 38, b: 118 };

    expect(srgbToOklab({ r: 0, g: 0, b: 0 }).L).toBeCloseTo(0, 6);
    expect(srgbToOklab({ r: 255, g: 255, b: 255 }).L).toBeCloseTo(1, 5);
    expect(deltaEOklab(navy, navy)).toBe(0);
    expect(deltaEOklab(navy, wrongPurple)).toBeCloseTo(deltaEOklab(wrongPurple, navy), 12);
    expect(deltaEOklab(navy, nearNavy)).toBeLessThan(0.02);
    expect(deltaEOklab(navy, wrongPurple)).toBeGreaterThan(0.12);
  });

  it("공식 설정표 대비 캐릭터 머리·눈동자 Oklab 색차 한도를 초과한 컷을 검출한다", () => {
    const report = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-01",
          cutNumber: 1,
          characters: [
            {
              characterId: "char-seojun",
              sampledPalette: { hair: { r: 29, g: 35, b: 55 }, eyes: { r: 62, g: 138, b: 210 } },
            },
          ],
        },
      ],
    });

    expect(report.readyForPublish).toBe(false);
    expect(report.paletteDriftDefects).toHaveLength(1);
    expect(report.paletteDriftDefects[0]?.slotKey).toBe("eyes");
    expect(report.paletteDriftDefects[0]?.deltaEOklab).toBeGreaterThan(0.15);
  });

  it("석양 전역 조명(sceneLighting)이 선언된 컷에서는 정당한 조명 틴트를 역보정해 오탐을 막는다", () => {
    const sunsetSkin = { r: 245, g: Math.round((218 * 200) / 255), b: Math.round((198 * 160) / 255) };
    const uncompensated = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [{ cutId: "cut-2", cutNumber: 2, characters: [{ characterId: "char-seojun", sampledPalette: { skin: sunsetSkin } }] }],
    });
    expect(uncompensated.paletteDriftDefects).toHaveLength(1);

    const compensated = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-2",
          cutNumber: 2,
          sceneLighting: { whiteReference: { r: 255, g: 200, b: 160 } },
          characters: [{ characterId: "char-seojun", sampledPalette: { skin: sunsetSkin } }],
        },
      ],
    });
    expect(compensated.paletteDriftDefects).toHaveLength(0);
  });

  it("isMirroredCut: true 미보정 반전 컷에서 흉터·점·안대·가르마·주손 소품 5대 비대칭 오류를 모두 검출한다", () => {
    const report = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [{ cutId: "cut-4", cutNumber: 4, isMirroredCut: true, characters: [{ characterId: "char-seojun", cameraFacing: "front" }] }],
    });

    expect(report.readyForPublish).toBe(false);
    expect(report.asymmetryFlipDefects.map((d) => d.traitKind)).toEqual([
      "scar",
      "mole",
      "eyepatch",
      "parted-hair",
      "dominant-hand-prop",
    ]);
    expect(report.asymmetryFlipDefects.every((d) => d.cause === "uncompensated-mirrored-cut")).toBe(true);
  });

  it("isMirroredCut: true 컷이라도 비대칭 부위를 재반전 보정 완료한 경우 정상 통과시킨다", () => {
    const report = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-5",
          cutNumber: 5,
          isMirroredCut: true,
          characters: [{ characterId: "char-seojun", cameraFacing: "front", mirroredTraitsCompensated: true }],
        },
      ],
    });
    expect(report.asymmetryFlipDefects).toHaveLength(0);
    expect(report.readyForPublish).toBe(true);
  });

  it("정면(front) 대 후면(back) 카메라 시점 패리티를 구분하여 수동 작화 방향 실수만 잡아낸다", () => {
    const validBackCut = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-6",
          cutNumber: 6,
          characters: [
            {
              characterId: "char-seojun",
              cameraFacing: "back",
              observedScreenTraits: { eyepatch: "screen-left", "dominant-hand-prop": "screen-right" },
            },
          ],
        },
      ],
    });
    expect(validBackCut.asymmetryFlipDefects).toHaveLength(0);

    const wrongFrontManual = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-7",
          cutNumber: 7,
          characters: [{ characterId: "char-seojun", cameraFacing: "front", observedScreenTraits: { scar: "screen-left" } }],
        },
      ],
    });
    expect(wrongFrontManual.asymmetryFlipDefects).toHaveLength(1);
    expect(wrongFrontManual.asymmetryFlipDefects[0]?.cause).toBe("inverted-screen-side");
  });

  it("양자화 계단 평탄면이 반복되는 그라데이션 밴딩만 검출하고 디더링 배경·선명한 펜선 경계는 통과시킨다", () => {
    const width = 16;
    const height = 80;
    const bandedSky = new Uint8Array(width * height);
    const ditheredSky = new Uint8Array(width * height);
    const crispInkPanel = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
      const quantizedStep = 90 + Math.floor(y / 10) * 3;
      const exactTone = 90 + (y / height) * 24;
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        bandedSky[idx] = quantizedStep;
        ditheredSky[idx] = Math.round(exactTone + (((x * 7 + y * 13) % 5) - 2));
        crispInkPanel[idx] = y < 40 ? 250 : 12;
      }
    }

    expect(detectGradientBanding({ regionId: "b", labelKo: "밴딩 하늘", width, height, luma8Bit: bandedSky }).hasBandingDefect).toBe(true);
    expect(detectGradientBanding({ regionId: "d", labelKo: "디더링 하늘", width, height, luma8Bit: ditheredSky }).hasBandingDefect).toBe(false);
    expect(detectGradientBanding({ regionId: "i", labelKo: "먹베타 경계", width, height, luma8Bit: crispInkPanel }).hasBandingDefect).toBe(false);
  });

  it("말풍선 일반 대사(4.5:1)와 대형 강조 식자(3.0:1)의 WCAG 명도 대비 미달 결함을 구분 검출한다", () => {
    expect(wcagContrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 3);
    const report = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-8",
          cutNumber: 8,
          textBalloons: [
            { balloonId: "b-low", textPreviewKo: "흐릿한 독백", foreground: { r: 150, g: 150, b: 150 }, background: { r: 245, g: 245, b: 245 }, fontSizePx: 15 },
            { balloonId: "b-ok", textPreviewKo: "강조 외침!", foreground: { r: 95, g: 95, b: 95 }, background: { r: 255, g: 255, b: 255 }, fontSizePx: 26, isBold: true },
          ],
        },
      ],
    });

    expect(report.textContrastDefects).toHaveLength(1);
    expect(report.textContrastDefects[0]?.balloonId).toBe("b-low");
  });

  it("4대 품질 게이트를 모두 만족하는 원고에 readyForPublish: true와 100점 품질 점수를 부여한다", () => {
    const clean = auditEpisodeQualityAndConsistency({
      episodeId: "ep-35-final",
      modelSheets: [heroSheet],
      cuts: [
        {
          cutId: "cut-1",
          cutNumber: 1,
          characters: [
            {
              characterId: "char-seojun",
              cameraFacing: "front",
              sampledPalette: heroSheet.canonicalPalette,
              observedScreenTraits: {
                scar: "screen-right",
                mole: "screen-left",
                eyepatch: "screen-right",
                "parted-hair": "screen-left",
                "dominant-hand-prop": "screen-left",
              },
            },
          ],
          textBalloons: [{ balloonId: "b-1", textPreviewKo: "출발한다.", foreground: { r: 20, g: 22, b: 26 }, background: { r: 252, g: 252, b: 250 }, fontSizePx: 16 }],
        },
      ],
    });

    expect(clean.readyForPublish).toBe(true);
    expect(clean.qualityScore).toBe(100);
    expect(clean.summaryKo).toContain("출고 준비 완료");
  });
});
