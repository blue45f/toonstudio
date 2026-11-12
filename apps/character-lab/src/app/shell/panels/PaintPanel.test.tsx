// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { INITIAL_HISTORY, createDefaultRecipe, createKitDefaultRecipe } from "../../../contracts";
import { readPixel } from "../../../paint/paint-layer";
import { createPaintSession } from "../../../paint/paint-session";
import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { PaintPanel } from "./PaintPanel";

import type { LabCommand } from "../../../contracts";

afterEach(cleanup);

describe("PaintPanel", () => {
  it("슬라이더·색·부위 선택이 페인트 세션에 반영된다", () => {
    const session = createPaintSession({ layerSize: 64 });
    render(
      <MockLabProvider>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.change(screen.getByLabelText("크기(px)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("불투명도"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("경도"), { target: { value: "0.25" } });
    fireEvent.change(screen.getByLabelText("색"), { target: { value: "#00ff00" } });
    fireEvent.change(screen.getByLabelText("레이어(부위)"), { target: { value: "hair" } });
    fireEvent.click(screen.getByLabelText("UV 경계 감싸기"));
    const state = session.getState();
    expect(state.brush).toMatchObject({ radiusPx: 40, opacity: 0.5, hardness: 0.25, color: "#00ff00" });
    expect(state.activePart).toBe("hair");
    expect(state.wrap).toBe(false);
    expect(screen.getByText(/헤어 레이어 \(아직 없음\)/u)).toBeTruthy();
    expect(screen.getByText(/엔진이 준비되지 않아/u)).toBeTruthy();
  });

  it("되돌리기는 history/undo를 1회 dispatch하고 canUndo가 false면 비활성이다", () => {
    const dispatched: LabCommand[] = [];
    const { unmount } = render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={createPaintSession()} />
      </MockLabProvider>,
    );
    const undo = screen.getByRole("button", { name: "되돌리기" });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    unmount();

    render(
      <MockLabProvider initialState={{ history: { ...INITIAL_HISTORY, canUndo: true, depth: 1 } }} dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={createPaintSession()} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(dispatched).toEqual([{ type: "history/undo" }]);
  });

  it("레이어 비우기는 undo 토큰을 paint/stroke로 dispatch한다", () => {
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    expect(screen.getByText(/피부 레이어 64×64 · 개정 1/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe("paint/stroke");
    expect(dispatched[0]?.type === "paint/stroke" && dispatched[0].undoToken.tiles.length).toBe(1);
    expect(session.layer("skin").rgba.every((b) => b === 0)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched).toHaveLength(1);
  });

  it("레이어 비우기는 비워진 레이어를 엔진 페인트 텍스처에도 올린다(뷰포트·PNG 내보내기에 이전 칠이 남지 않는다)", () => {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();
    engine.updatePaintTexture(session.layer("skin"));
    expect(engine.paintUploads).toHaveLength(1);
    expect(engine.paintUploads[0]?.rgba.some((byte) => byte !== 0)).toBe(true);
    render(
      <MockLabProvider engineSession={engineSession} dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched.map((command) => command.type)).toEqual(["paint/stroke"]);
    expect(engine.paintUploads).toHaveLength(2);
    const uploaded = engine.paintUploads[1];
    expect(uploaded?.part).toBe("skin");
    expect(uploaded?.rgba.every((byte) => byte === 0)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(engine.paintUploads).toHaveLength(2);
  });

  it("엔진이 없어도 레이어 비우기는 세션·history만 갱신하고 던지지 않는다", () => {
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
    session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
    session.endStroke();
    render(
      <MockLabProvider dispatchSpy={(command) => dispatched.push(command)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "레이어 비우기" }));
    expect(dispatched.map((command) => command.type)).toEqual(["paint/stroke"]);
    expect(session.layer("skin").rgba.every((byte) => byte === 0)).toBe(true);
  });

  describe("키트 소스 경고", () => {
    const kitRecipe = createKitDefaultRecipe();

    function paintLayer(session: ReturnType<typeof createPaintSession>, part: "skin" | "hair" | "top"): void {
      session.setActivePart(part);
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
      session.endStroke();
    }

    it("키트 소스에서 변형이 있는 부위(헤어)를 고르면 UV 경고를 보이고 skin·head에는 보이지 않는다", () => {
      const session = createPaintSession({ layerSize: 64 });
      render(
        <MockLabProvider initialState={{ recipe: kitRecipe }}>
          <PaintPanel session={session} />
        </MockLabProvider>,
      );
      expect(screen.queryByRole("note")).toBeNull();
      fireEvent.change(screen.getByLabelText("레이어(부위)"), { target: { value: "hair" } });
      expect(screen.getByRole("note").textContent).toMatch(/헤어 변형을 바꾸면 UV가 달라져 그림이 어긋납니다/u);
      fireEvent.change(screen.getByLabelText("레이어(부위)"), { target: { value: "head" } });
      expect(screen.queryByRole("note")).toBeNull();
      fireEvent.change(screen.getByLabelText("레이어(부위)"), { target: { value: "top" } });
      expect(screen.getByRole("note").textContent).toMatch(/상의 변형을 바꾸면/u);
    });

    it("이미 칠한 다른 부위 중 어긋날 수 있는 것을 목록으로 보인다(skin은 제외, 선택 부위는 중복하지 않는다)", () => {
      const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
      paintLayer(session, "skin");
      paintLayer(session, "top");
      paintLayer(session, "hair");
      session.setActivePart("skin");
      render(
        <MockLabProvider initialState={{ recipe: kitRecipe }}>
          <PaintPanel session={session} />
        </MockLabProvider>,
      );
      const list = screen.getByRole("list", { name: "어긋날 수 있는 레이어" });
      const items = Array.from(list.querySelectorAll("li")).map((item) => item.getAttribute("data-part"));
      expect(items.sort()).toEqual(["hair", "top"]);
      expect(list.textContent).toMatch(/이미 칠한 헤어 레이어: 헤어 변형을 바꾸면/u);
      fireEvent.change(screen.getByLabelText("레이어(부위)"), { target: { value: "hair" } });
      const after = Array.from(screen.getByRole("list", { name: "어긋날 수 있는 레이어" }).querySelectorAll("li")).map((item) => item.getAttribute("data-part"));
      expect(after).toEqual(["top"]);
      expect(screen.getByRole("note").textContent).toMatch(/헤어 변형을 바꾸면/u);
    });

    it("절차 소스에서는 경고를 보이지 않는다", () => {
      const session = createPaintSession({ layerSize: 64, brush: { radiusPx: 4, hardness: 1, opacity: 1 } });
      paintLayer(session, "hair");
      render(
        <MockLabProvider initialState={{ recipe: createDefaultRecipe() }}>
          <PaintPanel session={session} />
        </MockLabProvider>,
      );
      expect(screen.queryByRole("note")).toBeNull();
      expect(screen.queryByRole("list", { name: "어긋날 수 있는 레이어" })).toBeNull();
    });
  });

  it("빠른 브러시 프리셋 클릭 시 크기·불투명도·경도가 한 번에 변경된다", () => {
    const session = createPaintSession({ layerSize: 64 });
    render(
      <MockLabProvider>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "세밀 선화 (4px)" }));
    expect(session.getState().brush).toMatchObject({ radiusPx: 4, opacity: 1, hardness: 0.92 });
    fireEvent.click(screen.getByRole("button", { name: "부드러운 음영 (36px)" }));
    expect(session.getState().brush).toMatchObject({ radiusPx: 36, opacity: 0.45, hardness: 0.25 });
  });

  it("필압·의상 마스킹 선택을 공유 세션에 반영하고 펜 입력이 실제 반지름·알파를 바꾼다", () => {
    const session = createPaintSession({ layerSize: 64, wrap: false, brush: { radiusPx: 10, opacity: 1, hardness: 1 } });
    render(
      <MockLabProvider>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );
    const readout = screen.getByTestId("shaper-paint-stroke-readout");
    expect(readout.textContent).toContain("기준 반지름 10.0 px · 의상 마스킹 ON");
    expect(session.getState().pressureMode).toBe("constant");

    fireEvent.change(screen.getByLabelText("3D 스트로크 필압 모드"), { target: { value: "pen" } });
    expect(session.getState().pressureMode).toBe("pen");
    act(() => {
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 0.25 });
      session.endStroke();
    });
    expect(readPixel(session.layer("skin"), 32, 32)[3]).toBe(64);
    expect(readPixel(session.layer("skin"), 32, 39)[3]).toBe(0);
    const lowPressurePixels = session.layer("skin").rgba.filter((value, index) => index % 4 === 3 && value > 0).length;
    act(() => {
      session.clearLayer("skin");
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
      session.endStroke();
    });
    expect(readPixel(session.layer("skin"), 32, 32)[3]).toBe(255);
    expect(readPixel(session.layer("skin"), 32, 39)[3]).toBe(255);
    expect(session.layer("skin").rgba.filter((value, index) => index % 4 === 3 && value > 0).length).toBeGreaterThan(lowPressurePixels * 4);

    fireEvent.click(screen.getByLabelText("의상 뒤 신체 페인트 차단"));
    expect(session.getState().bodyLineMaskEnabled).toBe(false);
    expect(readout.textContent).toContain("의상 마스킹 OFF");
  });

  it("브러시/지우개 모드 전환·좌우 대칭 그리기·웹툰 디테일 스탬프가 undo 토큰과 엔진 업로드를 기록한다", () => {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, activePart: "head" });

    render(
      <MockLabProvider engineSession={engineSession} dispatchSpy={(cmd) => dispatched.push(cmd)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );

    fireEvent.click(screen.getByTestId("paint-tool-eraser"));
    expect(session.getState().toolMode).toBe("eraser");
    expect(screen.getByTestId("shaper-paint-stroke-readout").textContent).toContain("도구 지우개");

    fireEvent.click(screen.getByLabelText("좌우 대칭 그리기 (U축 미러)"));
    expect(session.getState().symmetry).toBe(true);
    expect(screen.getByTestId("shaper-paint-stroke-readout").textContent).toContain("대칭 ON");

    fireEvent.click(screen.getByTestId("paint-decal-blush-slash"));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe("paint/stroke");
    expect(engine.paintUploads).toHaveLength(1);
    expect(engine.paintUploads[0]?.part).toBe("head");
  });

  it("SHAPER 서브레이어(Layer 0~5) 전환·개별 숨김/불투명도·선택 서브레이어 비우기가 마스터 텍스처에 즉시 합성된다", () => {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, activePart: "head", brush: { radiusPx: 6, hardness: 1, opacity: 1, color: "#112233" } });

    act(() => {
      session.setActiveSublayer(0);
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
      session.endStroke();
    });

    render(
      <MockLabProvider engineSession={engineSession} dispatchSpy={(cmd) => dispatched.push(cmd)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );

    fireEvent.click(screen.getByTestId("paint-sublayer-1"));
    expect(session.getState().activeSublayer).toBe(1);
    expect(screen.getByTestId("shaper-paint-stroke-readout").textContent).toContain("서브레이어 L1");

    act(() => {
      session.setBrush({ color: "#ff3366", opacity: 1, hardness: 1 });
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
      session.endStroke();
    });
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([255, 51, 102, 255]);

    fireEvent.click(screen.getByTestId("paint-sublayer-visible"));
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);
    expect(engine.paintUploads.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByTestId("paint-sublayer-visible"));
    fireEvent.change(screen.getByTestId("paint-sublayer-opacity"), { target: { value: "0.6" } });
    fireEvent.click(screen.getByTestId("paint-clear-sublayer"));
    expect(dispatched.some((cmd) => cmd.type === "paint/stroke")).toBe(true);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);
  });

  it("서브레이어 상/하 순서 변경·방향키 키보드 탐색·포인터 드래그 불투명도 단일 Undo 병합·숨김 스탬프 차단이 동작한다", () => {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    const dispatched: LabCommand[] = [];
    const session = createPaintSession({ layerSize: 64, activePart: "head", brush: { radiusPx: 6, hardness: 1, opacity: 1, color: "#112233" } });

    act(() => {
      session.setActiveSublayer(0);
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
      session.endStroke();
      session.setActiveSublayer(1);
      session.setBrush({ color: "#ff3366", opacity: 1, hardness: 1 });
      session.beginStroke({ u: 0.5, v: 0.5, pressure: 1 });
      session.endStroke();
    });

    render(
      <MockLabProvider engineSession={engineSession} dispatchSpy={(cmd) => dispatched.push(cmd)}>
        <PaintPanel session={session} />
      </MockLabProvider>,
    );

    // L1에서 키보드 ArrowLeft → L0 선택, 다시 ArrowRight → L1 선택
    const chip1 = screen.getByTestId("paint-sublayer-1");
    chip1.focus();
    fireEvent.keyDown(chip1, { key: "ArrowLeft" });
    expect(session.getState().activeSublayer).toBe(0);
    expect(document.activeElement).toBe(screen.getByTestId("paint-sublayer-0"));
    fireEvent.keyDown(screen.getByTestId("paint-sublayer-0"), { key: "ArrowRight" });
    expect(session.getState().activeSublayer).toBe(1);

    // L1을 아래(배경)로 이동하면 [1, 0, 2, 3, 4, 5]가 되어 L0 선화가 위로 올라오고 Undo 토큰이 1회 dispatch된다
    dispatched.length = 0;
    fireEvent.click(screen.getByTestId("paint-sublayer-move-down"));
    expect(session.getState().sublayerOrders.get("head")).toEqual([1, 0, 2, 3, 4, 5]);
    expect(readPixel(session.layer("head"), 32, 32)).toEqual([17, 34, 51, 255]);
    expect(screen.getByTestId("paint-sublayer-order-readout").textContent).toContain("L1 → L0 → L2");
    expect(dispatched).toHaveLength(1);

    // 포인터 드래그 중 연속 불투명도 변경은 실시간 반영하되 pointerUp에서 단 1개의 병합 Undo 단계만 커밋한다
    const opacityInput = screen.getByTestId("paint-sublayer-opacity");
    fireEvent.pointerDown(opacityInput);
    fireEvent.change(opacityInput, { target: { value: "0.8" } });
    fireEvent.change(opacityInput, { target: { value: "0.5" } });
    fireEvent.change(opacityInput, { target: { value: "0.35" } });
    expect(dispatched).toHaveLength(1); // 아직 드래그 중이므로 추가 커밋 없음
    fireEvent.pointerUp(opacityInput);
    expect(dispatched).toHaveLength(2);
    const mergedOpCmd = dispatched[1];
    if (mergedOpCmd?.type === "paint/stroke") {
      act(() => {
        session.applyToken(mergedOpCmd.undoToken);
      });
      expect(session.getState().sublayers.get("head")?.[1]?.opacity).toBeCloseTo(1, 5);
    }

    // 숨김 처리 시 그리기 차단 배너가 표시되고 웹툰 디테일 스탬프 버튼이 비활성화된다
    fireEvent.click(screen.getByTestId("paint-sublayer-visible"));
    expect(screen.getByTestId("paint-sublayer-blocked-hint").textContent).toContain("숨김");
    expect((screen.getByTestId("paint-decal-blush-slash") as HTMLButtonElement).disabled).toBe(true);
  });
});
