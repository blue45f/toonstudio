import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";

import {
  applyWidthProfilePreset,
  computeWidthHandles,
  createCustomWidthProfilePreset,
  deleteWidthSample,
  dragWidthHandle,
  evaluateVariableWidthAtT,
  expandedOutlineToDrawElSeed,
  expandVariableWidthStrokeToOutline,
  normalizeWidthProfile,
  projectPointOntoSpine,
  slideWidthSampleAlongSpine,
  upsertWidthSampleAtT,
  WEBTOON_WIDTH_PROFILE_PRESETS,
  widthProfileFromV3Samples,
  widthProfileToV3Samples,
  type AsymmetricWidthSample,
  type SpineVec2,
} from "./studio-variable-width-tool";

const HORIZONTAL_SPINE: readonly SpineVec2[] = [
  { x: 0, y: 50 },
  { x: 100, y: 50 },
  { x: 200, y: 50 },
];

describe("studio-variable-width-tool", () => {
  it("8종 웹툰 폭 프로필 프리셋을 제공하고 칼날 비대칭 프로필의 좌·우 반폭 차이를 유지한다", () => {
    expect(WEBTOON_WIDTH_PROFILE_PRESETS).toHaveLength(8);
    const blade = applyWidthProfilePreset("blade-asymmetric", 20);
    const mid = evaluateVariableWidthAtT(blade, 0.35);
    expect(mid.rightWidthPx).toBeGreaterThan(mid.leftWidthPx * 4);
    expect(mid.totalWidthPx).toBeCloseTo(mid.leftWidthPx + mid.rightWidthPx, 2);

    const gpen = applyWidthProfilePreset("g-pen-taper", 10);
    expect(evaluateVariableWidthAtT(gpen, 0).totalWidthPx).toBeLessThan(2);
    expect(evaluateVariableWidthAtT(gpen, 0.5).totalWidthPx).toBeGreaterThan(8);
    expect(evaluateVariableWidthAtT(gpen, 1).totalWidthPx).toBeLessThan(2);
  });

  it("단조 큐빅 에르미트 보간은 급격한 폭 변화에서도 오버슈트나 음수 반폭을 만들지 않는다", () => {
    const profile = normalizeWidthProfile([
      { id: "a", t: 0, width: 0.4, leftWidthPx: 0.2, rightWidthPx: 0.2 },
      { id: "b", t: 0.3, width: 20, leftWidthPx: 14, rightWidthPx: 6 },
      { id: "c", t: 0.7, width: 20, leftWidthPx: 14, rightWidthPx: 6 },
      { id: "d", t: 1, width: 0.4, leftWidthPx: 0.2, rightWidthPx: 0.2 },
    ]);

    for (let i = 0; i <= 40; i += 1) {
      const sample = evaluateVariableWidthAtT(profile, i / 40);
      expect(sample.leftWidthPx).toBeGreaterThan(0);
      expect(sample.rightWidthPx).toBeGreaterThan(0);
      expect(sample.leftWidthPx).toBeLessThanOrEqual(14.01);
      expect(sample.rightWidthPx).toBeLessThanOrEqual(6.01);
    }
  });

  it("온캔버스 대칭 드래그 · Alt 비대칭 드래그 · 스파인 슬라이드 · 삭제를 정확히 처리한다", () => {
    let profile: readonly AsymmetricWidthSample[] = normalizeWidthProfile([], 8); // 초기 좌 4 / 우 4

    // 스파인 중앙(x=100, y=50) 투영
    const hit = projectPointOntoSpine(HORIZONTAL_SPINE, { x: 100, y: 65 });
    expect(hit.t).toBeCloseTo(0.5, 2);
    expect(hit.distancePx).toBeCloseTo(15, 1);

    // 대칭 드래그: t=0.5에서 반폭 15 -> 총폭 30
    const symDrag = dragWidthHandle(HORIZONTAL_SPINE, profile, {
      t: 0.5,
      cursor: { x: 100, y: 65 },
      symmetric: true,
    });
    profile = symDrag.profile;
    expect(symDrag.evaluated.leftWidthPx).toBeCloseTo(15, 1);
    expect(symDrag.evaluated.rightWidthPx).toBeCloseTo(15, 1);

    // Alt+드래그(비대칭): 같은 샘플의 left 측만 24px로 당김 -> right는 15px 유지
    const asymDrag = dragWidthHandle(HORIZONTAL_SPINE, profile, {
      sampleId: symDrag.activeSampleId,
      cursor: { x: 100, y: 74 },
      side: "left",
      symmetric: false,
    });
    profile = asymDrag.profile;
    expect(asymDrag.evaluated.leftWidthPx).toBeCloseTo(24, 1);
    expect(asymDrag.evaluated.rightWidthPx).toBeCloseTo(15, 1);

    // 핸들 좌표 검증
    const handles = computeWidthHandles(HORIZONTAL_SPINE, profile);
    const midHandle = handles.find((h) => h.sampleId === symDrag.activeSampleId);
    expect(midHandle?.asymmetric).toBe(true);

    // 슬라이드 & 삭제
    const slid = slideWidthSampleAlongSpine(profile, symDrag.activeSampleId, 0.7);
    expect(slid.find((s) => s.id === symDrag.activeSampleId)?.t).toBeCloseTo(0.7, 2);

    const deleted = deleteWidthSample(slid, symDrag.activeSampleId);
    expect(deleted).toHaveLength(2);
  });

  it("Expand Appearance는 비대칭 닫힌 윤곽 폴리곤을 생성하고 급커브 안쪽 루프 폴드를 정리한다", () => {
    const profile = upsertWidthSampleAtT(normalizeWidthProfile([], 6), 0.5, 18, 4);
    const outline = expandVariableWidthStrokeToOutline(HORIZONTAL_SPINE, profile, {
      capStyle: "round",
      sampleStepPx: 5,
    });

    expect(outline.outerRing.length).toBeGreaterThan(20);
    expect(outline.area).toBeGreaterThan(2000);
    // 비대칭이므로 y=50 기준 한쪽(leftNormal=+y)이 반대쪽(-y)보다 더 넓게 퍼진다
    expect(outline.bounds.maxY - 50).toBeGreaterThan(50 - outline.bounds.minY + 5);

    // 급격한 V자 꺾임에서 안쪽 루프 정리 확인
    const sharpTurnSpine: SpineVec2[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 20, y: 12 },
    ];
    const sharpOutline = expandVariableWidthStrokeToOutline(
      sharpTurnSpine,
      normalizeWidthProfile([], 24),
      { sampleStepPx: 3, capStyle: "butt" },
    );
    expect(sharpOutline.outerRing.length).toBeGreaterThan(6);
    expect(sharpOutline.area).toBeGreaterThan(0);

    // DrawEl 시드 변환 + WidthSampleV3 라운드트립 + 커스텀 프리셋 저장
    const seed = expandedOutlineToDrawElSeed(outline, { stroke: rgbToHex(18, 18, 22), opacity: 0.95 });
    expect(seed.type).toBe("draw");
    expect(seed.fill).toBe(rgbToHex(18, 18, 22));

    const v3 = widthProfileToV3Samples(profile);
    expect(v3[0]?.t).toBe(0);
    expect(v3.at(-1)?.t).toBe(1);
    const restored = widthProfileFromV3Samples(v3);
    expect(restored).toHaveLength(v3.length);

    const customPreset = createCustomWidthProfilePreset("my-katana", "내 검격 프로필", profile);
    expect(customPreset.builtin).toBe(false);
    expect(Math.max(...customPreset.samples.map((s) => s.width))).toBeCloseTo(1, 2);
  });
});
