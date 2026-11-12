import { describe, expect, it } from "vitest";

import { PERFORMANCE_PRESETS } from "../../animation/presets";
import { ALL_AVAILABLE_CAPABILITIES, ALL_UNAVAILABLE_CAPABILITIES, createKitDefaultRecipe, createPresetCatalog } from "../../contracts";
import { createPaintSession } from "../../paint/paint-session";
import { APPEARANCE_PRESETS } from "../../presets";
import { createLabStore } from "../../state/lab-store";
import { createMockEngine } from "../../testing/mock-engine";

import {
  captureCharacterWorkBackup,
  computePaintSignature,
  describeUnsavedWorkKo,
  evaluateUnsavedCharacterWork,
  hasUnsavedCharacterWork,
  markCharacterWorkSaved,
  restoreCharacterWorkBackup,
} from "./unsaved-work";

function createTestStore() {
  const catalog = createPresetCatalog([...APPEARANCE_PRESETS, ...PERFORMANCE_PRESETS]);
  return createLabStore({
    catalog,
    initial: {
      recipe: createKitDefaultRecipe(),
      capabilities: ALL_AVAILABLE_CAPABILITIES,
    },
    now: () => 1000,
  });
}

describe("unsaved-work (미저장 캐릭터·페인트 작업 보호 및 스냅샷 복구)", () => {
  it("초기 상태에서 모델(소스)만 바꾼 경우는 미저장 편집으로 오탐하지 않고, 포즈·색상·페인트 편집 시 미저장으로 감지한다", () => {
    const store = createTestStore();
    const session = createPaintSession({ layerSize: 16 });

    expect(hasUnsavedCharacterWork(store, store.getState(), session)).toBe(false);

    // 모델만 탐색(source/set)한 경우에는 포즈·외형·페인트 내용 변경이 없으므로 경고 대상이 아니다
    store.dispatch({
      type: "source/set",
      source: { kind: "procedural" },
      capabilities: ALL_AVAILABLE_CAPABILITIES,
    });
    expect(hasUnsavedCharacterWork(store, store.getState(), session)).toBe(false);

    // 포즈나 색상을 실제로 편집하면 미저장 레시피 편집으로 감지된다
    store.dispatch({ type: "color/set", key: "skin", value: "#c8a080" });
    const afterColor = evaluateUnsavedCharacterWork(store, store.getState(), session);
    expect(afterColor).toEqual({
      hasUnsaved: true,
      hasUnsavedRecipe: true,
      hasUnsavedPaint: false,
    });
    expect(describeUnsavedWorkKo(afterColor)).toMatch(/캐릭터 편집/u);

    // 페인트 서브레이어(L2)에 스트로크를 칠하면 레시피 + 페인트 미저장으로 감지된다
    session.setActivePart("head");
    session.setActiveSublayer(2);
    session.setBrush({ color: "#e84a72", radiusPx: 3, opacity: 0.9 });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 }, "head");
    session.endStroke();

    const afterPaint = evaluateUnsavedCharacterWork(store, store.getState(), session);
    expect(afterPaint).toEqual({
      hasUnsaved: true,
      hasUnsavedRecipe: true,
      hasUnsavedPaint: true,
    });
    expect(describeUnsavedWorkKo(afterPaint)).toMatch(/페인트 레이어/u);

    // "레시피 저장" 완료 체크포인트를 기록하면 미저장 상태가 즉시 해제된다
    markCharacterWorkSaved(store, store.getState().recipe, session);
    expect(hasUnsavedCharacterWork(store, store.getState(), session)).toBe(false);

    // 저장 이후 서브레이어 가시성·순서를 바꾸면 다시 미저장 페인트로 감지된다
    session.setSublayerVisible("head", 2, false);
    expect(hasUnsavedCharacterWork(store, store.getState(), session)).toBe(true);
  });

  it("captureCharacterWorkBackup과 restoreCharacterWorkBackup이 레시피·슬롯 능력·6단 페인트 서브레이어·엔진 텍스처를 손실 없이 복원한다", () => {
    const store = createTestStore();
    const session = createPaintSession({ layerSize: 16 });
    const engine = createMockEngine();

    store.dispatch({ type: "color/set", key: "hair", value: "#2c3e6b" });
    session.setActivePart("head");
    session.setActiveSublayer(1);
    session.setBrush({ color: "#ff5577", radiusPx: 3, opacity: 0.85 });
    session.beginStroke({ u: 0.4, v: 0.4, pressure: 1 }, "head");
    session.endStroke();
    session.setSublayerOpacity("head", 1, 0.7);
    session.moveSublayer("head", 1, "down");

    const prePaintSig = computePaintSignature(session);
    const backup = captureCharacterWorkBackup(
      store.getState().recipe,
      store.getState().capabilities,
      session,
      2000,
    );

    // 다른 레시피와 빈 페인트로 덮어쓴 뒤 백업 복원 검증
    store.dispatch({ type: "recipe/load", recipe: createKitDefaultRecipe() });
    store.applyEvent({ type: "source/capabilities", capabilities: ALL_UNAVAILABLE_CAPABILITIES });
    session.replacePaintState({ layers: [] });
    expect(store.getState().recipe.colors.hair).not.toBe("#2c3e6b");
    expect(computePaintSignature(session)).toBe("paint:empty");

    restoreCharacterWorkBackup({
      backup,
      session,
      engine,
      dispatch: (cmd) => store.dispatch(cmd),
      applyStoreEvent: (ev) => store.applyEvent(ev),
    });

    expect(store.getState().recipe.colors.hair).toBe("#2c3e6b");
    expect(store.getState().capabilities).toBe(ALL_AVAILABLE_CAPABILITIES);
    expect(computePaintSignature(session)).toBe(prePaintSig);
    const headMetas = session.getState().sublayers.get("head");
    expect(headMetas?.[1]?.opacity).toBeCloseTo(0.7, 3);
    expect(session.getState().sublayerOrders.get("head")?.[0]).toBe(1);
    expect(engine.calls.some((call) => call.method === "updatePaintTexture")).toBe(true);
  });
});
