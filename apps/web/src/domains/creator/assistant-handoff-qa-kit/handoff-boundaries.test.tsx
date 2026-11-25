// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyLayerAutoFix, auditLayerNamingConvention, buildHandoffBriefMarkdown, createDefaultPayoutAllocations,
  createSampleHandoffDocument, estimateAssistantPayout, evaluateHandoffReadiness, exportHandoffPackageJson,
  type HandoffBriefContext, type HandoffReadinessReport,
} from "./assistant-handoff-engine";
import { StudioAssistantHandoffKitPanel } from "./StudioAssistantHandoffKitPanel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function context(): HandoffBriefContext {
  return { projectTitle: "원문 🧑🏽‍🎨", episodeLabel: "1화", senderName: "작가", receiverName: "어시", dueDateIso: "2026-11-28", deliverableFormat: "PSD", notes: "  메모\r\n\t원문 😀  ",
    readiness: evaluateHandoffReadiness({ document: createSampleHandoffDocument("shading", "clean"), checkedChecklistIds: [] }),
    payout: estimateAssistantPayout({ allocations: createDefaultPayoutAllocations() }) };
}

describe("인수인계 입력과 원문 경계", () => {
  it("중복 레이어 ID를 보정 전에 거부하고 원본을 바꾸지 않는다", () => {
    const document = createSampleHandoffDocument("shading", "with-issues");
    const first = document.layers[0];
    if (!first) throw new Error("필수 예제 레이어 없음");
    const input = { ...document, layers: [first, { ...first, name: "02_BASE" }] };
    const before = structuredClone(input);
    expect(() => applyLayerAutoFix(input)).toThrow(/ID/);
    expect(input).toEqual(before);
  });
  it("누락 레이어 자동 추가 ID가 기존 사용자 ID를 덮지 않는다", () => {
    const input = { ...createSampleHandoffDocument("shading", "clean"), layers: [{ id: "auto-01_line", name: "02_BASE", visible: true, locked: true }] };
    const fixed = applyLayerAutoFix(input);
    expect(new Set(fixed.nextDocument.layers.map((layer) => layer.id)).size).toBe(fixed.nextDocument.layers.length);
    expect(input.layers[0]?.name).toBe("02_BASE");
  });
  it.each([NaN, Infinity, -Infinity])("불투명도 %s를 정상 검사·JSON null로 바꾸지 않는다", (opacityPct) => {
    const input = { ...createSampleHandoffDocument("lineart", "clean"), layers: [{ id: "x", name: "01_LINE", visible: true, locked: false, opacityPct }] };
    expect(() => auditLayerNamingConvention(input)).toThrow(/유한|finite|불투명도/);
    expect(Object.is(input.layers[0]?.opacityPct, opacityPct)).toBe(true);
  });
  it("256개를 넘는 레이어를 계산 전에 거부한다", () => {
    const input = { ...createSampleHandoffDocument("lineart", "clean"), layers: Array.from({ length: 257 }, (_, i) => ({ id: `x${i}`, name: `01_LINE_${i}`, visible: true, locked: false })) };
    expect(() => auditLayerNamingConvention(input)).toThrow(/256|상한/);
  });
  it("외부 보고서의 NaN이 JSON null이나 Markdown NaN으로 출력되지 않는다", () => {
    const input = context();
    const malformed = { ...input, payout: { ...input.payout, totalGrossAmountKrw: NaN } };
    expect(() => exportHandoffPackageJson(malformed)).toThrow(/유한|finite/);
    expect(() => buildHandoffBriefMarkdown(malformed)).toThrow(/유한|finite/);
  });
  it("JSON과 Markdown 메모의 공백·개행·Unicode 원문을 보존한다", () => {
    const input = context();
    const before = structuredClone(input);
    expect(JSON.parse(exportHandoffPackageJson(input)).metadata.notes).toBe(input.notes);
    expect(buildHandoffBriefMarkdown(input)).toContain(input.notes);
    expect(input).toEqual(before);
  });
  it("외부 세율 사실 대신 입력한 가정 세율로만 추정 계산한다", () => {
    const input = Object.assign({ allocations: [{ stageId: "lineart" as const, cutCount: 1, ratePerCutKrw: 10000 }] }, { nationalIncomeTaxRatePct: 5, localIncomeTaxRatePct: 1 });
    const result = estimateAssistantPayout(input);
    expect(result.totalWithholdingTaxKrw).toBe(600);
    expect(result.taxDisclaimerKo).toContain("가정");
  });
});

describe("인수인계 알림과 실제 클립보드 응답", () => {
  it("전달 메모를 입력하고 JSON으로 보낼 때 여러 줄과 여백을 보존한다", () => {
    const exported = vi.fn();
    render(<StudioAssistantHandoffKitPanel onExportJson={exported} />);
    const notes = "  장면 메모\n\t원문 🧑🏽‍🎨  ";
    fireEvent.change(screen.getByTestId("handoff-meta-notes"), { target: { value: notes } });
    fireEvent.click(screen.getByTestId("handoff-copy-json-btn"));
    const json = exported.mock.calls[0]?.[0];
    if (typeof json !== "string") throw new Error("JSON 전달 없음");
    expect(JSON.parse(json).metadata.notes).toBe(notes);
  });
  it("상한에서 자동 보정할 수 없으면 예제와 원문을 보존하고 안내한다", () => {
    const layers = Array.from({ length: 256 }, (_, index) => ({ id: `limit-${index}`, name: "01_LINE", visible: true, locked: false }));
    const before = structuredClone(layers);
    const preventReportedError = (event: ErrorEvent): void => { event.preventDefault(); };
    window.addEventListener("error", preventReportedError);
    try {
      render(<StudioAssistantHandoffKitPanel initialStageId="shading" initialDpi={300} initialColorSpace="sRGB" initialLayers={layers} />);
      fireEvent.click(screen.getByTestId("handoff-auto-fix-all-btn"));
      expect(screen.getByTestId("handoff-status-banner").textContent).toContain("상한");
      expect(screen.getAllByTestId(/^handoff-layer-name-/)).toHaveLength(256);
      expect(layers).toEqual(before);
    } finally { window.removeEventListener("error", preventReportedError); }
  });
  it("수신자 함수만 바뀌면 결과를 반복 통지하지 않고 다음 변경은 최신 수신자에게 보낸다", () => {
    const first = vi.fn(); const latest = vi.fn();
    const { rerender } = render(<StudioAssistantHandoffKitPanel onReadinessChange={first} />);
    expect(first).toHaveBeenCalledTimes(1);
    rerender(<StudioAssistantHandoffKitPanel onReadinessChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("handoff-add-layer-btn"));
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("클립보드가 응답하기 전에는 복사 완료를 표시하지 않고 실패 후 같은 원문만 재시도한다", async () => {
    let rejectCopy: (reason: Error) => void = () => { throw new Error("복사 요청 없음"); };
    const copy = vi.fn().mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectCopy = reject; })).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    const exported = vi.fn();
    render(<StudioAssistantHandoffKitPanel onExportBrief={exported} />);
    fireEvent.click(screen.getByTestId("handoff-copy-md-btn"));
    expect(screen.getByTestId("handoff-copy-status").textContent).toContain("기다리");
    expect(screen.getByTestId("handoff-copy-md-btn")).toHaveProperty("disabled", true);
    await act(async () => { rejectCopy(new Error("denied")); });
    expect(screen.getByTestId("handoff-copy-status").getAttribute("role")).toBe("alert");
    fireEvent.click(screen.getByTestId("handoff-retry-clipboard"));
    await waitFor(() => expect(screen.getByTestId("handoff-copy-status").textContent).toContain("복사 완료"));
    expect(copy).toHaveBeenCalledTimes(2);
    expect(copy.mock.calls[1]?.[0]).toBe(copy.mock.calls[0]?.[0]);
    expect(exported).toHaveBeenCalledTimes(1);
  });
  it("실패한 알림은 최신 수신자로 같은 결과를 재시도하며 원고를 재보정하지 않는다", async () => {
    const response = Promise.reject(new Error("receiver offline")); void response.catch(() => undefined);
    const failed = vi.fn((_report: HandoffReadinessReport) => response); const latest = vi.fn();
    const { rerender } = render(<StudioAssistantHandoffKitPanel onReadinessChange={failed} />);
    await waitFor(() => expect(screen.getByTestId("handoff-notification-readiness").getAttribute("role")).toBe("alert"));
    rerender(<StudioAssistantHandoffKitPanel onReadinessChange={latest} />);
    expect(latest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("handoff-retry-readiness"));
    expect(latest).toHaveBeenCalledWith(failed.mock.calls[0]?.[0]);
    expect(screen.getByTestId("handoff-verdict-value").textContent).toContain("출고 차단");
  });
});
