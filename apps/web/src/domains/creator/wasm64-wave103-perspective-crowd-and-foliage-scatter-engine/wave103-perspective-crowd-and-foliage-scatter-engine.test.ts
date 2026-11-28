import { describe, expect, it } from "vitest";
import {
  boxesIntersect,
  computeAtmosphericDepthStyling,
  computeBoxIntersectionArea,
  computeDiversityEntropy01,
  computeGroundSpanAtDepth,
  computeStandingEyeScreenY,
  DEFAULT_PERSPECTIVE_STAGE,
  DEFAULT_SCATTER_ASSET_TEMPLATES,
  escapeXmlText,
  expandBoundingBox,
  generatePerspectiveGroundGrid,
  groundYToWorldDepthMeters,
  mulberry32,
  projectStandingFigure,
  renderPerspectiveCrowdStageSvg,
  resolveStageDepthRange,
  SCATTER_TEMPLATE_BY_ID,
  scatterPerspectiveCrowdAndFoliage,
  screenGroundToWorldXZ,
  summarizeCrowdScatterKo,
  validatePerspectiveGroundStage,
  worldDepthToGroundYPx,
  worldDepthToScreenHeightPx,
  worldToScreenPoint,
  type KeepOutZone,
  type PerspectiveGroundStage,
  type ScatterArchetypeId,
} from "./index";

const STAGE: PerspectiveGroundStage = {
  viewportWidthPx: 1280,
  viewportHeightPx: 720,
  horizonYPx: 240,
  cameraEyeHeightMeters: 1.62,
  focalLengthPx: 900,
  nearGroundYPx: 700,
  farGroundYPx: 268,
  principalXPx: 640,
};

describe("Wave 103 — 원근 지평선 투영 및 대기 깊이 스타일링", () => {
  it("유효한 PerspectiveGroundStage를 통과시키고 잘못된 지평선·깊이 구성은 모두 거부한다", () => {
    expect(validatePerspectiveGroundStage(STAGE).valid).toBe(true);
    expect(validatePerspectiveGroundStage(DEFAULT_PERSPECTIVE_STAGE).valid).toBe(true);
    expect(validatePerspectiveGroundStage({ ...STAGE, farGroundYPx: STAGE.horizonYPx }).valid).toBe(
      false,
    );
    expect(
      validatePerspectiveGroundStage({ ...STAGE, nearGroundYPx: STAGE.farGroundYPx - 10 }).valid,
    ).toBe(false);
    expect(
      validatePerspectiveGroundStage({ ...STAGE, nearGroundYPx: STAGE.viewportHeightPx + 1 }).valid,
    ).toBe(false);

    const bad = validatePerspectiveGroundStage({
      ...STAGE,
      cameraEyeHeightMeters: 0,
      focalLengthPx: -100,
      horizonYPx: Number.NaN,
    });
    expect(bad.valid).toBe(false);
    expect(bad.issues.length).toBeGreaterThanOrEqual(3);
  });

  it("groundYToWorldDepthMeters가 핀홀 공식 Z = (H_cam * f) / (footY - horizonY)을 정확히 따른다", () => {
    const footY = 420;
    const expectedZ = (STAGE.cameraEyeHeightMeters * STAGE.focalLengthPx) / (footY - STAGE.horizonYPx);
    expect(groundYToWorldDepthMeters(footY, STAGE)).toBeCloseTo(expectedZ, 10);
    expect(() => groundYToWorldDepthMeters(STAGE.horizonYPx, STAGE)).toThrow();
    expect(() => groundYToWorldDepthMeters(STAGE.horizonYPx - 12, STAGE)).toThrow();
  });

  it("지면 Y ↔ 월드 깊이 Z 왕복 변환 오차가 1e-9 미만이다", () => {
    for (const z of [2.5, 4.2, 9.75, 18.4, 42.0, 95.5]) {
      const recoveredZ = groundYToWorldDepthMeters(worldDepthToGroundYPx(z, STAGE), STAGE);
      expect(Math.abs(recoveredZ - z)).toBeLessThan(1e-9);
    }
  });

  it("Horizon Eye-Level Law 불변량: 3m·8m·20m·50m 직립 인물의 눈높이가 지평선 Y에 1e-6px 이내로 일치한다", () => {
    for (const depthMeters of [3, 8, 20, 50, 120]) {
      const p = projectStandingFigure({
        worldXMeters: 1.8,
        depthMeters,
        physicalHeightMeters: 1.74,
        physicalWidthMeters: 0.54,
        stage: STAGE,
        eyeHeightMeters: STAGE.cameraEyeHeightMeters,
      });
      expect(Math.abs(p.eyeScreenY - STAGE.horizonYPx)).toBeLessThan(1e-6);
      expect(p.horizonEyeErrorPx).toBeLessThan(1e-6);
      const directEyeY = computeStandingEyeScreenY(
        p.footScreenY,
        STAGE.cameraEyeHeightMeters,
        STAGE,
      );
      expect(Math.abs(directEyeY - STAGE.horizonYPx)).toBeLessThan(1e-4);
    }
  });

  it("화면 픽셀 높이가 깊이에 정확히 반비례한다(H(Z) * Z === 상수)", () => {
    const physicalH = 1.72;
    const invariantProduct = physicalH * STAGE.focalLengthPx;
    let prevHeight = Infinity;
    for (const z of [3, 6, 12, 24, 48]) {
      const screenH = worldDepthToScreenHeightPx(physicalH, z, STAGE);
      expect(Math.abs(screenH * z - invariantProduct)).toBeLessThan(1e-9);
      expect(screenH).toBeLessThan(prevHeight);
      prevHeight = screenH;
    }
  });

  it("비대칭 주점(principalXPx)에서도 월드 XZ ↔ 화면 지면 정·역투영이 1e-9 이내로 일치한다", () => {
    const offCenter: PerspectiveGroundStage = { ...STAGE, principalXPx: 410 };
    const samples = [
      { x: -4.5, z: 6.0 },
      { x: 0.0, z: 12.5 },
      { x: 7.2, z: 28.0 },
      { x: -11.4, z: 45.0 },
    ];
    for (const sample of samples) {
      const screen = worldToScreenPoint(sample.x, 0, sample.z, offCenter);
      const back = screenGroundToWorldXZ(screen.xPx, screen.yPx, offCenter);
      expect(Math.abs(back.xMeters - sample.x)).toBeLessThan(1e-9);
      expect(Math.abs(back.zMeters - sample.z)).toBeLessThan(1e-9);
    }
  });

  it("카메라보다 키가 큰 인물은 눈이 지평선 위, 작은 인물은 지평선 아래에 정확히 배치된다", () => {
    const tall = projectStandingFigure({
      worldXMeters: 0,
      depthMeters: 10,
      physicalHeightMeters: 1.95,
      physicalWidthMeters: 0.56,
      stage: STAGE,
      eyeHeightMeters: 1.82,
    });
    const short = projectStandingFigure({
      worldXMeters: 0,
      depthMeters: 10,
      physicalHeightMeters: 1.48,
      physicalWidthMeters: 0.48,
      stage: STAGE,
      eyeHeightMeters: 1.38,
    });
    expect(tall.eyeScreenY).toBeLessThan(STAGE.horizonYPx);
    expect(short.eyeScreenY).toBeGreaterThan(STAGE.horizonYPx);
    expect(tall.canonicalHorizonEyeErrorPx).toBeLessThan(1e-6);
    expect(short.canonicalHorizonEyeErrorPx).toBeLessThan(1e-6);
  });

  it("computeAtmosphericDepthStyling이 근경·중경·원경 3개 티어를 깊이 순으로 정확히 분류한다", () => {
    expect(computeAtmosphericDepthStyling(3.4, 3.0, 55.0).detailTier).toBe("detailed-foreground");
    expect(computeAtmosphericDepthStyling(12.0, 3.0, 55.0).detailTier).toBe("midground-contour");
    expect(computeAtmosphericDepthStyling(44.0, 3.0, 55.0).detailTier).toBe("soft-background-wash");
  });

  it("대기 원근 스타일은 거리가 멀어질수록 안개 증가(0..0.75)·선 굵기 감소·채도 감쇠가 단조롭게 진행된다", () => {
    const styles = [3, 5, 10, 20, 35, 60].map((z) => computeAtmosphericDepthStyling(z, 3.0, 60.0));
    expect(styles[0].hazeBlend).toBeCloseTo(0, 8);
    expect(styles[styles.length - 1].hazeBlend).toBeCloseTo(0.75, 8);
    for (let i = 1; i < styles.length; i += 1) {
      expect(styles[i].hazeBlend).toBeGreaterThan(styles[i - 1].hazeBlend);
      expect(styles[i].strokeWidthPx).toBeLessThan(styles[i - 1].strokeWidthPx);
      expect(styles[i].chromaScale).toBeLessThan(styles[i - 1].chromaScale);
      expect(styles[i].silhouetteOpacity).toBeLessThan(styles[i - 1].silhouetteOpacity);
      expect(styles[i].lightnessLift).toBeGreaterThan(styles[i - 1].lightnessLift);
    }
  });

  it("원근 지면 그리드와 깊이별 가시 폭(GroundSpan)이 모두 지평선 아래 유한 좌표로 생성된다", () => {
    const range = resolveStageDepthRange(STAGE);
    const nearSpan = computeGroundSpanAtDepth(range.nearDepthMeters, STAGE, 20);
    const farSpan = computeGroundSpanAtDepth(range.farDepthMeters, STAGE, 20);
    expect(farSpan.visibleWorldWidthMeters).toBeGreaterThan(nearSpan.visibleWorldWidthMeters * 5);
    expect(farSpan.pixelsPerMeter).toBeLessThan(nearSpan.pixelsPerMeter);

    const grid = generatePerspectiveGroundGrid(STAGE, { depthLineCount: 6, radialHalfCount: 4 });
    expect(grid.depthLines.length).toBe(6);
    expect(grid.radialLines.length).toBe(9);
    for (const line of [...grid.depthLines, ...grid.radialLines]) {
      expect(line.start.yPx).toBeGreaterThan(STAGE.horizonYPx);
      expect(line.end.yPx).toBeGreaterThan(STAGE.horizonYPx);
      expect(Number.isFinite(line.start.xPx) && Number.isFinite(line.end.xPx)).toBe(true);
    }
  });

  it("AABB 교차 판정 및 패딩 확장 유틸리티가 정확히 동작한다", () => {
    const a = { minXPx: 100, minYPx: 100, maxXPx: 200, maxYPx: 200 };
    const touching = { minXPx: 200, minYPx: 100, maxXPx: 300, maxYPx: 200 };
    const overlapping = { minXPx: 180, minYPx: 150, maxXPx: 260, maxYPx: 250 };
    expect(boxesIntersect(a, touching)).toBe(false);
    expect(computeBoxIntersectionArea(a, touching)).toBe(0);
    expect(boxesIntersect(a, overlapping)).toBe(true);
    expect(computeBoxIntersectionArea(a, overlapping)).toBe(1000);
    expect(boxesIntersect(expandBoundingBox(a, 5), touching)).toBe(true);
  });
});

describe("Wave 103 — 포아송 군중·식생 배치, 보호구역 및 복제 방지 솔버", () => {
  it("mulberry32 의사난수 생성기는 같은 시드에서 완전히 동일한 수열을 만들고 다른 시드와 분기한다", () => {
    const seqA = Array.from({ length: 16 }, mulberry32(20261128));
    const seqB = Array.from({ length: 16 }, mulberry32(20261128));
    const seqC = Array.from({ length: 16 }, mulberry32(99103));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("7종 필수 아키타입이 물리 신장·수고 범위(인물 1.58~1.84m, 수목 4.5~8.0m)와 다중 포즈를 갖춘다", () => {
    const requiredIds: readonly ScatterArchetypeId[] = [
      "bystander-walker",
      "bystander-commuter",
      "student-uniform",
      "fantasy-soldier",
      "street-tree",
      "cherry-blossom-canopy",
      "street-lamp",
    ];
    expect(DEFAULT_SCATTER_ASSET_TEMPLATES.length).toBe(7);
    for (const id of requiredIds) {
      const tpl = SCATTER_TEMPLATE_BY_ID[id];
      expect(tpl.footprintRadiusM).toBeGreaterThan(0);
      expect(tpl.poseVariants.length).toBeGreaterThanOrEqual(4);
      if (tpl.category === "human") {
        expect(tpl.minHeightMeters).toBeGreaterThanOrEqual(1.58);
        expect(tpl.maxHeightMeters).toBeLessThanOrEqual(1.84);
      }
      if (tpl.category === "foliage") {
        expect(tpl.minHeightMeters).toBeGreaterThanOrEqual(4.5);
        expect(tpl.maxHeightMeters).toBeLessThanOrEqual(8.0);
      }
    }
  });

  it("원근 인식 발자국 비충돌 불변량: 45개체 이상 군중 배치에서 월드 XZ 겹침이 정확히 0건이다", () => {
    const spacingMultiplier = 1.1;
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10301,
      targetCount: 48,
      archetypeIds: ["bystander-walker", "bystander-commuter", "student-uniform"],
      spacingMultiplier,
    });
    expect(result.entities.length).toBeGreaterThanOrEqual(44);
    expect(result.metrics.worldCollisionCount).toBe(0);
    for (let i = 0; i < result.entities.length; i += 1) {
      for (let j = i + 1; j < result.entities.length; j += 1) {
        const a = result.entities[i];
        const b = result.entities[j];
        const minDist = (a.footprintRadiusM + b.footprintRadiusM) * spacingMultiplier;
        expect(Math.hypot(a.worldXMeters - b.worldXMeters, a.depthMeters - b.depthMeters)).toBeGreaterThanOrEqual(
          minDist - 1e-6,
        );
      }
    }
  });

  it("월드 고정 간격이 지평선에 가까워질수록 화면상 자연스럽게 압축된다(근경 높이 > 원경 높이)", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10302,
      targetCount: 45,
      archetypeIds: ["bystander-walker", "student-uniform"],
      depthDistribution: "screen-balanced",
    });
    expect(result.metrics.tierCounts["detailed-foreground"]).toBeGreaterThan(0);
    expect(result.metrics.tierCounts["midground-contour"]).toBeGreaterThan(0);
    expect(result.metrics.tierCounts["soft-background-wash"]).toBeGreaterThan(0);
    expect(result.metrics.meanScreenHeightNearPx).toBeGreaterThan(
      result.metrics.meanScreenHeightFarPx * 3,
    );
  });

  it("주인공 실루엣 보호구역 불변량: 밀집 군중 배치에서도 주인공 경계 상자 침범이 0건이다", () => {
    const heroZone: KeepOutZone = {
      id: "hero-center",
      role: "hero-silhouette",
      bbox: { minXPx: 520, minYPx: 210, maxXPx: 760, maxYPx: 690 },
    };
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10303,
      targetCount: 50,
      keepOutZones: [heroZone],
    });
    expect(result.entities.length).toBeGreaterThanOrEqual(35);
    expect(result.metrics.keepOutViolationCount).toBe(0);
    for (const ent of result.entities) expect(boxesIntersect(ent.bbox, heroZone.bbox)).toBe(false);
  });

  it("주인공·말풍선·시선 통로 다중 보호구역 복합 배치에서 침범이 0건이다", () => {
    const zones: readonly KeepOutZone[] = [
      { id: "hero-lead", role: "hero-silhouette", bbox: { minXPx: 500, minYPx: 230, maxXPx: 720, maxYPx: 700 } },
      { id: "balloon-left", role: "speech-balloon", bbox: { minXPx: 80, minYPx: 60, maxXPx: 420, maxYPx: 340 } },
      { id: "balloon-right", role: "speech-balloon", bbox: { minXPx: 840, minYPx: 90, maxXPx: 1180, maxYPx: 360 } },
      { id: "focal-aisle", role: "focal-corridor", bbox: { minXPx: 575, minYPx: 260, maxXPx: 665, maxYPx: 460 } },
    ];
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10304,
      targetCount: 44,
      keepOutZones: zones,
    });
    expect(result.entities.length).toBeGreaterThan(20);
    expect(result.metrics.keepOutViolationCount).toBe(0);
    for (const ent of result.entities) {
      for (const zone of zones) expect(boxesIntersect(ent.bbox, zone.bbox)).toBe(false);
    }
  });

  it("보호구역 paddingPx 여백 설정 시 확장된 안전 경계까지 침범 0건을 보장한다", () => {
    const padded: KeepOutZone = {
      id: "hero-padded",
      role: "hero-silhouette",
      bbox: { minXPx: 540, minYPx: 250, maxXPx: 740, maxYPx: 640 },
      paddingPx: 24,
    };
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10305,
      targetCount: 42,
      keepOutZones: [padded],
    });
    const expanded = expandBoundingBox(padded.bbox, 24);
    expect(result.metrics.keepOutViolationCount).toBe(0);
    for (const ent of result.entities) expect(boxesIntersect(ent.bbox, expanded)).toBe(false);
  });

  it("복제 방지 다양성 불변량(다중 아키타입): 최근접 이웃 복제 충돌 0건 및 다양성 엔트로피 >= 0.7을 달성한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10306,
      targetCount: 46,
      archetypeIds: ["bystander-walker", "bystander-commuter", "student-uniform"],
    });
    expect(result.metrics.adjacentCloneConflictCount).toBe(0);
    expect(result.metrics.diversityEntropy01).toBeGreaterThanOrEqual(0.7);
    expect(result.metrics.uniqueVariantCount).toBeGreaterThanOrEqual(16);
  });

  it("단일 아키타입 군중에서도 포즈·좌우 반전 다양성으로 최근접 복제 충돌 0건과 엔트로피 >= 0.7을 유지한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10307,
      targetCount: 36,
      archetypeIds: ["student-uniform"],
    });
    expect(result.entities.length).toBeGreaterThanOrEqual(30);
    expect(result.metrics.adjacentCloneConflictCount).toBe(0);
    expect(result.metrics.diversityEntropy01).toBeGreaterThanOrEqual(0.7);
    expect(result.metrics.uniqueVariantCount).toBe(8);
  });

  it("computeDiversityEntropy01이 완전 복제(0)와 균등 다양성(1)을 정확히 구분한다", () => {
    const clones = Array.from({ length: 12 }, () => "bystander-walker::stride-left::R");
    const balanced = ["a::1::L", "a::1::R", "a::2::L", "a::2::R", "a::3::L", "a::3::R", "a::4::L", "a::4::R"];
    expect(computeDiversityEntropy01(clones, 8)).toBe(0);
    expect(computeDiversityEntropy01(balanced, 8)).toBeCloseTo(1, 8);
    expect(computeDiversityEntropy01([], 8)).toBe(0);
  });

  it("시드 결정론: 같은 시드는 완전히 동일한 배치 결과를, 다른 시드는 서로 다른 배치를 생성한다", () => {
    const base = {
      stage: STAGE,
      targetCount: 32,
      archetypeIds: ["bystander-walker", "street-tree", "street-lamp"] as const,
    };
    const run1 = scatterPerspectiveCrowdAndFoliage({ ...base, seed: 777103 });
    const run2 = scatterPerspectiveCrowdAndFoliage({ ...base, seed: 777103 });
    const runOther = scatterPerspectiveCrowdAndFoliage({ ...base, seed: 888103 });
    expect(run1).toEqual(run2);
    expect(run1.entities.map((e) => e.footScreenX)).not.toEqual(
      runOther.entities.map((e) => e.footScreenX),
    );
  });

  it("원경→근경 페인터 깊이 정렬 및 대기 원근 스타일이 출력 배열 전반에서 엄격히 유지된다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({ stage: STAGE, seed: 10308, targetCount: 40 });
    expect(result.metrics.isDepthSortedBackToFront).toBe(true);
    for (let i = 0; i < result.entities.length; i += 1) {
      expect(result.entities[i].painterOrderIndex).toBe(i);
      if (i > 0) {
        expect(result.entities[i - 1].depthMeters).toBeGreaterThanOrEqual(
          result.entities[i].depthMeters,
        );
      }
    }
    const farthest = result.entities[0];
    const nearest = result.entities[result.entities.length - 1];
    expect(farthest.depthMeters).toBeGreaterThan(nearest.depthMeters);
    expect(farthest.atmosphericStyle.hazeBlend).toBeGreaterThan(nearest.atmosphericStyle.hazeBlend);
    expect(farthest.atmosphericStyle.strokeWidthPx).toBeLessThan(
      nearest.atmosphericStyle.strokeWidthPx,
    );
    expect(farthest.atmosphericStyle.chromaScale).toBeLessThan(nearest.atmosphericStyle.chromaScale);
  });

  it("복합 거리 장면(군중 + 가로수 + 벚꽃 수관 + 가로등)이 3개 카테고리를 모두 충돌 없이 배치한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10309,
      targetCount: 42,
      archetypeIds: [
        "bystander-walker",
        "bystander-commuter",
        "street-tree",
        "cherry-blossom-canopy",
        "street-lamp",
      ],
      archetypeWeights: {
        "bystander-walker": 1.0,
        "bystander-commuter": 0.9,
        "street-tree": 0.65,
        "cherry-blossom-canopy": 0.6,
        "street-lamp": 0.55,
      },
      keepOutZones: [
        { id: "hero-walkway", role: "hero-silhouette", bbox: { minXPx: 560, minYPx: 240, maxXPx: 720, maxYPx: 690 } },
      ],
    });
    expect(result.metrics.categoryCounts.human).toBeGreaterThan(0);
    expect(result.metrics.categoryCounts.foliage).toBeGreaterThan(0);
    expect(result.metrics.categoryCounts.prop).toBeGreaterThan(0);
    expect(result.metrics.worldCollisionCount).toBe(0);
    expect(result.metrics.keepOutViolationCount).toBe(0);
    expect(result.metrics.adjacentCloneConflictCount).toBe(0);
  });

  it("exact-camera-eye-level 모드에서는 모든 판타지 경비병의 실제 눈높이가 지평선과 1e-6px 이내로 일치한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10310,
      targetCount: 28,
      archetypeIds: ["fantasy-soldier"],
      eyeHeightLockMode: "exact-camera-eye-level",
    });
    expect(result.entities.length).toBeGreaterThanOrEqual(24);
    expect(result.metrics.maxHorizonEyeErrorPx).toBeLessThan(1e-6);
    for (const ent of result.entities) {
      expect(Math.abs(ent.eyeScreenY - STAGE.horizonYPx)).toBeLessThan(1e-6);
    }
  });

  it("경계 조건 — 보호구역이 비어 있어도 정상적으로 전체 지면에 배치한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10311,
      targetCount: 25,
      keepOutZones: [],
    });
    expect(result.entities.length).toBe(25);
    expect(result.metrics.keepOutViolationCount).toBe(0);
    expect(result.metrics.rejectedKeepOutCount).toBe(0);
  });

  it("경계 조건 — 보호구역이 스테이지 전체를 덮어도 무한 루프 없이 0개체로 안전 종료한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10312,
      targetCount: 40,
      keepOutZones: [
        {
          id: "full-cover",
          role: "hero-silhouette",
          bbox: { minXPx: -50, minYPx: -50, maxXPx: STAGE.viewportWidthPx + 50, maxYPx: STAGE.viewportHeightPx + 50 },
        },
      ],
    });
    expect(result.entities.length).toBe(0);
    expect(result.metrics.placedCount).toBe(0);
    expect(result.metrics.keepOutViolationCount).toBe(0);
    expect(result.metrics.attemptsUsed).toBeGreaterThan(0);
    expect(result.metrics.isDepthSortedBackToFront).toBe(true);
  });

  it("경계 조건 — targetCount가 0이면 시도 0회로 빈 결과를 반환한다", () => {
    const result = scatterPerspectiveCrowdAndFoliage({ stage: STAGE, seed: 10313, targetCount: 0 });
    expect(result.entities.length).toBe(0);
    expect(result.metrics.attemptsUsed).toBe(0);
    expect(result.metrics.isDepthSortedBackToFront).toBe(true);
  });

  it("경계 조건 — 잘못된 horizonYPx 스테이지를 전달하면 NaN 결과 대신 예외를 던진다", () => {
    expect(() =>
      scatterPerspectiveCrowdAndFoliage({
        stage: { ...STAGE, horizonYPx: STAGE.nearGroundYPx + 20 },
        seed: 10314,
        targetCount: 10,
      }),
    ).toThrow(RangeError);
  });
});

describe("Wave 103 — 순수 OKLCH SVG 렌더러 및 한국어 배경 연출 감사 리포트", () => {
  it("renderPerspectiveCrowdStageSvg가 순수 OKLCH 색상만 사용하고 NaN·원시 hex·rgb 리터럴이 0건이다", () => {
    const scatter = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10315,
      targetCount: 30,
      archetypeIds: [
        "bystander-walker",
        "bystander-commuter",
        "student-uniform",
        "fantasy-soldier",
        "street-tree",
        "cherry-blossom-canopy",
        "street-lamp",
      ],
      keepOutZones: [
        { id: "hero-frame", role: "hero-silhouette", bbox: { minXPx: 540, minYPx: 220, maxXPx: 720, maxYPx: 680 } },
        { id: "speech-1", role: "speech-balloon", bbox: { minXPx: 90, minYPx: 70, maxXPx: 360, maxYPx: 210 } },
      ],
    });
    const svg = renderPerspectiveCrowdStageSvg(scatter, {
      title: "벚꽃 거리 군중·식생 원근 배치도",
      theme: "light",
    });
    expect(svg.startsWith("<svg") && svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain('data-layer="horizon-eye-level"');
    expect(svg).toContain('data-layer="perspective-grid"');
    expect(svg).toContain('data-layer="keep-out-zones"');
    expect(svg).not.toMatch(/NaN|Infinity/);
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\(/i);
  });

  it("SVG XML 특수문자를 안전하게 이스케이프하고 dark 테마도 순수 OKLCH로 렌더링한다", () => {
    expect(escapeXmlText(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&apos;");
    const scatter = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10316,
      targetCount: 16,
      keepOutZones: [
        { id: `hero<&>"'1`, role: "hero-silhouette", bbox: { minXPx: 560, minYPx: 240, maxXPx: 700, maxYPx: 660 } },
      ],
    });
    const darkSvg = renderPerspectiveCrowdStageSvg(scatter, {
      title: `야간 골목 <배치> & "테스트"`,
      theme: "dark",
    });
    expect(darkSvg).toContain("&lt;배치&gt; &amp; &quot;테스트&quot;");
    expect(darkSvg).toContain("hero&lt;&amp;&gt;&quot;&apos;1");
    expect(darkSvg).not.toContain("<배치>");
    expect(darkSvg).not.toMatch(/NaN|Infinity/);
    expect(darkSvg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(darkSvg).not.toMatch(/\brgba?\(/i);
  });

  it("SVG 내 실루엣 그룹이 원경→근경 페인터 순서와 내림차순 깊이 그대로 출력된다", () => {
    const scatter = scatterPerspectiveCrowdAndFoliage({ stage: STAGE, seed: 10317, targetCount: 22 });
    const svg = renderPerspectiveCrowdStageSvg(scatter);
    const matches = Array.from(svg.matchAll(/data-painter-order="(\d+)" data-depth-m="([0-9.]+)"/g));
    expect(matches.length).toBe(scatter.entities.length);
    let prevDepth = Infinity;
    for (let i = 0; i < matches.length; i += 1) {
      expect(Number(matches[i][1])).toBe(i);
      const depth = Number(matches[i][2]);
      expect(depth).toBeLessThanOrEqual(prevDepth + 0.01);
      prevDepth = depth;
    }
  });

  it("summarizeCrowdScatterKo가 번역투 없이 자연스러운 한국어 배경 감독 감사 리포트를 생성한다", () => {
    const scatter = scatterPerspectiveCrowdAndFoliage({
      stage: STAGE,
      seed: 10318,
      targetCount: 38,
      archetypeIds: ["bystander-walker", "student-uniform", "street-tree", "street-lamp"],
      keepOutZones: [
        { id: "hero-main", role: "hero-silhouette", bbox: { minXPx: 540, minYPx: 240, maxXPx: 720, maxYPx: 680 } },
      ],
    });
    const audit = summarizeCrowdScatterKo(scatter);
    const fullText = [audit.headlineKo, audit.summaryParagraphKo, ...audit.bulletLinesKo].join("\n");
    expect(audit.statusBadgeKo).toBe("통과");
    expect(audit.bulletLinesKo.length).toBe(6);
    expect(fullText).toContain("근경");
    expect(fullText).toContain("중경");
    expect(fullText).toContain("원경");
    expect(fullText).toContain("보호구역");
    expect(fullText).toContain("다양성");
    expect(fullText).toContain("원경→근경 역순 정렬 통과");
    expect(fullText).not.toContain("가능하게 합니다");
    expect(fullText).not.toContain("직관적인 경험을 제공");
    expect(fullText).not.toContain("원활한 워크플로우");

    const emptyAudit = summarizeCrowdScatterKo(
      scatterPerspectiveCrowdAndFoliage({
        stage: STAGE,
        seed: 10319,
        targetCount: 20,
        keepOutZones: [
          { id: "cover-all", role: "hero-silhouette", bbox: { minXPx: 0, minYPx: 0, maxXPx: 1280, maxYPx: 720 } },
        ],
      }),
    );
    expect(emptyAudit.statusBadgeKo).toBe("주의");
    expect(emptyAudit.warningsKo.length).toBeGreaterThan(0);
  });
});
