// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioCharacterSheetBiblePanel, assessOklchPrintGamut, auditCharacterSheetCompleteness, buildCastHeightEntries, compareCastHeights, createCharacterPreset, exportCharacterSheetJson } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("설정집 예제의 구조·유한값·원문", () => {
  it("색 칩 중복이나 cast ID 중복 및 무제한 쌍별 계산을 거부한다", () => {
    const sheet = createCharacterPreset("taehyun-lead");
    expect(() => auditCharacterSheetCompleteness({ ...sheet, colorChips: [...sheet.colorChips, ...sheet.colorChips] })).toThrow();
    const cast = buildCastHeightEntries(sheet);
    expect(() => compareCastHeights([...cast, ...cast])).toThrow();
    expect(() => compareCastHeights(Array.from({ length: 65 }, (_, i) => ({ ...cast[0], id: `c${i}`, nameKo: "가", nameEn: "A", heightCm: 175, headRatio: 7.5 })))).toThrow();
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("잘못된 굽/색 %s를 배포 준비나 JSON null로 성공 처리하지 않는다", (bad) => {
    const sheet = createCharacterPreset("taehyun-lead");
    const badFootwear = { ...sheet, footwearBonusCm: bad };
    expect(auditCharacterSheetCompleteness(badFootwear).grade).not.toBe("production-ready");
    expect(() => exportCharacterSheetJson(badFootwear)).toThrow();
    const badColor = { ...sheet, accentOklch: { ...sheet.accentOklch, l: bad } };
    expect(auditCharacterSheetCompleteness(badColor).grade).not.toBe("production-ready");
    expect(() => exportCharacterSheetJson(badColor)).toThrow();
  });
  it("낮은 색역 위험도는 ICC/실제 인쇄 검증을 뜻하지 않는다", () => {
    const result = assessOklchPrintGamut({ l: 0.65, c: 0.06, h: 55 });
    expect(result).toMatchObject({ dataSourceKind: "heuristic", iccVerified: false });
    expect(result.labelKo).not.toContain("안전");
  });
  it("분해 한글·이모지·공백·쉼표를 편집과 탭 왕복 뒤에도 보존한다", () => {
    render(<StudioCharacterSheetBiblePanel />);
    const text = "  가 👨‍👩‍👧‍👦,  ,";
    const input = screen.getByTestId("bible-outfit-accessories-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: text } });
    expect(input.value).toBe(text);
    fireEvent.click(screen.getByTestId("bible-outfit-tab-casual"));
    fireEvent.click(screen.getByTestId("bible-outfit-tab-uniform"));
    expect((screen.getByTestId("bible-outfit-accessories-input") as HTMLInputElement).value).toBe(text);
    fireEvent.click(screen.getByTestId("bible-export-tab-json"));
    expect(JSON.parse(screen.getByTestId("bible-export-preview").textContent ?? "").sheet.outfits[0].keyAccessories.join(",")).toBe(text);
  });
});

describe("설정집 알림·복사 비동기 계약", () => {
  it("StrictMode와 부모 inline 콜백의 같은 sheet 알림은 한 번이다", async () => {
    let calls = 0;
    function Parent() {
      const [count, setCount] = useState(0);
      return <><output data-testid="count">{count}</output><StudioCharacterSheetBiblePanel onSheetChange={() => { calls += 1; if (calls > 4) throw new Error("반복 알림"); setCount((n) => n + 1); }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(calls).toBe(1);
  });
  it("동기 throw 알림 재시도는 최신 수신자와 같은 원문을 사용한다", async () => {
    const rejected = vi.fn(() => { throw new Error("예제 거절"); });
    const latest = vi.fn();
    const view = render(<StudioCharacterSheetBiblePanel onSheetChange={rejected} />);
    await screen.findByTestId("bible-notify-retry");
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioCharacterSheetBiblePanel onSheetChange={latest} />);
    fireEvent.click(screen.getByTestId("bible-notify-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
  });
  it("복사 pending 중 중복 요청을 막고 reject 뒤 실제 성공만 알린다", async () => {
    let rejectCopy: ((reason: Error) => void) | undefined;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; })).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const notify = vi.fn();
    render(<StudioCharacterSheetBiblePanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("bible-copy-json-btn"));
    fireEvent.click(screen.getByTestId("bible-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    await act(async () => { rejectCopy?.(new Error("권한 거절")); });
    fireEvent.click(await screen.findByTestId("bible-export-retry"));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
  });
  it("복사 성공 뒤 전달 실패는 복사를 중복하지 않고 최신 콜백으로 재시도한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const rejected = vi.fn().mockRejectedValue(new Error("전달 거절"));
    const latest = vi.fn();
    const view = render(<StudioCharacterSheetBiblePanel onExportJson={rejected} />);
    fireEvent.click(screen.getByTestId("bible-copy-json-btn"));
    await screen.findByTestId("bible-export-retry");
    view.rerender(<StudioCharacterSheetBiblePanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("bible-export-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledTimes(1);
  });
});

  it("복사 대기 중 추가된 수신자의 실패를 제거 뒤 거짓 성공으로 바꾸지 않는다", async () => {
    let resolveCopy: (() => void) | undefined;
    const write = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const rejected = vi.fn().mockRejectedValue(new Error("늦게 연결된 수신자 거절"));
    const latest = vi.fn();
    const view = render(<StudioCharacterSheetBiblePanel />);
    fireEvent.click(screen.getByTestId("bible-copy-json-btn"));
    view.rerender(<StudioCharacterSheetBiblePanel onExportJson={rejected} />);
    await act(async () => { resolveCopy?.(); });
    await screen.findByTestId("bible-export-retry");
    expect(rejected).toHaveBeenCalledTimes(1);
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioCharacterSheetBiblePanel />);
    fireEvent.click(screen.getByTestId("bible-export-retry"));
    await act(async () => {});
    expect(screen.getByTestId("bible-export-retry")).toBeTruthy();
    view.rerender(<StudioCharacterSheetBiblePanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("bible-export-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("최종 cast 상한은 active 포함64 또는 미포함63만 허용한다", () => {
    const active = { ...createCharacterPreset("taehyun-lead"), id: "active" };
    const presets = Array.from({ length: 64 }, (_, index) => ({ ...active, id: `cast-${index}` }));
    const included = buildCastHeightEntries({ ...active, id: "cast-0" }, presets);
    expect(included).toHaveLength(64);
    expect(compareCastHeights(included).members).toHaveLength(64);
    const appended = buildCastHeightEntries(active, presets.slice(0, 63));
    expect(appended).toHaveLength(64);
    expect(compareCastHeights(appended).members).toHaveLength(64);
    expect(() => buildCastHeightEntries(active, presets)).toThrow();
    expect(presets).toHaveLength(64);
  });
