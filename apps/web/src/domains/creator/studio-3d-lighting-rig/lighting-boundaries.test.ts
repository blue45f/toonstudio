// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeSeoulSunPosition, createInitialStudioRigConfig, evaluateStudioLightingRig, export2dCutRelightBridge, sampleSeoulDailyArc, Studio3dLightingRigPanel, validate2dCutRelightBridge, type RelightBridge2dPayload, type PhysicalSkyPresetId, type Studio3dLightingRigPanelProps } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("조명 예제 입력·브리지 경계", () => {
  it("비유한 입력과 미등록 계절·재질을 정상 조명으로 대체하지 않고 원본을 보존한다", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => computeSeoulSunPosition("summer", value)).toThrow();
      expect(() => sampleSeoulDailyArc("summer", value)).toThrow();
      const config = createInitialStudioRigConfig();
      const before = structuredClone(config);
      expect(() => evaluateStudioLightingRig({ ...config, key: { ...config.key, intensity: value } })).toThrow();
      expect(() => export2dCutRelightBridge({ ...config, atmosphere: { ...config.atmosphere, mieG: value } })).toThrow();
      expect(config).toEqual(before);
    }
    expect(() => Reflect.apply(computeSeoulSunPosition, undefined, ["constructor", 12])).toThrow();
    const config = createInitialStudioRigConfig();
    expect(() => Reflect.apply(evaluateStudioLightingRig, undefined, [{ ...config, bounce: { ...config.bounce, surfaceMaterial: "unknown" } }])).toThrow();
  });

  it("중첩 필드·유한 tuple·고유 광원 슬롯이 손상된 JSON을 valid payload로 반환하지 않는다", () => {
    const good = export2dCutRelightBridge(createInitialStudioRigConfig());
    const corruptions = [
      { ...good, dynamicLights: [null, null, null, null] },
      { ...good, dynamicLights: good.dynamicLights.map(() => good.dynamicLights[0]) },
      { ...good, location: [] }, { ...good, sky: {} }, { ...good, shadowCatcher: true },
      { ...good, threeLayer2dRelight: { ...good.threeLayer2dRelight, keyColor: [1, 2] } },
      { ...good, threeLayer2dRelight: { ...good.threeLayer2dRelight, keyIntensity: NaN } },
      { ...good, dynamicLights: good.dynamicLights.map((light) => ({ ...light, direction3d: { x: 1, y: null, z: 0 } })) },
    ];
    for (const payload of corruptions) expect(validate2dCutRelightBridge(JSON.stringify(payload))).toMatchObject({ valid: false, payload: null });
    expect(validate2dCutRelightBridge(JSON.stringify(good))).toMatchObject({ valid: true, payload: good });
  });
});

describe("조명 예제 결과 알림·클립보드", () => {
  it("미연결 JSON 결과를 실제 원고 적용·저장 완료로 표시하지 않는다", () => {
    render(createElement<Studio3dLightingRigPanelProps>(Studio3dLightingRigPanel, { initialTab: "studio-rig" }));
    expect(screen.getByTestId("lighting-scope-notice").textContent).toContain("CPU");
    expect(screen.getByTestId("lighting-scope-notice").textContent).toContain("실제 3D 씬");
    fireEvent.click(screen.getByTestId("export-relight-bridge-btn"));
    expect(screen.getByTestId("lighting-notification-bridge").textContent).toContain("미연결");
    expect(screen.getByTestId("lighting-notification-bridge").textContent).toContain("적용·저장 완료 아님");
  });

  it("브리지 수신 대기·거절·동일 결과 재시도에서 중복을 막는다", async () => {
    const controls = { reject: (_reason: Error) => {} };
    const pending = new Promise<void>((_resolve, reject) => { controls.reject = reject; });
    const callback = vi.fn<(payload: RelightBridge2dPayload, text: string) => void | Promise<void>>().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    render(createElement<Studio3dLightingRigPanelProps>(Studio3dLightingRigPanel, { initialTab: "studio-rig", onExportRelightBridge: callback }));
    const button = screen.getByTestId("export-relight-bridge-btn");
    fireEvent.click(button); fireEvent.click(button);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("studio-3d-lighting-rig-panel").getAttribute("aria-busy")).toBe("true");
    await act(async () => { controls.reject(new Error("수신 거부")); });
    expect(screen.getByTestId("lighting-notification-bridge").getAttribute("role")).toBe("alert");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "브리지 알림 다시 시도" })); });
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[1]?.[0]).toBe(callback.mock.calls[0]?.[0]);
    expect(callback.mock.calls[1]?.[1]).toBe(callback.mock.calls[0]?.[1]);
  });

  it("프리셋 알림 동기 오류는 최신 수신자로 같은 결과만 재시도한다", () => {
    const first = vi.fn<(id: PhysicalSkyPresetId) => void>().mockImplementation(() => { throw new Error("수신 실패"); });
    const latest = vi.fn();
    const view = render(createElement<Studio3dLightingRigPanelProps>(Studio3dLightingRigPanel, { onPresetChange: first }));
    fireEvent.click(screen.getByTestId("sky-preset-golden-sunset"));
    expect(screen.getByTestId("lighting-notification-preset").getAttribute("role")).toBe("alert");
    view.rerender(createElement<Studio3dLightingRigPanelProps>(Studio3dLightingRigPanel, { onPresetChange: latest }));
    fireEvent.click(screen.getByRole("button", { name: "프리셋 알림 다시 시도" }));
    expect(latest).toHaveBeenCalledExactlyOnceWith("golden-sunset");
  });

  it("복사 권한 거절을 성공으로 숨기지 않고 동일 JSON으로 재시도한다", async () => {
    const copy = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error("권한 거부")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    render(createElement<Studio3dLightingRigPanelProps>(Studio3dLightingRigPanel, { initialTab: "studio-rig" }));
    await act(async () => { fireEvent.click(screen.getByTestId("copy-relight-bridge-btn")); });
    expect(screen.getByTestId("lighting-copy-status").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("lighting-copy-status").textContent).not.toContain("복사 완료");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "JSON 복사 다시 시도" })); });
    expect(copy).toHaveBeenCalledTimes(2);
    expect(copy.mock.calls[1]?.[0]).toBe(copy.mock.calls[0]?.[0]);
    expect(screen.getByTestId("lighting-copy-status").textContent).toContain("복사 완료");
  });
});
