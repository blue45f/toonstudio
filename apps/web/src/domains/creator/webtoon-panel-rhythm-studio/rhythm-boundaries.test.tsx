// @vitest-environment jsdom

import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioWebtoonPanelRhythmPanel } from "./StudioWebtoonPanelRhythmPanel";
import { analyzeScrollRhythm, autoBalanceGutters, buildRhythmStripSvg, exportPanelRhythmJson, getWebtoonPlatformSpec, instantiateTemplatePanels, type PanelBeatInput, type ScrollRhythmAnalysis } from "./panel-rhythm-engine";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function samplePanel(): PanelBeatInput {
  const panel = instantiateTemplatePanels("action-3beat-impact", "naver-800")[0];
  if (!panel) throw new Error("예제 컷 누락");
  return panel;
}

const exportFormats = [
  { name: "SVG", run: buildRhythmStripSvg },
  { name: "JSON", run: exportPanelRhythmJson },
] as const;

describe("외부 분석의 내보내기 정규값 계약", () => {
  for (const format of exportFormats) {
    for (const field of ["heightPx", "gutterAfterPx"] as const) {
      it.each([1e308, -1])(`${format.name}는 외부 ${field}=%s를 정규값으로 오인하지 않는다`, (value) => {
        const analysis = analyzeScrollRhythm({ panels: [samplePanel()] });
        const invalid = { ...analysis, panels: analysis.panels.map((panel) => ({ ...panel, [field]: value })) };
        const before = structuredClone(invalid);
        expect(() => format.run(invalid)).toThrow(RangeError);
        expect(invalid).toEqual(before);
      });
    }
    it.each(["topY", "bottomY", "gutterEndY", "tensionScore"] as const)(`${format.name}는 외부 파생 좌표 %s의 초대값을 거부한다`, (field) => {
      const analysis = analyzeScrollRhythm({ panels: [samplePanel()] });
      const invalid = { ...analysis, panels: analysis.panels.map((panel) => ({ ...panel, [field]: 1e308 })) };
      expect(() => format.run(invalid)).toThrow(RangeError);
    });
    it.each(["recommendedGutterMinPx", "recommendedGutterMaxPx"] as const)(`${format.name}는 외부 플랫폼 %s의 NaN을 거부한다`, (field) => {
      const analysis = analyzeScrollRhythm({ panels: [samplePanel()] });
      const invalid = { ...analysis, platform: { ...analysis.platform, [field]: Number.NaN } };
      expect(() => format.run(invalid)).toThrow(RangeError);
    });
  }

  it("정상 분석은 객체 키 순서와 무관하게 같은 SVG·JSON을 내보내고 원본을 바꾸지 않는다", () => {
    const analysis = analyzeScrollRhythm({ panels: instantiateTemplatePanels("action-3beat-impact", "naver-800") });
    const before = structuredClone(analysis);
    const svg = buildRhythmStripSvg(analysis);
    const json = exportPanelRhythmJson(analysis);
    const { summary, warnings, ...rest } = before;
    const reordered = { warnings, summary, ...rest };
    expect(buildRhythmStripSvg(reordered)).toBe(svg);
    expect(exportPanelRhythmJson(reordered)).toBe(json);
    expect(analysis).toEqual(before);
    expect(svg).not.toContain("Infinity");
    expect(json).not.toContain("Infinity");
  });
});

describe("리듬 계산 예제의 입력·원문 경계", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("비유한 높이·여백·대사 %s는 분석과 보정에서 명시적으로 거부한다", (value) => {
    for (const key of ["heightPx", "gutterAfterPx", "dialogueCharCount"] as const) {
      const panel = { ...samplePanel(), [key]: value };
      expect(() => analyzeScrollRhythm({ panels: [panel] })).toThrow(RangeError);
      expect(() => autoBalanceGutters([panel])).toThrow(RangeError);
      expect(Object.is(panel[key], value)).toBe(true);
    }
  });

  it("유한한 범위 밖 입력은 보정 후보와 분석에 같은 정규값을 쓰고 원문을 보존한다", () => {
    const panel = { ...samplePanel(), heightPx: -10, gutterAfterPx: -10, dialogueCharCount: 999 };
    const before = structuredClone(panel);
    const result = autoBalanceGutters([panel]);
    expect(result.panels[0]?.heightPx).toBe(result.afterAnalysis.panels[0]?.heightPx);
    expect(result.panels[0]?.dialogueCharCount).toBe(result.afterAnalysis.panels[0]?.dialogueCharCount);
    expect(result.panels[0]?.gutterAfterPx).toBe(result.afterAnalysis.panels[0]?.gutterAfterPx);
    expect(panel).toEqual(before);
  });

  it("패널 상한을 넘는 입력은 배열을 순회하기 전에 거부한다", () => {
    const oversized = new Proxy<PanelBeatInput[]>([], { get(_target, key) {
      if (key === "length") return 129;
      throw new Error("초과 배열 순회");
    } });
    expect(() => analyzeScrollRhythm({ panels: oversized })).toThrow(RangeError);
    expect(() => autoBalanceGutters(oversized)).toThrow(RangeError);
  });

  it("연속 추가도 128컷을 넘기지 않고 컷 ID를 중복하지 않는다", () => {
    const receive = vi.fn<(analysis: ScrollRhythmAnalysis) => void>();
    render(<StudioWebtoonPanelRhythmPanel onAnalysisChange={receive} />);
    const add = screen.getByTestId("rhythm-add-panel-btn");
    act(() => { for (let index = 0; index < 140; index += 1) fireEvent.click(add); });
    expect(screen.getByTestId("rhythm-strip-preview-svg").getAttribute("data-panel-count")).toBe("128");
    expect(add.hasAttribute("disabled")).toBe(true);
    const panels = receive.mock.lastCall?.[0].panels ?? [];
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(128);
  });

  it("중복 컷 ID와 미등록 모드를 정상 분석으로 바꾸지 않는다", () => {
    const panel = samplePanel();
    expect(() => analyzeScrollRhythm({ panels: [panel, { ...panel }] })).toThrow(RangeError);
    expect(() => Reflect.apply(getWebtoonPlatformSpec, undefined, ["unknown-mode"])).toThrow(RangeError);
    expect(() => Reflect.apply(analyzeScrollRhythm, undefined, [{ panels: [{ ...panel, role: "unknown-role" }] }])).toThrow(RangeError);
  });

  it("외부에서 바뀐 비유한 분석을 SVG·JSON 정상 결과로 내보내지 않는다", () => {
    const analysis = analyzeScrollRhythm({ panels: [samplePanel()] });
    const invalid = { ...analysis, summary: { ...analysis.summary, totalHeightPx: Number.NaN } };
    expect(() => buildRhythmStripSvg(invalid)).toThrow(RangeError);
    expect(() => exportPanelRhythmJson(invalid)).toThrow(RangeError);
  });

  it("계산 예제·미저장·모델 가정을 한영으로 구분한다", () => {
    const view = render(<StudioWebtoonPanelRhythmPanel />);
    expect(screen.getByTestId("rhythm-scope-notice").textContent).toContain("저장하지");
    expect(screen.getByTestId("rhythm-scope-notice").textContent).toContain("가정");
    view.rerender(<StudioWebtoonPanelRhythmPanel locale="en" />);
    expect(screen.getByTestId("rhythm-scope-notice").textContent).toContain("CPU");
    expect(screen.getByTestId("rhythm-scope-notice").textContent).toContain("not saved");
  });
});

describe("리듬 결과 알림과 실제 복사의 구분", () => {
  it("부모 inline 수신자와 StrictMode에서도 같은 분석을 중복 알리지 않는다", () => {
    const receive = vi.fn();
    function Parent() {
      const [count, setCount] = useState(0);
      return <><span data-testid="parent-count">{count}</span><StudioWebtoonPanelRhythmPanel onAnalysisChange={(analysis) => { receive(analysis); if (count < 3) setCount((previous) => previous + 1); }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    expect(receive).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("parent-count").textContent).toBe("1");
  });

  it("분석 알림 대기·실패 중 같은 결과를 최신 수신자에게만 재알림한다", async () => {
    let rejectAttempt: (error: Error) => void = () => { throw new Error("미실행"); };
    const first = vi.fn((_analysis: ScrollRhythmAnalysis) => new Promise<void>((_resolve, reject) => { rejectAttempt = reject; }));
    const latest = vi.fn();
    const view = render(<StudioWebtoonPanelRhythmPanel onAnalysisChange={first} />);
    const before = screen.getByTestId("rhythm-strip-preview-svg").outerHTML;
    expect(screen.getByTestId("studio-webtoon-panel-rhythm-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByTestId("rhythm-add-panel-btn"));
    expect(first).toHaveBeenCalledTimes(1);
    await act(async () => { rejectAttempt(new Error("분석 알림 거절")); });
    expect(screen.getByTestId("rhythm-notification-analysis").getAttribute("role")).toBe("alert");
    view.rerender(<StudioWebtoonPanelRhythmPanel onAnalysisChange={latest} />);
    fireEvent.click(screen.getByTestId("retry-analysis-notification"));
    expect(latest).toHaveBeenCalledExactlyOnceWith(first.mock.calls[0]?.[0]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rhythm-strip-preview-svg").outerHTML).toBe(before);
  });

  for (const format of ["json", "svg"] as const) {
    it(`${format} 알림의 동기 실패 재시도는 같은 원문만 최신 수신자에 전달하고 복사를 반복하지 않는다`, async () => {
      const copy = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
      const first = vi.fn((_text: string, _analysis: ScrollRhythmAnalysis) => { throw new Error("수신 실패"); });
      const latest = vi.fn();
      const callback = format === "json" ? "onExportJson" : "onExportSvg";
      const view = render(<StudioWebtoonPanelRhythmPanel {...{ [callback]: first }} />);
      await act(async () => { fireEvent.click(screen.getByTestId(`rhythm-copy-${format}-btn`)); });
      expect(screen.getByTestId(`rhythm-notification-${format}`).getAttribute("role")).toBe("alert");
      view.rerender(<StudioWebtoonPanelRhythmPanel {...{ [callback]: latest }} />);
      fireEvent.click(screen.getByTestId(`retry-${format}-notification`));
      expect(latest).toHaveBeenCalledExactlyOnceWith(...(first.mock.calls[0] ?? []));
      expect(copy).toHaveBeenCalledTimes(1);
    });
  }

  it("클립보드 거절은 실패로 표시하고 같은 원문을 재복사하되 외부 알림을 반복하지 않는다", async () => {
    const copy = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error("권한 거절")).mockResolvedValue(undefined);
    const receive = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    render(<StudioWebtoonPanelRhythmPanel onExportJson={receive} />);
    await act(async () => { fireEvent.click(screen.getByTestId("rhythm-copy-json-btn")); });
    expect(screen.getByTestId("rhythm-copy-status").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("rhythm-copy-status").textContent).not.toContain("복사 완료");
    await act(async () => { fireEvent.click(screen.getByTestId("retry-clipboard")); });
    expect(copy.mock.calls[1]?.[0]).toBe(copy.mock.calls[0]?.[0]);
    expect(receive).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("rhythm-copy-status").textContent).toContain("복사 완료");
  });

  it("클립보드 미지원도 완료로 표시하지 않는다", () => {
    vi.stubGlobal("navigator", {});
    render(<StudioWebtoonPanelRhythmPanel />);
    fireEvent.click(screen.getByTestId("rhythm-copy-svg-btn"));
    expect(screen.getByTestId("rhythm-copy-status").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("rhythm-copy-status").textContent).not.toContain("복사 완료");
  });
});
