import { describe, expect, it } from "vitest";

import {
  DEFAULT_ONION_SKIN,
  MAX_ONION_SKIN_FRAMES,
  normalizeOnionSkinSettings,
  normalizeOnionSkinSettingsV2,
  onionSkinLayers,
  resolveOnionSkinLayerColorRgb,
  type StudioAnimFrame,
} from "../studio-frame-animation";

import {
  DEFAULT_LIGHT_TABLE_TRANSFORM,
  applyMatrix2DToPoint,
  createEmptyLightTableState,
  identityMatrix2D,
  invertMatrix2D,
  lightTableTransformToMatrix2D,
  multiplyMatrix2D,
  patchLightTableEntryTransform,
  registerOnionSkinFramesToLightTable,
  removeLightTableEntry,
  resolveActiveLightTableStack,
  setLightTableEnabled,
  upsertCelLightTableEntry,
  upsertGlobalLightTableEntry,
} from "./studio-light-table";

function makeFrame(id: string): StudioAnimFrame {
  return { id, src: `data:image/png;base64,${id}` };
}

describe("Onion Skin v2 (studio-frame-animation 확장)", () => {
  const frames = Array.from({ length: 19 }, (_, idx) => makeFrame(`f${idx}`));

  it("최대 8장 전/후 프레임 확장과 사용자 지정 RGB 색상, 감쇠 곡선을 지원한다", () => {
    expect(MAX_ONION_SKIN_FRAMES).toBe(8);

    // 레거시 호출은 상한 3과 기존 객체 형태를 완벽히 유지한다.
    expect(normalizeOnionSkinSettings({ prevCount: 99, nextCount: -1, opacity: 2 })).toEqual({
      enabled: true,
      prevCount: 3,
      nextCount: 0,
      opacity: 1,
      tint: true,
    });

    const v2 = normalizeOnionSkinSettingsV2({
      prevCount: 8,
      nextCount: 8,
      opacity: 0.8,
      prevColorRgb: { r: 255, g: 40, b: 120 },
      nextColorRgb: { r: 20, g: 210, b: 140 },
      opacityFalloff: "exponential",
      falloffRatio: 0.5,
    });
    expect(v2.prevCount).toBe(8);
    expect(v2.nextCount).toBe(8);

    const layers = onionSkinLayers(frames, 9, v2);
    expect(layers).toHaveLength(16);
    expect(layers[0]!.offset).toBe(-1);
    expect(layers[0]!.opacity).toBeCloseTo(0.8, 6);
    expect(layers[1]!.opacity).toBeCloseTo(0.4, 6);
    expect(layers[2]!.opacity).toBeCloseTo(0.2, 6);
    expect(layers[7]!.offset).toBe(-8);
    expect(layers[15]!.offset).toBe(8);
    expect(resolveOnionSkinLayerColorRgb(layers[0]!, v2)).toEqual({ r: 255, g: 40, b: 120 });
    expect(resolveOnionSkinLayerColorRgb(layers[8]!, v2)).toEqual({ r: 20, g: 210, b: 140 });
  });

  it("excludedFrames에 지정된 프레임 ID와 인덱스를 어니언스킨 레이어에서 건너뛴다", () => {
    const settings = normalizeOnionSkinSettingsV2({
      prevCount: 3,
      nextCount: 3,
      opacity: 0.6,
      opacityFalloff: "linear",
      excludedFrames: ["f8", 11],
    });
    const layers = onionSkinLayers(frames, 9, settings);
    const ids = layers.map((l) => l.frame.id);
    expect(ids).toEqual(["f7", "f6", "f10", "f12"]);
    expect(ids).not.toContain("f8");
    expect(ids).not.toContain("f11");
  });
});

describe("studio-light-table — 라이트 테이블 및 2x3 행렬 연산", () => {
  it("2x3 행렬 곱셈·역행렬·피벗 변환이 기하학적으로 정확하다", () => {
    const id = identityMatrix2D();
    expect(applyMatrix2DToPoint(id, 12, -7)).toEqual({ x: 12, y: -7 });

    const mat = lightTableTransformToMatrix2D(
      { tx: 20, ty: -10, scale: 2, rotationDeg: 90, flipX: true },
      { x: 50, y: 50 },
    );
    const transformed = applyMatrix2DToPoint(mat, 60, 50);
    // (60,50) - (50,50) = (10,0) -> flipX: (-10,0) -> scale 2: (-20,0) -> rot 90deg: (0,-20) -> +(50+20, 50-10) = (70, 20)
    expect(transformed.x).toBeCloseTo(70, 6);
    expect(transformed.y).toBeCloseTo(20, 6);

    const inv = invertMatrix2D(mat);
    expect(inv).not.toBeNull();
    const roundTrip = applyMatrix2DToPoint(multiplyMatrix2D(inv!, mat), 60, 50);
    expect(roundTrip.x).toBeCloseTo(60, 6);
    expect(roundTrip.y).toBeCloseTo(50, 6);
  });

  it("전역 참조와 셀 전용 참조를 합성하되 내보내기(isExporting) 및 비활성 시 완전히 제외한다", () => {
    const sourceSnapshot = makeFrame("ref-1");
    const frozenCopy = { ...sourceSnapshot };

    let state = createEmptyLightTableState(true);
    state = upsertGlobalLightTableEntry(state, {
      id: "g1",
      sourceKind: "layer",
      sourceId: "bg-sketch",
      visible: true,
      opacity: 0.4,
      tintMode: "half-color",
      tintHex: "#22c55e",
      transform: DEFAULT_LIGHT_TABLE_TRANSFORM,
    });
    state = upsertCelLightTableEntry(state, "cel-2", {
      id: "c1",
      sourceKind: "frame",
      sourceId: sourceSnapshot.id,
      visible: true,
      opacity: 0.65,
      tintMode: "colorize",
      tintHex: "#ef4444",
      transform: { tx: 5, ty: 8, scale: 1.2, rotationDeg: 15, flipX: false },
    });
    state = patchLightTableEntryTransform(state, "c1", { flipX: true }, "cel-2");

    const activeStack = resolveActiveLightTableStack(state, { activeCelId: "cel-2" });
    expect(activeStack).toHaveLength(2);
    expect(activeStack[0]!.scope).toBe("global");
    expect(activeStack[1]!.scope).toBe("cel");
    expect(activeStack[1]!.entry.transform.flipX).toBe(true);
    expect(activeStack[1]!.tintRgb).toEqual({ r: 239, g: 68, b: 68 });
    expect(activeStack.every((item) => item.excludedFromExport)).toBe(true);

    // 원본 프레임 데이터 불변 확인
    expect(sourceSnapshot).toEqual(frozenCopy);

    // 내보내기 중에는 빈 스택 반환
    expect(resolveActiveLightTableStack(state, { activeCelId: "cel-2", isExporting: true })).toEqual([]);

    // 라이트 테이블 비활성화 시 빈 스택 반환
    const disabled = setLightTableEnabled(state, false);
    expect(resolveActiveLightTableStack(disabled, { activeCelId: "cel-2" })).toEqual([]);

    // 항목 제거 확인
    const afterRemove = removeLightTableEntry(state, "c1", "cel-2");
    expect(resolveActiveLightTableStack(afterRemove, { activeCelId: "cel-2" })).toHaveLength(1);
  });

  it("registerOnionSkinFramesToLightTable로 인접 어니언스킨 프레임들을 라이트 테이블에 비파괴 등록한다", () => {
    const frames = [makeFrame("f1"), makeFrame("f2"), makeFrame("f3"), makeFrame("f4")];
    const state = registerOnionSkinFramesToLightTable(
      createEmptyLightTableState(true),
      frames,
      1,
      {
        ...DEFAULT_ONION_SKIN,
        prevCount: 1,
        nextCount: 2,
        opacity: 0.5,
        prevColorRgb: { r: 240, g: 50, b: 60 },
        nextColorRgb: { r: 40, g: 120, b: 250 },
      },
      { targetCelId: "f2" },
    );

    const stack = resolveActiveLightTableStack(state, { activeCelId: "f2" });
    expect(stack.map((s) => s.entry.sourceId)).toEqual(["f1", "f3", "f4"]);
    expect(stack[0]!.entry.tintHex).toBe("#f0323c");
    expect(stack[1]!.entry.tintHex).toBe("#2878fa");
    expect(stack[2]!.effectiveOpacity).toBeCloseTo(0.25, 6);
  });
});
