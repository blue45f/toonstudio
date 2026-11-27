import { describe, expect, it } from "vitest";

import {
  CreatorAssetVersionDag,
  applyContinuityProposalsPreview,
  auditEpisodeContinuity,
  camera3dToCutPerspective2d,
  canonicalizeStructure,
  compareSemVer,
  computeCiede2000FromOklab,
  computeFnv1a64Hex,
  computeOklabDistance,
  cutPerspective2dToCamera3d,
  focalLengthMmToVerticalFovDeg,
  formatOklchCss,
  harmonizeCharacterPaletteWithKeyLight,
  horizontalFovToVerticalFovDeg,
  linearSrgbToOklab,
  linearSrgbToSrgb,
  normalizeBrushStampTexture,
  oklabToLinearSrgb,
  oklabToOklch,
  oklabToSrgb,
  oklchToOklab,
  srgbToLinearSrgb,
  srgbToOklab,
  transcodeWorkspaceAsset,
  verticalFovDegToFocalLengthMm,
  verticalFovToHorizontalFovDeg,
  type AssetRightsRecord,
  type CharacterReferenceSheet,
  type EpisodeContinuityDocument,
  type SrgbColor,
} from "./index";

const COMMERCIAL_CLEAN_RIGHTS: AssetRightsRecord = {
  licenseId: "ToonStudio-Commercial-1.0",
  rightsholder: "스튜디오 아틀리에",
  commercialUse: "allowed",
  attributionRequired: false,
};

function createHeroReferenceSheet(): CharacterReferenceSheet {
  return {
    characterId: "char-haru",
    characterNameKo: "하루",
    parts: {
      hair: { partId: "hair", partLabelKo: "머리칼", referenceOklab: srgbToOklab({ r: 0.16, g: 0.19, b: 0.28 }) },
      jacket: { partId: "jacket", partLabelKo: "교복 자켓", referenceOklab: srgbToOklab({ r: 0.72, g: 0.21, b: 0.24 }) },
      eyes: { partId: "eyes", partLabelKo: "눈동자", referenceOklab: srgbToOklab({ r: 0.18, g: 0.56, b: 0.52 }) },
    },
  };
}

describe("wasm64-wave34-asset-version-ai-assist", () => {
  // 1. 워크스페이스 간 에셋 변환 파이프라인 (8 tests)
  it("1. sRGB ↔ Linear sRGB ↔ Oklab ↔ OKLCH 색공간 전 구간 왕복 오차가 1e-6 미만이다", () => {
    const samples: readonly SrgbColor[] = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 0.02, g: 0.031, b: 0.04 },
      { r: 0.88, g: 0.24, b: 0.31 },
      { r: 0.15, g: 0.67, b: 0.82 },
      { r: 0.94, g: 0.85, b: 0.62 },
    ];
    for (const sample of samples) {
      const linear = srgbToLinearSrgb(sample);
      const backLin = linearSrgbToSrgb(linear);
      expect(Math.abs(backLin.r - sample.r)).toBeLessThan(1e-12);
      expect(Math.abs(backLin.g - sample.g)).toBeLessThan(1e-12);
      expect(Math.abs(backLin.b - sample.b)).toBeLessThan(1e-12);

      const lch = oklabToOklch(linearSrgbToOklab(linear));
      const backSrgb = linearSrgbToSrgb(oklabToLinearSrgb(oklchToOklab(lch)));
      expect(Math.abs(backSrgb.r - sample.r)).toBeLessThan(1e-6);
      expect(Math.abs(backSrgb.g - sample.g)).toBeLessThan(1e-6);
      expect(Math.abs(backSrgb.b - sample.b)).toBeLessThan(1e-6);
      expect(formatOklchCss(lch).startsWith("oklch(")).toBe(true);
    }
  });

  it("2. 캐릭터 팔레트·조명 키라이트 정합이 선형 광량을 반영하고 Oklab 색상각 보존으로 탁해짐을 막는다", () => {
    const harmonized = harmonizeCharacterPaletteWithKeyLight(
      [
        { slotId: "coat", partLabelKo: "트렌치코트", albedoSrgb: { r: 0.82, g: 0.22, b: 0.26 } },
        { slotId: "skin", partLabelKo: "피부 톤", albedoSrgb: { r: 0.95, g: 0.83, b: 0.76 } },
      ],
      {
        keyLightSrgb: { r: 1, g: 0.94, b: 0.86 },
        keyIntensity: 0.9,
        exposureEv: 0.15,
        ambientSrgb: { r: 0.35, g: 0.45, b: 0.72 },
        ambientStrength: 0.25,
        preservePerceptualHue: 0.8,
      },
    );
    expect(harmonized).toHaveLength(2);
    const coat = harmonized[0]!;
    expect(coat.roundtripMaxChannelError).toBeLessThan(1e-6);
    const baseLab = srgbToOklab(coat.celBaseSrgb);
    const shadowLab = srgbToOklab(coat.celShadowSrgb);
    const highlightLab = srgbToOklab(coat.celHighlightSrgb);
    expect(shadowLab.l).toBeLessThan(baseLab.l);
    expect(highlightLab.l).toBeGreaterThan(baseLab.l);
    expect(Math.hypot(shadowLab.a, shadowLab.b)).toBeGreaterThan(0.08);
    expect(coat.celBaseCssOklch.startsWith("oklch(")).toBe(true);
  });

  it("3. 브러시 스탬프 정규화 시 Premultiplied Edge Bleed로 투명 배경의 검은 테두리 해일로를 제거한다", () => {
    const width = 16;
    const height = 16;
    const rgba = new Float32Array(width * height * 4);
    const coralFg: SrgbColor = { r: 0.92, g: 0.38, b: 0.24 };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (Math.hypot(x - 7.5, y - 7.5) <= 4.5) {
          const b = (y * width + x) * 4;
          rgba[b] = coralFg.r;
          rgba[b + 1] = coralFg.g;
          rgba[b + 2] = coralFg.b;
          rgba[b + 3] = 1;
        }
      }
    }
    const res = normalizeBrushStampTexture(
      { width, height, rgba },
      { targetWidth: 24, targetHeight: 24, filter: "bilinear", expectedForegroundSrgb: coralFg },
    );
    expect(res.width).toBe(24);
    expect(res.haloContaminationRms).toBeLessThan(0.005);
  });

  it("4. Lanczos2 다운샘플링 시 링잉 오버슈트를 [0, alpha]로 봉쇄하여 음수·초과 알파 없이 수렴한다", () => {
    const width = 32;
    const height = 32;
    const rgba = new Float32Array(width * height * 4);
    const tealFg: SrgbColor = { r: 0.14, g: 0.78, b: 0.71 };
    for (let y = 6; y < 26; y += 1) {
      for (let x = 6; x < 26; x += 1) {
        const b = (y * width + x) * 4;
        rgba[b] = tealFg.r;
        rgba[b + 1] = tealFg.g;
        rgba[b + 2] = tealFg.b;
        rgba[b + 3] = 1;
      }
    }
    const downsampled = normalizeBrushStampTexture(
      { width, height, rgba },
      { targetWidth: 12, targetHeight: 12, filter: "lanczos2", expectedForegroundSrgb: tealFg },
    );
    expect(downsampled.haloContaminationRms).toBeLessThan(0.008);
    for (let i = 0; i < downsampled.rgba.length; i += 1) {
      expect(downsampled.rgba[i]!).toBeGreaterThanOrEqual(0);
      expect(downsampled.rgba[i]!).toBeLessThanOrEqual(1);
    }
  });

  it("5. 3D 카메라 수직·수평 FOV 및 35mm 환산 초점거리가 정밀하게 상호 역변환된다", () => {
    const vFov = focalLengthMmToVerticalFovDeg(35, 24);
    expect(verticalFovDegToFocalLengthMm(vFov, 24)).toBeCloseTo(35, 9);
    const hFov = verticalFovToHorizontalFovDeg(vFov, 16 / 9);
    expect(horizontalFovToVerticalFovDeg(hFov, 16 / 9)).toBeCloseTo(vFov, 9);
  });

  it("6. 3D 카메라 ↔ 2D 컷 1점·2점·3점 투시 소실점 및 호라이즌 회전(Roll) 왕복 오차가 1e-6° 미만이다", () => {
    const cases = [
      { mode: "1-point", verticalFovDeg: 42, yawDeg: 0, pitchDeg: 0, rollDeg: 6 },
      { mode: "2-point", verticalFovDeg: 50, yawDeg: 32, pitchDeg: 0, rollDeg: -8.5 },
      { mode: "3-point", verticalFovDeg: 58, yawDeg: -27, pitchDeg: 19, rollDeg: 11 },
    ] as const;
    for (const c of cases) {
      const guide = camera3dToCutPerspective2d(
        { verticalFovDeg: c.verticalFovDeg, aspectRatio: 1200 / 900, yawDeg: c.yawDeg, pitchDeg: c.pitchDeg, rollDeg: c.rollDeg },
        1200,
        900,
      );
      expect(guide.mode).toBe(c.mode);
      const recovered = cutPerspective2dToCamera3d(guide);
      expect(Math.abs(recovered.verticalFovDeg - c.verticalFovDeg)).toBeLessThan(1e-6);
      expect(Math.abs(recovered.yawDeg - c.yawDeg)).toBeLessThan(1e-6);
      expect(Math.abs(recovered.pitchDeg - c.pitchDeg)).toBeLessThan(1e-6);
      expect(Math.abs(recovered.rollDeg - c.rollDeg)).toBeLessThan(1e-6);
    }
  });

  it("7. 2점·3점 투시 소실점 쌍이 주점 기준 사영 직교성((VP_z - C)·(VP_x - C) = -f^2)을 정확히 만족한다", () => {
    const guide = camera3dToCutPerspective2d(
      { verticalFovDeg: 48, aspectRatio: 1.5, yawDeg: 36, pitchDeg: -14, rollDeg: 7 },
      1500,
      1000,
    );
    const { x: cx, y: cy } = guide.principalPointPx;
    const vpZ = guide.primaryVanishingPoint.pointPx!;
    const vpX = guide.secondaryVanishingPoint.pointPx!;
    const dot = (vpZ.x - cx) * (vpX.x - cx) + (vpZ.y - cy) * (vpX.y - cy);
    expect(dot).toBeCloseTo(-(guide.calibratedFocalLengthPx ** 2), 4);
  });

  it("8. transcodeWorkspaceAsset 통합 파이프라인이 팔레트·브러시·카메라 페이로드를 무손실 정합한다", () => {
    const paletteRes = transcodeWorkspaceAsset("character-shaper", "2d-canvas", {
      kind: "character-palette-rig",
      assetId: "hero-rig",
      slots: [{ slotId: "hair", partLabelKo: "머리카락", albedoSrgb: { r: 0.2, g: 0.3, b: 0.6 } }],
      keyLightRig: {
        keyLightSrgb: { r: 1, g: 1, b: 1 },
        keyIntensity: 0.85,
        exposureEv: 0,
        ambientSrgb: { r: 0.4, g: 0.45, b: 0.6 },
        ambientStrength: 0.2,
      },
    });
    expect(paletteRes.losslessVerified).toBe(true);

    const cameraRes = transcodeWorkspaceAsset("3d-stage", "2d-canvas", {
      kind: "scene-camera-cut",
      assetId: "alley-cut-04",
      cutWidthPx: 1080,
      cutHeightPx: 1440,
      camera3d: { verticalFovDeg: 52, aspectRatio: 0.75, yawDeg: -24, pitchDeg: 15, rollDeg: -4 },
    });
    expect(cameraRes.losslessVerified).toBe(true);
    expect(cameraRes.convertedPerspective2d?.mode).toBe("3-point");
  });

  // 2. 크리에이터 에셋 버전 DAG & Rights BOM 엔진 (8 tests)
  it("9. FNV-1a 64-bit 해시가 표준 벡터와 일치하고 속성 키 순서와 무관하게 동일한 콘텐츠 주소를 생성한다", () => {
    expect(computeFnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(computeFnv1a64Hex("foobar")).toBe("85944171f73967e8");
    expect(canonicalizeStructure({ z: 1, a: { d: true, c: "ok" }, zero: -0 })).toBe(
      canonicalizeStructure({ zero: 0, a: { c: "ok", d: true }, z: 1 }),
    );

    const dagA = new CreatorAssetVersionDag();
    const dagB = new CreatorAssetVersionDag();
    const s1 = dagA.commitSnapshot({
      assetId: "char-haru",
      kind: "character-sheet",
      semver: "1.0.0",
      authorId: "artist-a",
      createdAtIso: "2026-11-27T01:00:00Z",
      summaryKo: "초기 설정",
      attributes: { outfit: "winter", palette: { coat: "crimson", trim: "gold" } },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    const s2 = dagB.commitSnapshot({
      assetId: "char-haru",
      kind: "character-sheet",
      semver: "v1.0.0",
      authorId: "artist-b",
      createdAtIso: "2026-11-27T09:00:00Z",
      summaryKo: "동일 콘텐츠",
      attributes: { palette: { trim: "gold", coat: "crimson" }, outfit: "winter" },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    expect(s1.contentAddress).toBe(s2.contentAddress);
  });

  it("10. 커밋된 스냅샷은 런타임에 깊이 동결(Object.freeze)되며 동일 버전 재정의 변조를 거부한다", () => {
    const dag = new CreatorAssetVersionDag();
    const snap = dag.commitSnapshot({
      assetId: "brush-ink-gpen",
      kind: "custom-brush-pack",
      semver: "1.0.0",
      authorId: "creator-1",
      createdAtIso: "2026-11-27T02:00:00Z",
      summaryKo: "G펜 기본값",
      attributes: { stabilization: 14, tipCurve: [0, 0.4, 1] },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.attributes)).toBe(true);
    expect(() => {
      (snap.attributes as Record<string, unknown>).stabilization = 99;
    }).toThrow();

    expect(() =>
      dag.commitSnapshot({
        assetId: "brush-ink-gpen",
        kind: "custom-brush-pack",
        semver: "1.0.0",
        authorId: "creator-1",
        createdAtIso: "2026-11-27T03:00:00Z",
        summaryKo: "덮어쓰기 시도",
        attributes: { stabilization: 99, tipCurve: [0, 0.4, 1] },
        rights: COMMERCIAL_CLEAN_RIGHTS,
      }),
    ).toThrow(/잠겨 있습니다/);
  });

  it("11. 팀원이 캐릭터 의상을 v2.0.0으로 갱신해도 마감된 ep-001은 v1.0.0을 유지하고 신규 ep-002만 마이그레이션한다", () => {
    const dag = new CreatorAssetVersionDag();
    const v1 = dag.commitSnapshot({
      assetId: "char-haru",
      kind: "character-sheet",
      semver: "1.0.0",
      authorId: "lead",
      createdAtIso: "2026-11-01T00:00:00Z",
      summaryKo: "1부 교복",
      attributes: { costume: "school-uniform-v1" },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    const ep1Lock = dag.createEpisodeLockfile("ep-001", [{ assetId: "char-haru", semver: "1.0.0" }], "locked-published", "2026-11-05T00:00:00Z");
    const ep2Lock = dag.createEpisodeLockfile("ep-002", [{ assetId: "char-haru", semver: "1.0.0" }], "in-progress", "2026-11-10T00:00:00Z");

    const v2 = dag.commitSnapshot({
      assetId: "char-haru",
      kind: "character-sheet",
      semver: "2.0.0",
      parentAddresses: [v1.contentAddress],
      authorId: "costume-designer",
      createdAtIso: "2026-11-20T00:00:00Z",
      summaryKo: "2부 전투복 리뉴얼",
      attributes: { costume: "tactical-coat-v2" },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });

    expect(dag.resolveLockedSnapshot(ep1Lock, "char-haru").contentAddress).toBe(v1.contentAddress);
    const ep2Migrated = dag.upgradeEpisodeAssetPin(ep2Lock, "char-haru", {
      targetSemver: "2.0.0",
      allowMajorBreaking: true,
      updatedAtIso: "2026-11-21T00:00:00Z",
    });
    expect(dag.resolveLockedSnapshot(ep2Migrated, "char-haru").contentAddress).toBe(v2.contentAddress);
    expect(dag.resolveLockedSnapshot(ep1Lock, "char-haru").attributes.costume).toBe("school-uniform-v1");
  });

  it("12. 마감 회차(locked-published) 무단 업그레이드를 차단하고 업그레이드된 핀을 직전 스냅샷으로 롤백한다", () => {
    const dag = new CreatorAssetVersionDag();
    const v100 = dag.commitSnapshot({
      assetId: "style-sfx",
      kind: "lettering-style",
      semver: "1.0.0",
      authorId: "letterer",
      createdAtIso: "2026-11-01T00:00:00Z",
      summaryKo: "기본 효과음",
      attributes: { strokeWidthPx: 4 },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    dag.commitSnapshot({
      assetId: "style-sfx",
      kind: "lettering-style",
      semver: "1.1.0",
      parentAddresses: [v100.contentAddress],
      authorId: "letterer",
      createdAtIso: "2026-11-02T00:00:00Z",
      summaryKo: "외곽선 보강",
      attributes: { strokeWidthPx: 6 },
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });

    const publishedLock = dag.createEpisodeLockfile("ep-010", [{ assetId: "style-sfx", semver: "1.0.0" }], "locked-published", "2026-11-03T00:00:00Z");
    expect(() => dag.upgradeEpisodeAssetPin(publishedLock, "style-sfx", { updatedAtIso: "2026-11-04T00:00:00Z" })).toThrow(/마감 완료된 회차/);

    const draftLock = dag.createEpisodeLockfile(
      "ep-011",
      [{ assetId: "style-sfx", semver: "1.0.0", upgradePolicy: "minor-compatible" }],
      "in-progress",
      "2026-11-03T00:00:00Z",
    );
    const upgraded = dag.upgradeEpisodeAssetPin(draftLock, "style-sfx", { updatedAtIso: "2026-11-04T00:00:00Z" });
    expect(upgraded.pins["style-sfx"]?.semver).toBe("1.1.0");

    const rolledBack = dag.rollbackEpisodeAssetPin(upgraded, "style-sfx", "2026-11-05T00:00:00Z");
    expect(rolledBack.pins["style-sfx"]?.contentAddress).toBe(v100.contentAddress);
    expect(rolledBack.lockfileDigest).toBe(draftLock.lockfileDigest);
    expect(compareSemVer("1.1.0", "1.0.0")).toBeGreaterThan(0);
  });

  it("13. 최소 공통 조상(LCA) 탐색 후 서로 다른 파츠를 수정한 두 브랜치를 무충돌 3-way 자동 병합한다", () => {
    const dag = new CreatorAssetVersionDag();
    const base = dag.commitSnapshot({
      assetId: "char-haru", kind: "character-sheet", semver: "1.0.0", authorId: "lead",
      createdAtIso: "2026-11-01T00:00:00Z", summaryKo: "베이스", rights: COMMERCIAL_CLEAN_RIGHTS,
      attributes: { hair: { length: "short", ribbon: "none" }, cape: { enabled: false, trim: "silver" } },
    });
    const branchHair = dag.commitSnapshot({
      assetId: "char-haru", kind: "character-sheet", semver: "1.1.0", parentAddresses: [base.contentAddress],
      authorId: "a", createdAtIso: "2026-11-02T00:00:00Z", summaryKo: "리본 추가", rights: COMMERCIAL_CLEAN_RIGHTS,
      attributes: { hair: { length: "short", ribbon: "crimson" }, cape: { enabled: false, trim: "silver" } },
    });
    const branchCape = dag.commitSnapshot({
      assetId: "char-haru", kind: "character-sheet", semver: "1.2.0", parentAddresses: [base.contentAddress],
      authorId: "b", createdAtIso: "2026-11-03T00:00:00Z", summaryKo: "망토 활성화", rights: COMMERCIAL_CLEAN_RIGHTS,
      attributes: { hair: { length: "short", ribbon: "none" }, cape: { enabled: true, trim: "gold" } },
    });

    expect(dag.findLowestCommonAncestor(branchHair.contentAddress, branchCape.contentAddress)).toBe(base.contentAddress);
    const merged = dag.mergeSnapshotsThreeWay(branchHair.contentAddress, branchCape.contentAddress);
    expect(merged.canAutoCommit).toBe(true);
    expect(merged.mergedAttributes).toEqual({
      hair: { length: "short", ribbon: "crimson" },
      cape: { enabled: true, trim: "gold" },
    });
  });

  it("14. 동일 속성을 서로 다르게 수정한 3-way 충돌을 정확히 리포트하고 지정 전략으로 해결한다", () => {
    const dag = new CreatorAssetVersionDag();
    const base = dag.commitSnapshot({
      assetId: "prop-lantern", kind: "background-prop", semver: "1.0.0", authorId: "lead",
      createdAtIso: "2026-11-01T00:00:00Z", summaryKo: "가로등 기본",
      attributes: { intensity: 1.0, frameMaterial: "iron" }, rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    const ours = dag.commitSnapshot({
      assetId: "prop-lantern", kind: "background-prop", semver: "1.1.0", parentAddresses: [base.contentAddress],
      authorId: "a", createdAtIso: "2026-11-02T00:00:00Z", summaryKo: "밝기 1.8",
      attributes: { intensity: 1.8, frameMaterial: "iron" }, rights: COMMERCIAL_CLEAN_RIGHTS,
    });
    const theirs = dag.commitSnapshot({
      assetId: "prop-lantern", kind: "background-prop", semver: "1.2.0", parentAddresses: [base.contentAddress],
      authorId: "b", createdAtIso: "2026-11-02T01:00:00Z", summaryKo: "밝기 2.4·황동",
      attributes: { intensity: 2.4, frameMaterial: "brass" }, rights: COMMERCIAL_CLEAN_RIGHTS,
    });

    const conflictReport = dag.mergeSnapshotsThreeWay(ours.contentAddress, theirs.contentAddress);
    expect(conflictReport.canAutoCommit).toBe(false);
    expect(conflictReport.conflicts[0]?.path).toBe("intensity");

    const resolved = dag.mergeSnapshotsThreeWay(ours.contentAddress, theirs.contentAddress, {
      intensity: { strategy: "custom", value: 2.1 },
    });
    expect(resolved.canAutoCommit).toBe(true);
    expect(resolved.mergedAttributes).toEqual({ intensity: 2.1, frameMaterial: "brass" });
  });

  it("15. 출고 전 Rights BOM 검증이 하위 의존성 에셋의 비상업용 라이선스 및 출처 표기 누락을 전수 차단한다", () => {
    const dag = new CreatorAssetVersionDag();
    const ncBrush = dag.commitSnapshot({
      assetId: "brush-lace-nc", kind: "custom-brush-pack", semver: "1.0.0", authorId: "ext",
      createdAtIso: "2026-11-01T00:00:00Z", summaryKo: "비영리 레이스", attributes: { pattern: "lace" },
      rights: {
        licenseId: "CC-BY-NC-4.0", rightsholder: "LaceCreator", commercialUse: "prohibited",
        attributionRequired: true, attributionText: "Lace Brush by LaceCreator (CC-BY-NC-4.0)",
      },
    });
    dag.commitSnapshot({
      assetId: "char-noble", kind: "character-sheet", semver: "1.0.0", authorId: "studio",
      createdAtIso: "2026-11-02T00:00:00Z", summaryKo: "귀족 시트", attributes: { dress: "royal" },
      dependencies: [{ assetId: "brush-lace-nc", pinnedAddress: ncBrush.contentAddress, semver: "1.0.0" }],
      rights: COMMERCIAL_CLEAN_RIGHTS,
    });

    const lock = dag.createEpisodeLockfile("ep-020", [{ assetId: "char-noble", semver: "1.0.0" }], "in-progress", "2026-11-27T00:00:00Z");
    const bom = dag.verifyEpisodeRightsBom(lock, { providedCredits: [], auditTimestampIso: "2026-11-27T05:00:00Z" });
    expect(bom.readyForCommercialRelease).toBe(false);
    expect(bom.scannedSnapshotCount).toBe(2);
    expect(bom.violations.map((v) => v.violationKind)).toEqual(
      expect.arrayContaining(["commercial-use-prohibited", "missing-required-attribution"]),
    );
  });

  it("16. Rights BOM이 조상 계보의 개작 금지(derivativeAllowed: false)와 만료를 차단하고 적법 출처 표기 시 통과시킨다", () => {
    const dag = new CreatorAssetVersionDag();
    const noDerivRoot = dag.commitSnapshot({
      assetId: "prop-cathedral", kind: "background-prop", semver: "1.0.0", authorId: "vendor",
      createdAtIso: "2026-01-01T00:00:00Z", summaryKo: "개작 금지 성당", attributes: { spires: 2 },
      rights: {
        licenseId: "Vendor-ND-Commercial", rightsholder: "ArchVendor", commercialUse: "allowed",
        attributionRequired: false, derivativeAllowed: false, expiresAtIso: "2026-06-01T00:00:00Z",
      },
    });
    dag.commitSnapshot({
      assetId: "prop-cathedral", kind: "background-prop", semver: "1.1.0", parentAddresses: [noDerivRoot.contentAddress],
      authorId: "studio", createdAtIso: "2026-07-01T00:00:00Z", summaryKo: "임의 개작본",
      attributes: { spires: 3 }, rights: COMMERCIAL_CLEAN_RIGHTS,
    });

    const badLock = dag.createEpisodeLockfile("ep-021", [{ assetId: "prop-cathedral", semver: "1.1.0" }], "in-progress", "2026-11-27T00:00:00Z");
    const badBom = dag.verifyEpisodeRightsBom(badLock, { providedCredits: [], auditTimestampIso: "2026-11-27T05:00:00Z" });
    expect(badBom.readyForCommercialRelease).toBe(false);
    expect(badBom.violations.map((v) => v.violationKind)).toEqual(
      expect.arrayContaining(["unauthorized-derivative-work", "expired-license"]),
    );

    dag.commitSnapshot({
      assetId: "prop-bench", kind: "background-prop", semver: "1.0.0", authorId: "open-3d",
      createdAtIso: "2026-11-01T00:00:00Z", summaryKo: "공원 벤치", attributes: { wood: "oak" },
      rights: {
        licenseId: "CC-BY-4.0", rightsholder: "OpenMeshLab", commercialUse: "allowed",
        attributionRequired: true, attributionText: "Park Bench by OpenMeshLab (CC-BY-4.0)",
      },
    });
    const cleanLock = dag.createEpisodeLockfile("ep-022", [{ assetId: "prop-bench", semver: "1.0.0" }], "in-progress", "2026-11-27T00:00:00Z");
    const cleanBom = dag.verifyEpisodeRightsBom(cleanLock, {
      providedCredits: ["배경 소품: Park Bench by OpenMeshLab (CC-BY-4.0)"],
      auditTimestampIso: "2026-11-27T05:00:00Z",
    });
    expect(cleanBom.readyForCommercialRelease).toBe(true);
  });

  // 3. AI 회차 연속성 비침습 어시스턴트 (8 tests)
  it("17. 캐릭터 파츠 고유색 이탈(오채색)을 CIEDE2000으로 정탐하고 목표 복원 색상을 패치로 제안한다", () => {
    const hero = createHeroReferenceSheet();
    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-034",
      readingDirection: "ltr-top-down",
      characterSheets: [hero],
      cuts: [
        {
          cutId: "cut-01",
          cutNumber: 1,
          sceneId: "classroom",
          lighting: { keyLightAzimuthDeg: 45 },
          characters: [
            {
              characterId: "char-haru",
              bounds: { x: 200, y: 180, width: 220, height: 420 },
              faceAnchor: { x: 310, y: 240 },
              observedPartOklab: {
                hair: hero.parts.hair!.referenceOklab,
                jacket: srgbToOklab({ r: 0.18, g: 0.32, b: 0.84 }),
              },
            },
          ],
          balloons: [],
        },
      ],
    };
    const report = auditEpisodeContinuity(doc);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.kind).toBe("character-part-color-drift");
    expect(report.patchProposals[0]?.payload.kind).toBe("replace-part-color");
  });

  it("18. 석양·야간 등 장면 조명(노출·앰비언트 색조)이 일관되게 적용된 컷에서는 색 이탈 오탐을 일으키지 않는다", () => {
    const hero = createHeroReferenceSheet();
    const shift = (c: { l: number; a: number; b: number }) => ({
      l: Math.max(0, Math.min(1, c.l - 0.11)),
      a: c.a + 0.045,
      b: c.b + 0.055,
    });
    expect(computeCiede2000FromOklab(hero.parts.jacket!.referenceOklab, shift(hero.parts.jacket!.referenceOklab))).toBeGreaterThan(8);

    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-sunset",
      readingDirection: "ltr-top-down",
      characterSheets: [hero],
      cuts: [
        {
          cutId: "cut-sunset",
          cutNumber: 1,
          sceneId: "rooftop",
          lighting: { keyLightAzimuthDeg: 20, exposureShiftL: -0.11, ambientShiftA: 0.045, ambientShiftB: 0.055 },
          characters: [
            {
              characterId: "char-haru",
              bounds: { x: 180, y: 140, width: 240, height: 460 },
              faceAnchor: { x: 300, y: 210 },
              observedPartOklab: {
                hair: shift(hero.parts.hair!.referenceOklab),
                jacket: shift(hero.parts.jacket!.referenceOklab),
                eyes: shift(hero.parts.eyes!.referenceOklab),
              },
            },
          ],
          balloons: [],
        },
      ],
    };
    expect(auditEpisodeContinuity(doc).findings).toHaveLength(0);
    expect(computeOklabDistance(hero.parts.hair!.referenceOklab, hero.parts.hair!.referenceOklab)).toBe(0);
  });

  it("19. 동일 씬 연속 컷 사이에서 주광원 방위각이 150° 급변하면 경고 및 완충 정렬 패치를 제안한다", () => {
    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-light-jump",
      readingDirection: "ltr-top-down",
      characterSheets: [],
      cuts: [
        { cutId: "cut-1", cutNumber: 1, sceneId: "alley", lighting: { keyLightAzimuthDeg: 30 }, characters: [], balloons: [] },
        { cutId: "cut-2", cutNumber: 2, sceneId: "alley", lighting: { keyLightAzimuthDeg: 180 }, characters: [], balloons: [] },
      ],
    };
    const report = auditEpisodeContinuity(doc);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.kind).toBe("abrupt-key-light-flip");
    expect(report.findings[0]?.metricValue).toBeCloseTo(150, 4);
  });

  it("20. 명시적 씬 전환(location-change)이나 대화 180° 리버스쇼트(cameraReverseShot180)에서는 광원 반전을 오탐하지 않는다", () => {
    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-reverse-shot",
      readingDirection: "ltr-top-down",
      characterSheets: [],
      cuts: [
        { cutId: "c1", cutNumber: 1, sceneId: "cafe", lighting: { keyLightAzimuthDeg: 25 }, characters: [], balloons: [] },
        { cutId: "c2", cutNumber: 2, sceneId: "cafe", cameraReverseShot180: true, lighting: { keyLightAzimuthDeg: 152 }, characters: [], balloons: [] },
        { cutId: "c3", cutNumber: 3, sceneId: "subway", transitionKind: "location-change", lighting: { keyLightAzimuthDeg: 290 }, characters: [], balloons: [] },
      ],
    };
    expect(auditEpisodeContinuity(doc).findings).toHaveLength(0);
  });

  it("21. 말풍선 꼬리가 의도된 화자 대신 다른 캐릭터를 가리키면 정탐하고 나레이션 박스는 오탐하지 않는다", () => {
    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-tail",
      readingDirection: "ltr-top-down",
      characterSheets: [createHeroReferenceSheet()],
      cuts: [
        {
          cutId: "cut-dialogue",
          cutNumber: 1,
          sceneId: "hall",
          lighting: { keyLightAzimuthDeg: 60 },
          characters: [
            { characterId: "char-haru", bounds: { x: 80, y: 200, width: 180, height: 400 }, faceAnchor: { x: 170, y: 260 }, observedPartOklab: {} },
            { characterId: "char-minsu", bounds: { x: 520, y: 200, width: 180, height: 400 }, faceAnchor: { x: 610, y: 260 }, observedPartOklab: {} },
          ],
          balloons: [
            { balloonId: "narration", readingOrder: 1, isNarration: true, bounds: { x: 60, y: 40, width: 260, height: 70 }, tailTip: null },
            { balloonId: "wrong-tail", readingOrder: 2, intendedSpeakerId: "char-haru", bounds: { x: 300, y: 90, width: 220, height: 90 }, tailTip: { x: 595, y: 250 } },
          ],
        },
      ],
    };
    const report = auditEpisodeContinuity(doc);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]?.kind).toBe("balloon-tail-speaker-mismatch");
    const payload = report.patchProposals[0]!.payload;
    expect(payload.kind).toBe("snap-balloon-tail");
    if (payload.kind === "snap-balloon-tail") {
      expect(Math.hypot(payload.proposedTailTip.x - 170, payload.proposedTailTip.y - 260)).toBeLessThan(25);
    }
  });

  it("22. 한국어 웹툰(좌상→우하)과 출판 만화(우상→좌하) 각각의 말풍선 읽기 순서 역전을 정확히 판별한다", () => {
    const balloons = [
      { balloonId: "bal-right", readingOrder: 1, bounds: { x: 520, y: 100, width: 180, height: 90 } },
      { balloonId: "bal-left", readingOrder: 2, bounds: { x: 100, y: 105, width: 180, height: 90 } },
    ] as const;
    const ltrDoc: EpisodeContinuityDocument = {
      episodeId: "ep-ltr",
      readingDirection: "ltr-top-down",
      characterSheets: [],
      cuts: [{ cutId: "c1", cutNumber: 1, sceneId: "s1", lighting: { keyLightAzimuthDeg: 45 }, characters: [], balloons }],
    };
    expect(auditEpisodeContinuity(ltrDoc).findings[0]?.kind).toBe("balloon-reading-order-inversion");
    expect(auditEpisodeContinuity({ ...ltrDoc, readingDirection: "rtl-manga-top-down" }).findings).toHaveLength(0);
  });

  it("23. 연속성 진단 실행 전후로 원본 문서의 해시와 중첩 객체 참조가 100% 불변(sourceMutated === false)이다", () => {
    const hero = createHeroReferenceSheet();
    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-immut",
      readingDirection: "ltr-top-down",
      characterSheets: [hero],
      cuts: [
        {
          cutId: "cut-immut",
          cutNumber: 1,
          sceneId: "lab",
          lighting: { keyLightAzimuthDeg: 40 },
          characters: [
            {
              characterId: "char-haru",
              bounds: { x: 100, y: 150, width: 200, height: 400 },
              faceAnchor: { x: 200, y: 210 },
              observedPartOklab: { jacket: srgbToOklab({ r: 0.1, g: 0.8, b: 0.2 }) },
            },
          ],
          balloons: [
            { balloonId: "b1", readingOrder: 1, bounds: { x: 450, y: 80, width: 160, height: 80 }, intendedSpeakerId: "char-haru", tailTip: { x: 700, y: 500 } },
          ],
        },
      ],
    };
    const jsonBefore = JSON.stringify(doc);
    const report = auditEpisodeContinuity(doc);
    expect(report.sourceMutated).toBe(false);
    expect(report.inputDigestBefore).toBe(report.inputDigestAfter);
    expect(report.patchProposals.every((p) => p.requiresCreatorApproval === true)).toBe(true);
    expect(JSON.stringify(doc)).toBe(jsonBefore);
  });

  it("24. applyContinuityProposalsPreview로 선택 패치를 적용한 복제본은 재진단 시 위반이 0건으로 해소되며 원본은 보존된다", () => {
    const hero = createHeroReferenceSheet();
    const doc: EpisodeContinuityDocument = {
      episodeId: "ep-heal",
      readingDirection: "ltr-top-down",
      characterSheets: [hero],
      cuts: [
        {
          cutId: "cut-1",
          cutNumber: 1,
          sceneId: "room",
          lighting: { keyLightAzimuthDeg: 35 },
          characters: [
            {
              characterId: "char-haru",
              bounds: { x: 120, y: 180, width: 180, height: 380 },
              faceAnchor: { x: 210, y: 235 },
              observedPartOklab: { jacket: srgbToOklab({ r: 0.12, g: 0.72, b: 0.85 }) },
            },
          ],
          balloons: [
            { balloonId: "b-right", readingOrder: 1, intendedSpeakerId: "char-haru", bounds: { x: 520, y: 90, width: 170, height: 80 }, tailTip: { x: 640, y: 480 } },
            { balloonId: "b-left", readingOrder: 2, bounds: { x: 90, y: 90, width: 170, height: 80 } },
          ],
        },
        { cutId: "cut-2", cutNumber: 2, sceneId: "room", lighting: { keyLightAzimuthDeg: 205 }, characters: [], balloons: [] },
      ],
    };

    const initialAudit = auditEpisodeContinuity(doc);
    expect(initialAudit.findings).toHaveLength(4);
    const preview = applyContinuityProposalsPreview(doc, initialAudit.patchProposals);
    expect(preview.appliedProposalIds).toHaveLength(4);
    expect(auditEpisodeContinuity(preview.previewDocument).findings).toHaveLength(0);
    expect(auditEpisodeContinuity(doc).findings).toHaveLength(4);
    expect(oklabToSrgb(hero.parts.jacket!.referenceOklab, true).r).toBeCloseTo(0.72, 4);
  });
});
