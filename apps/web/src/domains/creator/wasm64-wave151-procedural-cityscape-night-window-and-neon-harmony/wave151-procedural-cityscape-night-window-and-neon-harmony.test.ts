import { describe, expect, it } from "vitest";

import {
  applyAtmosphericDepthAttenuation,
  auditCityscapeNightHarmony,
  buildCityscapeNightFacadeWgsl,
  CITYSCAPE_NIGHT_PRESETS,
  cityscapeManifestSha256Hex,
  computeInteriorParallaxOffset,
  computeNightOccupancyRatio,
  detectSignboardScript,
  escapeCityscapeSvgXml,
  formatOklchCss,
  generateBuildingFacadeWindows,
  generateCityscapeNightScene,
  getCityscapeMoodPreset,
  harmonizeCityscapeNightPalette,
  kelvinToOklch,
  listCityscapeMoodPresets,
  normalizeHourOfNight,
  placeFacadeNeonSignboards,
  rectInsideBounds,
  rectOverlaps,
  renderCityscapeNightAuditSvg,
  sha256Utf8Hex,
  summarizeCityscapeNightAuditKo,
  validateCityscapeNightFacadeWgsl,
  type CityscapeNightMoodId,
  type CityscapeNightScene,
  type KeepOutBox2D,
  type NeonSignboardCandidate,
  type PlacedNeonSignboard,
} from "./index";

const ALL_MOODS: readonly CityscapeNightMoodId[] = [
  "seoul-gangnam-noir",
  "hongdae-warm-alley",
  "cyber-neon-alley",
  "quiet-midnight-apartment",
];

describe("Wave 151 — 야경 무드 프리셋 및 시간대 점등률 물리 감쇠", () => {
  it("4종 야경 도시 무드 프리셋이 고유한 색온도·안개·네온 팔레트를 제공한다", () => {
    const presets = listCityscapeMoodPresets();
    expect(presets).toHaveLength(4);
    expect(presets.map((p) => p.id)).toEqual(ALL_MOODS);
    for (const p of presets) {
      expect(p.labelKo.length).toBeGreaterThan(4);
      expect(p.neonPaletteOklch.length).toBeGreaterThanOrEqual(2);
      expect(p.windowKelvinRange[0]).toBeGreaterThanOrEqual(2700);
      expect(p.windowKelvinRange[1]).toBeLessThanOrEqual(6500);
      expect(CITYSCAPE_NIGHT_PRESETS[p.id]).toBe(p);
    }
    expect(getCityscapeMoodPreset("cyber-neon-alley").neonBloomStrength).toBeGreaterThan(
      getCityscapeMoodPreset("quiet-midnight-apartment").neonBloomStrength,
    );
  });

  it("시간대 정규화가 19..23시, 0..4시, 24..28시 및 경계 외 값을 안전하게 매핑한다", () => {
    expect(normalizeHourOfNight(19)).toEqual({ clockHour: 19, hoursSinceEveningStart: 0 });
    expect(normalizeHourOfNight(0)).toEqual({ clockHour: 0, hoursSinceEveningStart: 5 });
    expect(normalizeHourOfNight(24)).toEqual({ clockHour: 0, hoursSinceEveningStart: 5 });
    expect(normalizeHourOfNight(3)).toEqual({ clockHour: 3, hoursSinceEveningStart: 8 });
    expect(normalizeHourOfNight(27)).toEqual({ clockHour: 3, hoursSinceEveningStart: 8 });
    expect(normalizeHourOfNight(14).clockHour).toBe(19);
    expect(normalizeHourOfNight(8).clockHour).toBe(4);
  });

  it("모든 프리셋에서 19~21시(0.65~0.80) → 자정(0.28~0.42) → 새벽 3시(0.08~0.18)로 점등률이 단조 감쇠한다", () => {
    for (const moodId of ALL_MOODS) {
      const h19 = computeNightOccupancyRatio(19, moodId);
      const h21 = computeNightOccupancyRatio(21, moodId);
      const h00 = computeNightOccupancyRatio(0, moodId);
      const h03 = computeNightOccupancyRatio(3, moodId);
      const h04 = computeNightOccupancyRatio(4, moodId);
      expect(h19).toBeGreaterThanOrEqual(0.65);
      expect(h19).toBeLessThanOrEqual(0.80);
      expect(h21).toBeGreaterThanOrEqual(0.65);
      expect(h21).toBeLessThanOrEqual(0.80);
      expect(h00).toBeGreaterThanOrEqual(0.28);
      expect(h00).toBeLessThanOrEqual(0.42);
      expect(h03).toBeGreaterThanOrEqual(0.08);
      expect(h03).toBeLessThanOrEqual(0.18);
      expect(h19).toBeGreaterThan(h21);
      expect(h21).toBeGreaterThan(h00);
      expect(h00).toBeGreaterThan(h03);
      expect(h03).toBeGreaterThan(h04);
    }
  });

  it("실제 생성된 빌딩 창문 점등률도 19시 > 자정 0시 > 새벽 3시 순으로 단조 감소한다", () => {
    const mk = (hourOfNight: number) =>
      generateBuildingFacadeWindows({
        buildingId: "tower-a",
        moodId: "seoul-gangnam-noir",
        hourOfNight,
        floors: 14,
        columns: 10,
        seed: "decay-test",
      });
    const b19 = mk(19);
    const b00 = mk(0);
    const b03 = mk(3);
    expect(b19.actualOccupancyRatio).toBeGreaterThanOrEqual(0.65);
    expect(b19.actualOccupancyRatio).toBeLessThanOrEqual(0.82);
    expect(b00.actualOccupancyRatio).toBeGreaterThanOrEqual(0.27);
    expect(b00.actualOccupancyRatio).toBeLessThanOrEqual(0.44);
    expect(b03.actualOccupancyRatio).toBeGreaterThanOrEqual(0.07);
    expect(b03.actualOccupancyRatio).toBeLessThanOrEqual(0.20);
    expect(b19.actualOccupancyRatio).toBeGreaterThan(b00.actualOccupancyRatio);
    expect(b00.actualOccupancyRatio).toBeGreaterThan(b03.actualOccupancyRatio);
  });
});

describe("Wave 151 — 창문 공간 군집, 비반복성 및 실내 시차 오프셋", () => {
  it("같은 층 사무실 연속 점등 군집(2~4칸)이 형성되고 군집 내부 색온도 일관성이 유지된다", () => {
    const res = generateBuildingFacadeWindows({
      buildingId: "gangnam-hq",
      moodId: "seoul-gangnam-noir",
      hourOfNight: 21,
      floors: 12,
      columns: 10,
      seed: "cluster-check",
    });
    expect(res.clusterCount).toBeGreaterThan(0);
    expect(res.averageClusterSize).toBeGreaterThanOrEqual(1.8);
    const byCluster = new Map<string, number[]>();
    for (const w of res.windows) {
      if (w.lit && w.clusterId) {
        const list = byCluster.get(w.clusterId) ?? [];
        list.push(w.kelvin);
        byCluster.set(w.clusterId, list);
      }
    }
    let multiCount = 0;
    for (const kelvins of byCluster.values()) {
      if (kelvins.length >= 2) {
        multiCount += 1;
        expect(Math.max(...kelvins) - Math.min(...kelvins)).toBeLessThanOrEqual(320);
      }
    }
    expect(multiCount).toBeGreaterThan(4);
  });

  it("4종 무드와 심야 시간대 모두 동일 행 해시 반복률이 0.15 미만이다", () => {
    for (const moodId of ALL_MOODS) {
      for (const hour of [20, 0, 3]) {
        const res = generateBuildingFacadeWindows({
          buildingId: `bldg-${moodId}-${hour}`,
          moodId,
          hourOfNight: hour,
          floors: 16,
          columns: 9,
          seed: `non-repeat-${moodId}-${hour}`,
        });
        expect(res.rowHashRepetitionRate).toBeLessThan(0.15);
        const uniqueMasks = new Set<string>();
        for (let f = 0; f < res.floors; f += 1) {
          uniqueMasks.add(
            res.windows
              .filter((w) => w.floor === f)
              .sort((a, b) => a.column - b.column)
              .map((w) => (w.lit ? "1" : "0"))
              .join(""),
          );
        }
        expect((res.floors - uniqueMasks.size) / res.floors).toBeLessThan(0.15);
      }
    }
  });

  it("동일 시드는 완전히 동일한 창문 격자를, 다른 시드는 서로 다른 패턴을 생성한다", () => {
    const base = { buildingId: "det-tower", moodId: "hongdae-warm-alley" as const, hourOfNight: 22, floors: 10, columns: 8 };
    const runA = generateBuildingFacadeWindows({ ...base, seed: "seed-alpha" });
    const runB = generateBuildingFacadeWindows({ ...base, seed: "seed-alpha" });
    const runC = generateBuildingFacadeWindows({ ...base, seed: "seed-beta" });
    expect(runA).toEqual(runB);
    expect(runA.rowBitmasks).not.toEqual(runC.rowBitmasks);
  });

  it("모든 점등 창문이 유효한 실내 깊이(2.0..6.0m), 블라인드 차단율(0..0.85), 색온도(2700..6500K)를 가진다", () => {
    const res = generateBuildingFacadeWindows({
      buildingId: "apt-101",
      moodId: "quiet-midnight-apartment",
      hourOfNight: 23,
      floors: 12,
      columns: 8,
      seed: "range-check",
    });
    for (const w of res.windows) {
      expect(w.interiorDepthM).toBeGreaterThanOrEqual(2.0);
      expect(w.interiorDepthM).toBeLessThanOrEqual(6.0);
      expect(w.blindClosureRatio).toBeGreaterThanOrEqual(0);
      expect(w.blindClosureRatio).toBeLessThanOrEqual(0.85);
      expect(w.kelvin).toBeGreaterThanOrEqual(2700);
      expect(w.kelvin).toBeLessThanOrEqual(6500);
      expect(w.oklchCss.startsWith("oklch(")).toBe(true);
    }
  });

  it("실내 시차 오프셋이 정면 정렬 시 0이고 실내 깊이가 깊어질수록 단조 증가한다", () => {
    const centered = computeInteriorParallaxOffset({
      windowCenterNormX: 0.2, windowCenterNormY: -0.1, cameraOffsetX: 0.2, cameraOffsetY: -0.1, interiorDepthM: 4.0,
    });
    expect(centered.backWallOffsetU).toBe(0);
    expect(centered.backWallOffsetV).toBe(0);
    expect(centered.visibleSideWall).toBe("none");
    expect(centered.visibleHorizontalSurface).toBe("none");

    const shallow = computeInteriorParallaxOffset({
      windowCenterNormX: 0, windowCenterNormY: 0, cameraOffsetX: 1.0, cameraOffsetY: 0.6, interiorDepthM: 2.0,
    });
    const deep = computeInteriorParallaxOffset({
      windowCenterNormX: 0, windowCenterNormY: 0, cameraOffsetX: 1.0, cameraOffsetY: 0.6, interiorDepthM: 6.0,
    });
    expect(deep.backWallOffsetU).toBeGreaterThan(shallow.backWallOffsetU);
    expect(deep.backWallOffsetV).toBeGreaterThan(shallow.backWallOffsetV);
    expect(deep.effectiveParallaxMagnitude).toBeGreaterThan(shallow.effectiveParallaxMagnitude);
    expect(Math.abs(deep.backWallOffsetU)).toBeGreaterThan(Math.abs(deep.midFurnitureOffsetU));
    expect(deep.visibleSideWall).toBe("left");
    expect(deep.visibleHorizontalSurface).toBe("ceiling");
  });

  it("카메라 좌우 반전 시 실내 시차 오프셋 부호와 가시 내벽 방향이 대칭 반전된다", () => {
    const rightCam = computeInteriorParallaxOffset({
      windowCenterNormX: 0, windowCenterNormY: 0, cameraOffsetX: 0.9, cameraOffsetY: -0.5, interiorDepthM: 4.5,
    });
    const leftCam = computeInteriorParallaxOffset({
      windowCenterNormX: 0, windowCenterNormY: 0, cameraOffsetX: -0.9, cameraOffsetY: 0.5, interiorDepthM: 4.5,
    });
    expect(rightCam.backWallOffsetU).toBeCloseTo(-leftCam.backWallOffsetU, 4);
    expect(rightCam.backWallOffsetV).toBeCloseTo(-leftCam.backWallOffsetV, 4);
    expect(rightCam.visibleSideWall).toBe("left");
    expect(leftCam.visibleSideWall).toBe("right");
    expect(rightCam.visibleHorizontalSurface).toBe("floor");
    expect(leftCam.visibleHorizontalSurface).toBe("ceiling");
  });

  it("홍대 따뜻한 골목은 강남 느와르보다 평균 창문 색온도가 낮고(따뜻하고), 주거단지는 블라인드 차단율이 높다", () => {
    const mk = (moodId: CityscapeNightMoodId) =>
      generateBuildingFacadeWindows({ buildingId: moodId, moodId, hourOfNight: 21, floors: 12, columns: 10, seed: "mood-cmp" });
    const avgK = (wins: readonly { readonly lit: boolean; readonly kelvin: number }[]) => {
      const lit = wins.filter((w) => w.lit);
      return lit.reduce((a, w) => a + w.kelvin, 0) / Math.max(1, lit.length);
    };
    const avgB = (wins: readonly { readonly blindClosureRatio: number }[]) =>
      wins.reduce((a, w) => a + w.blindClosureRatio, 0) / Math.max(1, wins.length);
    const hd = mk("hongdae-warm-alley");
    const gn = mk("seoul-gangnam-noir");
    const apt = mk("quiet-midnight-apartment");
    expect(avgK(hd.windows)).toBeLessThan(avgK(gn.windows));
    expect(avgB(apt.windows)).toBeGreaterThan(avgB(gn.windows));
  });

  it("실내 시차 계산기가 비정상 깊이·NaN 입력을 [2.0..6.0m] 범위로 안전 클램핑한다", () => {
    const mk = (interiorDepthM: number) =>
      computeInteriorParallaxOffset({
        windowCenterNormX: 0, windowCenterNormY: 0, cameraOffsetX: 0.8, cameraOffsetY: 0.4, interiorDepthM,
      });
    expect(mk(0.1)).toEqual(mk(2.0));
    expect(mk(99)).toEqual(mk(6.0));
    const nanSafe = computeInteriorParallaxOffset({
      windowCenterNormX: Number.NaN, windowCenterNormY: Number.POSITIVE_INFINITY, cameraOffsetX: 0.5, cameraOffsetY: 0.2, interiorDepthM: Number.NaN,
    });
    expect(Number.isFinite(nanSafe.backWallOffsetU)).toBe(true);
    expect(Number.isFinite(nanSafe.ceilingLightOffsetV)).toBe(true);
  });
});

describe("Wave 151 — 한/일/영 세로·가로 네온 간판 무충돌 및 보호 박스 배치", () => {
  it("한글·일본어·영문·혼합 문자열 스크립트를 정확히 판별한다", () => {
    expect(detectSignboardScript("강남 심야 카페")).toBe("ko");
    expect(detectSignboardScript("深夜珈琲店")).toBe("ja");
    expect(detectSignboardScript("NOIR JAZZ")).toBe("en");
    expect(detectSignboardScript("홍대 LP BAR")).toBe("mixed");
  });

  it("세로·가로 간판이 글자 수에 맞춘 종횡비로 피팅되며 상호 겹침 0건·경계 이탈 0건을 보장한다", () => {
    const facadeRect = { x: 40, y: 60, width: 260, height: 340 };
    const candidates: readonly NeonSignboardCandidate[] = [
      { id: "s1", text: "강남법률사무소", preferredOrientation: "vertical", priority: 95, preferredZone: "edge-left" },
      { id: "s2", text: "深夜食堂", preferredOrientation: "vertical", priority: 90, preferredZone: "edge-right" },
      { id: "s3", text: "NOIR BAR", preferredOrientation: "horizontal", priority: 85, preferredZone: "lower" },
      { id: "s4", text: "24시 카페", preferredOrientation: "horizontal", priority: 80, preferredZone: "mid" },
      { id: "s5", text: "CYBER 99", preferredOrientation: "horizontal", priority: 75, preferredZone: "upper" },
    ];
    const res = placeFacadeNeonSignboards({
      buildingId: "fg-main", moodId: "seoul-gangnam-noir", facadeRect, candidates, minGapPx: 8, facadePaddingPx: 6, seed: "sign-fit",
    });
    expect(res.placedSigns.length).toBeGreaterThanOrEqual(4);
    expect(res.signOverlapCount).toBe(0);
    expect(res.keepOutViolationCount).toBe(0);
    expect(res.outOfBoundsCount).toBe(0);
    for (const sign of res.placedSigns) {
      expect(rectInsideBounds(sign.rect, facadeRect)).toBe(true);
      if (sign.orientation === "vertical") {
        expect(sign.rect.height).toBeGreaterThan(sign.rect.width);
        expect(sign.aspectRatio).toBeLessThan(1);
      } else {
        expect(sign.rect.width).toBeGreaterThan(sign.rect.height);
        expect(sign.aspectRatio).toBeGreaterThan(1);
      }
    }
    for (let i = 0; i < res.placedSigns.length; i += 1) {
      for (let j = i + 1; j < res.placedSigns.length; j += 1) {
        const a = res.placedSigns[i];
        const b = res.placedSigns[j];
        if (a && b) expect(rectOverlaps(a.rect, b.rect, 0)).toBe(false);
      }
    }
  });

  it("글자 수가 긴 간판이 짧은 간판보다 주축 길이가 더 길게 피팅된다", () => {
    const placed = placeFacadeNeonSignboards({
      buildingId: "aspect-bldg",
      moodId: "hongdae-warm-alley",
      facadeRect: { x: 0, y: 0, width: 320, height: 320 },
      candidates: [
        { id: "v-short", text: "술집", preferredOrientation: "vertical", fontSizePx: 12, priority: 90, preferredZone: "edge-left" },
        { id: "v-long", text: "연남동심야식당", preferredOrientation: "vertical", fontSizePx: 12, priority: 89, preferredZone: "edge-right" },
        { id: "h-short", text: "BAR", preferredOrientation: "horizontal", fontSizePx: 12, priority: 85, preferredZone: "upper" },
        { id: "h-long", text: "MIDNIGHT LOUNGE", preferredOrientation: "horizontal", fontSizePx: 12, priority: 84, preferredZone: "lower" },
      ],
      seed: "aspect-seed",
    });
    const byId = (id: string) => placed.placedSigns.find((s) => s.id === id);
    const vShort = byId("v-short");
    const vLong = byId("v-long");
    const hShort = byId("h-short");
    const hLong = byId("h-long");
    expect(vShort && vLong && hShort && hLong).toBeTruthy();
    if (vShort && vLong && hShort && hLong) {
      expect(vLong.rect.height).toBeGreaterThan(vShort.rect.height);
      expect(hLong.rect.width).toBeGreaterThan(hShort.rect.width);
    }
  });

  it("주인공 실루엣 보호 박스(Keep-Out Box)를 절대 침범하지 않는다(keepOutViolationCount === 0)", () => {
    const keepOutBoxes: readonly KeepOutBox2D[] = [
      { id: "hero-silhouette", labelKo: "주인공 실루엣", x: 70, y: 80, width: 120, height: 220, paddingPx: 10 },
    ];
    const res = placeFacadeNeonSignboards({
      buildingId: "hero-backdrop",
      moodId: "cyber-neon-alley",
      facadeRect: { x: 0, y: 0, width: 260, height: 340 },
      candidates: [
        { id: "k1", text: "네오바", preferredOrientation: "vertical", priority: 95 },
        { id: "k2", text: "電脳", preferredOrientation: "vertical", priority: 90 },
        { id: "k3", text: "CYBER", preferredOrientation: "horizontal", priority: 85 },
        { id: "k4", text: "CLUB 9", preferredOrientation: "horizontal", priority: 80 },
      ],
      keepOutBoxes,
      seed: "keepout-seed",
    });
    expect(res.keepOutViolationCount).toBe(0);
    expect(res.signOverlapCount).toBe(0);
    expect(res.placedSigns.length).toBeGreaterThan(0);
    const expandedHero = { x: 60, y: 70, width: 140, height: 240 };
    for (const sign of res.placedSigns) expect(rectOverlaps(sign.rect, expandedHero, 0)).toBe(false);
  });

  it("보호 박스가 건물 전체를 덮으면 억지 배치하지 않고 keep-out-blocked로 안전 스킵한다", () => {
    const res = placeFacadeNeonSignboards({
      buildingId: "blocked-bldg",
      moodId: "seoul-gangnam-noir",
      facadeRect: { x: 10, y: 10, width: 120, height: 140 },
      candidates: [{ id: "b1", text: "강남역", preferredOrientation: "horizontal" }],
      keepOutBoxes: [{ id: "full-cover", labelKo: "전면 보호", x: 0, y: 0, width: 160, height: 180 }],
    });
    expect(res.placedSigns).toHaveLength(0);
    expect(res.keepOutViolationCount).toBe(0);
    expect(res.skippedSigns[0]?.reason).toBe("keep-out-blocked");
  });

  it("건물 폭보다 지나치게 큰 간판은 exceeds-facade-bounds로 스킵하고, 우선순위가 높은 간판이 먼저 자리를 확보한다", () => {
    const res = placeFacadeNeonSignboards({
      buildingId: "tiny-shop",
      moodId: "hongdae-warm-alley",
      facadeRect: { x: 0, y: 0, width: 72, height: 64 },
      candidates: [
        { id: "huge", text: "초대형긴이름네온간판테스트문자열", preferredOrientation: "horizontal", fontSizePx: 18, priority: 95 },
        { id: "high", text: "BAR", preferredOrientation: "horizontal", fontSizePx: 11, priority: 90 },
        { id: "low", text: "PUB", preferredOrientation: "horizontal", fontSizePx: 11, priority: 10 },
      ],
      minGapPx: 10,
      facadePaddingPx: 6,
      seed: "prio-test",
    });
    expect(res.outOfBoundsCount).toBe(0);
    expect(res.signOverlapCount).toBe(0);
    expect(res.skippedSigns.some((s) => s.id === "huge" && s.reason === "exceeds-facade-bounds")).toBe(true);
    expect(res.placedSigns[0]?.id).toBe("high");
  });
});

describe("Wave 151 — Kelvin→OKLCH 변환, 60-30-10 조화 감사 및 자동 보정", () => {
  it("kelvinToOklch가 2700K(따뜻한 호박색), 5500K(중립 백색), 8500K(차가운 청백색)를 물리적으로 정확히 산출한다", () => {
    const warm2700 = kelvinToOklch(2700);
    const neutral5500 = kelvinToOklch(5500);
    const cool8500 = kelvinToOklch(8500);
    expect(warm2700.h).toBeGreaterThanOrEqual(45);
    expect(warm2700.h).toBeLessThanOrEqual(90);
    expect(warm2700.c).toBeGreaterThan(0.08);
    expect(neutral5500.c).toBeLessThan(0.045);
    expect(neutral5500.l).toBeGreaterThan(0.90);
    expect(cool8500.h).toBeGreaterThanOrEqual(220);
    expect(cool8500.h).toBeLessThanOrEqual(280);
    expect(cool8500.c).toBeGreaterThan(0.02);
    const nanFallback = kelvinToOklch(Number.NaN);
    expect(Number.isFinite(nanFallback.l) && Number.isFinite(nanFallback.c) && Number.isFinite(nanFallback.h)).toBe(true);
  });

  it("거리 대기 감쇠가 멀어질수록 채도를 단조롭게 낮추며 안개색으로 수렴한다", () => {
    const haze = { l: 0.22, c: 0.028, h: 250 };
    const neon = { l: 0.74, c: 0.19, h: 35 };
    const near = applyAtmosphericDepthAttenuation(neon, haze, 20, 0.009);
    const mid = applyAtmosphericDepthAttenuation(neon, haze, 80, 0.009);
    const far = applyAtmosphericDepthAttenuation(neon, haze, 180, 0.009);
    expect(near.c).toBeGreaterThan(mid.c);
    expect(mid.c).toBeGreaterThan(far.c);
    expect(near.l).toBeGreaterThan(mid.l);
    expect(mid.l).toBeGreaterThan(far.l);
  });

  it("4종 무드 기본 씬이 모두 간판 겹침 0건·원근 채도 단조 감쇠(근경 > 중경 > 원경)를 만족한다", () => {
    for (const moodId of ALL_MOODS) {
      const scene = generateCityscapeNightScene({
        moodId,
        hourOfNight: 22,
        seed: `scene-clean-${moodId}`,
        keepOutBoxes: [{ id: "hero", labelKo: "주인공", x: 420, y: 260, width: 110, height: 220 }],
      });
      const audit = auditCityscapeNightHarmony(scene);
      expect(scene.signOverlapCount).toBe(0);
      expect(scene.keepOutViolationCount).toBe(0);
      expect(scene.outOfBoundsSignCount).toBe(0);
      expect(scene.averageRowHashRepetitionRate).toBeLessThan(0.15);
      expect(audit.dominantRatio + audit.secondaryRatio + audit.accentRatio).toBeCloseTo(1, 2);
      expect(audit.isDepthChromaMonotonic).toBe(true);
      expect(audit.depthBandMetrics.foreground.meanChroma).toBeGreaterThan(audit.depthBandMetrics.midground.meanChroma);
      expect(audit.depthBandMetrics.midground.meanChroma).toBeGreaterThan(audit.depthBandMetrics.background.meanChroma);
      expect(audit.passed).toBe(true);
    }
  });

  it("네온 과밀(> 18%), 5종 이상 채도 충돌, 원경 대기 감쇠 역전을 각각 탐지하고 자동 보정한다", () => {
    const baseScene = generateCityscapeNightScene({ moodId: "cyber-neon-alley", hourOfNight: 21, seed: "broken-harmony" });
    const bloatedSigns: PlacedNeonSignboard[] = [15, 75, 135, 195, 265, 325].map((hue, idx) => {
      const color = { l: 0.78, c: 0.23, h: hue };
      return {
        id: `clash-${idx}`, buildingId: "fg-left", text: `CLASH ${idx}`, script: "en", orientation: "horizontal",
        rect: { x: 20 + idx * 14, y: 120 + idx * 36, width: 185, height: 95 },
        aspectRatio: 1.947, fontSizePx: 18, characterCount: 7, priority: 90 - idx,
        accentColorOklch: color, accentColorCss: formatOklchCss(color), glowRadiusPx: 20,
      };
    });
    const brokenScene: CityscapeNightScene = {
      ...baseScene,
      buildings: baseScene.buildings.map((b) =>
        b.id === "fg-left"
          ? { ...b, signboards: bloatedSigns }
          : b.depthBand === "background"
            ? { ...b, facadeBaseOklch: { l: 0.84, c: 0.24, h: 40 }, facadeBaseCss: formatOklchCss({ l: 0.84, c: 0.24, h: 40 }) }
            : b,
      ),
    };
    const brokenAudit = auditCityscapeNightHarmony(brokenScene);
    const codes = brokenAudit.issues.map((i) => i.code);
    expect(brokenAudit.accentRatio).toBeGreaterThan(0.18);
    expect(brokenAudit.distinctNeonHueCount).toBeGreaterThanOrEqual(5);
    expect(brokenAudit.isDepthChromaMonotonic).toBe(false);
    expect(codes).toContain("neon-overcrowding");
    expect(codes).toContain("neon-hue-clash");
    expect(codes).toContain("depth-haze-inversion");
    expect(brokenAudit.passed).toBe(false);

    const repaired = harmonizeCityscapeNightPalette(brokenScene);
    expect(repaired.afterAudit.harmonyScore).toBeGreaterThan(repaired.beforeAudit.harmonyScore);
    expect(repaired.afterAudit.accentRatio).toBeLessThanOrEqual(0.18);
    expect(repaired.afterAudit.distinctNeonHueCount).toBeLessThanOrEqual(4);
    expect(repaired.afterAudit.isDepthChromaMonotonic).toBe(true);
    expect(repaired.afterAudit.depthBandMetrics.foreground.meanChroma).toBeGreaterThan(
      repaired.afterAudit.depthBandMetrics.midground.meanChroma,
    );
    expect(repaired.afterAudit.depthBandMetrics.midground.meanChroma).toBeGreaterThan(
      repaired.afterAudit.depthBandMetrics.background.meanChroma,
    );
    expect(repaired.afterAudit.issues.filter((i) => i.severity === "error")).toHaveLength(0);
    expect(repaired.adjustmentsKo.length).toBeGreaterThanOrEqual(3);
  });

  it("이미 조화 기준을 만족하는 씬에 자동 보정을 적용해도 통과 상태와 단조 감쇠가 그대로 유지된다", () => {
    const clean = generateCityscapeNightScene({ moodId: "seoul-gangnam-noir", hourOfNight: 22, seed: "already-balanced" });
    const result = harmonizeCityscapeNightPalette(clean);
    expect(result.beforeAudit.passed).toBe(true);
    expect(result.afterAudit.passed).toBe(true);
    expect(result.afterAudit.isDepthChromaMonotonic).toBe(true);
    expect(result.adjustmentsKo[0]).toContain("이미 60-30-10 조화 기준을 충족");
  });
});

describe("Wave 151 — FIPS 180-4 SHA-256 결정론 및 키 순서 무관 지문", () => {
  it("표준 NIST FIPS 180-4 테스트 벡터와 정확히 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Utf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("매니페스트 지문이 키 삽입 순서와 무관하게 동일한 64자리 해시를 산출한다", () => {
    const hashA = cityscapeManifestSha256Hex({ mood: "seoul-gangnam-noir", hour: 23, flags: { a: 1, b: -0 } });
    const hashB = cityscapeManifestSha256Hex({ flags: { b: 0, a: 1 }, hour: 23, mood: "seoul-gangnam-noir" });
    const hashC = cityscapeManifestSha256Hex({ mood: "hongdae-warm-alley", hour: 23, flags: { a: 1, b: 0 } });
    expect(hashA).toMatch(/^[0-9a-f]{64}$/u);
    expect(hashA).toBe(hashB);
    expect(hashA).not.toBe(hashC);
  });

  it("동일 시드 씬의 감사 매니페스트 SHA-256이 재실행 시 바이트 단위로 동일하다", () => {
    const a1 = auditCityscapeNightHarmony(generateCityscapeNightScene({ moodId: "hongdae-warm-alley", hourOfNight: 0, seed: "sha-det" }));
    const a2 = auditCityscapeNightHarmony(generateCityscapeNightScene({ moodId: "hongdae-warm-alley", hourOfNight: 0, seed: "sha-det" }));
    expect(a1.manifestSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
    expect(a1.manifestSha256Hex).toBe(a2.manifestSha256Hex);
  });
});

describe("Wave 151 — WebGPU WGSL 인테리어 패럴랙스 · 네온 블룸 파사드 셰이더", () => {
  it("4종 무드 WGSL 생성 결과가 16바이트 정렬(80B), 바인딩 3개, 진입점 2개 및 유효성 검증을 통과한다", () => {
    for (const moodId of ALL_MOODS) {
      const artifact = buildCityscapeNightFacadeWgsl(moodId);
      const check = validateCityscapeNightFacadeWgsl(artifact.wgsl, artifact.uniformBufferByteLength);
      expect(artifact.uniformBufferByteLength).toBe(80);
      expect(artifact.uniformAlignmentBytes).toBe(16);
      expect(artifact.bindings).toHaveLength(3);
      expect(artifact.entryPoints).toEqual(["vs_cityscape_facade", "fs_cityscape_facade"]);
      expect(artifact.wgslSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
      expect(check.valid).toBe(true);
      expect(check.errors).toEqual([]);
      expect(check.isUniform16ByteAligned).toBe(true);
      expect(check.uniformBufferByteLength).toBe(80);
    }
  });

  it("손상된 WGSL(괄호 불균형)을 정확히 거부한다", () => {
    const base = buildCityscapeNightFacadeWgsl("seoul-gangnam-noir").wgsl;
    const check = validateCityscapeNightFacadeWgsl(`${base}\nfn broken_fn() { let x: f32 = 1.0;`);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("괄호"))).toBe(true);
  });

  it("중복 바인딩(@group(0) @binding(0))을 정확히 거부한다", () => {
    const dup = buildCityscapeNightFacadeWgsl("seoul-gangnam-noir").wgsl.replace("@group(0) @binding(1)", "@group(0) @binding(0)");
    const check = validateCityscapeNightFacadeWgsl(dup);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("중복 바인딩"))).toBe(true);
  });

  it("16바이트 정렬이 깨진 유니폼 구조체를 정확히 거부한다", () => {
    const misaligned = buildCityscapeNightFacadeWgsl("cyber-neon-alley").wgsl.replace(
      "moonlight_rgb_and_mode: vec4<f32>,",
      "moonlight_rgb_and_mode: vec4<f32>,\n  stray_scalar: f32,",
    );
    const check = validateCityscapeNightFacadeWgsl(misaligned, 80);
    expect(check.valid).toBe(false);
    expect(check.isUniform16ByteAligned).toBe(false);
    expect(check.errors.some((e) => e.includes("16바이트 배수"))).toBe(true);
  });

  it("GLSL 금지어(gl_FragCoord, sampler2D, bare vec3)가 섞인 셰이더를 거부한다", () => {
    const base = buildCityscapeNightFacadeWgsl("hongdae-warm-alley").wgsl;
    const check = validateCityscapeNightFacadeWgsl(`${base}\nfn bad() { let p = vec3(gl_FragCoord.xy, 1.0); }`);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("gl_FragCoord"))).toBe(true);
    expect(check.errors.some((e) => e.includes("bare GLSL vec"))).toBe(true);
  });

  it("빈 WGSL 또는 핵심 함수(ray_box_interior_mapping) 누락을 거부한다", () => {
    expect(validateCityscapeNightFacadeWgsl("   ").valid).toBe(false);
    const missing = buildCityscapeNightFacadeWgsl("quiet-midnight-apartment").wgsl.replace(/ray_box_interior_mapping/gu, "noop_helper");
    const check = validateCityscapeNightFacadeWgsl(missing);
    expect(check.valid).toBe(false);
    expect(check.errors.some((e) => e.includes("ray_box_interior_mapping"))).toBe(true);
  });

  it("WGSL 옵션(방 깊이·대기 소광·블룸·블라인드 밀도)이 셰이더 상수와 SHA-256 지문에 결정론적으로 반영된다", () => {
    const defA = buildCityscapeNightFacadeWgsl("seoul-gangnam-noir");
    const defB = buildCityscapeNightFacadeWgsl("seoul-gangnam-noir");
    const custom = buildCityscapeNightFacadeWgsl("seoul-gangnam-noir", {
      defaultRoomDepthM: 5.25, extinctionBeta: 0.0145, neonBloomGain: 1.25, blindSlatDensity: 28,
    });
    expect(defA.wgslSha256Hex).toBe(defB.wgslSha256Hex);
    expect(custom.wgslSha256Hex).not.toBe(defA.wgslSha256Hex);
    expect(custom.wgsl).toContain("DEFAULT_ROOM_DEPTH_M: f32 = 5.250;");
    expect(custom.wgsl).toContain("DEFAULT_BLIND_SLATS: f32 = 28.00;");
    expect(validateCityscapeNightFacadeWgsl(custom.wgsl, custom.uniformBufferByteLength).valid).toBe(true);
  });
});

describe("Wave 151 — 순수 OKLCH 검수 SVG, XSS 이스케이프 및 한국어 QA 브리프", () => {
  it("검수 SVG가 3-심도 빌딩, 점등/소등 창문, 세로/가로 간판, 60-30-10 비율 바를 순수 OKLCH 색상으로만 출력한다", () => {
    const scene = generateCityscapeNightScene({
      moodId: "seoul-gangnam-noir",
      hourOfNight: 21,
      seed: "svg-oklch-test",
      keepOutBoxes: [{ id: "hero-1", labelKo: "주인공 영역", x: 430, y: 270, width: 100, height: 200 }],
    });
    const svg = renderCityscapeNightAuditSvg(scene, auditCityscapeNightHarmony(scene));
    expect(svg.startsWith("<svg ") && svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('data-depth-band="background"');
    expect(svg).toContain('data-depth-band="midground"');
    expect(svg).toContain('data-depth-band="foreground"');
    expect(svg).toContain('data-window-lit="true"');
    expect(svg).toContain('data-window-lit="false"');
    expect(svg).toContain('data-sign-orientation="vertical"');
    expect(svg).toContain('data-sign-orientation="horizontal"');
    expect(svg).toContain('data-harmony-ratio-bar="60-30-10"');
    expect(svg).toContain("oklch(");
    expect(/#[0-9a-f]{3,8}\b/iu.test(svg)).toBe(false);
    expect(/\b(?:rgb|rgba|hsl|hsla)\s*\(/iu.test(svg)).toBe(false);
    expect(/\b(?:NaN|Infinity)\b/u.test(svg)).toBe(false);
  });

  it("제목·간판·보호 박스 라벨의 XML/XSS 특수문자를 완전히 이스케이프한다", () => {
    const xssPayload = `<script>alert("xss")</script> & 'night'`;
    expect(escapeCityscapeSvgXml(xssPayload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;night&apos;",
    );
    const scene = generateCityscapeNightScene({
      moodId: "cyber-neon-alley",
      hourOfNight: 23,
      seed: "xss-seed",
      keepOutBoxes: [{ id: "ko<1>", labelKo: `주인공 <보호> & "안전"`, x: 420, y: 260, width: 90, height: 180 }],
      customSignCandidates: [{ id: "sig<1>", text: `BAR <A&B>`, preferredOrientation: "horizontal", priority: 95 }],
    });
    const svg = renderCityscapeNightAuditSvg(scene, auditCityscapeNightHarmony(scene), { customTitle: xssPayload });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(svg).toContain("&lt;A&amp;B&gt;");
    expect(svg).toContain("&lt;보호&gt;");
  });

  it("한국어 배경 감독 QA 브리프가 번역투 없이 실무 판정과 핵심 지표를 요약한다", () => {
    const scene = generateCityscapeNightScene({ moodId: "hongdae-warm-alley", hourOfNight: 22, seed: "brief-ready" });
    const audit = auditCityscapeNightHarmony(scene);
    const brief = summarizeCityscapeNightAuditKo(scene, audit);
    expect(brief.verdict).toBe("ready");
    expect(brief.headlineKo).toContain("출고 가능");
    expect(brief.bulletsKo.length).toBeGreaterThanOrEqual(4);
    expect(brief.signOverlapCount).toBe(0);
    expect(brief.keepOutViolationCount).toBe(0);
    expect(brief.isDepthChromaMonotonic).toBe(true);
    expect(brief.manifestSha256Hex).toBe(audit.manifestSha256Hex);
    for (const phrase of ["가능하게 합니다", "직관적인 경험을 제공합니다", "원활한 워크플로우를 보장합니다"]) {
      expect(brief.reportTextKo).not.toContain(phrase);
    }
  });

  it("조화 실패 씬과 레이아웃 위반 씬에 대해 QA 브리프가 정확한 경고 판정을 반환한다", () => {
    const base = generateCityscapeNightScene({ moodId: "quiet-midnight-apartment", hourOfNight: 1, seed: "brief-warn" });
    const layoutBroken: CityscapeNightScene = { ...base, signOverlapCount: 2 };
    const layoutBrief = summarizeCityscapeNightAuditKo(layoutBroken, auditCityscapeNightHarmony(layoutBroken));
    expect(layoutBrief.verdict).toBe("needs-layout-review");
    expect(layoutBrief.headlineKo).toContain("배치 확인 필요");

    const harmonyBroken: CityscapeNightScene = {
      ...base,
      buildings: base.buildings.map((b) =>
        b.depthBand === "background"
          ? { ...b, facadeBaseOklch: { l: 0.85, c: 0.25, h: 42 }, facadeBaseCss: formatOklchCss({ l: 0.85, c: 0.25, h: 42 }) }
          : b,
      ),
    };
    const harmonyBrief = summarizeCityscapeNightAuditKo(harmonyBroken, auditCityscapeNightHarmony(harmonyBroken));
    expect(harmonyBrief.verdict).toBe("needs-harmony-fix");
    expect(harmonyBrief.headlineKo).toContain("색조 보정 권장");
  });

  it("씬 레벨 통합 검증: 4종 무드 × 3개 시간대(19시/0시/3시) 조합이 모두 결정론적·무충돌·비반복을 충족한다", () => {
    for (const moodId of ALL_MOODS) {
      const s19 = generateCityscapeNightScene({ moodId, hourOfNight: 19, seed: `matrix-${moodId}` });
      const s00 = generateCityscapeNightScene({ moodId, hourOfNight: 0, seed: `matrix-${moodId}` });
      const s03 = generateCityscapeNightScene({ moodId, hourOfNight: 3, seed: `matrix-${moodId}` });
      expect(s19.overallOccupancyRatio).toBeGreaterThan(s00.overallOccupancyRatio);
      expect(s00.overallOccupancyRatio).toBeGreaterThan(s03.overallOccupancyRatio);
      for (const s of [s19, s00, s03]) {
        expect(s.signOverlapCount).toBe(0);
        expect(s.keepOutViolationCount).toBe(0);
        expect(s.outOfBoundsSignCount).toBe(0);
        expect(s.averageRowHashRepetitionRate).toBeLessThan(0.15);
      }
    }
  });

  it("SVG 옵션으로 보호 구역 오버레이와 60-30-10 비율 바 표시 여부를 독립 제어할 수 있다", () => {
    const scene = generateCityscapeNightScene({
      moodId: "seoul-gangnam-noir",
      hourOfNight: 22,
      seed: "svg-toggle",
      keepOutBoxes: [{ id: "hero-toggle", labelKo: "주인공", x: 400, y: 260, width: 100, height: 180 }],
    });
    const minimalSvg = renderCityscapeNightAuditSvg(scene, auditCityscapeNightHarmony(scene), {
      showKeepOutOverlay: false,
      showHarmonyRatioBar: false,
    });
    expect(minimalSvg).not.toContain('data-keepout-box="hero-toggle"');
    expect(minimalSvg).not.toContain('data-harmony-ratio-bar="60-30-10"');
    expect(/#[0-9a-f]{3,8}\b/iu.test(minimalSvg)).toBe(false);
  });
});
