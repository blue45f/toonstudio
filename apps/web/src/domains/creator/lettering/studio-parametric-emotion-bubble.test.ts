import { describe, expect, it } from "vitest";

import { studioPathSignedArea } from "../studio-path-boolean";

import {
  PARAMETRIC_BUBBLE_BASE_SHAPES,
  PARAMETRIC_BUBBLE_EMOTION_PRESETS,
  PARAMETRIC_BUBBLE_PRESET_TABLE,
  PARAMETRIC_BUBBLE_SLIDER_SPECS,
  applyParametricEmotionPreset,
  collectParametricMergedGroups,
  createParametricEmotionBubble,
  generateParametricBubbleGeometry,
  mapParametricShapeToBubbleVariant,
  mergeParametricEmotionBubbles,
  normalizeParametricGeometryParams,
  splitParametricEmotionBubbleGroup,
  updateParametricBubbleInGroup,
  type ParametricBubbleSliderKey,
} from "./studio-parametric-emotion-bubble";

function ringArea(ring: readonly (readonly [number, number])[]): number {
  const flat: number[] = [];
  for (const [x, y] of ring) flat.push(x, y);
  return Math.abs(studioPathSignedArea(flat));
}

describe("Studio Parametric Emotion Bubble — 6기본형 × 9감정 × 8슬라이더", () => {
  it("6종 기본형, 9종 감정 프리셋, 8개 형상 슬라이더 카탈로그를 완비한다", () => {
    expect(PARAMETRIC_BUBBLE_BASE_SHAPES).toEqual([
      "ellipse",
      "squircle",
      "rectangle",
      "self-talk",
      "shout",
      "thought",
    ]);
    expect(PARAMETRIC_BUBBLE_EMOTION_PRESETS).toHaveLength(9);
    expect(PARAMETRIC_BUBBLE_SLIDER_SPECS.map((s) => s.key)).toEqual([
      "numPoints",
      "sharpness",
      "dynamic",
      "needleSpace",
      "length",
      "thickness",
      "numCurves",
      "convexity",
    ]);
  });

  it("6종 기본형 × 9종 감정 프리셋 54개 조합 전부 결정적이고 면적이 양수인 닫힌 패스를 생성한다", () => {
    for (const shape of PARAMETRIC_BUBBLE_BASE_SHAPES) {
      for (const preset of PARAMETRIC_BUBBLE_EMOTION_PRESETS) {
        const bubble = createParametricEmotionBubble({
          id: `${shape}-${preset}`,
          baseShape: shape,
          emotionPreset: preset,
          seed: 42,
        });
        const geomA = generateParametricBubbleGeometry(bubble);
        const geomB = generateParametricBubbleGeometry(bubble);

        expect(geomA).toEqual(geomB);
        expect(geomA.localRing.length).toBeGreaterThanOrEqual(4);
        expect(geomA.canvasRing.length).toBe(geomA.localRing.length);
        expect(ringArea(geomA.canvasRing)).toBeGreaterThan(500);
        expect(geomA.bodyPathD.startsWith("M ")).toBe(true);
        expect(geomA.bodyPathD.endsWith(" Z")).toBe(true);
        expect(geomA.bodyPathD).not.toContain("NaN");
        expect(geomA.tailPathD).not.toContain("NaN");
        expect(geomA.strokeWidth).toBe(PARAMETRIC_BUBBLE_PRESET_TABLE[preset].geometryParams.thickness);
        if (shape === "self-talk") {
          expect(geomA.needlePathsD.length).toBeGreaterThanOrEqual(12);
        }
      }
    }
  });

  it("8개 형상 슬라이더 각각을 변경하면 실제 지오메트리·선두께·가시가 반응한다", () => {
    const checks: Array<{
      readonly key: ParametricBubbleSliderKey;
      readonly shape: (typeof PARAMETRIC_BUBBLE_BASE_SHAPES)[number];
      readonly low: number;
      readonly high: number;
    }> = [
      { key: "numPoints", shape: "shout", low: 8, high: 32 },
      { key: "sharpness", shape: "shout", low: 0.1, high: 0.95 },
      { key: "dynamic", shape: "shout", low: 0, high: 0.9 },
      { key: "needleSpace", shape: "self-talk", low: 4, high: 20 },
      { key: "length", shape: "shout", low: 4, high: 40 },
      { key: "thickness", shape: "ellipse", low: 1, high: 8 },
      { key: "numCurves", shape: "thought", low: 8, high: 24 },
      { key: "convexity", shape: "squircle", low: -0.8, high: 0.9 },
    ];

    for (const check of checks) {
      const base = createParametricEmotionBubble({
        id: `slider-${check.key}`,
        baseShape: check.shape,
        emotionPreset: "custom",
        seed: 99,
      });
      const lowGeom = generateParametricBubbleGeometry(
        createParametricEmotionBubble({
          ...base,
          geometryParams: { ...base.geometryParams, [check.key]: check.low },
        }),
      );
      const highGeom = generateParametricBubbleGeometry(
        createParametricEmotionBubble({
          ...base,
          geometryParams: { ...base.geometryParams, [check.key]: check.high },
        }),
      );

      if (check.key === "thickness") {
        expect(highGeom.strokeWidth).toBeGreaterThan(lowGeom.strokeWidth);
      } else if (check.key === "needleSpace") {
        expect(lowGeom.needlePathsD.length).toBeGreaterThan(highGeom.needlePathsD.length);
      } else {
        expect(lowGeom.bodyPathD).not.toBe(highGeom.bodyPathD);
      }
    }
  });

  it("비유한·범위 이탈 파라미터를 안전 범위로 정규화한다", () => {
    const normalized = normalizeParametricGeometryParams({
      numPoints: Number.NaN,
      sharpness: 5,
      dynamic: -2,
      needleSpace: 0,
      length: 999,
      thickness: -10,
      numCurves: 100,
      convexity: -9,
    });
    expect(normalized.numPoints).toBe(16);
    expect(normalized.sharpness).toBe(1);
    expect(normalized.dynamic).toBe(0);
    expect(normalized.needleSpace).toBe(2);
    expect(normalized.length).toBe(48);
    expect(normalized.thickness).toBe(1);
    expect(normalized.numCurves).toBe(28);
    expect(normalized.convexity).toBe(-1);
  });

  it("감정 프리셋 전환·스튜디오 variant 매핑·꼬리 종류가 일관되게 동작한다", () => {
    const initial = createParametricEmotionBubble({ id: "b-preset", baseShape: "ellipse" });
    const furious = applyParametricEmotionPreset(initial, "fury", true);
    expect(furious.baseShape).toBe("shout");
    expect(furious.emotionPreset).toBe("fury");
    expect(mapParametricShapeToBubbleVariant(furious.baseShape, furious.emotionPreset)).toBe("shout");

    const thoughtBubble = createParametricEmotionBubble({
      id: "b-thought",
      baseShape: "thought",
      tail: { visible: true, targetCanvasPos: [140, 260], curveBias: 0 },
    });
    const thoughtGeom = generateParametricBubbleGeometry(thoughtBubble);
    expect(thoughtGeom.tailPathD).toContain("A ");

    const hiddenTail = createParametricEmotionBubble({
      id: "b-no-tail",
      tail: { visible: false },
    });
    expect(generateParametricBubbleGeometry(hiddenTail).tailPathD).toBe("");
  });
});

describe("Studio Parametric Emotion Bubble — 이어진 말풍선 Boolean Union 병합 & 비파괴 분할", () => {
  it("겹친 2개 말풍선을 2D Boolean Union으로 병합하면 내부 교차선이 제거된 단일 외곽선이 된다", async () => {
    const first = createParametricEmotionBubble({
      id: "bubble-a",
      x: 20,
      y: 20,
      width: 180,
      height: 110,
      baseShape: "ellipse",
      emotionPreset: "general",
      text: "잠깐만!",
      seed: 11,
    });
    const second = createParametricEmotionBubble({
      id: "bubble-b",
      x: 130,
      y: 50,
      width: 170,
      height: 105,
      baseShape: "shout",
      emotionPreset: "action",
      text: "거기 서!",
      seed: 29,
    });

    const areaA = ringArea(generateParametricBubbleGeometry(first).canvasRing);
    const areaB = ringArea(generateParametricBubbleGeometry(second).canvasRing);

    const merged = await mergeParametricEmotionBubbles([first, second], {
      groupId: "group-linked-1",
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;

    expect(merged.group.groupId).toBe("group-linked-1");
    expect(merged.group.isSingleConnectedOutline).toBe(true);
    expect(merged.group.unionPolygons).toHaveLength(1);
    expect(merged.group.unionPathD.startsWith("M ")).toBe(true);
    expect(merged.group.unionPathD.endsWith(" Z")).toBe(true);
    expect(merged.taggedMembers.every((m) => m.mergedGroupId === "group-linked-1")).toBe(true);

    // Boolean Union 면적 검증: 개별 중첩 합보다 작고(내부 교차 제거), 개별 최대보다 크다.
    const unionArea = ringArea(merged.group.unionPolygons[0]![0]!);
    expect(unionArea).toBeGreaterThan(Math.max(areaA, areaB));
    expect(unionArea).toBeLessThan(areaA + areaB);
  });

  it("분할(split) 시 원본 개별 멤버의 8파라미터·좌표·꼬리·대사를 100% 무손실 복원한다", async () => {
    const first = createParametricEmotionBubble({
      id: "member-1",
      x: 40,
      y: 30,
      width: 190,
      height: 120,
      baseShape: "squircle",
      emotionPreset: "custom",
      geometryParams: {
        numPoints: 27,
        sharpness: 0.72,
        dynamic: 0.44,
        needleSpace: 7,
        length: 23,
        thickness: 3.5,
        numCurves: 19,
        convexity: 0.65,
      },
      tail: { visible: true, targetCanvasPos: [90, 220], curveBias: 0.35 },
      text: "첫 번째 말풍선",
      seed: 101,
    });
    const second = createParametricEmotionBubble({
      id: "member-2",
      x: 150,
      y: 60,
      width: 170,
      height: 110,
      baseShape: "thought",
      emotionPreset: "comedy",
      tail: { visible: false, targetCanvasPos: [300, 240], curveBias: -0.4 },
      text: "두 번째 말풍선",
      seed: 202,
    });

    const merged = await mergeParametricEmotionBubbles([first, second], { groupId: "grp-restore" });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;

    const groupedMap = collectParametricMergedGroups(merged.taggedMembers);
    expect(groupedMap.get("grp-restore")).toHaveLength(2);

    const restored = splitParametricEmotionBubbleGroup(merged.group);
    expect(restored).toHaveLength(2);
    expect(restored[0]).toEqual({ ...first, mergedGroupId: undefined });
    expect(restored[1]).toEqual({ ...second, mergedGroupId: undefined });
  });

  it("병합 그룹 내 단일 멤버의 8파라미터를 수정하면 Boolean Union 외곽선이 실시간 재계산된다", async () => {
    const a = createParametricEmotionBubble({ id: "u1", x: 10, y: 10, width: 160, height: 100, seed: 3 });
    const b = createParametricEmotionBubble({ id: "u2", x: 100, y: 30, width: 160, height: 100, seed: 4 });
    const merged = await mergeParametricEmotionBubbles([a, b], { groupId: "grp-live" });
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;

    const updated = await updateParametricBubbleInGroup(merged.group, "u2", (member) =>
      createParametricEmotionBubble({
        ...member,
        baseShape: "shout",
        geometryParams: { ...member.geometryParams, numPoints: 28, length: 34, sharpness: 0.9 },
      }),
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.group.unionPathD).not.toBe(merged.group.unionPathD);
    expect(updated.group.members[1]!.baseShape).toBe("shout");
    expect(updated.group.members[0]!.baseShape).toBe("ellipse");
  });

  it("서로 겹치지 않는 말풍선은 기본(requireOverlap=true)에서 명확한 사유로 거부한다", async () => {
    const a = createParametricEmotionBubble({ id: "far-1", x: 0, y: 0, width: 120, height: 80 });
    const b = createParametricEmotionBubble({ id: "far-2", x: 600, y: 600, width: 120, height: 80 });

    const rejected = await mergeParametricEmotionBubbles([a, b]);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toContain("겹치지 않는");

    const single = await mergeParametricEmotionBubbles([a]);
    expect(single.ok).toBe(false);
  });
});
