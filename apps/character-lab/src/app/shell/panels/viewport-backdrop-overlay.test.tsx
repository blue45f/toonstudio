// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { ViewportPane } from "./ViewportPane";
import { getDefaultStripDirectorSession } from "./viewport-scene-director";

import type { LabCommand } from "../../../contracts";

afterEach(() => {
  cleanup();
  getDefaultStripDirectorSession().reset();
  vi.restoreAllMocks();
});

describe("ViewportPane — SHAPER 투명 격자·원고 컷 구도 매칭·4방향 시점·연출 앵글 바", () => {
  function renderReadyViewport(dispatchSpy?: (cmd: LabCommand) => void) {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    render(
      <MockLabProvider initialState={{ engine: engineSession.status() }} engineSession={engineSession} {...(dispatchSpy ? { dispatchSpy } : {})}>
        <ViewportPane hudIntervalMs={0} />
      </MockLabProvider>,
    );
    return engine;
  }

  it("투명 격자 토글과 0°·35°·90°·180° 4방향 시점 및 로우/하이앵글 프리셋이 카메라 yawDeg·pitchDeg를 조합해 변경한다", () => {
    const engine = renderReadyViewport();
    expect(screen.queryByTestId("viewport-checkerboard")).toBeNull();
    fireEvent.click(screen.getByTestId("viewport-toggle-checkerboard"));
    expect(screen.getByTestId("viewport-checkerboard")).toBeTruthy();

    expect(screen.queryByTestId("viewport-manuscript-guide")).toBeNull();
    fireEvent.click(screen.getByTestId("viewport-toggle-manuscript-guide"));
    expect(screen.getByTestId("viewport-manuscript-guide")).toBeTruthy();

    fireEvent.click(screen.getByTestId("viewport-turnaround-35"));
    expect(screen.getByTestId("viewport-turnaround-35").getAttribute("aria-pressed")).toBe("true");
    const lastSetCamera = engine.calls.filter((call) => call.method === "setCamera").at(-1);
    expect(lastSetCamera?.args[0]).toMatchObject({ mode: "full-body", yawDeg: 35, pitchDeg: 0 });

    fireEvent.click(screen.getByTestId("viewport-pitch--18"));
    expect(screen.getByTestId("viewport-pitch--18").getAttribute("aria-pressed")).toBe("true");
    const lowAngleCall = engine.calls.filter((call) => call.method === "setCamera").at(-1);
    expect(lowAngleCall?.args[0]).toMatchObject({ mode: "full-body", yawDeg: 35, pitchDeg: -18 });

    fireEvent.click(screen.getByTestId("viewport-pitch-22"));
    const highAngleCall = engine.calls.filter((call) => call.method === "setCamera").at(-1);
    expect(highAngleCall?.args[0]).toMatchObject({ mode: "full-body", yawDeg: 35, pitchDeg: 22 });

    fireEvent.click(screen.getByTestId("viewport-turnaround-180"));
    const backCall = engine.calls.filter((call) => call.method === "setCamera").at(-1);
    expect(backCall?.args[0]).toMatchObject({ mode: "full-body", yawDeg: 180, pitchDeg: 22 });
  });

  it("원고 컷 참조 이미지를 로드해 언더레이/오버레이 배치와 투명도를 조절하고 해제 시 Object URL을 반환한다", () => {
    const createUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:manuscript-cut-1");
    const revokeUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    renderReadyViewport();

    const fileInput = screen.getByTestId("viewport-reference-file-input") as HTMLInputElement;
    const cutFile = new File([new Uint8Array([137, 80, 78, 71])], "episode01-cut03.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [cutFile] } });

    expect(createUrlSpy).toHaveBeenCalledTimes(1);
    const img = screen.getByTestId("viewport-reference-cut-image") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:manuscript-cut-1");
    expect(img.getAttribute("data-placement")).toBe("underlay");

    fireEvent.change(screen.getByTestId("viewport-reference-placement"), { target: { value: "overlay" } });
    expect(img.getAttribute("data-placement")).toBe("overlay");

    fireEvent.change(screen.getByTestId("viewport-reference-opacity"), { target: { value: "0.75" } });
    expect(img.style.opacity).toBe("0.75");

    fireEvent.click(screen.getByTestId("viewport-clear-reference-cut"));
    expect(screen.queryByTestId("viewport-reference-cut-image")).toBeNull();
    expect(revokeUrlSpy).toHaveBeenCalledWith("blob:manuscript-cut-1");
  });

  it("확장된 SHAPER 장르 아키타입·포즈 프리셋을 뷰포트 셀렉터에서 일괄 적용한다", () => {
    const dispatched: LabCommand[] = [];
    renderReadyViewport((cmd) => dispatched.push(cmd));

    const select = screen.getByLabelText("SHAPER 내장 프리셋") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "shaper-archetype-academy-protagonist" } });
    expect(dispatched.some((cmd) => cmd.type === "slot/apply" && cmd.presetId === "hair/wolf-layered")).toBe(true);
    expect(dispatched.some((cmd) => cmd.type === "pose/set")).toBe(true);

    dispatched.length = 0;
    fireEvent.change(select, { target: { value: "sig-pose-council-command" } });
    expect(dispatched.some((cmd) => cmd.type === "pose/set")).toBe(true);
    expect(dispatched.some((cmd) => cmd.type === "slot/apply" && cmd.slot === "hand-pose" && cmd.presetId === "hand-pose/point")).toBe(true);
    expect(dispatched.some((cmd) => cmd.type === "eye-gaze/set")).toBe(true);
    expect(dispatched.some((cmd) => cmd.type === "expression/set")).toBe(true);
  });

  it("웹툰 2인 투샷·신장차 프리뷰 토글 시 12종 상대역 스탠디·신장차 배지를 표시하고 원클릭 아이컨택 시선 맞춤을 실행한다", () => {
    const dispatched: LabCommand[] = [];
    renderReadyViewport((cmd) => dispatched.push(cmd));

    expect(screen.queryByTestId("viewport-duo-shot-overlay")).toBeNull();
    fireEvent.click(screen.getByTestId("viewport-toggle-duo-shot"));
    expect(screen.getByTestId("viewport-duo-shot-overlay")).toBeTruthy();
    expect(screen.getByTestId("viewport-duo-delta-readout").textContent).toContain("신장차");

    const partnerSelect = screen.getByTestId("viewport-duo-partner-select") as HTMLSelectElement;
    expect(partnerSelect.options.length).toBe(12);
    fireEvent.change(partnerSelect, { target: { value: "shaper-thriller-detective" } });
    expect(screen.getByTestId("viewport-duo-partner-figure").getAttribute("data-partner-id")).toBe("shaper-thriller-detective");

    fireEvent.change(screen.getByTestId("viewport-duo-side-select"), { target: { value: "left" } });
    expect(screen.getByTestId("viewport-duo-partner-figure").getAttribute("data-side")).toBe("left");

    fireEvent.click(screen.getByTestId("viewport-duo-apply-eyecontact"));
    expect(dispatched).toHaveLength(2);
    expect(dispatched[0]?.type).toBe("pose/set");
    expect(dispatched[1]?.type).toBe("eye-gaze/set");
  });

  it("웹툰 연출·말풍선 토글 시 말풍선·효과선 및 한국어 오노마토페 스탬프(SVG + 엔진 setSfxStamp)를 실시간 연동한다", async () => {
    const engine = renderReadyViewport();
    expect(screen.queryByTestId("viewport-manga-fx-overlay")).toBeNull();
    fireEvent.click(screen.getByTestId("viewport-toggle-manga-fx"));
    expect(screen.getByTestId("viewport-manga-fx-overlay")).toBeTruthy();
    expect(screen.getByTestId("viewport-manga-focus-lines")).toBeTruthy();
    expect(screen.getByTestId("viewport-manga-speech-bubble").textContent).toContain("여기서부터는 내 구역이야.");

    fireEvent.change(screen.getByTestId("viewport-manga-dialogue-input"), { target: { value: "오늘 원고 마감까지 달려보자" } });
    expect(screen.getByTestId("viewport-manga-speech-bubble").textContent).toContain("오늘 원고 마감까지");

    fireEvent.change(screen.getByTestId("viewport-manga-bubble-select"), { target: { value: "shout-burst" } });
    expect(screen.getByTestId("viewport-manga-speech-bubble")).toBeTruthy();

    fireEvent.change(screen.getByTestId("viewport-manga-lines-select"), { target: { value: "speed-diagonal" } });
    expect(screen.getByTestId("viewport-manga-speed-lines")).toBeTruthy();

    fireEvent.change(screen.getByTestId("viewport-manga-lines-select"), { target: { value: "romance-sparkle" } });
    expect(screen.getByTestId("viewport-manga-romance-sparkles")).toBeTruthy();

    const sfxSelect = screen.getByTestId("viewport-manga-sfx-select") as HTMLSelectElement;
    expect(sfxSelect.options.length).toBe(5);
    fireEvent.change(sfxSelect, { target: { value: "seureung" } });
    expect(screen.getByTestId("viewport-manga-sfx-stamp").getAttribute("data-sfx-id")).toBe("seureung");
    expect(screen.getByTestId("viewport-manga-sfx-stamp").textContent).toContain("스릉");
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setSfxStamp").at(-1)?.args[0]).toMatchObject({
        stampId: "seureung",
        glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-seureung.glb",
      }),
    );

    fireEvent.change(sfxSelect, { target: { value: "none" } });
    expect(screen.queryByTestId("viewport-manga-sfx-stamp")).toBeNull();
    await waitFor(() => expect(engine.calls.filter((c) => c.method === "setSfxStamp").at(-1)?.args[0]).toBeNull());
  });

  it("웹툰 3D 소품·씬 디렉터·3D 듀오 상대역 표정/전용 손소품 선택이 엔진에 실시간 반영된다", async () => {
    const dispatched: LabCommand[] = [];
    const engine = renderReadyViewport((cmd) => dispatched.push(cmd));

    const propSelect = screen.getByTestId("viewport-hand-prop-select") as HTMLSelectElement;
    expect(propSelect.options.length).toBe(5);

    fireEvent.change(propSelect, { target: { value: "coffee-cup" } });
    const firstCall = engine.calls.filter((c) => c.method === "setHandProp").at(-1);
    expect(firstCall?.args[0]).toMatchObject({
      propId: "coffee-cup",
      hand: "rightHand",
      glbUrl: "/assets/props/webtoon-hand-props-v1/coffee-cup.glb",
    });

    const sideSelect = await screen.findByTestId("viewport-hand-prop-side");
    fireEvent.change(sideSelect, { target: { value: "leftHand" } });
    await waitFor(() => expect((screen.getByTestId("viewport-hand-prop-grip-pose") as HTMLButtonElement).disabled).toBe(false));
    const sideCall = engine.calls.filter((c) => c.method === "setHandProp").at(-1);
    expect(sideCall?.args[0]).toMatchObject({
      propId: "coffee-cup",
      hand: "leftHand",
    });

    fireEvent.click(screen.getByTestId("viewport-hand-prop-grip-pose"));
    expect(dispatched.some((cmd) => cmd.type === "pose/set")).toBe(true);
    expect(dispatched.some((cmd) => cmd.type === "slot/apply" && cmd.slot === "hand-pose" && cmd.presetId === "hand-pose/fist")).toBe(true);

    fireEvent.change(propSelect, { target: { value: "" } });
    await waitFor(() => expect(engine.calls.filter((c) => c.method === "setHandProp").at(-1)?.args[0]).toBeNull());

    const headSelect = screen.getByTestId("viewport-head-prop-select") as HTMLSelectElement;
    expect(headSelect.options.length).toBe(5);
    expect(Array.from(headSelect.options).every((opt) => !/[\u{1F300}-\u{1FAFF}]/u.test(opt.textContent ?? ""))).toBe(true);
    fireEvent.change(headSelect, { target: { value: "wire-glasses" } });
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setHeadProp").at(-1)?.args[0]).toMatchObject({
        propId: "wire-glasses",
        glbUrl: "/assets/props/webtoon-head-props-v1/wire-glasses.glb",
      }),
    );

    const stageSelect = screen.getByTestId("viewport-stage-prop-select") as HTMLSelectElement;
    expect(stageSelect.options.length).toBe(6);
    fireEvent.change(stageSelect, { target: { value: "rofan-throne-dais" } });
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setStageProp").at(-1)?.args[0]).toMatchObject({
        propId: "rofan-throne-dais",
        glbUrl: "/assets/props/webtoon-stage-props-v1/rofan-throne-dais.glb",
      }),
    );

    // 원클릭 장르 씬 디렉터 선택 시 소품 트리오 + 그립 포즈 + 툰 셰이딩 + 4컷 연기·대사·말풍선 모양/강조·효과음 세션이 일괄 세팅된다
    const directorSelect = screen.getByTestId("viewport-scene-director-select") as HTMLSelectElement;
    expect(directorSelect.options.length).toBe(5);
    fireEvent.change(directorSelect, { target: { value: "director-noir-interrogation" } });
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setStageProp").at(-1)?.args[0]).toMatchObject({
        propId: "noir-interrogation-lamp",
      }),
    );
    expect(dispatched.some((cmd) => cmd.type === "shading/set")).toBe(true);
    const sessionState = getDefaultStripDirectorSession().getState();
    expect(sessionState.actingArc).toBe("arc-thriller-shock");
    expect(sessionState.dialogueLines[0]).toContain("사건 기록 14페이지");
    expect(sessionState.bubbleShapes).toEqual(["monologue-box", "oval", "shout-burst", "whisper-dashed"]);
    expect(sessionState.bubbleFontScales).toEqual(["md", "md", "lg", "sm"]);
    expect(sessionState.sfxStamps).toEqual(["none", "pat", "kugugung", "none"]);

    // 3D 듀오 스테이지 동시 배치 활성화 시 상대역 스탠스·표정 프리셋·전용 손소품 전환 검증
    fireEvent.click(screen.getByTestId("viewport-toggle-duo-shot"));
    fireEvent.click(screen.getByTestId("viewport-duo-3d-toggle"));
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setDuoPartner").at(-1)?.args[0]).toMatchObject({
        characterId: "shaper-atelier-male-lead",
        stance: "conversational",
        expression: "neutral",
      }),
    );
    expect(screen.queryByTestId("viewport-duo-partner-figure")).toBeNull();
    fireEvent.change(screen.getByTestId("viewport-duo-3d-stance"), { target: { value: "arms-crossed" } });
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setDuoPartner").at(-1)?.args[0]).toMatchObject({
        stance: "arms-crossed",
      }),
    );
    fireEvent.change(screen.getByTestId("viewport-duo-3d-expression"), { target: { value: "cold-smirk" } });
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setDuoPartner").at(-1)?.args[0]).toMatchObject({
        expression: "cold-smirk",
      }),
    );
    fireEvent.change(screen.getByTestId("viewport-duo-3d-hand-prop"), { target: { value: "case-folder" } });
    await waitFor(() =>
      expect(engine.calls.filter((c) => c.method === "setDuoPartner").at(-1)?.args[0]).toMatchObject({
        expression: "cold-smirk",
        handProp: {
          propId: "case-folder",
          hand: "leftHand",
          glbUrl: "/assets/props/webtoon-hand-props-v1/case-folder.glb",
        },
      }),
    );

    fireEvent.click(screen.getByTestId("viewport-duo-3d-toggle"));
    await waitFor(() => expect(engine.calls.filter((c) => c.method === "setDuoPartner").at(-1)?.args[0]).toBeNull());

    fireEvent.change(directorSelect, { target: { value: "" } });
    await waitFor(() => expect(engine.calls.filter((c) => c.method === "setStageProp").at(-1)?.args[0]).toBeNull());
  });
});
