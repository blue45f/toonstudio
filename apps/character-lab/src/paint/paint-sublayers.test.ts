import { describe, expect, it } from "vitest";

import { createPointerPaintDriver } from "./paint-bridge";
import { readPixel } from "./paint-layer";
import { createPaintSession } from "./paint-session";
import {
  PAINT_SUBLAYER_INDICES,
  createPartSublayerStack,
  moveSublayerInOrder,
  recompositePartSublayers,
} from "./paint-sublayers";

import type { PaintUndoToken, PickHit } from "../contracts";

describe("paint-sublayers (SHAPER Layer 0 ~ Layer 5)", () => {
  it("6개의 서브레이어 슬롯(0..5)을 생성하고 순서·가시성·불투명도·Undo/Redo를 일관되게 합성한다", () => {
    expect(PAINT_SUBLAYER_INDICES).toEqual([0, 1, 2, 3, 4, 5]);
    const session = createPaintSession({
      layerSize: 64,
      activePart: "head",
      brush: { radiusPx: 6, hardness: 1, opacity: 1, color: "#112233" },
    });

    // Layer 0에 어두운 선화 칠하기
    session.setActiveSublayer(0);
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    const l0Token = session.endStroke();
    expect(l0Token?.tiles.length).toBe(1);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);

    // Layer 1에 밝은 볼터치(#ff3366) 덧칠하기 (기본 순서 L0 → L1 이므로 L1이 위)
    session.setActiveSublayer(1);
    session.setBrush({ color: "#ff3366", opacity: 1, hardness: 1 });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    const l1Token = session.endStroke();
    expect(l1Token).not.toBeNull();
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);

    // Layer 1을 아래(배경 쪽)로 내리면 순서가 [1, 0, 2, 3, 4, 5]가 되어 L0 선화가 볼터치 위로 올라온다
    const moveDownToken = session.moveSublayer("head", 1, "down");
    expect(moveDownToken).not.toBeNull();
    expect(session.getState().sublayerOrders.get("head")).toEqual([1, 0, 2, 3, 4, 5]);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);

    // 순서 변경 Undo → 다시 [0, 1, 2, 3, 4, 5]로 복원되어 볼터치가 위, Redo → 다시 선화가 위
    const moveRedo = moveDownToken ? session.applyToken(moveDownToken) : null;
    expect(session.getState().sublayerOrders.get("head")).toEqual([0, 1, 2, 3, 4, 5]);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);
    const moveUndoAgain = moveRedo ? session.applyToken(moveRedo) : null;
    expect(session.getState().sublayerOrders.get("head")).toEqual([1, 0, 2, 3, 4, 5]);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);
    if (moveUndoAgain) session.applyToken(moveUndoAgain);

    // Layer 1 숨김 토글 및 불투명도 변경도 Undo/Redo 토큰을 반환하며 일관되게 되돌려진다
    const hideToken = session.setSublayerVisible("head", 1, false);
    expect(hideToken).not.toBeNull();
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);

    const showRedo = hideToken ? session.applyToken(hideToken) : null;
    expect(session.getState().sublayers.get("head")?.[1]?.visible).toBe(true);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);
    void showRedo;

    const opToken = session.setSublayerOpacity("head", 1, 0.5);
    expect(opToken).not.toBeNull();
    const blended = readPixel(session.layer("head"), 32, 32);
    expect(blended[0]).toBeGreaterThan(100);
    expect(blended[0]).toBeLessThan(255);
    const opRedo = opToken ? session.applyToken(opToken) : null;
    expect(session.getState().sublayers.get("head")?.[1]?.opacity).toBe(1);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);
    void opRedo;

    // Layer 1 스트로크만 Undo하면 Layer 0 선화만 남고, Redo하면 다시 합성된다
    const redoToken = l1Token ? session.applyToken(l1Token) : null;
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);
    if (redoToken) session.applyToken(redoToken);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);
  });

  it("뷰포트 포인터 드라이버(mergeUndoTokens 다중 세그먼트 병합)에서 Undo/Redo 시 L0~L5가 L0로 평탄화되지 않는다", () => {
    const session = createPaintSession({
      layerSize: 64,
      activePart: "head",
      brush: { radiusPx: 4, hardness: 1, opacity: 1, color: "#112233" },
    });
    // L0 밑그림
    session.setActiveSublayer(0);
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();

    // L2 문양 레이어 선택 후 포인터가 표면을 벗어났다 다시 들어오는 2-세그먼트 스트로크 실행
    session.setActiveSublayer(2);
    session.setBrush({ color: "#22cc88" });
    const commits: PaintUndoToken[] = [];
    const driver = createPointerPaintDriver(session, {
      pick: (x, y): PickHit | null => {
        if (Math.abs(x) < 0.05) return null; // 가운데 빈 공간으로 세그먼트 분리 유도
        return {
          partId: 2,
          role: "head",
          uv: [(x + 1) / 2, (1 - y) / 2],
          worldPosition: [0, 0, 0],
          worldNormal: [0, 0, 1],
          distance: 1,
        };
      },
      upload: () => undefined,
      commit: (token) => commits.push(token),
    });

    expect(driver.down({ ndcX: -0.5, ndcY: 0, pressure: 1 })).toBe(true); // 세그먼트 1 (u=0.25)
    expect(driver.move({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(0); // 표면 밖 → closeSegment
    expect(driver.move({ ndcX: 0.5, ndcY: 0, pressure: 1 })).toBe(1); // 세그먼트 2 (u=0.75)
    const merged = driver.up();
    expect(merged).not.toBeNull();
    expect(merged?.sublayerSteps).toHaveLength(2);
    expect(commits).toHaveLength(1);

    // L0 픽셀은 (32,32)에 그대로 있고, L2 픽셀은 (16,32)와 (48,32)에 분리되어 있다
    expect(readPixel(session.sublayer("head", 0), 16, 32)[3]).toBe(0);
    expect(readPixel(session.sublayer("head", 2), 16, 32)).toEqual([34, 204, 136, 255]);
    expect(readPixel(session.sublayer("head", 2), 48, 32)).toEqual([34, 204, 136, 255]);

    // 병합된 토큰 Undo → L2 두 세그먼트 모두 지워지고 L0 밑그림은 L0에 온전히 유지된다(평탄화 버그 없음)
    const redo = merged ? session.applyToken(merged) : null;
    expect(readPixel(session.sublayer("head", 2), 16, 32)[3]).toBe(0);
    expect(readPixel(session.sublayer("head", 2), 48, 32)[3]).toBe(0);
    expect(readPixel(session.sublayer("head", 0), 32, 32)).toEqual([17, 34, 51, 255]);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);

    // Redo → L2 두 세그먼트가 다시 L2에만 복원된다
    if (redo) session.applyToken(redo);
    expect(readPixel(session.sublayer("head", 2), 16, 32)).toEqual([34, 204, 136, 255]);
    expect(readPixel(session.sublayer("head", 2), 48, 32)).toEqual([34, 204, 136, 255]);
    expect(readPixel(session.sublayer("head", 0), 16, 32)[3]).toBe(0);
  });

  it("숨김(visible=false) 또는 불투명도 0%인 활성 서브레이어에는 무음 그리기를 차단하고 한글 사유를 돌려준다", () => {
    const session = createPaintSession({
      layerSize: 64,
      activePart: "head",
      activeSublayer: 1,
      brush: { radiusPx: 5, hardness: 1, opacity: 1, color: "#ff4466" },
    });
    session.setSublayerVisible("head", 1, false);
    const hiddenGuard = session.canPaintActiveSublayer("head");
    expect(hiddenGuard.ok).toBe(false);
    if (!hiddenGuard.ok) expect(hiddenGuard.reasonKo).toContain("숨김");

    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    expect(session.endStroke()).toBeNull();
    expect(session.stampDecal("blush-slash", { part: "head" })).toBeNull();
    expect(readPixel(session.sublayer("head", 1), 32, 32)[3]).toBe(0);

    const notices: Array<string | null> = [];
    const driver = createPointerPaintDriver(session, {
      pick: () => ({ partId: 1, role: "head", uv: [0.5, 0.5], worldPosition: [0, 0, 0], worldNormal: [0, 0, 1], distance: 1 }),
      upload: () => undefined,
      commit: () => undefined,
      notify: (msg) => notices.push(msg),
    });
    expect(driver.down({ ndcX: 0, ndcY: 0, pressure: 1 })).toBe(false);
    expect(notices.at(-1)).toContain("숨김");

    // 다시 표시하되 불투명도 0%일 때도 동일하게 차단
    session.setSublayerVisible("head", 1, true);
    session.setSublayerOpacity("head", 1, 0);
    const zeroGuard = session.canPaintActiveSublayer("head");
    expect(zeroGuard.ok).toBe(false);
    if (!zeroGuard.ok) expect(zeroGuard.reasonKo).toContain("0%");
  });

  it("sublayersForExport와 replacePaintState가 숨겨진 레이어 픽셀·불투명도·순서를 무손실 복원하고 기존 단일 레이어도 보존한다", () => {
    const src = createPaintSession({
      layerSize: 32,
      activePart: "head",
      brush: { radiusPx: 4, hardness: 1, opacity: 1, color: "#112233" },
    });
    src.setActiveSublayer(0);
    src.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    src.endStroke();

    src.setActiveSublayer(1);
    src.setBrush({ color: "#ee3355" });
    src.beginStroke({ u: 0.25, v: 0.25, pressure: 1 });
    src.endStroke();
    src.setSublayerVisible("head", 1, false); // 숨겨진 서브레이어 픽셀도 보존되어야 함

    src.setActiveSublayer(3);
    src.setBrush({ color: "#3366cc" });
    src.beginStroke({ u: 0.75, v: 0.75, pressure: 1 });
    src.endStroke();
    src.setSublayerOpacity("head", 3, 0.65);
    src.moveSublayer("head", 3, "down"); // [0, 1, 3, 2, 4, 5]

    // 단일 L0 기본 상태만 칠한 기존 부위(skin)
    src.setActivePart("skin");
    src.setActiveSublayer(0);
    src.setBrush({ color: "#aa7755" });
    src.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    src.endStroke();

    const exportedLayers = src.layersForExport();
    const exportedSublayers = src.sublayersForExport();
    // skin은 기본 L0만 있으므로 sublayersForExport에서 생략되고 head만 포함된다
    expect(exportedSublayers.map((s) => s.part)).toEqual(["head"]);

    const dst = createPaintSession({ layerSize: 32 });
    dst.replacePaintState({ layers: exportedLayers, sublayers: exportedSublayers });

    expect(dst.getState().sublayerOrders.get("head")).toEqual([0, 1, 3, 2, 4, 5]);
    expect(dst.getState().sublayers.get("head")?.[1]?.visible).toBe(false);
    expect(dst.getState().sublayers.get("head")?.[3]?.opacity).toBeCloseTo(0.65, 5);
    // 숨겨진 L1의 원본 픽셀이 그대로 복원됨
    expect(readPixel(dst.sublayer("head", 1), 8, 8)).toEqual([238, 51, 85, 255]);
    // 기존 단일 레이어(skin)도 그대로 보존됨
    expect(readPixel(dst.layer("skin"), 16, 16)).toEqual([170, 119, 85, 255]);
  });

  it("clearSublayer·moveSublayerInOrder 경계 동작 및 recompositePartSublayers 크기 불일치 예외를 검증한다", () => {
    expect(moveSublayerInOrder([0, 1, 2, 3, 4, 5], 0, "down")).toBeNull();
    expect(moveSublayerInOrder([0, 1, 2, 3, 4, 5], 5, "up")).toBeNull();

    const session = createPaintSession({
      layerSize: 64,
      activePart: "skin",
      brush: { radiusPx: 5, hardness: 1, opacity: 1, color: "#224488" },
    });
    session.setActiveSublayer(0);
    session.beginStroke({ u: 0.25, v: 0.25, pressure: 1 });
    session.endStroke();
    session.setActiveSublayer(2);
    session.setBrush({ color: "#ee4422" });
    session.beginStroke({ u: 0.75, v: 0.75, pressure: 1 });
    session.endStroke();

    const clearToken = session.clearSublayer("skin", 2);
    expect(clearToken).not.toBeNull();
    expect(readPixel(session.layer("skin"), 16, 16)[3]).toBe(255);
    expect(readPixel(session.layer("skin"), 48, 48)[3]).toBe(0);

    if (clearToken) session.applyToken(clearToken);
    expect(readPixel(session.layer("skin"), 48, 48)[3]).toBe(255);

    const stack = createPartSublayerStack("head", 32, 32);
    const mismatchSession = createPaintSession({ layerSize: 16 });
    expect(() => recompositePartSublayers(stack, mismatchSession.layer("head"))).toThrow(/일치하지 않습니다/u);
  });
});
