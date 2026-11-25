// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioMobileReaderPreviewPanel, auditMobileReaderCuts, autoFixMobileReaderCuts, buildMobilePreviewSvg, createDefaultReaderCuts, exportMobileReaderAuditJson } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const clip = (writeText = vi.fn().mockResolvedValue(undefined)) => {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  return writeText;
};

describe("모바일 독자 계산 예제의 입력과 내보내기 경계", () => {
  it("200컷 상한과 중복 ID를 조용히 수용하지 않는다", () => {
    const cut = createDefaultReaderCuts()[0];
    if (!cut) throw new Error("샘플 컷 필요");
    expect(() => auditMobileReaderCuts({ cuts: Array.from({ length: 201 }, (_, i) => ({ ...cut, id: `c-${i}` })) })).toThrow();
    expect(() => auditMobileReaderCuts({ cuts: [cut, { ...cut }] })).toThrow();
  });
  it("보정 뒤에도 공백·분해 한글·가족 이모지·영문 원문이 보존된다", () => {
    const source = createDefaultReaderCuts().map((cut, index) => ({ ...cut, id: ` id-${index} `, labelKo: "  가 👨‍👩‍👧‍👦  ", labelEn: "  Family 👨‍👩‍👧‍👦  " }));
    const before = structuredClone(source);
    const result = autoFixMobileReaderCuts({ cuts: source });
    expect(result.cuts.map(({ id, labelKo, labelEn }) => ({ id, labelKo, labelEn }))).toEqual(source.map(({ id, labelKo, labelEn }) => ({ id, labelKo, labelEn })));
    const json = JSON.parse(exportMobileReaderAuditJson(result.afterAudit));
    expect(json.cuts[0].labelEn).toBe(source[0]?.labelEn);
    expect(json.cuts[0].dialogueCharCount).toBe(source[0]?.dialogueCharCount);
    expect(source).toEqual(before);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1e308])("외부 감사 수치 %s를 SVG/JSON 성공으로 내보내지 않는다", (bad) => {
    const audit = auditMobileReaderCuts({ cuts: createDefaultReaderCuts() });
    const forged = { ...audit, summary: { ...audit.summary, totalScaledHeightCssPx: bad } };
    expect(() => buildMobilePreviewSvg(forged)).toThrow();
    expect(() => exportMobileReaderAuditJson(forged)).toThrow();
  });
  it("같은 입력을 재분석한 정상 감사는 키 순서와 무관하며 원본을 바꾸지 않는다", () => {
    const audit = auditMobileReaderCuts({ cuts: createDefaultReaderCuts() });
    const before = structuredClone(audit);
    const reordered = { ...audit, summary: Object.fromEntries(Object.entries(audit.summary).reverse()) as typeof audit.summary };
    expect(buildMobilePreviewSvg(reordered)).toBe(buildMobilePreviewSvg(audit));
    expect(exportMobileReaderAuditJson(reordered)).toBe(exportMobileReaderAuditJson(audit));
    expect(audit).toEqual(before);
  });
});

describe("모바일 독자 알림과 실제 클립보드 ACK", () => {
  it("StrictMode와 inline 부모 콜백에서 같은 감사를 반복하지 않는다", async () => {
    let calls = 0;
    function Parent() {
      const [count, setCount] = useState(0);
      return <><output data-testid="count">{count}</output><StudioMobileReaderPreviewPanel onAuditChange={() => { calls += 1; if (calls > 4) throw new Error("반복 알림"); setCount((n) => n + 1); }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(calls).toBe(1);
  });
  it("감사 거절 뒤 retry는 동결 payload와 최신 수신자를 사용한다", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("예제 거절"));
    const latest = vi.fn();
    const view = render(<StudioMobileReaderPreviewPanel onAuditChange={rejected} />);
    await screen.findByTestId("reader-sim-notify-retry");
    const sent = rejected.mock.calls[0]?.[0];
    view.rerender(<StudioMobileReaderPreviewPanel onAuditChange={latest} />);
    fireEvent.click(screen.getByTestId("reader-sim-notify-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]?.[0]).toBe(sent);
  });
  it("복사 실패는 성공/콜백을 알리지 않고 실제 복사 후에만 알린다", async () => {
    const write = clip(vi.fn().mockRejectedValueOnce(new Error("권한 거절")).mockResolvedValue(undefined));
    const notify = vi.fn();
    render(<StudioMobileReaderPreviewPanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("reader-sim-copy-json-btn"));
    await screen.findByTestId("reader-sim-export-retry");
    expect(notify).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("reader-sim-export-retry"));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("전달 거절 재시도는 이미 성공한 복사를 반복하지 않고 수신자 제거도 성공으로 삼지 않는다", async () => {
    const write = clip();
    const rejected = vi.fn().mockRejectedValue(new Error("전달 거절"));
    const latest = vi.fn();
    const view = render(<StudioMobileReaderPreviewPanel onExportJson={rejected} />);
    fireEvent.click(screen.getByTestId("reader-sim-copy-json-btn"));
    await screen.findByTestId("reader-sim-export-retry");
    view.rerender(<StudioMobileReaderPreviewPanel />);
    fireEvent.click(screen.getByTestId("reader-sim-export-retry"));
    await act(async () => {});
    expect(screen.getByTestId("reader-sim-export-retry")).toBeTruthy();
    view.rerender(<StudioMobileReaderPreviewPanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("reader-sim-export-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("추가 컷 ID는 초기 custom ID와 겹치지 않으며 상한에 멈춘다", () => {
    const cut = createDefaultReaderCuts()[0];
    if (!cut) throw new Error("샘플 컷 필요");
    const cuts = Array.from({ length: 199 }, (_, i) => ({ ...cut, id: `custom-cut-${i + 1}` }));
    const received = vi.fn();
    render(<StudioMobileReaderPreviewPanel initialCuts={cuts} onAuditChange={received} />);
    fireEvent.click(screen.getByTestId("reader-sim-add-cut-btn"));
    const last = received.mock.calls.at(-1)?.[0];
    expect(last.cuts).toHaveLength(200);
    expect(new Set(last.cuts.map((item: { id: string }) => item.id)).size).toBe(200);
    expect((screen.getByTestId("reader-sim-add-cut-btn") as HTMLButtonElement).disabled).toBe(true);
  });
});

  it("복사 대기 중 추가된 수신자의 실패를 제거 뒤 거짓 성공으로 바꾸지 않는다", async () => {
    let resolveCopy: (() => void) | undefined;
    const write = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const rejected = vi.fn().mockRejectedValue(new Error("늦게 연결된 수신자 거절"));
    const latest = vi.fn();
    const view = render(<StudioMobileReaderPreviewPanel />);
    fireEvent.click(screen.getByTestId("reader-sim-copy-json-btn"));
    view.rerender(<StudioMobileReaderPreviewPanel onExportJson={rejected} />);
    await act(async () => { resolveCopy?.(); });
    await screen.findByTestId("reader-sim-export-retry");
    expect(rejected).toHaveBeenCalledTimes(1);
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioMobileReaderPreviewPanel />);
    fireEvent.click(screen.getByTestId("reader-sim-export-retry"));
    await act(async () => {});
    expect(screen.getByTestId("reader-sim-export-retry")).toBeTruthy();
    view.rerender(<StudioMobileReaderPreviewPanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("reader-sim-export-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
    expect(write).toHaveBeenCalledTimes(1);
  });
