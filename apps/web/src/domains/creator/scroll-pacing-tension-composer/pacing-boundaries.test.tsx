// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioScrollPacingComposerPanel, applyScrollPacingProposal, auditScrollTensionCurve, createScrollPacingSession,
  exportScrollPacingJson, exportScrollPacingMarkdown, getScrollPacingPreset, proposeScrollPacingAdjustmentsTop3,
  revertAllPacingAdjustments, updateCutPacingMetrics, type ScrollPacingSessionState } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function firstCut(session: ScrollPacingSessionState) {
  const cut = session.workingCuts[0];
  if (!cut) throw new Error("회귀 입력 컷이 없습니다.");
  return cut;
}

describe("스크롤 리듬 예제의 데이터 경계", () => {
  it.each(["cutId", "cutNumber"] as const)("중복 %s는 경고·좌표·수정 대상을 혼동하지 않도록 거부한다", key => {
    const session = createScrollPacingSession(); const first = firstCut(session);
    const cuts = [first, { ...first, cutId: "다른 컷", cutNumber: 2, [key]: first[key] }];
    expect(() => auditScrollTensionCurve(cuts)).toThrow();
    expect(() => proposeScrollPacingAdjustmentsTop3(cuts)).toThrow();
  });
  it("60컷을 넘기는 입력을 할당·계산 전에 거부하며 원본을 자르지 않는다", () => {
    const first = firstCut(createScrollPacingSession());
    const cuts = Array.from({ length: 61 }, (_, index) => ({ ...first, cutId: `cut-${index + 1}`, cutNumber: index + 1 }));
    const before = structuredClone(cuts);
    expect(() => auditScrollTensionCurve(cuts)).toThrow(); expect(cuts).toEqual(before);
  });
  it("유효한 컷 ID와 지원 순서가 아니면 임의 ID·좌표로 대체하지 않는다", () => {
    const first = firstCut(createScrollPacingSession());
    expect(() => auditScrollTensionCurve([{ ...first, cutId: "  " }])).toThrow();
    expect(() => auditScrollTensionCurve([{ ...first, cutNumber: NaN }])).toThrow();
  });
  it("새 편집 후 오래된 제안을 적용해 원문·수동 설정을 덮어쓰지 않는다", () => {
    const session = createScrollPacingSession(); const proposal = proposeScrollPacingAdjustmentsTop3(session.workingCuts)[0];
    const edited = updateCutPacingMetrics(session, 1, { gutterPx: 400 }); const before = structuredClone(edited);
    expect(() => applyScrollPacingProposal(edited, proposal)).toThrow(); expect(edited).toEqual(before);
  });
  it("다른 회차 또는 누락 컷의 제안으로 전체 목록을 교체하지 않는다", () => {
    const session = createScrollPacingSession(); const other = createScrollPacingSession("action-ep12");
    const proposal = proposeScrollPacingAdjustmentsTop3(other.workingCuts)[0];
    expect(() => applyScrollPacingProposal(session, proposal)).toThrow();
    const valid = proposeScrollPacingAdjustmentsTop3(session.workingCuts)[0];
    expect(() => applyScrollPacingProposal(session, { ...valid, proposedCuts: valid.proposedCuts.slice(1) })).toThrow();
  });
  it("기존 수치 클램핑은 유지하되 JSON도 감사한 유한 모델을 내보내고 원문은 보존한다", () => {
    const session = createScrollPacingSession(); const first = firstCut(session);
    const cuts = [{ ...first, sceneLabelKo: "  가 🧑🏽‍🎨 원문  ", gutterPx: NaN, panelHeightPx: -500, tensionScore: Infinity }];
    const before = structuredClone(cuts); const audit = auditScrollTensionCurve(cuts);
    const json = JSON.parse(exportScrollPacingJson({ preset: getScrollPacingPreset(session.presetId), cuts, audit }));
    expect(json.cuts[0].gutterPx).toBe(120); expect(json.cuts[0].panelHeightPx).toBe(320); expect(json.cuts[0].tensionScore).toBe(50);
    expect(json.cuts[0].sceneLabelKo).toBe(cuts[0]?.sceneLabelKo);
    expect(json.inputNormalizationApplied).toBe(true); expect(json.sourceKind).toBe("cpu-pacing-example");
    expect(json.artworkModified).toBe(false); expect(cuts).toEqual(before);
  });
  it("낡은 외부 감사 점수는 JSON·Markdown 성공으로 내보내지 않는다", () => {
    const session = createScrollPacingSession(); const cuts = session.workingCuts; const preset = getScrollPacingPreset(session.presetId);
    const audit = { ...auditScrollTensionCurve(cuts), immersionScore: NaN };
    expect(() => exportScrollPacingJson({ preset, cuts, audit, session })).toThrow();
    expect(() => exportScrollPacingMarkdown({ preset, cuts, audit, session })).toThrow();
  });
  it("수동 편집의 직전 원복은 24단계로 제한하고 전체 원본 복구를 보존한다", () => {
    let session = createScrollPacingSession(); const baseline = structuredClone(session.baselineCuts);
    for (let index = 0; index < 30; index += 1) session = updateCutPacingMetrics(session, 1, { gutterPx: 200 + index });
    expect(session.undoStack.length).toBeLessThanOrEqual(24);
    expect(revertAllPacingAdjustments(session).workingCuts).toEqual(baseline);
  });
});

describe("스크롤 리듬 예제의 수신 확인", () => {
  it("수신자 없는 적용은 실제 원고 반영 성공으로 표시하지 않는다", () => {
    render(<StudioScrollPacingComposerPanel />); fireEvent.click(screen.getByTestId("proposal-apply-btn-1"));
    expect(screen.getByTestId("pacing-example-scope").textContent).toContain("실제");
    expect(screen.getByTestId("pacing-delivery-apply").textContent).toContain("미연결");
  });
  it("복사 미지원에서는 알림을 호출하거나 완료로 표시하지 않는다", async () => {
    vi.stubGlobal("navigator", {}); const recipient = vi.fn();
    render(<StudioScrollPacingComposerPanel onExportJson={recipient} />); fireEvent.click(screen.getByTestId("export-json-btn"));
    expect(recipient).not.toHaveBeenCalled(); expect(await screen.findByTestId("pacing-copy-retry")).toBeTruthy();
  });
  it("복사 ACK를 기다리고 pending 중복 없이 최신 수신자에게 알린다", async () => {
    const gate = Promise.withResolvers<void>(); const write = vi.fn(() => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn(); const latest = vi.fn(); const view = render(<StudioScrollPacingComposerPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("export-json-btn")); fireEvent.click(screen.getByTestId("export-json-btn"));
    expect(write).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
    view.rerender(<StudioScrollPacingComposerPanel onExportJson={latest} />); await act(async () => { gate.resolve(); });
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("적용 reject는 이력을 다시 만들지 않고 같은 결과를 최신 수신자에게 재알림한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioScrollPacingComposerPanel onApply={first} />);
    fireEvent.click(screen.getByTestId("proposal-apply-btn-1")); fireEvent.click(screen.getByTestId("proposal-apply-btn-1"));
    expect(first).toHaveBeenCalledTimes(1); const sent = first.mock.calls[0];
    await act(async () => { gate.reject(new Error("예제 알림 거절")); });
    view.rerender(<StudioScrollPacingComposerPanel />); fireEvent.click(screen.getByTestId("pacing-retry-apply"));
    expect(screen.getByTestId("pacing-retry-apply")).toBeTruthy();
    view.rerender(<StudioScrollPacingComposerPanel onApply={latest} />); fireEvent.click(screen.getByTestId("pacing-retry-apply"));
    expect(latest.mock.calls[0]).toEqual(sent); expect(latest.mock.calls[0]?.[1].history).toHaveLength(1);
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("동기 throw 후에도 화면·원본과 원복 경로를 유지한다", () => {
    const first = vi.fn(() => { throw new Error("동기 알림 실패"); });
    render(<StudioScrollPacingComposerPanel onApply={first} />); fireEvent.click(screen.getByTestId("proposal-apply-btn-1"));
    expect(screen.getByTestId("pacing-retry-apply")).toBeTruthy();
    fireEvent.click(screen.getByTestId("revert-last-btn"));
    expect(screen.getByTestId("pacing-revision-counter").textContent).toContain("r2");
  });
  it("복사 후 알림 실패는 입력이 바뀌어도 같은 시트·UTF-8 크기로 복사 없이 재알림한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn().mockRejectedValue(new Error("시트 알림 거절")); const latest = vi.fn();
    const view = render(<StudioScrollPacingComposerPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("export-json-btn")); await screen.findByTestId("pacing-copy-retry");
    const sent = first.mock.calls[0]; const text = write.mock.calls[0]?.[0];
    fireEvent.change(screen.getByTestId("cut-gutter-slider"), { target: { value: "400" } });
    view.rerender(<StudioScrollPacingComposerPanel onExportJson={latest} />); fireEvent.click(screen.getByTestId("pacing-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(latest.mock.calls[0]).toEqual(sent);
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pacing-copy-status").textContent).toContain(`${new TextEncoder().encode(text).byteLength.toLocaleString("ko-KR")} B`);
  });
  it("클립보드 거절 뒤 같은 시트를 재복사하고 ACK 뒤에만 알린다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("복사 거절")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } }); const recipient = vi.fn();
    render(<StudioScrollPacingComposerPanel onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId("export-json-btn")); await screen.findByTestId("pacing-copy-retry");
    expect(recipient).not.toHaveBeenCalled(); const text = write.mock.calls[0]?.[0];
    fireEvent.click(screen.getByTestId("pacing-copy-retry")); await waitFor(() => expect(recipient).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[1]?.[0]).toBe(text);
  });
});
