import { describe, expect, it } from "vitest";

import {
  applyApprovedRepairPatches,
  applyTileXorRleDelta,
  auditEpisodeCutQuality,
  computeOklabDeltaE,
  computeTileCrc32,
  computeTileFnv1a32,
  computeWcagContrastRatio,
  encodeTileXorRleDelta,
  MIN_WCAG_AA_TEXT_CONTRAST_RATIO,
  projectCanonicalScreenSide,
  scheduleFoveatedTileSyncPackets,
  simulateHorizontalMirrorCutAppearance,
  STARVATION_GUARANTEE_AGE_FRAMES,
  TILE_PACKET_HEADER_BYTE_LENGTH,
  transitionRepairPatchApproval,
  verifyEpisodeModelSheetConsistency,
  WEBGPU_COLLAB_SUBTILE_BYTE_LENGTH,
  WEBGPU_COLLAB_SUBTILE_SIZE_PX,
  type CharacterCutAppearance,
  type CharacterModelSheetSpec,
  type CutSpeechBalloon,
  type DirtyTileSyncCandidate,
  type EpisodeCutAuditTarget,
} from "./index";

function makeSolidTile(r: number, g: number, b: number, a = 255): Uint8Array {
  const buf = new Uint8Array(WEBGPU_COLLAB_SUBTILE_BYTE_LENGTH);
  for (let p = 0; p < WEBGPU_COLLAB_SUBTILE_SIZE_PX * WEBGPU_COLLAB_SUBTILE_SIZE_PX; p += 1) {
    const idx = p * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }
  return buf;
}

function makeNoisyTile(seed: number): Uint8Array {
  const buf = new Uint8Array(WEBGPU_COLLAB_SUBTILE_BYTE_LENGTH);
  let state = seed >>> 0;
  for (let i = 0; i < buf.byteLength; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    buf[i] = (state >>> 16) & 0xff;
  }
  return buf;
}

function makeBalloon(overrides: Partial<CutSpeechBalloon> = {}): CutSpeechBalloon {
  return {
    balloonId: "bal-1",
    attributedSpeakerId: "char-haerin",
    bounds: { x: 80, y: 60, width: 220, height: 110 },
    tailTip: { x: 285, y: 262 },
    tailStyle: "pointed",
    text: "오늘 마감 전에 이 컷부터 맞춰 보자.",
    textSrgb: { r: 22, g: 24, b: 28 },
    fillSrgb: { r: 252, g: 251, b: 248 },
    ...overrides,
  };
}

function makeCut(overrides: Partial<EpisodeCutAuditTarget> = {}): EpisodeCutAuditTarget {
  return {
    cutId: "cut-01",
    cutOrder: 1,
    panelBounds: { x: 0, y: 0, width: 800, height: 1000 },
    characters: [
      { characterId: "char-haerin", nameKo: "해린", mouthPosition: { x: 300, y: 280 }, bodyBounds: { x: 220, y: 180, width: 160, height: 520 }, zOrder: 1 },
      { characterId: "char-dohyun", nameKo: "도현", mouthPosition: { x: 600, y: 310 }, bodyBounds: { x: 520, y: 190, width: 170, height: 540 }, zOrder: 2 },
    ],
    balloons: [makeBalloon()],
    ...overrides,
  };
}

function makeHeroSheet(): CharacterModelSheetSpec {
  return {
    characterId: "char-haerin",
    nameKo: "해린",
    asymmetricFeatures: [
      { featureId: "left-eye-mole", kind: "mole", labelKo: "왼쪽 눈 밑 눈물점", anatomicalSide: "left" },
      { featureId: "right-cheek-scar", kind: "scar", labelKo: "오른쪽 뺨 흉터", anatomicalSide: "right" },
      { featureId: "left-hair-parting", kind: "hair-parting", labelKo: "왼쪽 가르마", anatomicalSide: "left", occludedOnOppositeProfile: false },
    ],
    outfitColorSlots: [
      { slotId: "coat-navy", labelKo: "남색 롱코트", canonicalSrgb: { r: 34, g: 49, b: 78 }, maxOklabDeltaE: 0.045 },
      { slotId: "scarf-burgundy", labelKo: "버건디 머플러", canonicalSrgb: { r: 138, g: 38, b: 52 }, maxOklabDeltaE: 0.045 },
    ],
    requiredAccessories: [
      { accessoryId: "silver-earcuff", labelKo: "은색 이어커프" },
      { accessoryId: "front-brooch", labelKo: "정면 브로치", allowRearViewOcclusion: true },
    ],
    proportionBounds: { minHeadToBodyRatio: 0.125, maxHeadToBodyRatio: 0.165 },
  };
}

function makeAppearance(overrides: Partial<CharacterCutAppearance> = {}): CharacterCutAppearance {
  return {
    cutId: "cut-01",
    cutOrder: 1,
    characterId: "char-haerin",
    cameraYawDeg: 0,
    observedAsymmetricFeatures: [
      { featureId: "left-eye-mole", observedScreenSide: "right" },
      { featureId: "right-cheek-scar", observedScreenSide: "left" },
      { featureId: "left-hair-parting", observedScreenSide: "right" },
    ],
    observedOutfitColors: [
      { slotId: "coat-navy", observedSrgb: { r: 35, g: 50, b: 79 } },
      { slotId: "scarf-burgundy", observedSrgb: { r: 136, g: 39, b: 53 } },
    ],
    presentAccessoryIds: ["silver-earcuff", "front-brooch"],
    headHeightPx: 72,
    bodyHeightPx: 504,
    ...overrides,
  };
}

describe("wasm64-wave37-collab-webgpu-agent-fabric", () => {
  it("1. 64×64 서브타일의 국소 브러시 차분을 XOR+바이트평면 RLE로 고압축하고 무손실 복원한다", () => {
    const baseTile = makeSolidTile(246, 244, 238, 255);
    const currentTile = baseTile.slice();
    for (let y = 18; y < 30; y += 1) {
      for (let x = 20; x < 30; x += 1) {
        const idx = (y * 64 + x) * 4;
        currentTile.set([35, 68, 112, 255], idx);
      }
    }

    const delta = encodeTileXorRleDelta(currentTile, baseTile);
    expect(delta.encoding).toBe("xor-byteplane-rle");
    expect(delta.changedPixelCount).toBe(120);
    expect(delta.compressionRatio).toBeLessThan(0.08);

    const applied = applyTileXorRleDelta(delta, baseTile);
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.rgbaBytes).toEqual(currentTile);
      expect(applied.verifiedCrc32).toBe(computeTileCrc32(currentTile));
      expect(applied.verifiedFnv1a32).toBe(computeTileFnv1a32(currentTile));
    }
  });

  it("2. 압축 불가능한 고엔트로피 노이즈 타일은 원본 RGBA8 폴백으로 전환하고 무손실 복원한다", () => {
    const baseTile = makeNoisyTile(0x13579bdf);
    const noisyTarget = makeNoisyTile(0x2468ace1);
    const delta = encodeTileXorRleDelta(noisyTarget, baseTile);
    expect(delta.encoding).toBe("raw-rgba8");
    expect(delta.payloadBytes.byteLength).toBe(WEBGPU_COLLAB_SUBTILE_BYTE_LENGTH);

    const applied = applyTileXorRleDelta(delta, baseTile);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.rgbaBytes).toEqual(noisyTarget);
  });

  it("3. 기준 타일 없이 처음 전송하는 키프레임 타일도 바이트평면 RLE로 압축·복원한다", () => {
    const keyframeTile = makeSolidTile(250, 248, 242, 255);
    const delta = encodeTileXorRleDelta(keyframeTile, null);
    expect(delta.hasBaseline).toBe(false);
    expect(delta.encoding).toBe("xor-byteplane-rle");
    expect(delta.payloadBytes.byteLength).toBeLessThan(64);

    const applied = applyTileXorRleDelta(delta, null);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.rgbaBytes).toEqual(keyframeTile);
  });

  it("4. 기준 CRC32 불일치, 목표 CRC32·FNV-1a 위변조, RLE 스트림 절단을 모두 거부한다", () => {
    const baseTile = makeSolidTile(240, 240, 240, 255);
    const nextTile = baseTile.slice();
    nextTile[0] = 12;
    const delta = encodeTileXorRleDelta(nextTile, baseTile);

    const wrongBase = baseTile.slice();
    wrongBase[100] = 99;
    expect(applyTileXorRleDelta(delta, wrongBase)).toMatchObject({ ok: false, reason: "base-digest-mismatch" });
    expect(applyTileXorRleDelta(delta, null)).toMatchObject({ ok: false, reason: "missing-baseline" });
    expect(applyTileXorRleDelta({ ...delta, targetFnv1a32: (delta.targetFnv1a32 ^ 0xff00ff) >>> 0 }, baseTile)).toMatchObject({
      ok: false,
      reason: "target-digest-mismatch",
    });
    expect(applyTileXorRleDelta({ ...delta, targetCrc32: (delta.targetCrc32 ^ 0xffff) >>> 0 }, baseTile)).toMatchObject({
      ok: false,
      reason: "target-digest-mismatch",
    });
    expect(applyTileXorRleDelta({ ...delta, payloadBytes: delta.payloadBytes.subarray(0, 1) }, baseTile)).toMatchObject({
      ok: false,
      reason: "corrupt-rle-stream",
    });
  });

  it("5. 프레임 바이트 상한 안에서 협업자의 활성 시선 초점에 가장 가까운 타일을 우선 배정한다", () => {
    const baseTile = makeSolidTile(255, 255, 255, 255);
    const makeCandidate = (tileId: string, tileX: number, tileY: number): DirtyTileSyncCandidate => {
      const modified = baseTile.slice();
      for (let i = 0; i < 600; i += 1) modified[i * 4] = (i * 37 + tileX * 13) & 0xff;
      return { tileId, layerId: "layer-ink", tileX, tileY, delta: encodeTileXorRleDelta(modified, baseTile), ageFrames: 0 };
    };

    const farTile = makeCandidate("tile-far", 20, 20);
    const midTile = makeCandidate("tile-mid", 6, 6);
    const foveaTile = makeCandidate("tile-fovea", 1, 1);
    const budget =
      TILE_PACKET_HEADER_BYTE_LENGTH * 2
      + foveaTile.delta.payloadBytes.byteLength
      + midTile.delta.payloadBytes.byteLength;

    const schedule = scheduleFoveatedTileSyncPackets({
      candidates: [farTile, midTile, foveaTile],
      collaboratorFocalPoints: [{ peerId: "peer-b", focusX: 96, focusY: 96 }],
      maxBytesPerFrame: budget,
    });

    expect(schedule.scheduledPackets.map((p) => p.tileId)).toEqual(["tile-fovea", "tile-mid"]);
    expect(schedule.totalScheduledBytes).toBeLessThanOrEqual(budget);
    expect(schedule.deferredTiles.map((d) => d.tileId)).toEqual(["tile-far"]);
    expect(schedule.deferredTiles[0]?.nextAgeFrames).toBe(1);
  });

  it("6. 시선 외곽 주변부 타일도 대기 프레임이 누적되면 노화 부스트로 기아 없이 최우선 전송된다", () => {
    const baseTile = makeSolidTile(255, 255, 255, 255);
    const painted = baseTile.slice();
    painted[0] = 20;
    const delta = encodeTileXorRleDelta(painted, baseTile);
    const singlePacketCap = TILE_PACKET_HEADER_BYTE_LENGTH + delta.payloadBytes.byteLength;

    const schedule = scheduleFoveatedTileSyncPackets({
      candidates: [
        { tileId: "tile-center-fresh", layerId: "l1", tileX: 1, tileY: 1, delta, ageFrames: 0 },
        { tileId: "tile-edge-starving", layerId: "l1", tileX: 45, tileY: 45, delta, ageFrames: STARVATION_GUARANTEE_AGE_FRAMES },
      ],
      collaboratorFocalPoints: [{ peerId: "peer-1", focusX: 96, focusY: 96 }],
      maxBytesPerFrame: singlePacketCap,
    });

    expect(schedule.scheduledPackets.map((p) => p.tileId)).toEqual(["tile-edge-starving"]);
    expect(schedule.scheduledPackets[0]?.starvationBoosted).toBe(true);
    expect(schedule.deferredTiles[0]?.tileId).toBe("tile-center-fresh");
  });

  it("7. 변경된 픽셀이 없는 기준선 타일은 패킷 대역폭을 소모하지 않고 건너뛴다", () => {
    const baseTile = makeSolidTile(220, 220, 225, 255);
    const schedule = scheduleFoveatedTileSyncPackets({
      candidates: [{ tileId: "tile-clean", layerId: "l1", tileX: 0, tileY: 0, delta: encodeTileXorRleDelta(baseTile.slice(), baseTile), ageFrames: 2 }],
      collaboratorFocalPoints: [{ peerId: "peer-1", focusX: 32, focusY: 32 }],
      maxBytesPerFrame: 4096,
    });
    expect(schedule.scheduledPackets).toHaveLength(0);
    expect(schedule.skippedUnchangedTileIds).toEqual(["tile-clean"]);
  });

  it("8. 래스터 격자와 경계 샘플에서 1~2px 미채색 실틈만 검출하고 3px 이상 여백은 오탐하지 않는다", () => {
    const cut = makeCut({
      celRasterGrid: { width: 8, height: 1, inkMask: Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1]), fillRegionIds: [0, 0, 0, 2, 0, 0, 0, 0] },
      celBoundarySeams: [
        { seamId: "seam-narrow", position: { x: 120, y: 240 }, uncoloredGapWidthPx: 1.5, adjacentFillRegionId: 3, hasInkBoundary: true },
        { seamId: "seam-open", position: { x: 400, y: 500 }, uncoloredGapWidthPx: 5, adjacentFillRegionId: 3, hasInkBoundary: true },
      ],
    });
    const sliverFindings = auditEpisodeCutQuality([cut]).findings.filter((f) => f.kind === "sliver-halo");
    expect(sliverFindings).toHaveLength(1);
    expect(sliverFindings[0]?.measuredValue).toBe(3);
  });

  it("9. 말풍선 꼬리가 다른 캐릭터 입에 더 가깝거나 전경 캐릭터에 가려지면 speaker-tail-mismatch를 검출한다", () => {
    const misdirected = makeCut({
      cutId: "cut-wrong",
      balloons: [makeBalloon({ balloonId: "bal-wrong", bounds: { x: 430, y: 70, width: 210, height: 100 }, tailTip: { x: 590, y: 295 } })],
    });
    const occluded = makeCut({
      cutId: "cut-occ",
      cutOrder: 2,
      balloons: [makeBalloon({ balloonId: "bal-occ", bounds: { x: 640, y: 220, width: 140, height: 90 }, tailTip: { x: 580, y: 280 } })],
    });
    const tailFindings = auditEpisodeCutQuality([misdirected, occluded]).findings.filter((f) => f.kind === "speaker-tail-mismatch");
    expect(tailFindings.map((f) => f.targetId)).toEqual(["bal-wrong", "bal-occ"]);
  });

  it("10. 말풍선 대사 명도 대비비가 4.5:1 미만이면 low-text-contrast를 검출하고 AA 기준 이상 색상을 제안한다", () => {
    const paleFill = { r: 248, g: 248, b: 250 };
    const cut = makeCut({ balloons: [makeBalloon({ balloonId: "bal-pale", textSrgb: { r: 165, g: 168, b: 172 }, fillSrgb: paleFill })] });
    const report = auditEpisodeCutQuality([cut]);
    const patch = report.repairPatches.find((p) => p.issueKind === "low-text-contrast");
    expect(patch?.selfVerified).toBe(true);
    if (patch?.operation.opKind === "rebalance-text-contrast") {
      expect(computeWcagContrastRatio(patch.operation.suggestedTextSrgb, paleFill)).toBeGreaterThanOrEqual(MIN_WCAG_AA_TEXT_CONTRAST_RATIO);
    }
  });

  it("11. 컷 테두리에 0~3px 간격으로 스치는 요소는 panel-tangent-collision으로 잡고 의도적 블리드는 허용한다", () => {
    const cut = makeCut({
      balloons: [makeBalloon({ balloonId: "bal-grazing", bounds: { x: 2, y: 60, width: 220, height: 110 }, tailTip: { x: 260, y: 250 } })],
      foregroundElements: [
        { elementId: "elem-bleed", labelKo: "집중선", bounds: { x: -24, y: 0, width: 300, height: 240 }, intentionalBleed: true },
        { elementId: "elem-grazing", labelKo: "테이블 소품", bounds: { x: 649, y: 720, width: 150, height: 120 } },
      ],
    });
    const targets = auditEpisodeCutQuality([cut]).findings.filter((f) => f.kind === "panel-tangent-collision").map((f) => f.targetId);
    expect(targets).toEqual(["bal-grazing", "elem-grazing"]);
  });

  it("12. 비파괴 복구 플래너는 승인(accepted) 패치만 적용하고 거절(rejected) 컷과 원본 입력은 보존한다", () => {
    const cutA = makeCut({
      cutId: "cut-approve",
      celRasterGrid: { width: 5, height: 1, inkMask: Uint8Array.from([1, 0, 0, 0, 0]), fillRegionIds: [0, 0, 0, 4, 4] },
      balloons: [makeBalloon({ balloonId: "bal-a", bounds: { x: 1, y: 60, width: 220, height: 110 }, textSrgb: { r: 170, g: 170, b: 170 } })],
    });
    const cutB = makeCut({
      cutId: "cut-reject",
      cutOrder: 2,
      balloons: [makeBalloon({ balloonId: "bal-b", textSrgb: { r: 160, g: 160, b: 165 } })],
    });

    const snapshotBefore = structuredClone([cutA, cutB]);
    const audit = auditEpisodeCutQuality([cutA, cutB]);
    const decisions = audit.repairPatches.map((p) => ({
      patchId: p.patchId,
      decision: p.cutId === "cut-approve" ? ("accepted" as const) : ("rejected" as const),
      authorId: "artist-lead",
    }));

    expect(transitionRepairPatchApproval(audit.repairPatches, decisions).filter((p) => p.approvalState === "accepted")).toHaveLength(3);
    const applied = applyApprovedRepairPatches([cutA, cutB], audit.repairPatches, decisions);
    expect([cutA, cutB]).toEqual(snapshotBefore);
    expect(applied.cuts[1]).toBe(cutB);
    expect(applied.mutatedCutIds).toEqual(["cut-approve"]);
    expect(applied.postRepairFindingCount).toBe(1);
  });

  it("13. 정면(yaw=0°)과 후면(yaw=180°) 카메라 회전 시 비대칭 표식의 기대 화면 좌우 전환을 정확히 판정한다", () => {
    const front = makeAppearance({ cutId: "cut-front", cutOrder: 1, cameraYawDeg: 0 });
    const rear = makeAppearance({
      cutId: "cut-rear",
      cutOrder: 2,
      cameraYawDeg: 180,
      observedAsymmetricFeatures: [{ featureId: "left-hair-parting", observedScreenSide: "left" }],
      presentAccessoryIds: ["silver-earcuff"],
    });
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [front, rear] });
    expect(report.consistent).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("14. 레이어 좌우 반전(mirror-flip)으로 비대칭 점·흉터·가르마가 뒤집힌 컷을 즉시 적발한다", () => {
    const mirrored = simulateHorizontalMirrorCutAppearance(makeAppearance({ cutId: "cut-03", cameraYawDeg: 28 }));
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [mirrored] });
    expect(report.consistent).toBe(false);
    expect(report.violations).toHaveLength(3);
    expect(report.violations.every((v) => v.kind === "asymmetric-mark-side-mismatch" && v.suspectedMirrorFlip)).toBe(true);
  });

  it("15. 좌우 반전 플래그가 없어도 모든 비대칭 표식이 반대로 그려지면 mirror-flip 의심 경고를 올린다", () => {
    const handFlipped = makeAppearance({
      cutId: "cut-04",
      horizontalMirrorApplied: false,
      observedAsymmetricFeatures: [
        { featureId: "left-eye-mole", observedScreenSide: "left" },
        { featureId: "right-cheek-scar", observedScreenSide: "right" },
      ],
      fullBodyFramed: false,
    });
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [handFlipped] });
    expect(report.violations).toHaveLength(2);
    expect(report.violations[0]?.suspectedMirrorFlip).toBe(true);
  });

  it("16. 정측면 프로필(yaw=+90°)에서 반대편 뺨의 흉터가 노출되면 차폐 위반으로 검출한다", () => {
    expect(projectCanonicalScreenSide("right", 90, true).occludedByOppositeProfile).toBe(true);
    const profileCut = makeAppearance({
      cutId: "cut-profile",
      cameraYawDeg: 90,
      observedAsymmetricFeatures: [
        { featureId: "left-eye-mole", observedScreenSide: "right" },
        { featureId: "right-cheek-scar", observedScreenSide: "left" },
      ],
      fullBodyFramed: false,
    });
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [profileCut] });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.kind).toBe("asymmetric-mark-occluded-in-profile");
  });

  it("17. 의상 색상의 OKLab 지각 색차(deltaE)가 허용치를 넘으면 outfit-color-drift를 검출한다", () => {
    const driftedNavy = { r: 78, g: 112, b: 168 };
    const deltaE = computeOklabDeltaE({ r: 34, g: 49, b: 78 }, driftedNavy);
    expect(deltaE).toBeGreaterThan(0.045);

    const cut = makeAppearance({
      cutId: "cut-drift",
      observedAsymmetricFeatures: [],
      observedOutfitColors: [{ slotId: "coat-navy", observedSrgb: driftedNavy }],
      fullBodyFramed: false,
    });
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [cut] });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.kind).toBe("outfit-color-drift");
    expect(report.characterSummaries[0]?.maxObservedOutfitDeltaE).toBeCloseTo(deltaE, 5);
  });

  it("18. 정면 컷에서 필수 소품이 빠지면 missing-required-accessory 위반을 보고한다", () => {
    const cut = makeAppearance({ cutId: "cut-acc", cameraYawDeg: 15, observedAsymmetricFeatures: [], presentAccessoryIds: ["silver-earcuff"], fullBodyFramed: false });
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [cut] });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.kind).toBe("missing-required-accessory");
    expect(report.violations[0]?.targetId).toBe("front-brooch");
  });

  it("19. 전신 컷 두신비가 설정집 상·하한을 벗어나면 proportion-out-of-bounds를 검출하고 클로즈업은 면제한다", () => {
    const badFullBody = makeAppearance({ cutId: "cut-prop", observedAsymmetricFeatures: [], headHeightPx: 120, bodyHeightPx: 480, fullBodyFramed: true });
    const okCloseup = makeAppearance({ cutId: "cut-close", cutOrder: 2, observedAsymmetricFeatures: [], headHeightPx: 180, bodyHeightPx: 300, fullBodyFramed: false });
    const report = verifyEpisodeModelSheetConsistency({ modelSheets: [makeHeroSheet()], cutAppearances: [badFullBody, okCloseup] });
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.kind).toBe("proportion-out-of-bounds");
  });

  it("20. 단일 패킷이 프레임 바이트 상한보다 크면 packet-exceeds-frame-cap 사유로 이월하고 후속 소형 타일은 전송한다", () => {
    const rawDelta = encodeTileXorRleDelta(makeNoisyTile(0x99887766), null);
    const smallDelta = encodeTileXorRleDelta(makeSolidTile(120, 140, 160, 255), null);
    const schedule = scheduleFoveatedTileSyncPackets({
      candidates: [
        { tileId: "tile-oversized", layerId: "bg", tileX: 0, tileY: 0, delta: rawDelta, ageFrames: 2 },
        { tileId: "tile-compact", layerId: "bg", tileX: 1, tileY: 0, delta: smallDelta, ageFrames: 0 },
      ],
      collaboratorFocalPoints: [{ peerId: "peer-a", focusX: 16, focusY: 16 }],
      maxBytesPerFrame: 2048,
    });
    expect(schedule.scheduledPackets.map((p) => p.tileId)).toEqual(["tile-compact"]);
    expect(schedule.deferredTiles[0]?.reason).toBe("packet-exceeds-frame-cap");
  });

  it("21. 인접 말풍선끼리 0~3px 간격으로 스치는 형제 말풍선 접선 충돌도 검출해 간격을 벌린다", () => {
    const cut = makeCut({
      balloons: [
        makeBalloon({ balloonId: "bal-left", bounds: { x: 80, y: 80, width: 180, height: 100 } }),
        makeBalloon({ balloonId: "bal-right", attributedSpeakerId: "char-dohyun", bounds: { x: 262, y: 90, width: 180, height: 100 }, tailTip: { x: 585, y: 295 } }),
      ],
    });
    const audit = auditEpisodeCutQuality([cut]);
    expect(audit.repairPatches.some((p) => p.issueKind === "panel-tangent-collision")).toBe(true);
    const decisions = audit.repairPatches.map((p) => ({ patchId: p.patchId, decision: "accepted" as const, authorId: "artist-lead" }));
    expect(applyApprovedRepairPatches([cut], audit.repairPatches, decisions).postRepairFindingCount).toBe(0);
  });
});
