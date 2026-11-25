// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { exportActionFxSvg, generateActionFxLayer, measurePrimitiveIntrusion, StudioActionFxLabPanel, verifyCharacterMaskClearance, type ActionFxLayerResult, type ActionFxVectorPrimitive } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const mask = { cx: 400, cy: 450, radius: 120, enabled: true };
const circle: ActionFxVectorPrimitive = { kind: "circle", id: "probe", role: "bokeh", cx: 700, cy: 450, r: 20, fill: "oklch(0.8 0.1 30)", opacity: 1 };

describe("FX 생성·독립 감사·SVG 경계", () => {
  it("비유한 옵션·마스크와 미등록 프리셋을 정상 예제로 대체하지 않는다", () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => generateActionFxLayer({ preset: "radial-focus-lines", width: value })).toThrow();
      expect(() => generateActionFxLayer({ preset: "radial-focus-lines", seed: value })).toThrow();
      expect(() => generateActionFxLayer({ preset: "radial-focus-lines", characterMask: { radius: value } })).toThrow();
      expect(() => verifyCharacterMaskClearance([circle], { ...mask, radius: value })).toThrow();
      expect(() => measurePrimitiveIntrusion({ ...circle, cx: value }, mask)).toThrow();
    }
    expect(() => Reflect.apply(generateActionFxLayer, undefined, [{ preset: "constructor" }])).toThrow();
    expect(() => verifyCharacterMaskClearance([circle], { ...mask, radius: -1 })).toThrow();
    expect(() => verifyCharacterMaskClearance([{ ...circle, opacity: 2 }], mask)).toThrow();
    expect(() => verifyCharacterMaskClearance([circle, circle], mask)).toThrow();
  });

  it("내보내기는 변경된 도형을 재감사하고 오래된 안전 통과를 복사하지 않는다", () => {
    const layer = generateActionFxLayer({ preset: "radial-focus-lines" });
    const edited = { ...layer, primitives: [{ ...circle, cx: layer.resolvedOptions.characterMask.cx, cy: layer.resolvedOptions.characterMask.cy }] };
    const before = structuredClone(edited);
    expect(layer.maskAudit.safeZoneGuaranteed).toBe(true);
    expect(exportActionFxSvg(edited)).toContain('data-safe-zone="breach"');
    expect(edited).toEqual(before);
  });

  it("한글 제목을 포함한 실제 UTF-8 바이트 수와 독립 SVG 원문을 보존한다", () => {
    const layer = generateActionFxLayer({ preset: "romance-petal-frame" });
    const svg = exportActionFxSvg(layer);
    expect(new TextEncoder().encode(svg).byteLength).toBeGreaterThan(svg.length);
    expect(layer.metrics.estimatedSvgBytes).toBe(new TextEncoder().encode(svg).byteLength);
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("title")?.textContent).toBe(layer.preset.labelKo);
  });

  it("소수 픽셀 침범을 0px 안전 통과로 반올림하지 않는다", () => {
    const overlapping = { ...circle, cx: mask.cx + mask.radius + circle.r - 0.001, cy: mask.cy };
    const audit = verifyCharacterMaskClearance([overlapping], mask);
    expect(audit.safeZoneGuaranteed).toBe(false);
    expect(audit.maxIntrusionPx).toBeGreaterThan(0);
  });

  it("지원 도형 수를 넘으면 배열을 순회하기 전에 거부한다", () => {
    const oversized = new Proxy<ActionFxVectorPrimitive[]>([], { get: (_target, key) => {
      if (key === "length") return 4097;
      throw new Error("초과 배열 순회");
    } });
    expect(() => verifyCharacterMaskClearance(oversized, mask)).toThrow(/4096/);
  });
});

describe("FX 예제 결과 알림·브라우저 출력", () => {
  it("부모 inline 수신자의 상태 갱신과 StrictMode에서도 같은 결과를 중복 알리지 않는다", () => {
    const calls = vi.fn();
    function Parent() {
      const [count, setCount] = useState(0);
      return <><span data-testid="parent-count">{count}</span><StudioActionFxLabPanel onLayerChange={(layer) => { calls(layer); if (count < 3) setCount((value) => value + 1); }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("parent-count").textContent).toBe("1");
    expect(screen.getByTestId("fx-scope-notice").textContent).toContain("고정 원형");
  });

  it("자동 알림 대기 중 중복을 막고 거절 후 최신 수신자로 같은 레이어를 재시도한다", async () => {
    const controls = { reject: (_reason: Error) => {} };
    const pending = new Promise<void>((_resolve, reject) => { controls.reject = reject; });
    const first = vi.fn<(layer: ActionFxLayerResult) => void | Promise<void>>().mockReturnValue(pending);
    const latest = vi.fn();
    const view = render(<StudioActionFxLabPanel onLayerChange={first} />);
    fireEvent.click(screen.getByTestId("fx-randomize-seed-btn"));
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("studio-action-fx-lab-panel").getAttribute("aria-busy")).toBe("true");
    await act(async () => { controls.reject(new Error("수신 실패")); });
    view.rerender(<StudioActionFxLabPanel onLayerChange={latest} />);
    fireEvent.click(screen.getByRole("button", { name: "레이어 알림 다시 시도" }));
    expect(latest).toHaveBeenCalledExactlyOnceWith(first.mock.calls[0]?.[0]);
  });

  it("SVG 수신자의 동기 실패를 재시도해도 실제 복사·저장을 완료로 표시하지 않는다", () => {
    const onExport = vi.fn().mockImplementationOnce(() => { throw new Error("알림 실패"); }).mockImplementation(() => undefined);
    render(<StudioActionFxLabPanel onExportSvg={onExport} />);
    fireEvent.click(screen.getByTestId("fx-copy-svg-btn"));
    expect(screen.getByTestId("fx-notification-export").getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByRole("button", { name: "SVG 알림 다시 시도" }));
    expect(onExport.mock.calls[1]?.[0]).toBe(onExport.mock.calls[0]?.[0]);
    expect(screen.getByTestId("fx-notification-export").textContent).toContain("적용·저장 완료 아님");
  });

  it("클립보드 거절과 미지원 다운로드를 완료로 표시하지 않고 재시도한다", async () => {
    const copy = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error("권한 거부")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    render(<StudioActionFxLabPanel />);
    await act(async () => { fireEvent.click(screen.getByTestId("fx-copy-svg-btn")); });
    expect(screen.getByTestId("fx-transfer-status").getAttribute("role")).toBe("alert");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "브라우저 출력 다시 시도" })); });
    expect(copy.mock.calls[1]?.[0]).toBe(copy.mock.calls[0]?.[0]);
    expect(screen.getByTestId("fx-transfer-status").textContent).toContain("복사 완료");
    vi.stubGlobal("URL", { createObjectURL: undefined });
    fireEvent.click(screen.getByTestId("fx-download-svg-btn"));
    expect(screen.getByTestId("fx-transfer-status").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("fx-transfer-status").textContent).not.toContain("내보냈습니다");
  });

  it("다운로드는 원문 SVG Blob을 전달하고 URL을 정리하며 실제 파일 저장 완료를 단정하지 않는다", () => {
    vi.useFakeTimers();
    const create = vi.fn<(blob: Blob) => string>().mockReturnValue("blob:fx-example");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<StudioActionFxLabPanel />);
    const source = screen.getByTestId("fx-svg-code-preview").textContent;
    fireEvent.click(screen.getByTestId("fx-download-svg-btn"));
    expect(create.mock.calls[0]?.[0].type).toBe("image/svg+xml;charset=utf-8");
    expect(create.mock.calls[0]?.[0].size).toBe(new TextEncoder().encode(source ?? "").byteLength);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(screen.getByTestId("fx-transfer-status").textContent).toContain("실제 파일 저장 여부는 브라우저에서 확인");
    act(() => { vi.runOnlyPendingTimers(); });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:fx-example");
  });
});
