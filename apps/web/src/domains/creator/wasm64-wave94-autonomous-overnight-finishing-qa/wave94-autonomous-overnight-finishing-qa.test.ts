import { describe, expect, it } from "vitest";
import {
  applyMorningPatchDecisions,
  buildMorningQaTriageMetrics,
  computeEpisodeSnapshotSha256,
  planGutterAwareVerticalSlices,
  rectBisectedByCutY,
  renderOvernightQaTriageSvg,
  runOvernightSelfHealingPipeline,
  scanOvernightEpisodeDefects,
  sha256OvernightQaHex,
  summarizeMorningQaBriefKo,
  type CompactRgbaTileBuffer,
  type OvernightEpisodeSnapshot,
  type OvernightLayerState,
  type OvernightPanelState,
} from "./index";

function createBlankTile(width: number, height: number): CompactRgbaTileBuffer {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(tile: CompactRgbaTileBuffer, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const idx = (y * tile.width + x) * 4;
  tile.rgba[idx] = r;
  tile.rgba[idx + 1] = g;
  tile.rgba[idx + 2] = b;
  tile.rgba[idx + 3] = a;
}

function getPixel(tile: CompactRgbaTileBuffer, x: number, y: number): readonly [number, number, number, number] {
  const idx = (y * tile.width + x) * 4;
  return [tile.rgba[idx] ?? 0, tile.rgba[idx + 1] ?? 0, tile.rgba[idx + 2] ?? 0, tile.rgba[idx + 3] ?? 0];
}

/** 16×16 타일: 바깥 여백(투명), 사각 어두운 선화 테두리(2..13, luma~18), 내부 살구색 채색(3..12) */
function createInkFramedCelTile(pinholes: readonly (readonly [number, number])[] = []): CompactRgbaTileBuffer {
  const tile = createBlankTile(16, 16);
  for (let y = 2; y <= 13; y += 1) {
    for (let x = 2; x <= 13; x += 1) {
      const isBorder = x === 2 || x === 13 || y === 2 || y === 13;
      if (isBorder) setPixel(tile, x, y, 16, 18, 22, 255);
      else setPixel(tile, x, y, 240, 196, 152, 255);
    }
  }
  for (const [px, py] of pinholes) setPixel(tile, px, py, 0, 0, 0, 0);
  return tile;
}

function makeBaseLayers(celTile: CompactRgbaTileBuffer = createInkFramedCelTile()): readonly OvernightLayerState[] {
  return [
    { layerId: "p1-ink", name: "선화", role: "ink", visible: true, opacity: 1, blendMode: "normal", colorProfile: "srgb" },
    { layerId: "p1-cel", name: "인물 채색", role: "cel-fill", visible: true, opacity: 1, blendMode: "normal", colorProfile: "srgb", rasterTile: celTile },
  ];
}

function createCleanEpisode(overrides: Partial<OvernightEpisodeSnapshot> = {}): OvernightEpisodeSnapshot {
  const defaultPanel: OvernightPanelState = {
    panelId: "p1",
    sequenceIndex: 1,
    bounds: { x: 0, y: 40, width: 800, height: 960 },
    layers: makeBaseLayers(),
  };
  return {
    episodeId: "ep-042",
    title: "42화 밤의 아틀리에",
    platformSpec: "naver-webtoon",
    canvasWidthPx: 800,
    canvasHeightPx: 1120,
    auditDateIso: "2026-11-28",
    colorProfile: "srgb",
    panels: [defaultPanel],
    speechBalloons: [
      { balloonId: "b1", panelId: "p1", bbox: { x: 40, y: 80, width: 200, height: 90 }, text: "내일 아침 바로 출고.", minReadableFontPx: 14, fontSizePx: 16 },
    ],
    faceKeepOutBoxes: [
      { boxId: "face-1", characterId: "char-hana", panelId: "p1", bbox: { x: 420, y: 260, width: 140, height: 150 } },
    ],
    rightsBomAssets: [
      { assetId: "font-pretendard", assetName: "프리텐다드 상업 폰트", assetType: "font", licenseStatus: "verified-commercial", expiresAtIso: "2028-12-31", usedInPanelIds: ["p1"] },
    ],
    ...overrides,
  };
}

function withSinglePanelLayers(
  layers: readonly OvernightLayerState[],
  overrides: Partial<OvernightEpisodeSnapshot> = {},
): OvernightEpisodeSnapshot {
  return createCleanEpisode({
    panels: [{ panelId: "p1", sequenceIndex: 1, bounds: { x: 0, y: 40, width: 800, height: 960 }, layers }],
    ...overrides,
  });
}

describe("Wave 94: 무인 야간 자율 마감 QA · 자가 복구 파이프라인", () => {
  it("1. FIPS 180-4 SHA-256 표준 벡터와 한글 UTF-8 해시가 정확히 일치한다", () => {
    expect(sha256OvernightQaHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256OvernightQaHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const ko = sha256OvernightQaHex("툰스튜디오 야간 마감");
    expect(ko).toHaveLength(64);
    expect(ko).toBe(sha256OvernightQaHex("툰스튜디오 야간 마감"));
  });

  it("2. 스냅샷 SHA-256 해시는 래스터 타일 1바이트 변경도 즉시 감지한다", () => {
    const epA = createCleanEpisode();
    const epB = createCleanEpisode();
    const tileB = epB.panels[0]?.layers[1]?.rasterTile;
    expect(tileB).toBeDefined();
    if (tileB) setPixel(tileB, 5, 5, 241, 196, 152, 255);
    expect(computeEpisodeSnapshotSha256(epA)).not.toBe(computeEpisodeSnapshotSha256(epB));
  });

  it("3. 결함이 없는 정상 회차는 0건 탐지 및 exportReady=true를 반환한다", () => {
    const master = createCleanEpisode();
    const scan = scanOvernightEpisodeDefects(master);
    expect(scan.defects).toHaveLength(0);
    expect(scan.exportReady).toBe(true);
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.masterUnmutated).toBe(true);
    expect(run.masterSha256Before).toBe(run.masterSha256After);
    expect(run.appliedPatchCount).toBe(0);
    expect(run.exportReady).toBe(true);
  });

  it("4. 채색 영역 내부에 둘러싸인 2×2 투명 핀홀을 SAFE_AUTO_PATCH로 탐지한다", () => {
    const ep = withSinglePanelLayers([
      { layerId: "p1-cel", name: "인물 채색", role: "cel-fill", visible: true, opacity: 1, blendMode: "normal", rasterTile: createInkFramedCelTile([[6, 6], [7, 6], [6, 7], [7, 7]]) },
    ]);
    const scan = scanOvernightEpisodeDefects(ep);
    expect(scan.countsByClass["transparent-pinhole-gap"]).toBe(1);
    expect(scan.defects[0]?.safetyTier).toBe("SAFE_AUTO_PATCH");
    expect(scan.defects[0]?.pinholePixels).toHaveLength(4);
    expect(scan.defects[0]?.pinholeBbox).toEqual({ x: 6, y: 6, width: 2, height: 2 });
  });

  it("5. 바깥 캔버스 투명 여백과 4px 초과 대면적 빈 구간은 핀홀로 오탐하지 않는다", () => {
    const largeGap: Array<readonly [number, number]> = [];
    for (let y = 5; y <= 10; y += 1) for (let x = 5; x <= 10; x += 1) largeGap.push([x, y]);
    const ep = withSinglePanelLayers([
      { layerId: "p1-cel", name: "인물 채색", role: "cel-fill", visible: true, opacity: 1, blendMode: "normal", rasterTile: createInkFramedCelTile(largeGap) },
    ]);
    expect(scanOvernightEpisodeDefects(ep).countsByClass["transparent-pinhole-gap"]).toBe(0);
  });

  it("6. 인접 채색 없이 어두운 선화에만 둘러싸인 1px 공백은 PROPOSE_REVIEW_PATCH로 보류한다", () => {
    const tile = createBlankTile(10, 10);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) {
        if (x !== 4 || y !== 4) setPixel(tile, x, y, 10, 10, 12, 255);
      }
    }
    const ep = withSinglePanelLayers([
      { layerId: "p1-cel", name: "인물 채색", role: "cel-fill", visible: true, opacity: 1, blendMode: "normal", rasterTile: tile },
    ]);
    const scan = scanOvernightEpisodeDefects(ep);
    expect(scan.countsByClass["transparent-pinhole-gap"]).toBe(1);
    expect(scan.defects[0]?.safetyTier).toBe("PROPOSE_REVIEW_PATCH");
  });

  it("7. 2×2 핀홀 자가 복구는 인접 채색 대표색으로 메우고 어두운 선화와 원본 버퍼를 무손상 유지한다", () => {
    const masterTile = createInkFramedCelTile([[6, 6], [7, 6], [6, 7], [7, 7]]);
    const master = withSinglePanelLayers([
      { layerId: "p1-cel", name: "인물 채색", role: "cel-fill", visible: true, opacity: 1, blendMode: "normal", rasterTile: masterTile },
    ]);
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.masterUnmutated).toBe(true);
    expect(run.masterSha256Before).toBe(run.masterSha256After);
    expect(run.appliedPatchCount).toBe(1);
    expect(run.afterScan.countsByClass["transparent-pinhole-gap"]).toBe(0);
    expect(run.exportReady).toBe(true);

    const stagedTile = run.stagingSnapshot.panels[0]?.layers[0]?.rasterTile;
    expect(stagedTile).toBeDefined();
    if (stagedTile) {
      expect(getPixel(stagedTile, 6, 6)).toEqual([240, 196, 152, 255]);
      expect(getPixel(stagedTile, 7, 7)).toEqual([240, 196, 152, 255]);
      expect(getPixel(stagedTile, 2, 2)).toEqual([16, 18, 22, 255]);
      expect(getPixel(stagedTile, 13, 6)).toEqual([16, 18, 22, 255]);
      expect(getPixel(stagedTile, 0, 0)).toEqual([0, 0, 0, 0]);
    }
    expect(getPixel(masterTile, 6, 6)).toEqual([0, 0, 0, 0]);
  });

  it("8. 선화 테두리에 바로 맞닿은 코너 2×2 핀홀도 다수결 채색만 선택하고 잉크 경계를 건드리지 않는다", () => {
    const tile = createInkFramedCelTile([[3, 3], [4, 3], [3, 4], [4, 4]]);
    setPixel(tile, 5, 3, 120, 160, 220, 255);
    const master = withSinglePanelLayers([
      { layerId: "p1-cel", name: "인물 채색", role: "cel-fill", visible: true, opacity: 1, blendMode: "normal", rasterTile: tile },
    ]);
    const run = runOvernightSelfHealingPipeline(master);
    const stagedTile = run.stagingSnapshot.panels[0]?.layers[0]?.rasterTile;
    expect(run.appliedPatchCount).toBe(1);
    expect(stagedTile && getPixel(stagedTile, 3, 3)).toEqual([240, 196, 152, 255]);
    expect(stagedTile && getPixel(stagedTile, 2, 3)).toEqual([16, 18, 22, 255]);
    expect(stagedTile && getPixel(stagedTile, 3, 2)).toEqual([16, 18, 22, 255]);
  });

  it("9. 켜진 rough-draft / perspective-guide 레이어는 스테이징에서만 비표시 전환되고 원본 SHA-256이 불변이다", () => {
    const master = withSinglePanelLayers([
      ...makeBaseLayers(),
      { layerId: "p1-rough", name: "1차 러프", role: "rough-draft", visible: true, opacity: 0.4, blendMode: "normal" },
      { layerId: "p1-persp", name: "2점 투시선", role: "perspective-guide", visible: true, opacity: 0.5, blendMode: "normal" },
    ]);
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.beforeScan.countsByClass["draft-guide-layer-left-visible"]).toBe(2);
    expect(run.afterScan.countsByClass["draft-guide-layer-left-visible"]).toBe(0);
    expect(run.appliedPatchCount).toBe(2);
    expect(run.masterUnmutated).toBe(true);
    expect(run.masterSha256Before).toBe(run.masterSha256After);
    expect(run.stagingSnapshot.panels[0]?.layers[2]?.visible).toBe(false);
    expect(run.stagingSnapshot.panels[0]?.layers[3]?.visible).toBe(false);
    expect(master.panels[0]?.layers[2]?.visible).toBe(true);
  });

  it("10. 이미 숨겨진 rough-draft 레이어는 결함으로 잡지 않는다", () => {
    const ep = withSinglePanelLayers([
      ...makeBaseLayers(),
      { layerId: "p1-rough", name: "숨긴 러프", role: "rough-draft", visible: false, opacity: 0.3, blendMode: "normal" },
    ]);
    expect(scanOvernightEpisodeDefects(ep).defects).toHaveLength(0);
  });

  it("11. 선화·채색 레이어의 비정상 블렌드 모드는 PROPOSE_REVIEW_PATCH로 분류하고 자동 수정하지 않는다", () => {
    const [ink, cel] = makeBaseLayers();
    const master = withSinglePanelLayers([
      ...(ink ? [{ ...ink, blendMode: "screen" as const }] : []),
      ...(cel ? [cel] : []),
    ]);
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.beforeScan.countsByClass["layer-blend-alpha-halo"]).toBe(1);
    expect(run.beforeScan.defects[0]?.safetyTier).toBe("PROPOSE_REVIEW_PATCH");
    expect(run.appliedPatchCount).toBe(0);
    expect(run.stagingSnapshot.panels[0]?.layers[0]?.blendMode).toBe("screen");
    expect(run.exportReady).toBe(false);
  });

  it("12. 채색 레이어에 밝은 반투명 알파 헤일로가 감지되면 PROPOSE_REVIEW_PATCH를 기록한다", () => {
    const haloTile = createInkFramedCelTile();
    for (let x = 2; x <= 7; x += 1) setPixel(haloTile, x, 1, 250, 250, 250, 120);
    const ep = withSinglePanelLayers(makeBaseLayers(haloTile));
    const scan = scanOvernightEpisodeDefects(ep);
    expect(scan.countsByClass["layer-blend-alpha-halo"]).toBe(1);
    expect(scan.defects[0]?.safetyTier).toBe("PROPOSE_REVIEW_PATCH");
  });

  it("13. 패널 우측 경계를 넘긴 말풍선은 얼굴 충돌 여유가 있으면 안쪽 여백으로 안전 자동 이동한다", () => {
    const master = createCleanEpisode({
      speechBalloons: [
        { balloonId: "b-clip-safe", panelId: "p1", bbox: { x: 640, y: 100, width: 200, height: 90 }, text: "잘린 대사", minReadableFontPx: 14 },
      ],
      faceKeepOutBoxes: [
        { boxId: "face-left", characterId: "char-hana", panelId: "p1", bbox: { x: 120, y: 300, width: 140, height: 150 } },
      ],
    });
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.appliedPatchCount).toBe(1);
    expect(run.rolledBackPatchCount).toBe(0);
    expect(run.exportReady).toBe(true);
    expect(run.stagingSnapshot.speechBalloons[0]?.bbox.x).toBe(592);
    expect(master.speechBalloons[0]?.bbox.x).toBe(640);
  });

  it("14. 말풍선 안쪽 이동이 얼굴 보호 영역과 충돌하면 회귀 게이트가 해당 패치만 자동 롤백(AUTO_ROLLED_BACK_REGRESSION)한다", () => {
    const master = withSinglePanelLayers(
      [...makeBaseLayers(), { layerId: "p1-rough", name: "러프", role: "rough-draft", visible: true, opacity: 0.4, blendMode: "normal" }],
      {
        speechBalloons: [
          { balloonId: "b-clip-danger", panelId: "p1", bbox: { x: 660, y: 260, width: 180, height: 90 }, text: "충돌 대사", minReadableFontPx: 14 },
        ],
        faceKeepOutBoxes: [
          { boxId: "face-right", characterId: "char-seo", panelId: "p1", bbox: { x: 520, y: 250, width: 130, height: 130 } },
        ],
      },
    );
    const run = runOvernightSelfHealingPipeline(master);
    const balloonPatch = run.patches.find((p) => p.defectClass === "speech-balloon-edge-clip");
    const draftPatch = run.patches.find((p) => p.defectClass === "draft-guide-layer-left-visible");

    expect(draftPatch?.status).toBe("APPLIED");
    expect(balloonPatch?.status).toBe("AUTO_ROLLED_BACK_REGRESSION");
    expect(balloonPatch?.introducedDefectIds.length).toBeGreaterThan(0);
    expect(balloonPatch?.rollbackReasonKo).toContain("얼굴 보호 영역");
    expect(run.stagingSnapshot.speechBalloons[0]?.bbox.x).toBe(660);
    expect(run.stagingSnapshot.panels[0]?.layers[2]?.visible).toBe(false);
    expect(run.rolledBackPatchCount).toBe(1);
    expect(run.exportReady).toBe(false);
    expect(run.masterUnmutated).toBe(true);
  });

  it("15. 이미 얼굴 보호 영역을 침범한 말풍선은 HARD_HUMAN_BLOCKER로 즉시 차단한다", () => {
    const master = createCleanEpisode({
      speechBalloons: [
        { balloonId: "b-on-face", panelId: "p1", bbox: { x: 430, y: 270, width: 160, height: 80 }, text: "얼굴 침범", minReadableFontPx: 14 },
      ],
    });
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.beforeScan.hardBlockerCount).toBe(1);
    expect(run.appliedPatchCount).toBe(0);
    expect(run.exportReady).toBe(false);
  });

  it("16. 플랫폼별 세로 슬라이스 높이 한도(네이버 1280px · 카카오 1600px · 글로벌 1280px)를 정확히 판별한다", () => {
    expect(scanOvernightEpisodeDefects(createCleanEpisode({ platformSpec: "naver-webtoon", canvasHeightPx: 1500 })).countsByClass["vertical-slice-budget-violation"]).toBe(1);
    expect(scanOvernightEpisodeDefects(createCleanEpisode({ platformSpec: "kakao-page", canvasHeightPx: 1500 })).countsByClass["vertical-slice-budget-violation"]).toBe(0);
    expect(scanOvernightEpisodeDefects(createCleanEpisode({ platformSpec: "global-webtoon-canvas", canvasHeightPx: 1500 })).countsByClass["vertical-slice-budget-violation"]).toBe(1);
  });

  it("17. 3400px 장편 회차는 여백 기반 세로 분할 플래너가 빈 거터 Y에만 분할선을 놓아 말풍선·얼굴 절단 0건을 보장한다", () => {
    const panels: OvernightPanelState[] = [
      { panelId: "p1", sequenceIndex: 1, bounds: { x: 0, y: 40, width: 800, height: 960 }, layers: [] },
      { panelId: "p2", sequenceIndex: 2, bounds: { x: 0, y: 1120, width: 800, height: 980 }, layers: [] },
      { panelId: "p3", sequenceIndex: 3, bounds: { x: 0, y: 2220, width: 800, height: 1080 }, layers: [] },
    ];
    const balloons = [
      { balloonId: "b1", panelId: "p1", bbox: { x: 60, y: 160, width: 200, height: 90 }, text: "1컷", minReadableFontPx: 14 },
      { balloonId: "b2", panelId: "p2", bbox: { x: 500, y: 1200, width: 200, height: 100 }, text: "2컷", minReadableFontPx: 14 },
      { balloonId: "b3", panelId: "p3", bbox: { x: 100, y: 2320, width: 220, height: 110 }, text: "3컷", minReadableFontPx: 14 },
    ];
    const faces = [
      { boxId: "f1", characterId: "c1", panelId: "p1", bbox: { x: 340, y: 420, width: 150, height: 160 } },
      { boxId: "f2", characterId: "c1", panelId: "p2", bbox: { x: 180, y: 1500, width: 160, height: 160 } },
      { boxId: "f3", characterId: "c1", panelId: "p3", bbox: { x: 420, y: 2600, width: 150, height: 170 } },
    ];
    const run = runOvernightSelfHealingPipeline(
      createCleanEpisode({ platformSpec: "naver-webtoon", canvasHeightPx: 3400, panels, speechBalloons: balloons, faceKeepOutBoxes: faces }),
    );
    expect(run.exportReady).toBe(true);
    expect(run.verticalSlicePlan?.feasible).toBe(true);
    const cuts = run.stagingSnapshot.plannedSliceCutsY ?? [];
    expect(cuts.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i + 1 < cuts.length; i += 1) expect((cuts[i + 1] ?? 0) - (cuts[i] ?? 0)).toBeLessThanOrEqual(1280);
    for (const y of cuts.slice(1, -1)) {
      expect(panels.every((p) => !rectBisectedByCutY(p.bounds, y))).toBe(true);
      expect(balloons.every((b) => !rectBisectedByCutY(b.bbox, y))).toBe(true);
      expect(faces.every((f) => !rectBisectedByCutY(f.bbox, y))).toBe(true);
    }
  });

  it("18. 기존 분할선이 말풍선을 관통하면 결함을 탐지하고 빈 거터 구간으로 재배치한다", () => {
    const panels: OvernightPanelState[] = [
      { panelId: "p1", sequenceIndex: 1, bounds: { x: 0, y: 40, width: 800, height: 960 }, layers: [] },
      { panelId: "p2", sequenceIndex: 2, bounds: { x: 0, y: 1120, width: 800, height: 960 }, layers: [] },
    ];
    const run = runOvernightSelfHealingPipeline(
      createCleanEpisode({
        canvasHeightPx: 2200,
        plannedSliceCutsY: [0, 1200, 2200],
        panels,
        speechBalloons: [{ balloonId: "b2", panelId: "p2", bbox: { x: 80, y: 1160, width: 200, height: 100 }, text: "절단 금지", minReadableFontPx: 14 }],
        faceKeepOutBoxes: [],
      }),
    );
    expect(run.beforeScan.countsByClass["vertical-slice-budget-violation"]).toBe(1);
    expect(run.afterScan.countsByClass["vertical-slice-budget-violation"]).toBe(0);
    const cutY = run.stagingSnapshot.plannedSliceCutsY?.[1] ?? 0;
    expect(cutY).toBeGreaterThan(1000);
    expect(cutY).toBeLessThan(1120);
  });

  it("19. 단일 패널이 1280px을 넘어 빈 거터가 없으면 실패 닫힘(AUTO_ROLLED_BACK_REGRESSION) 처리한다", () => {
    const master = createCleanEpisode({
      platformSpec: "naver-webtoon",
      canvasHeightPx: 1700,
      panels: [{ panelId: "p-giant", sequenceIndex: 1, bounds: { x: 0, y: 0, width: 800, height: 1700 }, layers: [] }],
      speechBalloons: [],
      faceKeepOutBoxes: [],
    });
    expect(planGutterAwareVerticalSlices(master).feasible).toBe(false);
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.rolledBackPatchCount).toBe(1);
    expect(run.exportReady).toBe(false);
  });

  it("20. 컷 순번 누락·중복과 0px/음수 붕괴 거터를 panel-sequence-numbering-gap으로 탐지한다", () => {
    const ep = createCleanEpisode({
      canvasHeightPx: 1100,
      panels: [
        { panelId: "p1", sequenceIndex: 1, bounds: { x: 0, y: 20, width: 800, height: 400 }, layers: [] },
        { panelId: "p2", sequenceIndex: 3, bounds: { x: 0, y: 410, width: 800, height: 400 }, layers: [] },
      ],
      speechBalloons: [],
      faceKeepOutBoxes: [],
    });
    const scan = scanOvernightEpisodeDefects(ep);
    expect(scan.countsByClass["panel-sequence-numbering-gap"]).toBe(2);
    expect(scan.defects.every((d) => d.safetyTier === "PROPOSE_REVIEW_PATCH")).toBe(true);
  });

  it("21. CMYK 및 미변환 Display-P3 레이어·문서를 color-profile-mismatch로 탐지한다", () => {
    const [ink, cel] = makeBaseLayers();
    const ep = withSinglePanelLayers(
      [...(ink ? [{ ...ink, colorProfile: "cmyk" as const }] : []), ...(cel ? [cel] : [])],
      { colorProfile: "display-p3-unconverted" },
    );
    const scan = scanOvernightEpisodeDefects(ep);
    expect(scan.countsByClass["color-profile-mismatch"]).toBe(2);
    expect(scan.proposeReviewCount).toBe(2);
  });

  it("22. Rights BOM 만료·누락·비상업 전용·기준일 경과 자산을 HARD_HUMAN_BLOCKER로 탐지한다", () => {
    const ep = createCleanEpisode({
      auditDateIso: "2026-11-28",
      rightsBomAssets: [
        { assetId: "a1", assetName: "만료 배경 3D", assetType: "3d-background", licenseStatus: "expired", usedInPanelIds: ["p1"] },
        { assetId: "a2", assetName: "출처 미상 브러시", assetType: "brush", licenseStatus: "missing", usedInPanelIds: ["p1"] },
        { assetId: "a3", assetName: "비상업 무료 폰트", assetType: "font", licenseStatus: "non-commercial-only", usedInPanelIds: ["p1"] },
        { assetId: "a4", assetName: "기간 경과 텍스처", assetType: "texture", licenseStatus: "verified-commercial", expiresAtIso: "2026-10-01", usedInPanelIds: ["p1"] },
      ],
    });
    const scan = scanOvernightEpisodeDefects(ep);
    expect(scan.countsByClass["rights-bom-unverified-asset"]).toBe(4);
    expect(scan.hardBlockerCount).toBe(4);
    expect(scan.exportReady).toBe(false);
  });

  it("23. Fail-Closed: 안전한 자동 복구가 모두 성공해도 Rights BOM 만료 블로커가 있으면 exportReady=false를 유지한다", () => {
    const master = withSinglePanelLayers(
      [...makeBaseLayers(), { layerId: "p1-rough", name: "러프 레이어", role: "rough-draft", visible: true, opacity: 0.5, blendMode: "normal" }],
      {
        rightsBomAssets: [
          { assetId: "bg-castle-3d", assetName: "유럽 성곽 3D 배경", assetType: "3d-background", licenseStatus: "expired", expiresAtIso: "2026-09-30", usedInPanelIds: ["p1"] },
        ],
      },
    );
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.appliedPatchCount).toBe(1);
    expect(run.afterScan.hardBlockerCount).toBe(1);
    expect(run.exportReady).toBe(false);
    expect(run.masterUnmutated).toBe(true);
  });

  it("24. 아침 결정 재구성: 전체 수락 시 스테이징 해시와 일치하고, 전체 되돌림 시 원본 해시와 일치한다", () => {
    const master = withSinglePanelLayers(
      [...makeBaseLayers(createInkFramedCelTile([[6, 6], [7, 6]])), { layerId: "p1-rough", name: "러프", role: "rough-draft", visible: true, opacity: 0.5, blendMode: "normal" }],
      { speechBalloons: [{ balloonId: "b1", panelId: "p1", bbox: { x: 640, y: 90, width: 200, height: 80 }, text: "이동 대상", minReadableFontPx: 14 }] },
    );
    const run = runOvernightSelfHealingPipeline(master);
    expect(run.appliedPatchCount).toBe(3);

    const acceptAll = applyMorningPatchDecisions(run, {});
    expect(acceptAll.finalStagingSha256).toBe(run.stagingSha256After);
    expect(acceptAll.exportReady).toBe(true);

    const revertMap: Record<string, "revert"> = {};
    for (const p of run.patches) revertMap[p.patchId] = "revert";
    const revertAll = applyMorningPatchDecisions(run, revertMap);
    expect(revertAll.finalStagingSha256).toBe(run.masterSha256Before);
    expect(revertAll.revertedPatchIds).toHaveLength(3);
    expect(revertAll.exportReady).toBe(false);
  });

  it("25. 아침 결정 선택 수락/되돌림: 핀홀·러프 숨김은 수락하고 말풍선 이동만 되돌리면 하이브리드 스테이징이 결정론적으로 복원된다", () => {
    const master = withSinglePanelLayers(
      [...makeBaseLayers(createInkFramedCelTile([[6, 6]])), { layerId: "p1-rough", name: "러프", role: "rough-draft", visible: true, opacity: 0.5, blendMode: "normal" }],
      { speechBalloons: [{ balloonId: "b1", panelId: "p1", bbox: { x: 640, y: 90, width: 200, height: 80 }, text: "되돌릴 말풍선", minReadableFontPx: 14 }] },
    );
    const run = runOvernightSelfHealingPipeline(master);
    const balloonPatch = run.patches.find((p) => p.defectClass === "speech-balloon-edge-clip");
    const decisions: Record<string, "accept" | "revert"> = { "unknown-patch-999": "revert" };
    if (balloonPatch) decisions[balloonPatch.patchId] = "revert";

    const applied = applyMorningPatchDecisions(run, decisions);
    expect(applied.acceptedPatchIds).toHaveLength(2);
    expect(applied.revertedPatchIds).toEqual(balloonPatch ? [balloonPatch.patchId] : []);
    expect(applied.unknownDecisionPatchIds).toEqual(["unknown-patch-999"]);
    const tile = applied.finalStagingSnapshot.panels[0]?.layers[1]?.rasterTile;
    expect(tile && getPixel(tile, 6, 6)).toEqual([240, 196, 152, 255]);
    expect(applied.finalStagingSnapshot.panels[0]?.layers[2]?.visible).toBe(false);
    expect(applied.finalStagingSnapshot.speechBalloons[0]?.bbox.x).toBe(640);
    expect(applied.exportReady).toBe(false);
  });

  it("26. 아침 결정에서 회귀 롤백된 패치에 accept를 넘겨도 강제 적용하지 않고 안전하게 롤백 상태를 유지한다", () => {
    const master = createCleanEpisode({
      speechBalloons: [{ balloonId: "b-clash", panelId: "p1", bbox: { x: 660, y: 260, width: 180, height: 90 }, text: "충돌", minReadableFontPx: 14 }],
      faceKeepOutBoxes: [{ boxId: "face-1", characterId: "char-a", panelId: "p1", bbox: { x: 520, y: 250, width: 130, height: 130 } }],
    });
    const run = runOvernightSelfHealingPipeline(master);
    const rbPatch = run.patches[0];
    expect(rbPatch?.status).toBe("AUTO_ROLLED_BACK_REGRESSION");
    const morning = applyMorningPatchDecisions(run, rbPatch ? { [rbPatch.patchId]: "accept" } : {});
    expect(morning.keptRolledBackPatchIds).toEqual(rbPatch ? [rbPatch.patchId] : []);
    expect(morning.acceptedPatchIds).toHaveLength(0);
    expect(morning.finalStagingSnapshot.speechBalloons[0]?.bbox.x).toBe(660);
    expect(morning.exportReady).toBe(false);
  });

  it("27. 아침 검토 SVG 트리아지 보드는 4대 필 배지·분할선 눈금자·XML 이스케이프를 포함하고 NaN/Infinity가 0건이다", () => {
    const run = runOvernightSelfHealingPipeline(
      createCleanEpisode({
        title: `42화 <script>"위험" & '특수'</script>`,
        canvasHeightPx: 2200,
        panels: [
          { panelId: "p1", sequenceIndex: 1, bounds: { x: 0, y: 40, width: 800, height: 960 }, layers: [] },
          { panelId: "p2", sequenceIndex: 2, bounds: { x: 0, y: 1120, width: 800, height: 960 }, layers: [] },
        ],
        speechBalloons: [],
        faceKeepOutBoxes: [],
      }),
    );
    const svg = renderOvernightQaTriageSvg(run);
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("AUTO-HEALED");
    expect(svg).toContain("REVIEW");
    expect(svg).toContain("BLOCKED");
    expect(svg).toContain("ROLLED-BACK");
    expect(svg).toContain("&lt;script&gt;&quot;위험&quot; &amp; &apos;특수&apos;&lt;/script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain("oklch(");
    expect(svg).toContain("1060px");

    const zeroSvg = renderOvernightQaTriageSvg(
      runOvernightSelfHealingPipeline(createCleanEpisode({ canvasHeightPx: 0, panels: [], speechBalloons: [], faceKeepOutBoxes: [] })),
    );
    expect(zeroSvg).not.toContain("NaN");
    expect(zeroSvg).not.toContain("Infinity");
  });

  it("28. 한국어 아침 브리핑은 자동 복구·회귀 롤백·작가 확인·Rights BOM 차단·원본 SHA-256을 자연스러운 문체로 요약한다", () => {
    const [ink, cel] = makeBaseLayers();
    const master = withSinglePanelLayers(
      [
        ...(ink ? [{ ...ink, colorProfile: "cmyk" as const }] : []),
        ...(cel ? [cel] : []),
        { layerId: "p1-rough", name: "러프 밑그림", role: "rough-draft", visible: true, opacity: 0.4, blendMode: "normal" },
      ],
      {
        speechBalloons: [{ balloonId: "b-rb", panelId: "p1", bbox: { x: 660, y: 260, width: 180, height: 90 }, text: "충돌 대사", minReadableFontPx: 14 }],
        faceKeepOutBoxes: [{ boxId: "face-1", characterId: "char-hana", panelId: "p1", bbox: { x: 520, y: 250, width: 130, height: 130 } }],
        rightsBomAssets: [{ assetId: "font-exp", assetName: "계약만료 명조체", assetType: "font", licenseStatus: "expired", usedInPanelIds: ["p1"] }],
      },
    );
    const run = runOvernightSelfHealingPipeline(master);
    const metrics = buildMorningQaTriageMetrics(run);
    const brief = summarizeMorningQaBriefKo(run);

    expect(metrics.autoHealedCount).toBe(1);
    expect(metrics.rolledBackCount).toBe(1);
    expect(metrics.reviewCount).toBe(1);
    expect(metrics.blockedCount).toBe(1);

    expect(brief).toContain("[아침 마감 브리핑]");
    expect(brief).toContain("출고 보류");
    expect(brief).toContain(run.masterSha256Before);
    expect(brief).toContain("야간 자동 복구 완료 (1건)");
    expect(brief).toContain("회귀 감지로 자동 되돌린 항목 (1건)");
    expect(brief).toContain("작가 확인 필요 항목 (1건)");
    expect(brief).toContain("출고 차단 항목 · Rights BOM / 치명 충돌 (1건)");
    expect(brief).toContain("계약만료 명조체");
    expect(brief).not.toContain("하는 것을 가능하게 합니다");
    expect(brief).not.toContain("직관적인 경험을 제공합니다");
    expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
  });
});
