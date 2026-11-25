// @vitest-environment jsdom
import { createElement } from "react";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DUAL_VIEWER_PANEL_PRESETS, WEBTOON_CVD_AUDIT_PAIRS,
  auditDualViewerReadability, simulateColorVisionDeficiency, buildEpisodeColorScriptArc,
  parseHexToSrgb, StudioColorScriptLabPanel, type StudioColorScriptLabPanelProps,
} from "./index";

afterEach(cleanup);

const preset = DUAL_VIEWER_PANEL_PRESETS[3];
if (!preset) throw new Error("합성 예제 누락");
const valid = preset;

describe("색 모델 계산의 잘못된 입력", () => {
  it("NaN·음수 너비를 양면 접근성 통과로 처리하지 않는다", () => {
    for (const value of [NaN, Infinity, -1]) {
      expect(() => auditDualViewerReadability({ ...valid, borderWidthPx: value })).toThrow();
      expect(() => auditDualViewerReadability({ ...valid, outerHaloWidthPx: value })).toThrow();
    }
  });

  it("유한 범위를 벗어난 RGB·강도·미등록 모델을 정상 색으로 보정하지 않는다", () => {
    for (const value of [NaN, Infinity, -0.01, 1.01]) {
      expect(() => simulateColorVisionDeficiency({ r: value, g: 0, b: 0 }, "protanopia")).toThrow();
      expect(() => simulateColorVisionDeficiency({ r: 0, g: 0, b: 0 }, "protanopia", value)).toThrow();
    }
    expect(() => Reflect.apply(simulateColorVisionDeficiency, undefined, [WEBTOON_CVD_AUDIT_PAIRS[0]?.colorA, "unknown"])).toThrow();
  });

  it("미등록 색 조화·잘못된 곡선·색 문자열은 성공으로 보정하지 않고 정상 결과는 모델 범위를 표시한다", () => {
    expect(() => Reflect.apply(buildEpisodeColorScriptArc, undefined, [{ baseHueDeg: 20, harmonyRule: "constructor" }])).toThrow();
    expect(() => buildEpisodeColorScriptArc({ baseHueDeg: NaN, harmonyRule: "triadic" })).toThrow();
    expect(() => buildEpisodeColorScriptArc({ baseHueDeg: 20, harmonyRule: "triadic", tensionCurve: [0, 0, NaN, 1] })).toThrow();
    expect(() => parseHexToSrgb("원문 색상 아님")).toThrow();
    expect(auditDualViewerReadability(valid)).toMatchObject({ scope: "model-calculation", humanMeasured: false });
    const rgb = { r: 0.2, g: 0.4, b: 0.6 };
    const before = { ...rgb };
    expect(simulateColorVisionDeficiency(rgb, "protanopia", 0)).toMatchObject({ originalRgb: before, scope: "model-calculation", humanMeasured: false });
    expect(rgb).toEqual(before);
  });
});

describe("색 스크립트 예제 알림", () => {
  it("모델 비교와 실제 기기·원고 측정을 구분하고 미연결 결과를 성공 수신으로 표시하지 않는다", () => {
    render(createElement<StudioColorScriptLabPanelProps>(StudioColorScriptLabPanel, { initialTab: "dualViewer" }));
    expect(screen.getByTestId("color-script-scope-notice").textContent).toContain("실제 이용자 접근성");
    expect(screen.getByTestId("color-script-scope-notice").textContent).toContain("영구 저장에는 반영하지 않으며");
    fireEvent.click(screen.getByTestId("dual-viewer-apply-repair-btn"));
    expect(screen.getByTestId("color-notification-3").textContent).toContain("수신자 미연결");
    expect(screen.getByTestId("dual-viewer-score-badge").textContent).toContain("예제 기준 통과");
  });

  it("후보 색 알림은 대기 중 중복을 막고 거절 후 같은 payload를 최신 수신자로 재시도한다", async () => {
    const controls = { reject: (_error: Error) => {} };
    const pending = new Promise<void>((_resolve, reject) => { controls.reject = reject; });
    const first = vi.fn<NonNullable<StudioColorScriptLabPanelProps["onApplySafeColor"]>>().mockReturnValueOnce(pending);
    const next = vi.fn<NonNullable<StudioColorScriptLabPanelProps["onApplySafeColor"]>>();
    const view = render(createElement<StudioColorScriptLabPanelProps>(StudioColorScriptLabPanel, { initialTab: "cvd", onApplySafeColor: first }));
    const button = screen.getByTestId("cvd-apply-safe-btn");
    fireEvent.click(button);
    expect(screen.getByTestId("color-script-a11y-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(first).toHaveBeenCalledTimes(1);
    const payload = first.mock.calls[0];
    await act(async () => { controls.reject(new Error("수신 실패")); });
    expect(screen.getByRole("alert").textContent).toContain("예제 알림 실패");
    view.rerender(createElement<StudioColorScriptLabPanelProps>(StudioColorScriptLabPanel, { initialTab: "cvd", onApplySafeColor: next }));
    fireEvent.click(screen.getByRole("button", { name: "예제 알림 다시 시도" }));
    expect(next.mock.calls[0]).toEqual(payload);
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("color-notification-2").textContent).toContain("실제 적용·저장 완료 아님");
  });

  it("동기 콜백 오류 재시도는 선택·모델 보정을 다시 실행하지 않는다", () => {
    const callback = vi.fn<NonNullable<StudioColorScriptLabPanelProps["onApplyDualViewerRepair"]>>()
      .mockImplementationOnce(() => { throw new Error("알림 오류"); }).mockImplementation(() => undefined);
    render(createElement<StudioColorScriptLabPanelProps>(StudioColorScriptLabPanel, { initialTab: "dualViewer", onApplyDualViewerRepair: callback }));
    fireEvent.click(screen.getByTestId("dual-viewer-apply-repair-btn"));
    const score = screen.getByTestId("dual-viewer-score-badge").textContent;
    expect(screen.getByRole("alert").textContent).toContain("예제 알림 실패");
    fireEvent.click(screen.getByRole("button", { name: "예제 알림 다시 시도" }));
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[0]).toEqual(callback.mock.calls[1]);
    expect(screen.getByTestId("dual-viewer-score-badge").textContent).toBe(score);
  });
});
