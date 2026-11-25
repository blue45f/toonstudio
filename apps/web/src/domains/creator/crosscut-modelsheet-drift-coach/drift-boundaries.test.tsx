// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRIFT_METRIC_META } from "./modelsheet-drift-engine";
import { StudioModelSheetDriftCoachPanel, applyCutCorrection, auditEpisodeModelSheetDrift, auditSingleCutDrift,
  createDriftCoachSession, exportDriftReportJson, exportDriftReportMarkdown, getModelSheetSpec,
  proposeCutDriftCorrectionsTop3, simulateCutMetricUpdate, type DriftCoachSessionState } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function cutAt(session: DriftCoachSessionState, index = 0) {
  const cut = session.workingCuts[index];
  if (!cut) throw new Error("회귀 입력 컷이 없습니다.");
  return cut;
}

describe("모델 시트 예제의 입력·보존·출력 경계", () => {
  it.each([NaN, Infinity, 1e308])("외부 비율 %s를 정상 등급이나 JSON null로 숨기지 않는다", value => {
    const session = createDriftCoachSession("romance-lead", 1);
    const cut = { ...cutAt(session), headToBodyRatio: value };
    expect(() => auditSingleCutDrift(getModelSheetSpec("romance-lead"), cut)).toThrow();
  });
  it("NaN 임계값은 정상 판정으로 통과하지 않는다", () => {
    const session = createDriftCoachSession("romance-lead", 1);
    const threshold = DRIFT_METRIC_META.headToBodyRatio.thresholds;
    const before = { ...threshold };
    try {
      Object.assign(threshold, { okPct: NaN });
      expect(() => auditSingleCutDrift(getModelSheetSpec("romance-lead"), cutAt(session))).toThrow();
    } finally { Object.assign(threshold, before); }
  });
  it("60컷 초과는 원문을 잘라 성공하지 않고 계산 전에 거부한다", () => {
    const session = createDriftCoachSession("romance-lead", 60);
    const cuts = [...session.workingCuts, { ...cutAt(session), cutId: "마지막 원문", cutNumber: 61 }];
    const before = structuredClone(cuts);
    expect(() => auditEpisodeModelSheetDrift({ spec: getModelSheetSpec("romance-lead"), cuts })).toThrow();
    expect(cuts).toEqual(before);
  });
  it.each(["cutId", "cutNumber"] as const)("중복 %s로 두 컷을 함께 덮어쓰지 않는다", key => {
    const session = createDriftCoachSession("romance-lead", 2);
    const first = cutAt(session); const second = cutAt(session, 1);
    const cuts = [first, { ...second, [key]: first[key] }];
    expect(() => auditEpisodeModelSheetDrift({ spec: getModelSheetSpec("romance-lead"), cuts })).toThrow();
    expect(() => simulateCutMetricUpdate({ ...session, workingCuts: cuts }, 1, { headToBodyRatio: 6 })).toThrow();
  });
  it("NaN 패치는 원본을 보존한 오류이고 유한 극값 클램핑 계약은 유지한다", () => {
    const session = createDriftCoachSession("romance-lead", 1); const before = structuredClone(session);
    expect(() => simulateCutMetricUpdate(session, 1, { eyeSpacingRatio: NaN })).toThrow();
    expect(simulateCutMetricUpdate(session, 1, { headToBodyRatio: 99 }).workingCuts[0]?.headToBodyRatio).toBe(9);
    expect(session).toEqual(before);
  });
  it("다른 컷의 후보로 선택 컷을 덮어쓰지 않는다", () => {
    const session = createDriftCoachSession("romance-lead", 2); const before = structuredClone(session);
    const candidate = proposeCutDriftCorrectionsTop3(getModelSheetSpec("romance-lead"), cutAt(session, 1))[2];
    expect(() => applyCutCorrection(session, 1, candidate)).toThrow();
    expect(session).toEqual(before);
  });
  it("현재 세션과 다른 외부 리포트는 JSON·Markdown 성공으로 내보내지 않는다", () => {
    const session = createDriftCoachSession("romance-lead", 1);
    const audit = auditEpisodeModelSheetDrift({ spec: getModelSheetSpec("romance-lead"), cuts: session.workingCuts });
    const stale = { ...audit, consistencyScore: audit.consistencyScore - 1 };
    expect(() => exportDriftReportJson({ audit: stale, session })).toThrow();
    expect(() => exportDriftReportMarkdown({ audit: stale, session })).toThrow();
  });
  it("외부 메타데이터는 제외하고 원문의 공백과 Unicode 설정은 보존한다", () => {
    const session = createDriftCoachSession("romance-lead", 1);
    const spec = { ...getModelSheetSpec("romance-lead"), nameKo: "  가 🧑🏽‍🎨 원문  ", privateNote: "synthetic-private-fixture" };
    const audit = auditEpisodeModelSheetDrift({ spec, cuts: session.workingCuts }); const before = structuredClone(audit);
    const json = exportDriftReportJson({ audit, session });
    expect(json).not.toContain("synthetic-private-fixture");
    expect(JSON.parse(json).spec.nameKo).toBe(spec.nameKo);
    expect(JSON.parse(json).sourceKind).toBe("cpu-metric-example");
    expect(JSON.parse(json).artworkModified).toBe(false);
    expect(audit).toEqual(before);
  });
  it("안전 정수 마지막 이력은 내보내고 다음 증가만 원본 보존 오류로 거부한다", () => {
    const session = { ...createDriftCoachSession("romance-lead", 1), revision: Number.MAX_SAFE_INTEGER - 1 };
    const spec = getModelSheetSpec("romance-lead");
    const candidate = proposeCutDriftCorrectionsTop3(spec, cutAt(session))[2];
    const last = applyCutCorrection(session, 1, candidate);
    const audit = auditEpisodeModelSheetDrift({ spec, cuts: last.workingCuts });
    expect(() => exportDriftReportJson({ audit, session: last })).not.toThrow();
    const before = structuredClone(last);
    expect(() => applyCutCorrection(last, 1, candidate)).toThrow();
    expect(last).toEqual(before);
  });
});

describe("모델 시트 예제의 수신 확인", () => {
  it("수신자 없는 보정은 실제 원고 수정 성공이 아닌 메모리 예제로 표시한다", () => {
    render(<StudioModelSheetDriftCoachPanel />);
    fireEvent.click(screen.getByTestId("proposal-apply-btn-3"));
    expect(screen.getByTestId("drift-example-scope").textContent).toContain("실제");
    expect(screen.getByTestId("drift-delivery-apply").textContent).toContain("미연결");
  });
  it("복사 미지원은 콜백을 호출하거나 완료로 표시하지 않는다", async () => {
    vi.stubGlobal("navigator", {}); const recipient = vi.fn();
    render(<StudioModelSheetDriftCoachPanel onExportReport={recipient} />);
    fireEvent.click(screen.getByTestId("export-json-btn"));
    expect(recipient).not.toHaveBeenCalled();
    expect(await screen.findByTestId("drift-copy-retry")).toBeTruthy();
  });
  it("복사 ACK를 기다리고 pending 중복을 막아 최신 수신자에게만 알린다", async () => {
    const gate = Promise.withResolvers<void>(); const write = vi.fn(() => gate.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn(); const latest = vi.fn();
    const view = render(<StudioModelSheetDriftCoachPanel onExportReport={first} />);
    fireEvent.click(screen.getByTestId("export-json-btn")); fireEvent.click(screen.getByTestId("export-json-btn"));
    expect(write).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
    view.rerender(<StudioModelSheetDriftCoachPanel onExportReport={latest} />);
    await act(async () => { gate.resolve(); });
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("적용 중복을 막고 reject 뒤 같은 결과를 최신 수신자에게 재알림한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioModelSheetDriftCoachPanel onApplyFix={first} />);
    fireEvent.click(screen.getByTestId("proposal-apply-btn-3")); fireEvent.click(screen.getByTestId("proposal-apply-btn-3"));
    expect(first).toHaveBeenCalledTimes(1); const sent = first.mock.calls[0];
    await act(async () => { gate.reject(new Error("예제 알림 거절")); });
    view.rerender(<StudioModelSheetDriftCoachPanel />);
    fireEvent.click(screen.getByTestId("drift-retry-apply"));
    expect(screen.getByTestId("drift-retry-apply")).toBeTruthy();
    view.rerender(<StudioModelSheetDriftCoachPanel onApplyFix={latest} />);
    fireEvent.click(screen.getByTestId("drift-retry-apply"));
    expect(latest).toHaveBeenCalledTimes(1); expect(latest.mock.calls[0]).toEqual(sent);
    expect(latest.mock.calls[0]?.[1].approvalHistory).toHaveLength(1);
  });
  it("원복 동기 throw는 화면과 원본을 유지하고 재시도에 같은 세션을 전달한다", () => {
    const first = vi.fn(() => { throw new Error("원복 알림 실패"); }); const latest = vi.fn();
    const view = render(<StudioModelSheetDriftCoachPanel onRevertFix={first} />);
    fireEvent.click(screen.getByTestId("proposal-apply-btn-3"));
    fireEvent.click(screen.getByTestId("revert-selected-cut-btn"));
    expect(screen.getByTestId("drift-retry-revert")).toBeTruthy();
    view.rerender(<StudioModelSheetDriftCoachPanel onRevertFix={latest} />);
    fireEvent.click(screen.getByTestId("drift-retry-revert"));
    expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
    expect(latest.mock.calls[0]?.[1].appliedFixByCut).toEqual({});
  });
  it("복사 후 알림 reject는 같은 리포트·UTF-8 bytes를 유지하고 복사를 반복하지 않는다", async () => {
    const write = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn().mockRejectedValue(new Error("리포트 알림 거절")); const latest = vi.fn();
    const view = render(<StudioModelSheetDriftCoachPanel onExportReport={first} />);
    fireEvent.click(screen.getByTestId("export-json-btn")); await screen.findByTestId("drift-copy-retry");
    const sent = first.mock.calls[0]; const text = write.mock.calls[0]?.[0];
    fireEvent.click(screen.getByTestId("archetype-btn-action-hero"));
    view.rerender(<StudioModelSheetDriftCoachPanel />); fireEvent.click(screen.getByTestId("drift-copy-retry"));
    await screen.findByTestId("drift-copy-retry");
    view.rerender(<StudioModelSheetDriftCoachPanel onExportReport={latest} />); fireEvent.click(screen.getByTestId("drift-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent); expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("drift-copy-status").textContent).toContain(`${new TextEncoder().encode(text).byteLength.toLocaleString("ko-KR")} B`);
  });
  it("예제 수동 조정 후 이전 교정 완료 강조를 재사용하지 않고 원복은 유지한다", () => {
    render(<StudioModelSheetDriftCoachPanel />); fireEvent.click(screen.getByTestId("proposal-apply-btn-3"));
    fireEvent.change(screen.getByTestId("slider-headToBodyRatio"), { target: { value: "5.8" } });
    expect(screen.queryByTestId("proposal-revert-btn-3")).toBeNull();
    expect((screen.getByTestId("revert-selected-cut-btn") as HTMLButtonElement).disabled).toBe(false);
  });
});
