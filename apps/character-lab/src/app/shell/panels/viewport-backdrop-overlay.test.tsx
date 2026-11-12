// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockEngine } from "../../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../../testing/mock-store";

import { ViewportPane } from "./ViewportPane";

import type { LabCommand } from "../../../contracts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ViewportPane — SHAPER 투명 격자·원고 컷 구도 매칭·4방향 시점 바", () => {
  function renderReadyViewport(dispatchSpy?: (cmd: LabCommand) => void) {
    const engine = createMockEngine();
    const engineSession = createMockEngineSession({ phase: "ready", backend: engine.backend, diagnostics: engine.diagnostics });
    engineSession.setEngine(engine);
    render(
      <MockLabProvider engineSession={engineSession} {...(dispatchSpy ? { dispatchSpy } : {})}>
        <ViewportPane hudIntervalMs={0} />
      </MockLabProvider>,
    );
    return engine;
  }

  it("투명 격자 토글과 0°·35°·90°·180° 4방향 시점 버튼이 카메라 yawDeg를 즉시 변경한다", () => {
    const engine = renderReadyViewport();
    expect(screen.queryByTestId("viewport-checkerboard")).toBeNull();
    fireEvent.click(screen.getByTestId("viewport-toggle-checkerboard"));
    expect(screen.getByTestId("viewport-checkerboard")).toBeTruthy();

    fireEvent.click(screen.getByTestId("viewport-turnaround-35"));
    expect(screen.getByTestId("viewport-turnaround-35").getAttribute("aria-pressed")).toBe("true");
    const lastSetCamera = engine.calls.filter((call) => call.method === "setCamera").at(-1);
    expect(lastSetCamera?.args[0]).toMatchObject({ mode: "full-body", yawDeg: 35, pitchDeg: 0 });

    fireEvent.click(screen.getByTestId("viewport-turnaround-180"));
    const backCall = engine.calls.filter((call) => call.method === "setCamera").at(-1);
    expect(backCall?.args[0]).toMatchObject({ mode: "full-body", yawDeg: 180 });
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
  });
});
